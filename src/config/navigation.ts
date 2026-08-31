import type { Permission } from '@/lib/roles'
import { isAssociadoLogin, isRamoFinanceiroScoped } from '@/lib/roles'
import type { Profile } from '@/types/database'

export type NavLinkItem = {
  type: 'link'
  to: string
  label: string
  end?: boolean
  permission?: Permission
  /** Só administrador do grupo (ou super_admin) */
  grupoAdminOnly?: boolean
  /** Se definido, abre URL externa em nova aba (to = chave de menu). */
  externalUrl?: string
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
    to: '/dashboard',
    label: 'Dashboard',
    permission: 'dashboard.view',
  },
  {
    type: 'link',
    to: '/calendario',
    label: 'Calendário',
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
    id: 'documentos',
    label: 'Documentos',
    anyOf: ['dashboard.view'],
    children: [
      {
        type: 'link',
        to: '/regimento-interno',
        label: 'Regimento interno',
        permission: 'dashboard.view',
      },
      {
        type: 'link',
        to: '/documentos/por-online',
        label: 'P.O.R online',
        permission: 'dashboard.view',
        externalUrl: 'https://www.guiadecola.com.br/por/',
      },
    ],
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
    type: 'group',
    id: 'estoque',
    label: 'Estoque',
    anyOf: ['estoque.view'],
    children: [
      {
        type: 'link',
        to: '/estoque/produtos',
        label: 'Produtos',
        permission: 'estoque.view',
      },
      {
        type: 'link',
        to: '/estoque/grupos-produtos',
        label: 'Grupo de produto',
        permission: 'estoque.view',
      },
      {
        type: 'link',
        to: '/estoque/acerto',
        label: 'Acerto de estoque',
        permission: 'estoque.view',
      },
    ],
  },
  {
    type: 'link',
    to: '/atividades',
    label: 'Atividades',
    permission: 'atividades.view',
  },
  // Eventos oculto por enquanto
  // {
  //   type: 'link',
  //   to: '/eventos',
  //   label: 'Eventos',
  //   permission: 'eventos.view',
  // },
  {
    type: 'group',
    id: 'vendas',
    label: 'Vendas',
    anyOf: ['vendas.view'],
    children: [
      {
        type: 'link',
        to: '/vendas/acao-entre-amigos',
        label: 'Ação entre amigos',
        permission: 'vendas.view',
      },
      {
        type: 'link',
        to: '/vendas/eventos',
        label: 'Eventos',
        permission: 'vendas.view',
      },
      {
        type: 'link',
        to: '/vendas/loja',
        label: 'Loja local',
        permission: 'vendas.view',
      },
      {
        type: 'link',
        to: '/vendas/loja-online',
        label: 'Loja online',
        permission: 'vendas.view',
      },
    ],
  },
  {
    type: 'link',
    to: '/projetos',
    label: 'Projetos',
    permission: 'projetos.view',
  },
  {
    type: 'link',
    to: '/grupos',
    label: 'Grupos escoteiros',
    permission: 'grupos.write',
  },
  {
    type: 'group',
    id: 'plataforma',
    label: 'Mensalidade plataforma',
    anyOf: ['plataforma.view', 'plataforma.write'],
    children: [
      {
        type: 'link',
        to: '/plataforma/planos',
        label: 'Planos',
        permission: 'plataforma.view',
      },
      {
        type: 'link',
        to: '/plataforma/cobrancas',
        label: 'Cobranças',
        permission: 'plataforma.view',
      },
      {
        type: 'link',
        to: '/plataforma/gerar',
        label: 'Gerar cobranças',
        permission: 'plataforma.write',
      },
      {
        type: 'link',
        to: '/plataforma/efi-pix',
        label: 'PIX Efí',
        permission: 'plataforma.write',
      },
    ],
  },
  {
    type: 'link',
    to: '/grupos/meu',
    label: 'Grupo escoteiro',
    permission: 'grupos.view',
  },
  {
    type: 'link',
    to: '/mensalidade-plataforma',
    label: 'Mensalidade do sistema',
  },
  {
    type: 'link',
    to: '/sugestoes-melhoria',
    label: 'Sugestões de melhorias',
  },
  {
    type: 'link',
    to: '/auditoria',
    label: 'Auditoria',
    permission: 'auditoria.view',
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
  profile: Pick<
    Profile,
    'registro' | 'codigo_ramo' | 'role' | 'menu_keys'
  > | null,
): NavItem[] {
  if (isAssociadoLogin(profile)) {
    const associadoMenus: NavItem[] = [
      {
        type: 'link',
        to: '/dashboard',
        label: 'Dashboard',
        end: true,
        permission: 'dashboard.view',
      },
      {
        type: 'link',
        to: '/calendario',
        label: 'Calendário',
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
        id: 'documentos',
        label: 'Documentos',
        anyOf: ['dashboard.view'],
        children: [
          {
            type: 'link',
            to: '/regimento-interno',
            label: 'Regimento interno',
            permission: 'dashboard.view',
          },
          {
            type: 'link',
            to: '/documentos/por-online',
            label: 'P.O.R online',
            permission: 'dashboard.view',
            externalUrl: 'https://www.guiadecola.com.br/por/',
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
        to: '/projetos',
        label: 'Projetos',
        permission: 'projetos.view',
      },
      {
        type: 'link',
        to: '/vendas/acao-entre-amigos',
        label: 'Ação entre amigos',
        permission: 'vendas.view',
      },
      {
        type: 'link',
        to: '/vendas/eventos',
        label: 'Comprar convites',
        permission: 'vendas.view',
      },
      {
        type: 'link',
        to: '/vendas/loja-online',
        label: 'Loja online',
        permission: 'vendas.view',
      },
    ]
    const keys = profile?.menu_keys
    if (Array.isArray(keys) && keys.length > 0) {
      const keySet = new Set(
        keys.map((k) => (k === '/' ? '/dashboard' : k)),
      )
      const alwaysTo = [
        '/dashboard',
        '/calendario',
        '/regimento-interno',
        '/documentos/por-online',
        '/projetos',
        '/vendas/eventos',
        '/vendas/loja-online',
      ] as const

      const filtered: NavItem[] = []
      for (const item of associadoMenus) {
        if (item.type === 'link') {
          if (
            keySet.has(item.to) ||
            alwaysTo.includes(item.to as (typeof alwaysTo)[number])
          ) {
            filtered.push(item)
          }
          continue
        }
        const children = item.children.filter(
          (child) =>
            keySet.has(child.to) ||
            alwaysTo.includes(child.to as (typeof alwaysTo)[number]),
        )
        if (children.length > 0) {
          filtered.push({ ...item, children })
        }
      }

      // Garante itens alwaysTo que ainda não entraram (links avulsos).
      for (const to of alwaysTo) {
        const already = filtered.some(
          (item) =>
            (item.type === 'link' && item.to === to) ||
            (item.type === 'group' &&
              item.children.some((c) => c.to === to)),
        )
        if (already) continue
        const fromMenus = associadoMenus.find(
          (entry) => entry.type === 'link' && entry.to === to,
        )
        if (fromMenus) filtered.push(fromMenus)
      }

      // Ordem fixa: Dashboard → Calendário → demais.
      const ordemTopo = ['/dashboard', '/calendario'] as const
      filtered.sort((a, b) => {
        const toOf = (item: NavItem) =>
          item.type === 'link' ? item.to : item.id
        const ia = ordemTopo.indexOf(
          toOf(a) as (typeof ordemTopo)[number],
        )
        const ib = ordemTopo.indexOf(
          toOf(b) as (typeof ordemTopo)[number],
        )
        if (ia === -1 && ib === -1) return 0
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
      return filtered
    }
    return associadoMenus
  }

  const items = NAV_ITEMS.map((item) => {
    if (item.type !== 'group') return item
    // Login por e-mail: itens de cadastro seguem só a permissão do papel.
    return {
      ...item,
      children: item.children.filter(
        (child) => !child.grupoAdminOnly || !isAssociadoLogin(profile),
      ),
    }
  }).filter((item) => {
    // Super admin: lista de grupos + backup + mensalidade plataforma.
    // Admin do grupo: só "Grupo escoteiro".
    if (item.type === 'group' && item.id === 'plataforma') {
      return profile?.role === 'super_admin'
    }
    if (item.type !== 'link') return true
    if (item.to === '/grupos' || item.to === '/backup') {
      return profile?.role === 'super_admin'
    }
    // Admin do grupo (não super_admin da plataforma).
    if (item.to === '/grupos/meu') {
      return profile?.role === 'admin'
    }
    // Só o super admin vê "Mensalidade do sistema" (com grupo em contexto).
    if (item.to === '/mensalidade-plataforma') {
      return profile?.role === 'super_admin'
    }
    // Só login por e-mail (equipe); associados (registro) não veem.
    if (item.to === '/sugestoes-melhoria') {
      return !isAssociadoLogin(profile)
    }
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
