/** Labels e helpers da auditoria ampla. */

export const AUDITORIA_ACOES = ['INSERT', 'UPDATE', 'DELETE'] as const

export type AuditoriaAcao = (typeof AUDITORIA_ACOES)[number]

export const AUDITORIA_TABELA_LABELS: Record<string, string> = {
  associados: 'Associados',
  profiles: 'Usuários',
  secao: 'Seções',
  secao_nome: 'Matilhas / Patrulhas / Clã',
  tipo_pagamento: 'Tipo de pagamento',
  tipo_mensalidade: 'Tipo de mensalidade',
  fornecedor_despesa: 'Fornecedores',
  empresa: 'Grupo escoteiro',
  empresa_conta_bancaria: 'Conta bancária',
  empresa_saldo_local: 'Locais do saldo',
  grupo_produto: 'Grupo de produto',
  produto: 'Produtos',
  movimento_estoque: 'Movimento de estoque',
  receitas: 'Receitas',
  receita_pagamento: 'Recebimentos',
  despesas: 'Despesas',
  despesa_pagamento: 'Pagamentos de despesa',
  atividades: 'Atividades',
  atividade_pagamento: 'Pagamento de atividade',
  atividade_confirmacao: 'Confirmação de atividade',
  projetos: 'Projetos',
  calendario_grupo: 'Calendário',
  acao_entre_amigos: 'Ação entre amigos',
  acao_entre_amigos_faixa: 'Faixas (ação)',
  acao_entre_amigos_venda: 'Vendas (ação)',
  venda_eventos: 'Eventos',
  venda_evento_compra: 'Compras de evento',
  venda_evento_convite: 'Convites',
  venda_evento_tipo: 'Tipos de convite',
  loja_pedido: 'Pedidos da loja',
  loja_pedido_item: 'Itens do pedido (loja)',
  infinitepay_pedidos: 'Pedidos InfinitePay',
  pix_cobrancas: 'Cobranças PIX',
  lgpd_consentimento_log: 'Consentimento LGPD',
}

export function tabelaAuditoriaLabel(tabela: string | null | undefined): string {
  if (!tabela) return '—'
  return AUDITORIA_TABELA_LABELS[tabela] ?? tabela
}

export function acaoAuditoriaLabel(acao: string | null | undefined): string {
  switch (acao) {
    case 'INSERT':
      return 'Inclusão'
    case 'UPDATE':
      return 'Alteração'
    case 'DELETE':
      return 'Exclusão'
    default:
      return acao ?? '—'
  }
}

export function formatAuditoriaQuando(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function prettyJson(value: unknown): string {
  if (value == null) return '—'
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
