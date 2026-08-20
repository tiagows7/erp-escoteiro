import { NAV_ITEMS, type NavItem } from '@/config/navigation'
import {
  can,
  isGrupoAdmin,
  type AppRole,
  type Permission,
} from '@/lib/roles'
import type { Profile } from '@/types/database'

export type MenuAccessOption = {
  key: string
  label: string
  group: string
  permission?: Permission
  grupoAdminOnly?: boolean
}

/** Menus padrão do portal do associado (login por registro / importação Excel). */
export const ASSOCIADO_PORTAL_MENU_KEYS = [
  '/dashboard',
  '/calendario',
  '/portal-transparencia',
  '/conquistas',
  '/atividades',
  '/projetos',
  // Ação entre amigos: menu só se o associado tiver faixa (AppLayout).
  '/vendas/acao-entre-amigos',
  '/vendas/eventos',
  '/vendas/loja-online',
] as const

export type AssociadoPortalMenuKey =
  (typeof ASSOCIADO_PORTAL_MENU_KEYS)[number]

export function associadoPortalMenuKeys(): string[] {
  return [...ASSOCIADO_PORTAL_MENU_KEYS]
}

/** Menus que o admin do grupo pode marcar no cadastro de usuário. */
export function menuAccessCatalog(): MenuAccessOption[] {
  const options: MenuAccessOption[] = []

  for (const item of NAV_ITEMS) {
    if (item.type === 'link') {
      // Reservados à plataforma / admin do grupo via papel.
      if (
        item.to === '/grupos' ||
        item.to === '/backup' ||
        item.to === '/grupos/meu' ||
        item.to === '/mensalidade-plataforma' ||
        item.to.startsWith('/plataforma/')
      ) {
        continue
      }
      options.push({
        key: item.to,
        label: item.label,
        group: 'Geral',
        permission: item.permission,
        grupoAdminOnly: item.grupoAdminOnly,
      })
      continue
    }

    // Grupo "Mensalidade plataforma" só para super_admin.
    if (item.id === 'plataforma') continue

    for (const child of item.children) {
      options.push({
        key: child.to,
        label: child.label,
        group: item.label,
        permission: child.permission,
        grupoAdminOnly: child.grupoAdminOnly,
      })
    }
  }

  return options
}

/** Opções de menu permitidas para o papel (pré-marca / padrão). */
export function menuAccessCatalogForRole(role: AppRole): MenuAccessOption[] {
  const admin = isGrupoAdmin(role)
  return menuAccessCatalog().filter((opt) => {
    if (opt.grupoAdminOnly && !admin) return false
    if (!opt.permission) return true
    return can(role, opt.permission)
  })
}

/**
 * Catálogo completo para o formulário de usuário (admin marca o que liberar).
 * Inclui Projetos, tipos de pagamento/mensalidade, fornecedores, etc.
 */
export function menuAccessCatalogForForm(): MenuAccessOption[] {
  return menuAccessCatalog()
}

/** Menus padrão liberados para o papel (pré-marca no formulário). */
export function defaultMenuKeysForRole(role: AppRole): string[] {
  return menuAccessCatalogForRole(role).map((opt) => opt.key)
}

/** Mantém só chaves que existem no catálogo do grupo (não corta pelo papel). */
export function pruneMenuKeysForRole(
  _role: AppRole,
  keys: string[] | null | undefined,
): string[] {
  if (!keys?.length) return []
  const allowed = new Set(menuAccessCatalog().map((opt) => opt.key))
  return keys.filter((key) => allowed.has(key))
}

export function normalizeMenuKeys(
  value: unknown,
): string[] | null {
  if (value == null) return null
  if (!Array.isArray(value)) return null
  const keys = value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
  return keys
}

export function profileUsesMenuKeys(
  profile: Pick<Profile, 'registro' | 'menu_keys' | 'role'> | null | undefined,
): boolean {
  if (!profile) return false
  // Super admin da plataforma: menu completo (grupos, backup, etc.).
  if (profile.role === 'super_admin') return false
  return Array.isArray(profile.menu_keys) && profile.menu_keys.length > 0
}

