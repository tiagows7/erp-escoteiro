import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

/** Admin do grupo: abre direto o cadastro do próprio grupo. */
export function GrupoMeuRedirectPage() {
  const { empresa, loading, isSuperAdmin } = useAuth()

  if (loading) {
    return <div className="loading">Carregando…</div>
  }

  if (isSuperAdmin) {
    return <Navigate to="/grupos" replace />
  }

  if (!empresa?.id) {
    return (
      <section className="panel">
        <p className="muted">
          Seu usuário não está vinculado a um grupo escoteiro.
        </p>
      </section>
    )
  }

  return <Navigate to={`/grupos/${empresa.id}`} replace />
}
