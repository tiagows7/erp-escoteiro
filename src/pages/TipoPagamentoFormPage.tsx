import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'

const emptyForm = {
  nome: '',
  quita: false,
}

export function TipoPagamentoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
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
        .from('tipo_pagamento')
        .select('tipopagto_id, nome, quita')
        .eq('tipopagto_id', Number(id))
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Tipo de pagamento não encontrado')
        setLoading(false)
        return
      }

      setForm({
        nome: data.nome ?? '',
        quita: data.quita === true,
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
      setError('Sem permissão para alterar tipos de pagamento.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (!form.nome.trim()) {
      setError('Informe o nome.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      empresa_id: empresaId,
      nome: form.nome.trim().toUpperCase(),
      quita: form.quita,
    }

    const result = isNew
      ? await supabase
          .from('tipo_pagamento')
          .insert(payload)
          .select('tipopagto_id')
          .single()
      : await supabase
          .from('tipo_pagamento')
          .update(payload)
          .eq('tipopagto_id', Number(id))
          .eq('empresa_id', empresaId)
          .select('tipopagto_id')
          .single()

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    navigate('/cadastros/tipo-pagamento', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || !empresaId || isNew) return
    const ok = await toast.confirm({
      title: 'Excluir tipo de pagamento?',
      message: `Tem certeza que deseja excluir "${form.nome}"?`,
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)

    const { error: delError } = await supabase
      .from('tipo_pagamento')
      .delete()
      .eq('tipopagto_id', Number(id))
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (delError) {
      setError(delError.message)
      return
    }

    navigate('/cadastros/tipo-pagamento', {
      state: { flashSuccess: 'Tipo de pagamento excluído com sucesso!' },
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
            {isNew ? 'Novo tipo de pagamento' : 'Editar tipo de pagamento'}
          </h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link className="btn btn-soft" to="/cadastros/tipo-pagamento">
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
            <label htmlFor="nome">Nome</label>
            <input
              id="nome"
              className="input"
              value={form.nome}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, nome: e.target.value }))
              }
              disabled={disabled}
              required
            />
          </div>
          <div className="field field-checks">
            <label>
              <input
                type="checkbox"
                checked={form.quita}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, quita: e.target.checked }))
                }
                disabled={disabled}
              />
              Quita (baixa automática)
            </label>
          </div>
        </div>

        <div className="form-actions">
          {canWrite ? (
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
          ) : (
            <p className="muted">Modo leitura — sem permissão para salvar.</p>
          )}
          <Link className="btn btn-soft" to="/cadastros/tipo-pagamento">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
