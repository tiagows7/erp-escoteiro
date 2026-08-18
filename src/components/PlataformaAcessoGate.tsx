import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'

const ALLOWED_WHEN_BLOCKED = new Set([
  '/mensalidade-plataforma',
  '/termos',
  '/privacidade',
])

/**
 * Bloqueia o app quando a mensalidade da plataforma passou da tolerância.
 * Mantém só a tela de mensalidade (e logout via layout).
 */
export function PlataformaAcessoGate({
  children,
}: {
  children: React.ReactNode
}) {
  const { isSuperAdmin, plataformaAcesso } = useAuth()
  const location = useLocation()

  if (isSuperAdmin) return children

  const blocked = plataformaAcesso.nivel === 'bloqueado'
  const path = location.pathname
  const allowed =
    ALLOWED_WHEN_BLOCKED.has(path) ||
    path.startsWith('/mensalidade-plataforma')

  if (blocked && !allowed) {
    return <Navigate to="/mensalidade-plataforma" replace />
  }

  return children
}

/** Banner de aviso (5 dias / em atraso na tolerância). */
export function PlataformaAcessoBanner() {
  const { isSuperAdmin, plataformaAcesso } = useAuth()
  if (isSuperAdmin) return null
  if (plataformaAcesso.nivel !== 'aviso' || !plataformaAcesso.mensagem) {
    return null
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      <AlertMessage tone="info" title="Mensalidade da plataforma">
        <p style={{ margin: 0 }}>{plataformaAcesso.mensagem}</p>
        <p style={{ margin: '0.5rem 0 0' }}>
          <Link to="/mensalidade-plataforma">Ver cobrança e pagar</Link>
        </p>
      </AlertMessage>
    </div>
  )
}
