import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  formatMoney,
  situacaoFromSaldo,
  situacaoTituloLabel,
} from '@/lib/receitas'
import {
  applyReceitaScope,
  matchesFinanceiroScope,
  resolveFinanceiroScope,
} from '@/lib/financeiroScope'
import {
  atividadeLabel,
  loadAtividadesLookup,
  type AtividadeLookup,
} from '@/lib/atividadesLookup'

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

export function ReceitaRecebimentoFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const scope = useMemo(() => resolveFinanceiroScope(profile), [profile])

  const [receita, setReceita] = useState<{
    receita_id: number
    receita_descricao: string | null
    receita_valor: number
    receita_saldo: number
    receita_situacao: number | null
    receita_vencimento: string | null
    receita_ramo: number | null
    receita_secao: number | null
    associado_nome: string | null
  } | null>(null)
  const [historico, setHistorico] = useState<PagamentoRow[]>([])
  const [tipos, setTipos] = useState<TipoPagamento[]>([])
  const [atividades, setAtividades] = useState<AtividadeLookup[]>([])
  const [atividadeId, setAtividadeId] = useState('')
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
      let receitaQuery = supabase
        .from('receitas')
        .select(
          'receita_id, receita_descricao, receita_valor, receita_saldo, receita_situacao, receita_vencimento, receita_ramo, receita_secao, atividade_id, associados(nome)',
        )
        .eq('receita_id', Number(id))
        .eq('empresa_id', empresaId)
      receitaQuery = applyReceitaScope(receitaQuery, scope)

      const [d, t, h, ativ] = await Promise.all([
        receitaQuery.maybeSingle(),
        supabase
          .from('tipo_pagamento')
          .select('tipopagto_id, nome, quita')
          .eq('empresa_id', empresaId)
          .order('nome'),
        supabase
          .from('receita_pagamento')
          .select(
            'pagamento_id, data_pagamento, valor, observacao, tipo_pagamento(nome)',
          )
          .eq('receita_id', Number(id))
          .eq('empresa_id', empresaId)
          .order('data_pagamento', { ascending: false }),
        loadAtividadesLookup(empresaId, { scope }),
      ])

      if (!mounted) return

      if (d.error || !d.data) {
        setError(
          scope
            ? 'Receita não encontrada ou fora do seu ramo/seção.'
            : (d.error?.message ?? 'Receita não encontrada'),
        )
        setReceita(null)
        setLoading(false)
        return
      }

      const row = d.data as {
        receita_id: number
        receita_descricao: string | null
        receita_valor: number | null
        receita_saldo: number | null
        receita_situacao: number | null
        receita_vencimento: string | null
        receita_ramo: number | null
        receita_secao: number | null
        atividade_id: number | null
        associados: { nome: string | null } | null
      }

      if (
        !matchesFinanceiroScope(scope, row.receita_ramo, row.receita_secao)
      ) {
        setError('Esta receita não pertence ao seu ramo/seção.')
        setReceita(null)
        setLoading(false)
        return
      }

      const saldo = Number(row.receita_saldo ?? 0)
      setReceita({
        receita_id: row.receita_id,
        receita_descricao: row.receita_descricao,
        receita_valor: Number(row.receita_valor ?? 0),
        receita_saldo: saldo,
        receita_situacao: row.receita_situacao,
        receita_vencimento: row.receita_vencimento,
        receita_ramo: row.receita_ramo,
        receita_secao: row.receita_secao,
        associado_nome: row.associados?.nome ?? null,
      })
      setAtividadeId(row.atividade_id?.toString() ?? '')
      setValorPago(saldo > 0 ? String(saldo) : '')
      setTipos((t.data as TipoPagamento[]) ?? [])
      setHistorico((h.data as unknown as PagamentoRow[]) ?? [])
      setAtividades(ativ.data)
      setError(null)
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, id, scope])

  const atividadesFiltradas = useMemo(() => {
    if (!receita) return atividades
    let list = atividades
    if (receita.receita_ramo != null) {
      list = list.filter((a) => a.ramo === receita.receita_ramo)
    }
    if (receita.receita_secao != null) {
      list = list.filter((a) => a.secao === receita.receita_secao)
    }
    return list
  }, [atividades, receita])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite || !empresaId || !receita) return

    const valor = Number(String(valorPago).replace(',', '.'))
    if (!Number.isFinite(valor) || valor <= 0) {
      setError('Informe um valor de recebimento válido.')
      return
    }
    if (valor > receita.receita_saldo + 0.001) {
      setError('O valor não pode ser maior que o saldo em aberto.')
      return
    }
    if (!dataPagamento) {
      setError('Informe a data do recebimento.')
      return
    }

    setSaving(true)
    setError(null)

    const { error: insertError } = await supabase.from('receita_pagamento').insert({
      empresa_id: empresaId,
      receita_id: receita.receita_id,
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

    const newSaldo = Math.max(
      0,
      Number((receita.receita_saldo - valor).toFixed(2)),
    )
    const { error: updateError } = await supabase
      .from('receitas')
      .update({
        receita_saldo: newSaldo,
        receita_situacao: situacaoFromSaldo(receita.receita_valor, newSaldo),
        atividade_id: atividadeId ? Number(atividadeId) : null,
      })
      .eq('receita_id', receita.receita_id)
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    navigate('/receitas/recebimento', {
      state: { flashSuccess: 'Recebimento registrado com sucesso!' },
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
    return <div className="loading">Carregando receita…</div>
  }

  if (!receita) {
    return (
      <section className="panel">
        <AlertMessage tone="error" title="Atenção">
          {error ?? 'Receita não encontrada'}
        </AlertMessage>
        <Link className="btn btn-soft" to="/receitas/recebimento">
          Voltar
        </Link>
      </section>
    )
  }

  const disabled = saving || !canWrite || receita.receita_saldo <= 0

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Registrar recebimento</h2>
          <p>
            {receita.receita_descricao || 'Receita'} ·{' '}
            {situacaoTituloLabel(receita.receita_situacao)}
          </p>
        </div>
        <Link className="btn btn-soft" to="/receitas/recebimento">
          Voltar
        </Link>
      </header>

      <section className="panel" style={{ marginBottom: '1rem' }}>
        <div className="form-grid">
          <div className="field">
            <label>Associado</label>
            <p className="muted" style={{ margin: 0 }}>
              {receita.associado_nome || '—'}
            </p>
          </div>
          <div className="field">
            <label>Vencimento</label>
            <p className="muted" style={{ margin: 0 }}>
              {formatDate(receita.receita_vencimento)}
            </p>
          </div>
          <div className="field">
            <label>Valor original</label>
            <p style={{ margin: 0, fontWeight: 700 }}>
              {formatMoney(receita.receita_valor)}
            </p>
          </div>
          <div className="field">
            <label>Saldo em aberto</label>
            <p style={{ margin: 0, fontWeight: 700, color: '#b02a37' }}>
              {formatMoney(receita.receita_saldo)}
            </p>
          </div>
          <div className="field field-span-2">
            <label>Atividade</label>
            <p className="muted" style={{ margin: 0 }}>
              {atividadeId
                ? atividadeLabel(
                    atividadesFiltradas.find(
                      (a) => a.atividade_id === Number(atividadeId),
                    ) ??
                      atividades.find(
                        (a) => a.atividade_id === Number(atividadeId),
                      ) ?? {
                        atividade_id: Number(atividadeId),
                        descricao: `Atividade #${atividadeId}`,
                        local: null,
                        ramo: null,
                        secao: null,
                        valor: 0,
                      },
                  )
                : '—'}
            </p>
          </div>
        </div>
      </section>

      {receita.receita_saldo > 0 ? (
        <form className="panel" onSubmit={(e) => void onSubmit(e)}>
          {error ? (
            <AlertMessage tone="error" title="Atenção">
              {error}
            </AlertMessage>
          ) : null}

          <div className="form-grid">
            <div className="field field-span-2">
              <label htmlFor="atividade_id">Atividade</label>
              <select
                id="atividade_id"
                className="select"
                value={atividadeId}
                onChange={(e) => setAtividadeId(e.target.value)}
                disabled={disabled}
              >
                <option value="">Nenhuma</option>
                {atividadesFiltradas.map((a) => (
                  <option key={a.atividade_id} value={a.atividade_id}>
                    {atividadeLabel(a)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="valorPago">Valor recebido</label>
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
                {saving ? 'Salvando…' : 'Confirmar recebimento'}
              </button>
            ) : (
              <p className="muted">Sem permissão para receber.</p>
            )}
            <Link className="btn btn-soft" to="/receitas/recebimento">
              Cancelar
            </Link>
          </div>
        </form>
      ) : (
        <section className="panel">
          <div className="empty">Esta receita já está quitada.</div>
        </section>
      )}

      <section className="panel" style={{ marginTop: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Histórico de recebimentos</h3>
        {historico.length === 0 ? (
          <div className="empty">Nenhum recebimento registrado.</div>
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
