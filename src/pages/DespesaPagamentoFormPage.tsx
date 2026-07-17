import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  formatMoney,
  situacaoDespesaLabel,
  situacaoFromSaldo,
} from '@/lib/despesas'

type TipoPagamento = {
  tipopagto_id: number
  nome: string
  quita: boolean | null
}

type PagamentoRow = {
  pagamento_id: number
  data_pagamento: string
  valor: number
  observacao: string | null
  tipo_pagamento: { nome: string } | null
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function DespesaPagamentoFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id

  const [despesa, setDespesa] = useState<{
    despesa_id: number
    despesa_finalidade: string | null
    despesa_valor: number
    despesa_saldo: number
    despesa_situacao: number | null
    despesa_vencimento: string | null
    fornecedor_nome: string | null
  } | null>(null)
  const [historico, setHistorico] = useState<PagamentoRow[]>([])
  const [tipos, setTipos] = useState<TipoPagamento[]>([])
  const [valorPago, setValorPago] = useState('')
  const [dataPagamento, setDataPagamento] = useState(todayISO())
  const [tipopagtoId, setTipopagtoId] = useState('')
  const [observacao, setObservacao] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!empresaId || !id) return
    let mounted = true

    void (async () => {
      setLoading(true)
      const [d, t, h] = await Promise.all([
        supabase
          .from('despesas')
          .select(
            'despesa_id, despesa_finalidade, despesa_valor, despesa_saldo, despesa_situacao, despesa_vencimento, fornecedor_despesa(fordespesa_nome)',
          )
          .eq('despesa_id', Number(id))
          .eq('empresa_id', empresaId)
          .maybeSingle(),
        supabase
          .from('tipo_pagamento')
          .select('tipopagto_id, nome, quita')
          .eq('empresa_id', empresaId)
          .order('nome'),
        supabase
          .from('despesa_pagamento')
          .select(
            'pagamento_id, data_pagamento, valor, observacao, tipo_pagamento(nome)',
          )
          .eq('despesa_id', Number(id))
          .eq('empresa_id', empresaId)
          .order('data_pagamento', { ascending: false }),
      ])

      if (!mounted) return

      if (d.error || !d.data) {
        setError(d.error?.message ?? 'Despesa não encontrada')
        setDespesa(null)
        setLoading(false)
        return
      }

      const row = d.data as {
        despesa_id: number
        despesa_finalidade: string | null
        despesa_valor: number | null
        despesa_saldo: number | null
        despesa_situacao: number | null
        despesa_vencimento: string | null
        fornecedor_despesa: { fordespesa_nome: string | null } | null
      }

      const saldo = Number(row.despesa_saldo ?? 0)
      setDespesa({
        despesa_id: row.despesa_id,
        despesa_finalidade: row.despesa_finalidade,
        despesa_valor: Number(row.despesa_valor ?? 0),
        despesa_saldo: saldo,
        despesa_situacao: row.despesa_situacao,
        despesa_vencimento: row.despesa_vencimento,
        fornecedor_nome: row.fornecedor_despesa?.fordespesa_nome ?? null,
      })
      setValorPago(saldo > 0 ? String(saldo) : '')
      setTipos((t.data as TipoPagamento[]) ?? [])
      setHistorico((h.data as unknown as PagamentoRow[]) ?? [])
      setError(null)
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, id])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite || !empresaId || !despesa) return

    const valor = Number(String(valorPago).replace(',', '.'))
    if (!Number.isFinite(valor) || valor <= 0) {
      setError('Informe um valor de pagamento válido.')
      return
    }
    if (valor > despesa.despesa_saldo + 0.001) {
      setError('O valor não pode ser maior que o saldo em aberto.')
      return
    }
    if (!dataPagamento) {
      setError('Informe a data do pagamento.')
      return
    }

    setSaving(true)
    setError(null)

    const { error: insertError } = await supabase.from('despesa_pagamento').insert({
      empresa_id: empresaId,
      despesa_id: despesa.despesa_id,
      tipopagto_id: tipopagtoId ? Number(tipopagtoId) : null,
      data_pagamento: dataPagamento,
      valor,
      observacao: observacao.trim() || null,
    })

    if (insertError) {
      setSaving(false)
      setError(insertError.message)
      return
    }

    const newSaldo = Math.max(0, Number((despesa.despesa_saldo - valor).toFixed(2)))
    const { error: updateError } = await supabase
      .from('despesas')
      .update({
        despesa_saldo: newSaldo,
        despesa_situacao: situacaoFromSaldo(despesa.despesa_valor, newSaldo),
      })
      .eq('despesa_id', despesa.despesa_id)
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    navigate('/despesas/pagamento', {
      state: { flashSuccess: 'Pagamento registrado com sucesso!' },
    })
  }

  if (!empresaId) {
    return (
      <section className="panel">
        <p className="muted">
          Seu usuário precisa estar vinculado a um grupo escoteiro.
        </p>
      </section>
    )
  }

  if (loading) {
    return <div className="loading">Carregando despesa…</div>
  }

  if (!despesa) {
    return (
      <section className="panel">
        <AlertMessage tone="error" title="Atenção">
          {error ?? 'Despesa não encontrada'}
        </AlertMessage>
        <Link className="btn btn-soft" to="/despesas/pagamento">
          Voltar
        </Link>
      </section>
    )
  }

  const disabled = saving || !canWrite || despesa.despesa_saldo <= 0

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Registrar pagamento</h2>
          <p>
            {despesa.despesa_finalidade || 'Despesa'} ·{' '}
            {situacaoDespesaLabel(despesa.despesa_situacao)}
          </p>
        </div>
        <Link className="btn btn-soft" to="/despesas/pagamento">
          Voltar
        </Link>
      </header>

      <section className="panel" style={{ marginBottom: '1rem' }}>
        <div className="form-grid">
          <div className="field">
            <label>Fornecedor</label>
            <p className="muted" style={{ margin: 0 }}>
              {despesa.fornecedor_nome || '—'}
            </p>
          </div>
          <div className="field">
            <label>Vencimento</label>
            <p className="muted" style={{ margin: 0 }}>
              {formatDate(despesa.despesa_vencimento)}
            </p>
          </div>
          <div className="field">
            <label>Valor original</label>
            <p style={{ margin: 0, fontWeight: 700 }}>
              {formatMoney(despesa.despesa_valor)}
            </p>
          </div>
          <div className="field">
            <label>Saldo em aberto</label>
            <p style={{ margin: 0, fontWeight: 700, color: '#b02a37' }}>
              {formatMoney(despesa.despesa_saldo)}
            </p>
          </div>
        </div>
      </section>

      {despesa.despesa_saldo > 0 ? (
        <form className="panel" onSubmit={(e) => void onSubmit(e)}>
          {error ? (
            <AlertMessage tone="error" title="Atenção">
              {error}
            </AlertMessage>
          ) : null}

          <div className="form-grid">
            <div className="field">
              <label htmlFor="valorPago">Valor do pagamento</label>
              <input
                id="valorPago"
                className="input"
                inputMode="decimal"
                value={valorPago}
                onChange={(e) => setValorPago(e.target.value)}
                disabled={disabled}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="dataPagamento">Data</label>
              <input
                id="dataPagamento"
                className="input"
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
                disabled={disabled}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="tipopagto">Tipo de pagamento</label>
              <select
                id="tipopagto"
                className="select"
                value={tipopagtoId}
                onChange={(e) => setTipopagtoId(e.target.value)}
                disabled={disabled}
              >
                <option value="">Selecione</option>
                {tipos.map((t) => (
                  <option key={t.tipopagto_id} value={t.tipopagto_id}>
                    {t.nome}
                    {t.quita ? ' (quita)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field-span-2">
              <label htmlFor="observacao">Observação</label>
              <input
                id="observacao"
                className="input"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                disabled={disabled}
                maxLength={200}
              />
            </div>
          </div>

          <div className="form-actions">
            {canWrite ? (
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Salvando…' : 'Confirmar pagamento'}
              </button>
            ) : (
              <p className="muted">Sem permissão para pagar.</p>
            )}
            <Link className="btn btn-soft" to="/despesas/pagamento">
              Cancelar
            </Link>
          </div>
        </form>
      ) : (
        <section className="panel">
          <div className="empty">Esta despesa já está quitada.</div>
        </section>
      )}

      <section className="panel" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Histórico de pagamentos</h3>
        {historico.length === 0 ? (
          <div className="empty">Nenhum pagamento registrado.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((row) => (
                  <tr key={row.pagamento_id}>
                    <td>{formatDate(row.data_pagamento)}</td>
                    <td>{row.tipo_pagamento?.nome || '—'}</td>
                    <td>{formatMoney(row.valor)}</td>
                    <td>{row.observacao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
