import type { Permission } from '@/lib/roles'
import { isAssociadoLogin, isRamoFinanceiroScoped } from '@/lib/roles'
import type { Profile } from '@/types/database'

export type NavLinkItem = {
  type: 'link'
  to: string
  label: string
  end?: boolean
  permission?: Permission
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
      },
      {
        type: 'link',
        to: '/secoes',
        label: 'Seção',
        permission: 'estrutura.view',
      },
      {
        type: 'link',
        to: '/patrulhas',
        label: 'Matilhas / Patrulhas / Clã',
        permission: 'estrutura.view',
      },
      {
        type: 'link',
        to: '/cadastros/tipo-mensalidade',
        label: 'Tipo de Mensalidade',
        permission: 'financeiro.view',
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
        to: '/receitas/recebimento',
        label: 'Contas a receber',
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
]

/** Menu do associado (login por registro): dashboard + atividades + portal. */
export function navItemsForProfile(
  profile: Pick<Profile, 'registro' | 'codigo_ramo'> | null,
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
        to: '/atividades',
        label: 'Atividades',
        permission: 'atividades.view',
      },
      {
        type: 'link',
        to: '/portal-transparencia',
        label: 'Portal da Transparência',
        permission: 'portal.view',
      },
    ]
  }

  if (!isRamoFinanceiroScoped(profile)) return NAV_ITEMS

  // Login e-mail com ramo: financeiro sem gera mensalidade (só próprio ramo/seção).
  return NAV_ITEMS.map((item) => {
    if (item.type !== 'group' || item.id !== 'receitas') return item
    return {
      ...item,
      children: item.children.filter(
        (child) => child.to !== '/receitas/gera-mensalidade',
      ),
    }
  })
}
