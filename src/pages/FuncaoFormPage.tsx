import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import { isGrupoAdmin } from '@/lib/roles'

export function FuncaoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, hasPermission, role } = useAuth()
  const canWrite = hasPermission('estrutura.write') && isGrupoAdmin(role)
  const toast = useToast()

  const [nome, setNome] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    if (isNew) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('funcao')
        .select('funcao_id, nome')
        .eq('funcao_id', Number(id))
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Função não encontrada')
        setLoading(false)
        return
      }

      setNome(data.nome ?? '')
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar funções.')
      return
    }
    if (!nome.trim()) {
      setError('Informe o nome.')
      return
    }

    setSaving(true)
    setError(null)

    const payload = { nome: nome.trim().toUpperCase() }

    const result = isNew
      ? await supabase.from('funcao').insert(payload).select('funcao_id').single()
      : await supabase
          .from('funcao')
          .update(payload)
          .eq('funcao_id', Number(id))
          .select('funcao_id')
          .single()

    setSaving(false)

    if (result.error) {
      setError(result.error.message)
      return
    }

    navigate('/cadastros/funcao', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || isNew) return
    const ok = await toast.confirm({
      title: 'Excluir função?',
      message: `Tem certeza que deseja excluir "${nome}"? Associados com esta função ficarão sem vínculo.`,
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)
    const { error: delError } = await supabase
      .from('funcao')
      .delete()
      .eq('funcao_id', Number(id))
    setSaving(false)

    if (delError) {
      setError(delError.message)
      return
    }

    navigate('/cadastros/funcao', {
      state: { flashSuccess: 'Função excluída.' },
    })
  }

  const disabled = !canWrite || saving || loading

  return (
    <>
      <WaitingOverlay
        open={saving}
        title="Aguarde"
        message="Salvando no banco de dados. Isso pode levar alguns instantes…"
      />
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Nova função' : 'Editar função'}</h2>
          <p>
            Cadastro ligado ao campo Função dos associados
            {empresa?.nome ? (
              <>
                {' '}
                — <strong>{empresa.nome}</strong>
              </>
            ) : null}
          </p>
        </div>
        <Link className="btn btn-soft" to="/cadastros/funcao">
          Voltar
        </Link>
      </header>

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        {loading ? (
          <div className="loading">Carregando…</div>
        ) : (
          <>
            <div className="form-grid">
              <div className="field field-span-2">
                <label htmlFor="nome">Nome</label>
                <input
                  id="nome"
                  className="input"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  disabled={disabled}
                  required
                  maxLength={30}
                />
              </div>
            </div>

            <div className="form-actions">
              {canWrite ? (
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              ) : (
                <p className="muted">Somente consulta.</p>
              )}
              {!isNew && canWrite ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={saving}
                  onClick={() => void onDelete()}
                >
                  Excluir
                </button>
              ) : null}
              <Link className="btn btn-soft" to="/cadastros/funcao">
                Cancelar
              </Link>
            </div>
          </>
        )}
      </form>
    </>
  )
}
