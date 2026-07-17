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
  'usuarios.view',
  'usuarios.write',
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
    'usuarios.view',
    'usuarios.write',
    'eventos.view',
    'eventos.write',
    'vendas.view',
    'vendas.write',
    'projetos.view',
    'projetos.write',
  ],
  tesoureiro: [
    'dashboard.view',
    'associados.view',
    'associados.write',
    'estrutura.view',
    'estoque.view',
    'financeiro.view',
    'financeiro.write',
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
    'eventos.view',
    'eventos.write',
    'projetos.view',
    'projetos.write',
  ],
  escotista: [
    'dashboard.view',
    'associados.view',
    'associados.write',
    'estrutura.view',
    'estoque.view',
    'eventos.view',
  ],
  leitura: [
    'dashboard.view',
    'associados.view',
    'estrutura.view',
    'estoque.view',
    'financeiro.view',
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
