import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  RECEITA_ORIGEM,
  formatMoney,
  situacaoFromSaldo,
  situacaoTituloLabel,
  TITULO_SITUACAO,
} from '@/lib/receitas'
import type { Ramo } from '@/types/database'

type Lookup = { id: number; nome: string; ramo?: number | null }

const emptyForm = {
  receita_descricao: '',
  associado_id: '',
  receita_ramo: '',
  receita_secao: '',
  receita_emissao: '',
  receita_vencimento: '',
  receita_valor: '',
  receita_observacao: '',
}

function numOrNull(value: string) {
  return value ? Number(value) : null
}

function strOrNull(value: string) {
  const v = value.trim()
  return v || null
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export function ReceitaFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const toast = useToast()

  const [form, setForm] = useState({
    ...emptyForm,
    receita_emissao: todayISO(),
    receita_vencimento: todayISO(),
  })
  const [origem, setOrigem] = useState<string>(RECEITA_ORIGEM.AVULSA)
  const [saldo, setSaldo] = useState<number | null>(null)
  const [situacao, setSituacao] = useState<number | null>(null)
  const [paidAmount, setPaidAmount] = useState(0)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Lookup[]>([])
  const [associados, setAssociados] = useState<Lookup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    if (!empresaId) return
    void Promise.all([
      supabase
        .from('ramos')
        .select('ramo_id, nome, idade_inicio, idade_fim')
        .order('ramo_id'),
      supabase
        .from('secao')
        .select('secao_id, nome, ramo')
        .eq('empresa_id', empresaId)
        .order('nome'),
      supabase
        .from('associados')
        .select('associado_id, nome')
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .order('nome')
        .limit(2000),
    ]).then(([r, s, a]) => {
      setRamos((r.data as Ramo[]) ?? [])
      setSecoes(
        (s.data ?? []).map((row) => ({
          id: row.secao_id as number,
          nome: row.nome as string,
          ramo: (row.ramo as number | null) ?? null,
        })),
      )
      setAssociados(
        (a.data ?? []).map((row) => ({
          id: row.associado_id as number,
          nome: row.nome as string,
        })),
      )
    })
  }, [empresaId])

  const secoesFiltradas = useMemo(() => {
    if (!form.receita_ramo) return secoes
    return secoes.filter((s) => s.ramo === Number(form.receita_ramo))
  }, [secoes, form.receita_ramo])

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('receitas')
        .select(
          'receita_id, receita_descricao, associado_id, receita_ramo, receita_secao, receita_emissao, receita_vencimento, receita_valor, receita_saldo, receita_situacao, receita_observacao, receita_origem',
        )
        .eq('receita_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Receita não encontrada')
        setLoading(false)
        return
      }

      const valorNum = Number(data.receita_valor ?? 0)
      const saldoNum = Number(data.receita_saldo ?? 0)

      setForm({
        receita_descricao: data.receita_descricao ?? '',
        associado_id: data.associado_id?.toString() ?? '',
        receita_ramo: data.receita_ramo?.toString() ?? '',
        receita_secao: data.receita_secao?.toString() ?? '',
        receita_emissao: data.receita_emissao?.slice(0, 10) ?? '',
        receita_vencimento: data.receita_vencimento?.slice(0, 10) ?? '',
        receita_valor: data.receita_valor != null ? String(data.receita_valor) : '',
        receita_observacao: data.receita_observacao ?? '',
      })
      setOrigem(data.receita_origem ?? RECEITA_ORIGEM.AVULSA)
      setSaldo(saldoNum)
      setSituacao(data.receita_situacao)
      setPaidAmount(Math.max(0, valorNum - saldoNum))
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId])

  function update<K extends keyof typeof emptyForm>(
    key: K,
    value: (typeof emptyForm)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar receitas.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (!form.receita_descricao.trim()) {
      setError('Informe a descrição.')
      return
    }
    const valor = Number(String(form.receita_valor).replace(',', '.'))
    if (!Number.isFinite(valor) || valor <= 0) {
      setError('Informe um valor maior que zero.')
      return
    }

    setSaving(true)
    setError(null)

    if (isNew) {
      const { error: insertError } = await supabase.from('receitas').insert({
        empresa_id: empresaId,
        receita_origem: RECEITA_ORIGEM.AVULSA,
        receita_descricao: form.receita_descricao.trim(),
        associado_id: numOrNull(form.associado_id),
        receita_ramo: numOrNull(form.receita_ramo),
        receita_secao: numOrNull(form.receita_secao),
        receita_emissao: strOrNull(form.receita_emissao),
        receita_vencimento: strOrNull(form.receita_vencimento),
        receita_valor: valor,
        receita_saldo: valor,
        receita_situacao: TITULO_SITUACAO.ABERTO,
        receita_observacao: strOrNull(form.receita_observacao),
      })

      setSaving(false)
      if (insertError) {
        setError(insertError.message)
        return
      }
    } else {
      if (origem === RECEITA_ORIGEM.MENSALIDADE && situacao !== TITULO_SITUACAO.ABERTO) {
        setSaving(false)
        setError('Mensalidade com recebimento não pode ser alterada por aqui.')
        return
      }

      const newSaldo =
        situacao === TITULO_SITUACAO.ABERTO
          ? valor
          : Math.max(0, valor - paidAmount)

      const { error: updateError } = await supabase
        .from('receitas')
        .update({
          receita_descricao: form.receita_descricao.trim(),
          associado_id: numOrNull(form.associado_id),
          receita_ramo: numOrNull(form.receita_ramo),
          receita_secao: numOrNull(form.receita_secao),
          receita_emissao: strOrNull(form.receita_emissao),
          receita_vencimento: strOrNull(form.receita_vencimento),
          receita_valor: valor,
          receita_saldo: newSaldo,
          receita_situacao: situacaoFromSaldo(valor, newSaldo),
          receita_observacao: strOrNull(form.receita_observacao),
        })
        .eq('receita_id', Number(id))
        .eq('empresa_id', empresaId)

      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }
    }

    navigate('/receitas/inclusao', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || !empresaId || isNew) return
    if (
      situacao === TITULO_SITUACAO.PAGO ||
      situacao === TITULO_SITUACAO.PARCIAL
    ) {
      setError('Não é possível excluir receita com recebimento registrado.')
      return
    }

    const ok = await toast.confirm({
      title: 'Excluir receita?',
      message: `Tem certeza que deseja excluir "${form.receita_descricao}"?`,
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)
    const { error: deleteError } = await supabase
      .from('receitas')
      .delete()
      .eq('receita_id', Number(id))
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    navigate('/receitas/inclusao', {
      state: { flashSuccess: 'Excluído com sucesso!' },
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

  const disabled = saving || !canWrite
  const isPaid = situacao === TITULO_SITUACAO.PAGO
  const isMensalidade = origem === RECEITA_ORIGEM.MENSALIDADE

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Nova receita' : 'Editar receita'}</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
            {!isNew && situacao != null ? (
              <>
                {' '}
                · {isMensalidade ? 'Mensalidade' : 'Avulsa'} ·{' '}
                {situacaoTituloLabel(situacao)}
                {saldo != null ? ` · Saldo ${formatMoney(saldo)}` : ''}
              </>
            ) : null}
          </p>
        </div>
        <Link className="btn btn-soft" to="/receitas/inclusao">
          Voltar
        </Link>
      </header>

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        <div className="form-grid">
          <div className="field field-span-2">
            <label htmlFor="receita_descricao">Descrição</label>
            <input
              id="receita_descricao"
              className="input"
              value={form.receita_descricao}
              onChange={(e) => update('receita_descricao', e.target.value)}
              disabled={disabled || isPaid}
              required
              maxLength={120}
            />
          </div>

          <div className="field field-span-2">
            <label htmlFor="associado_id">Associado (opcional)</label>
            <select
              id="associado_id"
              className="select"
              value={form.associado_id}
              onChange={(e) => update('associado_id', e.target.value)}
              disabled={disabled || isPaid || isMensalidade}
            >
              <option value="">Nenhum</option>
              {associados.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="receita_ramo">Ramo</label>
            <select
              id="receita_ramo"
              className="select"
              value={form.receita_ramo}
              onChange={(e) => {
                update('receita_ramo', e.target.value)
                update('receita_secao', '')
              }}
              disabled={disabled || isPaid}
            >
              <option value="">Selecione</option>
              {ramos.map((ramo) => (
                <option key={ramo.ramo_id} value={ramo.ramo_id}>
                  {ramo.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="receita_secao">Seção</label>
            <select
              id="receita_secao"
              className="select"
              value={form.receita_secao}
              onChange={(e) => update('receita_secao', e.target.value)}
              disabled={disabled || isPaid}
            >
              <option value="">Selecione</option>
              {secoesFiltradas.map((secao) => (
                <option key={secao.id} value={secao.id}>
                  {secao.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="receita_emissao">Emissão</label>
            <input
              id="receita_emissao"
              className="input"
              type="date"
              value={form.receita_emissao}
              onChange={(e) => update('receita_emissao', e.target.value)}
              disabled={disabled || isPaid}
            />
          </div>

          <div className="field">
            <label htmlFor="receita_vencimento">Vencimento</label>
            <input
              id="receita_vencimento"
              className="input"
              type="date"
              value={form.receita_vencimento}
              onChange={(e) => update('receita_vencimento', e.target.value)}
              disabled={disabled || isPaid}
            />
          </div>

          <div className="field">
            <label htmlFor="receita_valor">Valor</label>
            <input
              id="receita_valor"
              className="input"
              inputMode="decimal"
              value={form.receita_valor}
              onChange={(e) => update('receita_valor', e.target.value)}
              disabled={disabled || isPaid}
              required
            />
          </div>

          <div className="field field-span-2">
            <label htmlFor="receita_observacao">Observação</label>
            <input
              id="receita_observacao"
              className="input"
              value={form.receita_observacao}
              onChange={(e) => update('receita_observacao', e.target.value)}
              disabled={disabled || isPaid}
              maxLength={200}
            />
          </div>
        </div>

        <div className="form-actions">
          {canWrite && !isPaid ? (
            <>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {!isNew ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={saving}
                  onClick={() => void onDelete()}
                >
                  Excluir
                </button>
              ) : null}
            </>
          ) : isPaid ? (
            <p className="muted">Receita quitada — edição bloqueada.</p>
          ) : (
            <p className="muted">Modo leitura — sem permissão para salvar.</p>
          )}
          {!isNew && saldo != null && saldo > 0 && canWrite ? (
            <Link className="btn btn-soft" to={`/receitas/recebimento/${id}`}>
              Registrar recebimento
            </Link>
          ) : null}
          <Link className="btn btn-soft" to="/receitas/inclusao">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
