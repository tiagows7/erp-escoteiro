/**
 * Papéis e permissões do ERP Escoteiro.
 * Ajuste aqui quando novos módulos ganharem regras diferentes por tipo de usuário.
 */

export const APP_ROLES = [
  'super_admin',
  'admin',
  'tesoureiro',
  'chefe',
  'escotista',
  'leitura',
] as const

export type AppRole = (typeof APP_ROLES)[number]

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Administrador da plataforma',
  admin: 'Administrador do grupo',
  tesoureiro: 'Tesoureiro',
  chefe: 'Chefe / Coordenação',
  escotista: 'Escotista',
  leitura: 'Somente leitura',
}

/** Módulos/ações que o app pode liberar ou bloquear */
export const PERMISSIONS = [
  'dashboard.view',
  'associados.view',
  'associados.write',
  'estrutura.view',
  'estrutura.write',
  'estoque.view',
  'estoque.write',
  'financeiro.view',
  'financeiro.write',
  'portal.view',
  'usuarios.view',
  'usuarios.write',
  'atividades.view',
  'atividades.write',
  'eventos.view',
  'eventos.write',
  'vendas.view',
  'vendas.write',
  'projetos.view',
  'projetos.write',
  'grupos.view',
  'grupos.write',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const ALL: Permission[] = [...PERMISSIONS]

const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  super_admin: ALL,
  admin: [
    'dashboard.view',
    'associados.view',
    'associados.write',
    'estrutura.view',
    'estrutura.write',
    'estoque.view',
    'estoque.write',
    'financeiro.view',
    'financeiro.write',
    'portal.view',
    'usuarios.view',
    'usuarios.write',
    'atividades.view',
    'atividades.write',
    'eventos.view',
    'eventos.write',
    'vendas.view',
    'vendas.write',
    'projetos.view',
    'projetos.write',
    'grupos.view',
  ],
  tesoureiro: [
    'dashboard.view',
    'associados.view',
    'associados.write',
    'estrutura.view',
    'estoque.view',
    'financeiro.view',
    'financeiro.write',
    'portal.view',
    'atividades.view',
    'atividades.write',
    'vendas.view',
    'vendas.write',
  ],
  chefe: [
    'dashboard.view',
    'associados.view',
    'associados.write',
    'estrutura.view',
    'estrutura.write',
    'estoque.view',
    'estoque.write',
    'portal.view',
    'atividades.view',
    'atividades.write',
    'eventos.view',
    'eventos.write',
    'vendas.view',
    'vendas.write',
    'projetos.view',
    'projetos.write',
  ],
  escotista: [
    'dashboard.view',
    'associados.view',
    'associados.write',
    'estrutura.view',
    'estoque.view',
    'portal.view',
    'atividades.view',
    'atividades.write',
    'eventos.view',
    'vendas.view',
    'vendas.write',
  ],
  leitura: [
    'dashboard.view',
    'associados.view',
    'estrutura.view',
    'estoque.view',
    'financeiro.view',
    'portal.view',
    'atividades.view',
    'eventos.view',
    'vendas.view',
    'projetos.view',
  ],
}

export function isAppRole(value: string | null | undefined): value is AppRole {
  return !!value && (APP_ROLES as readonly string[]).includes(value)
}

export function normalizeRole(value: string | null | undefined): AppRole {
  if (isAppRole(value)) return value

  // Legado Delphi (USUARIOS.TIPO)
  switch ((value ?? '').toUpperCase()) {
    case 'S':
      return 'super_admin'
    case 'A':
      return 'admin'
    case 'T':
      return 'tesoureiro'
    case 'C':
      return 'chefe'
    case 'E':
      return 'escotista'
    case 'L':
      return 'leitura'
    case 'R':
      return 'admin'
    default:
      return 'escotista'
  }
}

export function rolePermissions(role: AppRole): Permission[] {
  return ROLE_PERMISSIONS[role]
}

