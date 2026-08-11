import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  firstAllowedMenuPath,
  pathAllowedByMenuKeys,
  pathMatchesMenuKey,
  profileUsesMenuKeys,
} from '@/lib/menuAccess'
import { isAssociadoLogin, isGrupoAdmin, type Permission } from '@/lib/roles'

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
  const { loading, hasPermission, hasAnyPermission, role, profile } = useAuth()
  const location = useLocation()

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

  if (profileUsesMenuKeys(profile)) {
    const menuOk = pathAllowedByMenuKeys(
      location.pathname,
      profile?.menu_keys,
    )
    // Associado: Projetos (leitura) e Ação entre amigos (venda) sempre liberados.
    const associadoExtra =
      isAssociadoLogin(profile) &&
      (pathMatchesMenuKey(location.pathname, '/projetos') ||
        pathMatchesMenuKey(location.pathname, '/vendas/acao-entre-amigos'))
    if (!menuOk && !associadoExtra) {
      return (
        <Navigate
          to={firstAllowedMenuPath(profile?.menu_keys)}
          replace
        />
      )
    }
  }

  return children
}
