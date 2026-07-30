import type { Permission } from '@/lib/roles'
import {
  isAssociadoLogin,
  isGrupoAdmin,
  isRamoFinanceiroScoped,
} from '@/lib/roles'
import type { Profile } from '@/types/database'

export type NavLinkItem = {
  type: 'link'
  to: string
  label: string
  end?: boolean
  permission?: Permission
  /** Só administrador do grupo (ou super_admin) */
  grupoAdminOnly?: boolean
}

export type NavGroupItem = {
  type: 'group'
  id: string
  label: string
  /** Mostra o grupo se o usuário tiver qualquer uma destas permissões */
  anyOf?: Permission[]
  children: NavLinkItem[]
}

export type NavItem = NavLinkItem | NavGroupItem

/**
 * Menu alinhado ao Delphi (unit_main / SideMenu).
 * Itens já implementados apontam para as telas reais; demais usam placeholder.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    type: 'link',
    to: '/',
    label: 'Dashboard',
    end: true,
    permission: 'dashboard.view',
  },
  {
    type: 'link',
    to: '/portal-transparencia',
    label: 'Portal da Transparência',
    permission: 'portal.view',
  },
  {
    type: 'link',
    to: '/conquistas',
    label: 'Conquistas',
    permission: 'dashboard.view',
  },
  {
    type: 'group',
    id: 'cadastros',
    label: 'Cadastros',
    anyOf: [
      'associados.view',
      'usuarios.view',
      'estrutura.view',
      'financeiro.view',
    ],
    children: [
      {
        type: 'link',
        to: '/associados',
        label: 'Associados',
        permission: 'associados.view',
      },
      {
        type: 'link',
        to: '/cadastros/usuarios',
        label: 'Usuários',
        permission: 'usuarios.view',
      },
      {
        type: 'link',
        to: '/cadastros/tipo-pagamento',
        label: 'Tipo de Pagamento',
        permission: 'financeiro.view',
        grupoAdminOnly: true,
      },
      {
        type: 'link',
        to: '/secoes',
        label: 'Seção',
        permission: 'estrutura.view',
        grupoAdminOnly: true,
      },
      {
        type: 'link',
        to: '/patrulhas',
        label: 'Matilhas / Patrulhas / Clã',
        permission: 'estrutura.view',
        grupoAdminOnly: true,
      },
      {
        type: 'link',
        to: '/cadastros/tipo-mensalidade',
        label: 'Tipo de Mensalidade',
        permission: 'financeiro.view',
        grupoAdminOnly: true,
      },
      {
        type: 'link',
        to: '/cadastros/fornecedores',
        label: 'Fornecedor / Contatos',
        permission: 'financeiro.view',
      },
    ],
  },
  // Estoque oculto por enquanto
  // {
  //   type: 'group',
  //   id: 'estoque',
  //   label: 'Estoque',
  //   anyOf: ['estoque.view'],
  //   children: [
  //     {
  //       type: 'link',
  //       to: '/estoque/grupos-produtos',
  //       label: 'Grupo de Produtos',
  //       permission: 'estoque.view',
  //     },
  //     {
  //       type: 'link',
  //       to: '/estoque/produtos',
  //       label: 'Produtos',
  //       permission: 'estoque.view',
  //     },
  //     {
  //       type: 'link',
  //       to: '/estoque/entrada',
  //       label: 'Entrada de Estoque',
  //       permission: 'estoque.view',
  //     },
  //   ],
  // },
  {
    type: 'group',
    id: 'despesas',
    label: 'Despesas',
    anyOf: ['financeiro.view'],
    children: [
      {
        type: 'link',
        to: '/despesas/inclusao',
        label: 'Inclusão',
        permission: 'financeiro.view',
      },
      {
        type: 'link',
        to: '/despesas/pagamento',
        label: 'Pagamento',
        permission: 'financeiro.view',
      },
      {
        type: 'link',
        to: '/despesas/relatorio',
        label: 'Relatório',
        permission: 'financeiro.view',
      },
    ],
  },
  {
    type: 'group',
    id: 'receitas',
    label: 'Receitas',
    anyOf: ['financeiro.view'],
    children: [
      {
        type: 'link',
        to: '/receitas/inclusao',
        label: 'Inclusão',
        permission: 'financeiro.view',
      },
      {
        type: 'link',
        to: '/receitas/gera-mensalidade',
        label: 'Gera Mensalidade',
        permission: 'financeiro.view',
      },
      {
        type: 'link',
        to: '/receitas/relatorio',
        label: 'Relatório',
        permission: 'financeiro.view',
      },
    ],
  },
  {
    type: 'link',
    to: '/atividades',
    label: 'Atividades',
    permission: 'atividades.view',
  },
  {
    type: 'link',
    to: '/eventos',
    label: 'Eventos',
    permission: 'eventos.view',
  },
  // Vendas oculto por enquanto
  // {
  //   type: 'link',
  //   to: '/vendas',
  //   label: 'Vendas',
  //   permission: 'vendas.view',
  // },
  // Projetos oculto por enquanto
  // {
  //   type: 'link',
  //   to: '/projetos',
  //   label: 'Projetos',
  //   permission: 'projetos.view',
  // },
  {
    type: 'link',
    to: '/grupos',
    label: 'Grupos escoteiros',
    permission: 'grupos.write',
  },
  {
    type: 'link',
    to: '/grupos/meu',
    label: 'Grupo escoteiro',
    permission: 'grupos.view',
  },
  {
    type: 'link',
    to: '/backup',
    label: 'Backup do banco',
    permission: 'grupos.write',
  },
]

/** Menu do associado (login por registro): dashboard + atividades + portal. */
export function navItemsForProfile(
  profile: Pick<Profile, 'registro' | 'codigo_ramo' | 'role'> | null,
): NavItem[] {
  if (isAssociadoLogin(profile)) {
    return [
      {
        type: 'link',
        to: '/',
        label: 'Dashboard',
        end: true,
        permission: 'dashboard.view',
      },
      {
        type: 'link',
        to: '/portal-transparencia',
        label: 'Portal da Transparência',
        permission: 'portal.view',
      },
      {
        type: 'link',
        to: '/conquistas',
        label: 'Conquistas',
        permission: 'dashboard.view',
      },
      {
        type: 'link',
        to: '/atividades',
        label: 'Atividades',
        permission: 'atividades.view',
      },
    ]
  }

  const admin = isGrupoAdmin(profile?.role)

  const items = NAV_ITEMS.map((item) => {
    if (item.type !== 'group') return item
    return {
      ...item,
      children: item.children.filter(
        (child) => admin || !child.grupoAdminOnly,
      ),
    }
  }).filter((item) => {
    // Super admin: lista de grupos + backup. Admin do grupo: só "Grupo escoteiro".
    if (item.type !== 'link') return true
    if (item.to === '/grupos' || item.to === '/backup') {
      return profile?.role === 'super_admin'
    }
    if (item.to === '/grupos/meu') return profile?.role === 'admin'
    return true
  })

  if (!isRamoFinanceiroScoped(profile)) return items

  // Login e-mail com ramo: financeiro sem gera mensalidade (só próprio ramo/seção).
  return items.map((item) => {
    if (item.type !== 'group' || item.id !== 'receitas') return item
    return {
      ...item,
      children: item.children.filter(
        (child) => child.to !== '/receitas/gera-mensalidade',
      ),
    }
  })
}
