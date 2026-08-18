import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  firstAllowedMenuPath,
  pathAllowedByMenuKeys,
  pathMatchesMenuKey,
  profileUsesMenuKeys,
} from '@/lib/menuAccess'
import { useAssociadoAcaoEntreAmigos } from '@/hooks/useAssociadoAcaoEntreAmigos'
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
  const {
    associadoLogin,
    loading: acaoLoading,
    temAcao,
  } = useAssociadoAcaoEntreAmigos()
  const isAcaoPath = pathMatchesMenuKey(
    location.pathname,
    '/vendas/acao-entre-amigos',
  )

  if (loading || (associadoLogin && isAcaoPath && acaoLoading)) {
    return <div className="loading">Carregando permissões…</div>
  }

  if (grupoAdmin && !isGrupoAdmin(role)) {
    return <Navigate to="/dashboard" replace />
  }

  const allowed = permission
    ? hasPermission(permission)
    : anyOf
      ? hasAnyPermission(anyOf)
      : true

  if (!allowed) {
    return <Navigate to="/dashboard" replace />
  }

  // Associado sem faixa: não acessa ação entre amigos.
  if (associadoLogin && isAcaoPath && !temAcao) {
    return <Navigate to="/dashboard" replace />
  }

  if (profileUsesMenuKeys(profile)) {
    const menuOk = pathAllowedByMenuKeys(
      location.pathname,
      profile?.menu_keys,
    )
    // Eventos / Loja online: sempre liberados para quem tem vendas.view.
    // Equipe (e-mail): Cadastros liberado conforme permissão do papel.
    // Associado: Projetos sempre; ação só se tiver faixa.
    const isCadastrosPath =
      pathMatchesMenuKey(location.pathname, '/associados') ||
      pathMatchesMenuKey(location.pathname, '/cadastros') ||
      pathMatchesMenuKey(location.pathname, '/secoes') ||
      pathMatchesMenuKey(location.pathname, '/patrulhas')
    const menuBypass =
      pathMatchesMenuKey(location.pathname, '/dashboard') ||
      pathMatchesMenuKey(location.pathname, '/vendas/eventos') ||
      pathMatchesMenuKey(location.pathname, '/vendas/loja-online') ||
      pathMatchesMenuKey(location.pathname, '/calendario') ||
      (!isAssociadoLogin(profile) && isCadastrosPath) ||
      (isAssociadoLogin(profile) &&
        (pathMatchesMenuKey(location.pathname, '/projetos') ||
          (isAcaoPath && temAcao)))
    if (!menuOk && !menuBypass) {
      const fallback = firstAllowedMenuPath(profile?.menu_keys)
      // Evita Navigate para a própria rota (loop).
      if (pathMatchesMenuKey(location.pathname, fallback)) {
        return children
      }
      return <Navigate to={fallback} replace />
    }
  }

  return children
}
