/** Situação da despesa (legado Delphi / ERP) */
export const DESPESA_SITUACAO = {
  ABERTO: 1,
  PARCIAL: 2,
  PAGO: 3,
} as const

export function situacaoDespesaLabel(situacao: number | null | undefined): string {
  switch (situacao) {
    case DESPESA_SITUACAO.ABERTO:
      return 'Aberto'
    case DESPESA_SITUACAO.PARCIAL:
      return 'Parcial'
    case DESPESA_SITUACAO.PAGO:
      return 'Pago'
    default:
      return situacao != null ? String(situacao) : '—'
  }
}

export function situacaoFromSaldo(valor: number, saldo: number): number {
  if (saldo <= 0) return DESPESA_SITUACAO.PAGO
  if (saldo < valor) return DESPESA_SITUACAO.PARCIAL
  return DESPESA_SITUACAO.ABERTO
}

export function formatMoney(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function parseMoneyInput(value: string): number {
  const cleaned = value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}
