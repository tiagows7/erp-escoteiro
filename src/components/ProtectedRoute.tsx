import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, signOut } = useAuth()

  if (loading) {
    return <div className="loading">Carregando sessão…</div>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!profile) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ maxWidth: 420 }}>
          <p className="login-lead">
            Seu login existe, mas ainda não há perfil vinculado a um grupo
            escoteiro.
          </p>
          <p className="muted" style={{ marginBottom: '1rem' }}>
            Peça ao administrador para criar seu registro em{' '}
            <code>profiles</code> com <code>empresa_id</code> e{' '}
            <code>role</code>.
          </p>
          <button className="btn btn-primary" type="button" onClick={() => void signOut()}>
            Voltar ao login
          </button>
        </div>
      </div>
    )
  }

  if (!profile.ativo) {
    return (
      <div className="login-page">
        <div className="login-card" style={{ maxWidth: 420 }}>
          <p className="login-lead">Seu usuário está inativo.</p>
          <button className="btn btn-primary" type="button" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
      </div>
    )
  }

  return children
}
