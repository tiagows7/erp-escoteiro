import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { MoneyInput } from '@/components/MoneyInput'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import { formatMoney, formatMoneyInput, parseMoneyInput } from '@/lib/despesas'
import { PORTAL_CAIXAS } from '@/lib/portal'

type AcertoRow = {
  id: number
  caixa_id: number
  secao_id: number | null
  data_acerto: string
  valor: number
  observacao: string | null
  created_at: string
}

type Lookup = { id: number; nome: string; ramo?: number }

function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function caixaLabel(caixaId: number) {
  return PORTAL_CAIXAS.find((c) => c.id === caixaId)?.label ?? `Caixa ${caixaId}`
}

const emptyForm = {
  id: null as number | null,
  caixa_id: '0',
  secao_id: '',
  data_acerto: todayIso(),
  valor: '0,00',
  observacao: '',
}

export function PortalAcertoSaldoPage() {
  const { empresa, profile, hasPermission, isSuperAdmin } = useAuth()
  const toast = useToast()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id

  const [rows, setRows] = useState<AcertoRow[]>([])
  const [secoes, setSecoes] = useState<Lookup[]>([])
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scopedCaixas = useMemo(() => {
    const ramo = profile?.codigo_ramo
    if (ramo != null && ramo >= 1 && ramo <= 4 && !isSuperAdmin) {
      return PORTAL_CAIXAS.filter((c) => c.id === 0 || c.id === ramo)
    }
    return PORTAL_CAIXAS
  }, [profile?.codigo_ramo, isSuperAdmin])

  const secoesFiltradas = useMemo(() => {
    const caixa = Number(form.caixa_id)
    if (!(caixa >= 1 && caixa <= 4)) return []
    return secoes.filter((s) => s.ramo == null || s.ramo === caixa)
  }, [secoes, form.caixa_id])

  async function load() {
    if (!empresaId) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const [{ data, error: queryError }, secoesRes] = await Promise.all([
      supabase
        .from('portal_saldo_acerto')
        .select('id, caixa_id, secao_id, data_acerto, valor, observacao, created_at')
        .eq('empresa_id', empresaId)
        .order('data_acerto', { ascending: false })
        .order('id', { ascending: false }),
      supabase
        .from('secao')
        .select('secao_id, nome, ramo')
        .eq('empresa_id', empresaId)
        .order('nome'),
    ])
    if (queryError) {
      setError(queryError.message)
      setRows([])
    } else {
      setRows(
        ((data ?? []) as AcertoRow[]).map((row) => ({
          ...row,
          valor: Number(row.valor ?? 0),
        })),
      )
    }
    setSecoes(
      (
        (secoesRes.data ?? []) as Array<{
          secao_id: number
          nome: string
          ramo: number | null
        }>
      ).map((s) => ({
        id: s.secao_id,
        nome: s.nome,
        ramo: s.ramo ?? undefined,
      })),
    )
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [empresaId])

  function startEdit(row: AcertoRow) {
    setForm({
      id: row.id,
      caixa_id: String(row.caixa_id),
      secao_id: row.secao_id != null ? String(row.secao_id) : '',
      data_acerto: row.data_acerto.slice(0, 10),
      valor: formatMoneyInput(row.valor),
      observacao: row.observacao ?? '',
    })
  }

  function resetForm() {
    setForm({
      ...emptyForm,
      caixa_id: String(scopedCaixas[0]?.id ?? 0),
      data_acerto: todayIso(),
    })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!empresaId || !canWrite) return

    const caixaId = Number(form.caixa_id)
    if (!(caixaId >= 0 && caixaId <= 4)) {
      setError('Selecione o caixa.')
      return
    }
    if (!form.data_acerto) {
      setError('Informe a data de referência.')
      return
    }
    const valor = parseMoneyInput(form.valor)
    if (!Number.isFinite(valor)) {
      setError('Informe um valor válido.')
      return
    }

    setSaving(true)
    setError(null)
    const payload = {
      empresa_id: empresaId,
      caixa_id: caixaId,
      secao_id: form.secao_id ? Number(form.secao_id) : null,
      data_acerto: form.data_acerto,
      valor,
      observacao: form.observacao.trim() || null,
      updated_at: new Date().toISOString(),
      ...(form.id
        ? {}
        : { created_by: profile?.id ?? null }),
    }

    const result = form.id
      ? await supabase
          .from('portal_saldo_acerto')
          .update(payload)
          .eq('id', form.id)
          .eq('empresa_id', empresaId)
      : await supabase.from('portal_saldo_acerto').insert(payload)

    setSaving(false)
    if (result.error) {
      setError(result.error.message)
      return
    }
    toast.success(
      form.id
        ? 'Acerto de saldo atualizado.'
        : 'Acerto de saldo registrado. O portal usará esse valor no saldo inicial.',
    )
    resetForm()
    await load()
  }

  async function onDelete(row: AcertoRow) {
    if (!empresaId || !canWrite) return
    const ok = await toast.confirm({
      title: 'Excluir acerto?',
      message:
        'O saldo inicial do portal será recalculado sem este lançamento na próxima consulta.',
      confirmLabel: 'Excluir',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return
    setSaving(true)
    const { error: delError } = await supabase
      .from('portal_saldo_acerto')
      .delete()
      .eq('id', row.id)
      .eq('empresa_id', empresaId)
    setSaving(false)
    if (delError) {
      setError(delError.message)
      return
    }
    toast.success('Acerto excluído.')
    if (form.id === row.id) resetForm()
    await load()
  }

  const secaoNome = useMemo(() => {
    const map = new Map(secoes.map((s) => [s.id, s.nome]))
    return (id: number | null) => (id == null ? 'Todas' : map.get(id) ?? `Seção ${id}`)
  }, [secoes])

  if (!empresaId) {
    return (
      <section className="panel">
        <p className="muted">Selecione um grupo em contexto para acertar o saldo.</p>
      </section>
    )
  }

  return (
    <>
      <WaitingOverlay open={saving} title="Salvando…" message="Gravando o acerto de saldo." />
      <header className="page-header">
        <div>
          <h2>Acerto de saldo do portal</h2>
          <p>
            Define o saldo inicial do caixa no Portal da Transparência — útil para
            grupo novo ou grupo já em andamento.
          </p>
        </div>
      </header>

      <section className="panel">
        <p className="field-hint" style={{ marginBottom: '1rem' }}>
          Informe a data de referência (ex.: 01/11/2026) e o valor que o caixa já
          tinha nessa data. Esse valor entra no <strong>saldo inicial</strong> do
          portal a partir desse período, sem criar receita ou despesa.
        </p>

        {error ? (
          <AlertMessage tone="error" title="Não foi possível salvar">
            {error}
          </AlertMessage>
        ) : null}

        {canWrite ? (
          <form className="form-grid" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="acerto_caixa">Caixa</label>
              <select
                id="acerto_caixa"
                className="select"
                value={form.caixa_id}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    caixa_id: e.target.value,
                    secao_id: '',
                  }))
                }
                required
              >
                {scopedCaixas.map((caixa) => (
                  <option key={caixa.id} value={caixa.id}>
                    {caixa.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="acerto_secao">Seção (opcional)</label>
              <select
                id="acerto_secao"
                className="select"
                value={form.secao_id}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, secao_id: e.target.value }))
                }
                disabled={!(Number(form.caixa_id) >= 1 && Number(form.caixa_id) <= 4)}
              >
                <option value="">Todas / caixa inteiro</option>
                {secoesFiltradas.map((secao) => (
                  <option key={secao.id} value={secao.id}>
                    {secao.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="acerto_data">Data de referência</label>
              <input
                id="acerto_data"
                className="input"
                type="date"
                value={form.data_acerto}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, data_acerto: e.target.value }))
                }
                required
              />
            </div>

            <div className="field">
              <label htmlFor="acerto_valor">Saldo inicial (R$)</label>
              <MoneyInput
                id="acerto_valor"
                value={form.valor}
                onChange={(valor) => setForm((prev) => ({ ...prev, valor }))}
                required
              />
            </div>

            <div className="field field-span-2">
              <label htmlFor="acerto_obs">Observação</label>
              <input
                id="acerto_obs"
                className="input"
                value={form.observacao}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, observacao: e.target.value }))
                }
                maxLength={200}
                placeholder="Ex.: Saldo de abertura ao iniciar o uso do sistema"
              />
            </div>

            <div className="form-actions field-span-2">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {form.id ? 'Atualizar acerto' : 'Registrar acerto'}
              </button>
              {form.id ? (
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancelar edição
                </button>
              ) : null}
            </div>
          </form>
        ) : (
          <p className="muted">Seu usuário só pode consultar os acertos.</p>
        )}
      </section>

      <section className="panel">
        <h3>Acertos registrados</h3>
        {loading ? (
          <div className="loading">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="empty">Nenhum acerto de saldo cadastrado neste grupo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Caixa</th>
                  <th>Seção</th>
                  <th>Valor</th>
                  <th>Observação</th>
                  {canWrite ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.data_acerto)}</td>
                    <td>{caixaLabel(row.caixa_id)}</td>
                    <td>{secaoNome(row.secao_id)}</td>
                    <td>{formatMoney(row.valor)}</td>
                    <td>{row.observacao || '—'}</td>
                    {canWrite ? (
                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="btn btn-soft"
                            onClick={() => startEdit(row)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn-soft"
                            onClick={() => void onDelete(row)}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    ) : null}
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
