import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import { isAssociadoLogin } from '@/lib/roles'

export function RegimentoInternoPage() {
  const { empresa, profile } = useAuth()
  const toast = useToast()
  const empresaId = empresa?.id
  const associadoLogin = isAssociadoLogin(profile)

  /** Usuário do grupo (sem ramo 1–5): pode cadastrar/editar. */
  const canCadastrar = (() => {
    if (associadoLogin) return false
    const r = profile?.codigo_ramo
    return r == null || r < 1 || r > 5
  })()

  const [texto, setTexto] = useState('')
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaId) {
      setTexto('')
      setLoading(false)
      return
    }

    let mounted = true
    void (async () => {
      setLoading(true)
      const { data, error: loadError } = await supabase
        .from('empresa')
        .select('regimento_interno')
        .eq('id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError) {
        setError(loadError.message)
        setTexto('')
      } else {
        setError(null)
        const value = (data?.regimento_interno as string | null) ?? ''
        setTexto(value)
        setDraft(value)
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId])

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (!canCadastrar || !empresaId) return

    setSaving(true)
    setError(null)
    const value = draft.trim()
    const { error: saveError } = await supabase
      .from('empresa')
      .update({ regimento_interno: value || null })
      .eq('id', empresaId)

    setSaving(false)
    if (saveError) {
      setError(saveError.message)
      return
    }

    setTexto(value)
    setDraft(value)
    setEditing(false)
    toast.success('Regimento salvo')
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

  return (
    <>
      <WaitingOverlay open={saving} message="Salvando regimento…" />
      <header className="page-header">
        <div>
          <h2>Regimento interno</h2>
          <p>
            Documento do grupo — <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canCadastrar && !editing ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setDraft(texto)
              setEditing(true)
            }}
          >
            {texto.trim() ? 'Editar' : 'Cadastrar'}
          </button>
        ) : null}
        {canCadastrar && editing ? (
          <button
            type="button"
            className="btn btn-soft"
            disabled={saving}
            onClick={() => {
              setDraft(texto)
              setEditing(false)
              setError(null)
            }}
          >
            Cancelar
          </button>
        ) : null}
      </header>

      {error ? (
        <AlertMessage tone="error" title="Não foi possível continuar">
          {error}
        </AlertMessage>
      ) : null}

      {loading ? (
        <section className="panel">
          <div className="loading">Carregando…</div>
        </section>
      ) : editing && canCadastrar ? (
        <form className="panel" onSubmit={(e) => void onSave(e)}>
          <p className="muted" style={{ marginTop: 0 }}>
            Cole ou digite o texto do regimento interno. Ele será exibido para
            quem entra com número de registro.
          </p>
          <div className="field">
            <label htmlFor="regimento_interno">Texto do regimento</label>
            <textarea
              id="regimento_interno"
              className="input"
              rows={18}
              value={draft}
              disabled={saving}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Cole aqui o regimento interno do grupo…"
              style={{ resize: 'vertical', minHeight: '20rem' }}
            />
          </div>
          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              Salvar
            </button>
          </div>
        </form>
      ) : texto.trim() ? (
        <section className="panel">
          <div className="regimento-interno-texto">{texto}</div>
        </section>
      ) : (
        <section className="panel">
          <p className="muted" style={{ margin: 0 }}>
            {canCadastrar
              ? 'Nenhum regimento cadastrado. Use Cadastrar para colar o texto.'
              : 'O regimento interno ainda não foi publicado pelo grupo.'}
          </p>
        </section>
      )}
    </>
  )
}
