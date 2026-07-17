import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { Permission } from '@/lib/roles'

type Props = {
  permission?: Permission
  anyOf?: Permission[]
  children: React.ReactNode
}

/** Bloqueia a rota se o papel do usuário não tiver a permissão */
export function RequirePermission({ permission, anyOf, children }: Props) {
  const { loading, hasPermission, hasAnyPermission } = useAuth()

  if (loading) {
    return <div className="loading">Carregando permissões…</div>
  }

  const allowed = permission
    ? hasPermission(permission)
    : anyOf
      ? hasAnyPermission(anyOf)
      : true

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  return children
}
