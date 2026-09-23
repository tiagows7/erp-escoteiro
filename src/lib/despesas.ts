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

/** Formata número para input monetário pt-BR (ex.: 1234.5 → "1.234,50"). */
export function formatMoneyInput(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0,00'
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Máscara de valor enquanto digita: só dígitos, tratados como centavos
 * (ex.: "1" → "0,01", "1234" → "12,34").
 */
export function maskMoneyInput(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (!digits) return '0,00'
  const capped = digits.slice(0, 15)
  const cents = Number(capped)
  if (!Number.isFinite(cents)) return '0,00'
  return formatMoneyInput(cents / 100)
}

export function parseMoneyInput(value: string): number {
  const cleaned = value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}
