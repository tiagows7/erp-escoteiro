import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'

const emptyForm = {
  descricao: '',
}

export function GrupoProdutoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('estoque.write')
  const empresaId = empresa?.id
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('grupo_produto')
        .select('grupoproduto_id, nome')
        .eq('grupoproduto_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Grupo de produto não encontrado')
        setLoading(false)
        return
      }

      setForm({
        descricao: data.nome ?? '',
      })
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar grupos de produto.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (!form.descricao.trim()) {
      setError('Informe a descrição.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      empresa_id: empresaId,
      nome: form.descricao.trim().toUpperCase().slice(0, 50),
    }

    const result = isNew
      ? await supabase
          .from('grupo_produto')
          .insert(payload)
          .select('grupoproduto_id')
          .single()
      : await supabase
          .from('grupo_produto')
          .update(payload)
          .eq('grupoproduto_id', Number(id))
          .eq('empresa_id', empresaId)
          .select('grupoproduto_id')
          .single()

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    navigate('/estoque/grupos-produtos', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || !empresaId || isNew) return
    const ok = await toast.confirm({
      title: 'Excluir grupo de produto?',
      message: `Tem certeza que deseja excluir "${form.descricao}"?`,
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)

    const { error: delError } = await supabase
      .from('grupo_produto')
      .delete()
      .eq('grupoproduto_id', Number(id))
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (delError) {
      setError(delError.message)
      return
    }

    navigate('/estoque/grupos-produtos', {
      state: { flashSuccess: 'Grupo de produto excluído com sucesso!' },
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
    return <div className="loading">Carregando…</div>
  }

  const disabled = saving || !canWrite

  return (
    <>
      <header className="page-header">
        <div>
          <h2>
            {isNew ? 'Novo grupo de produto' : 'Editar grupo de produto'}
          </h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link className="btn btn-soft" to="/estoque/grupos-produtos">
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
            <label htmlFor="descricao">Descrição</label>
            <input
              id="descricao"
              className="input"
              value={form.descricao}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, descricao: e.target.value }))
              }
              disabled={disabled}
              required
              maxLength={50}
            />
            <span className="field-hint">Até 50 caracteres.</span>
          </div>
        </div>

        <div className="form-actions">
          {canWrite ? (
            <>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={saving}
              >
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
          ) : (
            <p className="muted">Modo leitura — sem permissão para salvar.</p>
          )}
          <Link className="btn btn-soft" to="/estoque/grupos-produtos">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