export function pathMatchesMenuKey(pathname: string, menuKey: string): boolean {
  // Chaves antigas usavam "/" como home (= dashboard).
  if (menuKey === '/' || menuKey === '/dashboard') {
    return pathname === '/' || pathname === '/dashboard'
  }
  if (menuKey === '/portal-transparencia') {
    return (
      pathname === '/portal-transparencia' ||
      pathname.startsWith('/transparencia/')
    )
  }
  // Relatório/inclusão de receitas também liberam registrar recebimento
  // (rota irmã /receitas/recebimento/:id — não é filha do menu).
  if (menuKey === '/receitas/relatorio' || menuKey === '/receitas/inclusao') {
    if (
      pathname === '/receitas/recebimento' ||
      pathname.startsWith('/receitas/recebimento/')
    ) {
      return true
    }
  }
  return pathname === menuKey || pathname.startsWith(`${menuKey}/`)
}

/** Menus sempre liberados mesmo com menu_keys restrito (equipe e associado). */
export const ALWAYS_VISIBLE_MENU_KEYS = [
  '/dashboard',
  // Admin do grupo: item só entra no nav se role=admin.
  '/grupos/meu',
  '/sugestoes-melhoria',
] as const

/**
 * Menus do portal do associado que continuam visíveis mesmo se menu_keys
 * personalizado omitir (importações antigas).
 */
export const ASSOCIADO_ALWAYS_VISIBLE_MENU_KEYS = [
  '/calendario',
  '/projetos',
  '/vendas/eventos',
  '/vendas/loja-online',
] as const

/** Itens só de plataforma — nunca filtrar por menu_keys. */
export const PLATFORM_MENU_KEYS = [
  '/grupos',
  '/backup',
  '/plataforma/planos',
  '/plataforma/cobrancas',
  '/plataforma/gerar',
  '/plataforma/efi-pix',
  '/mensalidade-plataforma',
] as const

function isAlwaysVisibleMenuKey(
  to: string,
  associadoLogin: boolean,
): boolean {
  if (
    ALWAYS_VISIBLE_MENU_KEYS.includes(
      to as (typeof ALWAYS_VISIBLE_MENU_KEYS)[number],
    )
  ) {
    return true
  }
  if (
    associadoLogin &&
    ASSOCIADO_ALWAYS_VISIBLE_MENU_KEYS.includes(
      to as (typeof ASSOCIADO_ALWAYS_VISIBLE_MENU_KEYS)[number],
    )
  ) {
    return true
  }
  return PLATFORM_MENU_KEYS.includes(
    to as (typeof PLATFORM_MENU_KEYS)[number],
  )
}

export function pathAllowedByMenuKeys(
  pathname: string,
  menuKeys: string[] | null | undefined,
  opts?: { associadoLogin?: boolean },
): boolean {
  if (menuKeys == null) return true
  const associadoLogin = opts?.associadoLogin === true
  if (
    ALWAYS_VISIBLE_MENU_KEYS.some((key) => pathMatchesMenuKey(pathname, key))
  ) {
    return true
  }
  if (
    associadoLogin &&
    ASSOCIADO_ALWAYS_VISIBLE_MENU_KEYS.some((key) =>
      pathMatchesMenuKey(pathname, key),
    )
  ) {
    return true
  }
  if (
    PLATFORM_MENU_KEYS.some((key) => pathMatchesMenuKey(pathname, key))
  ) {
    return true
  }
  return menuKeys.some((key) => pathMatchesMenuKey(pathname, key))
}

export function firstAllowedMenuPath(
  menuKeys: string[] | null | undefined,
): string {
  if (!menuKeys?.length) return '/dashboard'
  const first = menuKeys[0] ?? '/dashboard'
  // Evita loop: "/" redireciona para o dashboard.
  if (first === '/') return '/dashboard'
  return first
}

export function filterNavItemsByMenuKeys(
  items: NavItem[],
  menuKeys: string[] | null | undefined,
  opts?: { associadoLogin?: boolean },
): NavItem[] {
  if (menuKeys == null) return items
  const associadoLogin = opts?.associadoLogin === true

  return items
    .map((item) => {
      if (item.type === 'link') {
        return menuKeys.includes(item.to) ||
          isAlwaysVisibleMenuKey(item.to, associadoLogin)
          ? item
          : null
      }
      const children = item.children.filter(
        (child) =>
          menuKeys.includes(child.to) ||
          isAlwaysVisibleMenuKey(child.to, associadoLogin),
      )
      if (children.length === 0) return null
      return { ...item, children }
    })
    .filter((item): item is NavItem => item != null)
}
