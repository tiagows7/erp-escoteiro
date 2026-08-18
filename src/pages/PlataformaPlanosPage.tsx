import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { formatMoney, type PlataformaPlano } from '@/lib/plataforma'

const emptyForm = {
  nome: '',
  valor: '',
  ativo: true,
}

export function PlataformaPlanosPage() {
  const { isSuperAdmin, hasPermission } = useAuth()
  const canWrite = isSuperAdmin && hasPermission('plataforma.write')
  const toast = useToast()

  const [rows, setRows] = useState<PlataformaPlano[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error: qError } = await supabase
      .from('plataforma_plano')
      .select('plano_id, nome, valor, ativo')
      .order('nome')
    if (qError) {
      setError(qError.message)
      setRows([])
    } else {
      setError(null)
      setRows((data as PlataformaPlano[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!isSuperAdmin) return
    void load()
  }, [isSuperAdmin])

  const ativos = useMemo(() => rows.filter((r) => r.ativo), [rows])

  function startNew() {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
    setError(null)
  }

  function startEdit(row: PlataformaPlano) {
    setEditingId(row.plano_id)
    setForm({
      nome: row.nome,
      valor: String(row.valor ?? ''),
      ativo: row.ativo !== false,
    })
    setShowForm(true)
    setError(null)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canWrite) return
    const nome = form.nome.trim()
    const valor = Number(String(form.valor).replace(',', '.'))
    if (!nome) {
      setError('Informe o nome do plano.')
      return
    }
    if (!Number.isFinite(valor) || valor < 0) {
      setError('Informe um valor válido.')
      return
    }

    setSaving(true)
    setError(null)
    const payload = {
      nome,
      valor,
      ativo: form.ativo,
      updated_at: new Date().toISOString(),
    }

    const result =
      editingId == null
        ? await supabase.from('plataforma_plano').insert(payload)
        : await supabase
            .from('plataforma_plano')
            .update(payload)
            .eq('plano_id', editingId)

    setSaving(false)
    if (result.error) {
      setError(result.error.message)
      return
    }

    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    toast.success(editingId == null ? 'Plano criado.' : 'Plano atualizado.')
    void load()
  }

  if (!isSuperAdmin) {
    return (
      <section className="panel">
        <p className="muted">Acesso restrito ao administrador da plataforma.</p>
      </section>
    )
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Planos da plataforma</h2>
          <p>Mensalidade cobrada de cada grupo escoteiro cadastrado.</p>
        </div>
        <div className="page-header-actions actions-pair">
          <Link className="btn btn-soft" to="/plataforma/cobrancas">
            Cobranças
          </Link>
          {canWrite ? (
            <button
              type="button"
              className="btn btn-primary btn-with-icon"
              onClick={startNew}
            >
              <AddIcon />
              Novo plano
            </button>
          ) : null}
        </div>
      </header>

      {showForm ? (
        <form className="panel" onSubmit={(e) => void onSubmit(e)}>
          <h3 style={{ marginTop: 0 }}>
            {editingId == null ? 'Novo plano' : 'Editar plano'}
          </h3>
          {error ? (
            <AlertMessage tone="error" title="Atenção">
              {error}
            </AlertMessage>
          ) : null}
          <div className="form-grid form-grid-2">
            <div className="field">
              <label htmlFor="plano_nome">Nome</label>
              <input
                id="plano_nome"
                className="input"
                value={form.nome}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, nome: e.target.value }))
                }
                required
                maxLength={80}
                disabled={saving}
              />
            </div>
            <div className="field">
              <label htmlFor="plano_valor">Valor mensal</label>
              <input
                id="plano_valor"
                className="input"
                inputMode="decimal"
                value={form.valor}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, valor: e.target.value }))
                }
                required
                disabled={saving}
              />
            </div>
            <div className="field field-checks">
              <label>
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, ativo: e.target.checked }))
                  }
                  disabled={saving}
                />
                Plano ativo
              </label>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              className="btn btn-soft"
              disabled={saving}
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <section className="panel">
        {error && !showForm ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}
        {loading ? (
          <div className="loading">Carregando planos…</div>
        ) : rows.length === 0 ? (
          <div className="empty">Nenhum plano cadastrado.</div>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              {ativos.length} ativo(s) · {rows.length} no total
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Valor mensal</th>
                    <th>Situação</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.plano_id}>
                      <td>{row.nome}</td>
                      <td>{formatMoney(row.valor)}</td>
                      <td>{row.ativo ? 'Ativo' : 'Inativo'}</td>
                      <td>
                        {canWrite ? (
                          <button
                            type="button"
                            className="btn btn-soft"
                            onClick={() => startEdit(row)}
                          >
                            Editar
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  )
}
