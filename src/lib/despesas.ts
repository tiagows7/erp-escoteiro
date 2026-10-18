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

/** Máscara decimal simples (ex.: percentual): só dígitos e uma vírgula. */
export function maskDecimalInput(raw: string, maxDecimals = 2): string {
  let s = String(raw ?? '').replace(/[^\d,]/g, '')
  const comma = s.indexOf(',')
  if (comma >= 0) {
    const intPart = s.slice(0, comma).replace(/^0+(?=\d)/, '') || '0'
    const decPart = s
      .slice(comma + 1)
      .replace(/,/g, '')
      .slice(0, maxDecimals)
    return `${intPart},${decPart}`
  }
  return s.replace(/^0+(?=\d)/, '')
}
