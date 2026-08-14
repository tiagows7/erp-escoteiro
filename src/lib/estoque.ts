/** Operações de movimento de estoque (acerto / loja). */

export const ESTOQUE_OPERACAO = {
  ENTRADA: 1,
  PERDAS: 2,
  DOACAO: 3,
  VENDA_LOJA: 10,
} as const

export type EstoqueOperacao =
  (typeof ESTOQUE_OPERACAO)[keyof typeof ESTOQUE_OPERACAO]

export const ESTOQUE_ORIGEM = {
  ACERTO: 'acerto',
  LOJA: 'loja',
} as const

export type EstoqueOrigem =
  (typeof ESTOQUE_ORIGEM)[keyof typeof ESTOQUE_ORIGEM]

export const ESTOQUE_OPERACAO_ACERTO = [
  {
    id: ESTOQUE_OPERACAO.ENTRADA,
    label: 'Entrada de Produtos',
    sinal: '+' as const,
    descricao: 'Soma no estoque',
  },
  {
    id: ESTOQUE_OPERACAO.PERDAS,
    label: 'Perdas',
    sinal: '-' as const,
    descricao: 'Diminui no estoque',
  },
  {
    id: ESTOQUE_OPERACAO.DOACAO,
    label: 'Doação',
    sinal: '-' as const,
    descricao: 'Diminui no estoque',
  },
] as const

export function operacaoAcertoLabel(op: number | null | undefined): string {
  const found = ESTOQUE_OPERACAO_ACERTO.find((o) => o.id === op)
  return found?.label ?? (op != null ? `Operação ${op}` : '—')
}

export function operacaoEstoqueLabel(op: number | null | undefined): string {
  if (op === ESTOQUE_OPERACAO.VENDA_LOJA) return 'Venda (loja)'
  return operacaoAcertoLabel(op)
}

export function sinalDaOperacao(op: number): '+' | '-' {
  const found = ESTOQUE_OPERACAO_ACERTO.find((o) => o.id === op)
  if (found) return found.sinal
  if (op === ESTOQUE_OPERACAO.VENDA_LOJA) return '-'
  return '+'
}

export function formatQty(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })
}

export function parseQtyInput(value: string): number {
  const cleaned = value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}
