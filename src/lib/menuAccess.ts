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
  '/',
  '/portal-transparencia',
  '/conquistas',
  '/atividades',
  '/projetos',
  // Ação entre amigos: menu só se o associado tiver faixa (AppLayout).
  '/vendas/acao-entre-amigos',
  '/vendas/eventos',
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
        item.to === '/grupos/meu'
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

/** Menus padrão liberados para o papel (pré-marca no formulário). */
export function defaultMenuKeysForRole(role: AppRole): string[] {
  const admin = isGrupoAdmin(role)
  return menuAccessCatalog()
    .filter((opt) => {
      if (opt.grupoAdminOnly && !admin) return false
      if (!opt.permission) return true
      return can(role, opt.permission)
    })
    .map((opt) => opt.key)
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
  profile: Pick<Profile, 'registro' | 'menu_keys'> | null | undefined,
): boolean {
  if (!profile) return false
  return Array.isArray(profile.menu_keys) && profile.menu_keys.length > 0
}

export function pathMatchesMenuKey(pathname: string, menuKey: string): boolean {
  if (menuKey === '/') return pathname === '/'
  if (menuKey === '/portal-transparencia') {
    return (
      pathname === '/portal-transparencia' ||
      pathname.startsWith('/transparencia/')
    )
  }
  return pathname === menuKey || pathname.startsWith(`${menuKey}/`)
}

export function pathAllowedByMenuKeys(
  pathname: string,
  menuKeys: string[] | null | undefined,
): boolean {
  if (menuKeys == null) return true
  return menuKeys.some((key) => pathMatchesMenuKey(pathname, key))
}

export function firstAllowedMenuPath(
  menuKeys: string[] | null | undefined,
): string {
  if (!menuKeys?.length) return '/'
  return menuKeys[0] ?? '/'
}

export function filterNavItemsByMenuKeys(
  items: NavItem[],
  menuKeys: string[] | null | undefined,
): NavItem[] {
  if (menuKeys == null) return items

  return items
    .map((item) => {
      if (item.type === 'link') {
        return menuKeys.includes(item.to) ? item : null
      }
      const children = item.children.filter((child) =>
        menuKeys.includes(child.to),
      )
      if (children.length === 0) return null
      return { ...item, children }
    })
    .filter((item): item is NavItem => item != null)
}