export function can(role: AppRole | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function canAny(
  role: AppRole | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.some((permission) => can(role, permission))
}

const LOGIN_VIA_KEY = 'erp-escoteiro:login-via'

/** Grava se o acesso foi por e-mail (equipe) ou por nº de registro (associado). */
export function setLoginVia(via: 'email' | 'registro') {
  try {
    sessionStorage.setItem(LOGIN_VIA_KEY, via)
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearLoginVia() {
  try {
    sessionStorage.removeItem(LOGIN_VIA_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Portal do associado (menu limitado, sem Cadastros / sem editar atividade).
 * Equipe (admin, chefe, escotista, etc.) NUNCA entra nesse modo — mesmo com
 * nº de registro no perfil. Login por e-mail também força modo equipe.
 */
export function isAssociadoLogin(profile: {
  registro?: string | null
  email?: string | null
  role?: AppRole | string | null
} | null | undefined): boolean {
  if (!profile?.registro || !String(profile.registro).trim()) return false

  // Papéis de equipe: UI completa (Cadastros, nova/editar atividade).
  if (profile.role && profile.role !== 'leitura') return false

  try {
    const via = sessionStorage.getItem(LOGIN_VIA_KEY)
    if (via === 'email') return false
    if (via === 'registro') return true
  } catch {
    /* ignore */
  }

  const email = (profile.email ?? '').trim().toLowerCase()
  // E-mail real (não sintético da importação) = acesso de equipe.
  if (email.includes('@') && !email.endsWith('@usuarios.local')) {
    return false
  }

  // Somente leitura + registro (portal do associado / e-mail @usuarios.local).
  return true
}

/** Infere modo de login a partir do e-mail do Auth (restauração de sessão). */
export function inferLoginViaFromAuthEmail(
  authEmail: string | null | undefined,
): void {
  const email = (authEmail ?? '').trim().toLowerCase()
  if (!email.includes('@')) return
  setLoginVia(email.endsWith('@usuarios.local') ? 'registro' : 'email')
}

/** Administrador do grupo (ou da plataforma). */
export function isGrupoAdmin(
  role: AppRole | null | undefined,
): boolean {
  return role === 'admin' || role === 'super_admin'
}

/** Login por e-mail com ramo: financeiro só do próprio ramo/seção. */
export function isRamoFinanceiroScoped(profile: {
  registro?: string | null
  codigo_ramo?: number | null
} | null | undefined): boolean {
  if (isAssociadoLogin(profile)) return false
  const ramo = profile?.codigo_ramo
  return ramo != null && ramo >= 1 && ramo <= 4
}

/** Ramo do usuário staff (e-mail) para filtrar consultas; null = vê todos. */
export function staffRamoScope(profile: {
  registro?: string | null
  codigo_ramo?: number | null
} | null | undefined): number | null {
  if (!isRamoFinanceiroScoped(profile)) return null
  return profile!.codigo_ramo ?? null
}

export function financeiroScopeFromProfile(profile: {
  codigo_ramo?: number | null
  codigo_secao?: number | null
} | null | undefined): { ramo: number; secao: number | null } | null {
  const ramo = profile?.codigo_ramo
  if (ramo == null || ramo < 1 || ramo > 4) return null
  const secao = profile?.codigo_secao
  return {
    ramo,
    secao: secao != null && secao > 0 ? secao : null,
  }
}

const ASSOCIADO_PERMISSIONS: Permission[] = [
  'dashboard.view',
  'portal.view',
  'atividades.view',
  'projetos.view',
  'vendas.view',
  'vendas.write',
]

const RAMO_FINANCEIRO_PERMISSIONS: Permission[] = [
  'financeiro.view',
  'financeiro.write',
]

export function canForProfile(
  role: AppRole | null | undefined,
  profile: {
    registro?: string | null
    email?: string | null
    role?: AppRole | string | null
    codigo_ramo?: number | null
  } | null | undefined,
  permission: Permission,
): boolean {
  if (isAssociadoLogin(profile)) {
    return ASSOCIADO_PERMISSIONS.includes(permission)
  }
  if (
    isRamoFinanceiroScoped(profile) &&
    RAMO_FINANCEIRO_PERMISSIONS.includes(permission)
  ) {
    return true
  }
  return can(role, permission)
}

export function canAnyForProfile(
  role: AppRole | null | undefined,
  profile: {
    registro?: string | null
    email?: string | null
    role?: AppRole | string | null
    codigo_ramo?: number | null
  } | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.some((p) => canForProfile(role, profile, p))
}
