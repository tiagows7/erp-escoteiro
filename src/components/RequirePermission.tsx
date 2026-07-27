import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { isGrupoAdmin, type Permission } from '@/lib/roles'

type Props = {
  permission?: Permission
  anyOf?: Permission[]
  /** Exige administrador do grupo (ou super_admin) */
  grupoAdmin?: boolean
  children: React.ReactNode
}

/** Bloqueia a rota se o papel do usuário não tiver a permissão */
export function RequirePermission({
  permission,
  anyOf,
  grupoAdmin,
  children,
}: Props) {
  const { loading, hasPermission, hasAnyPermission, role } = useAuth()

  if (loading) {
    return <div className="loading">Carregando permissões…</div>
  }

  if (grupoAdmin && !isGrupoAdmin(role)) {
    return <Navigate to="/" replace />
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
