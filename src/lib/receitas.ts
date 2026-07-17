/** Situação de títulos financeiros (despesa / receita) */
export const TITULO_SITUACAO = {
  ABERTO: 1,
  PARCIAL: 2,
  PAGO: 3,
} as const

export const RECEITA_ORIGEM = {
  AVULSA: 'A',
  MENSALIDADE: 'M',
} as const

export function situacaoTituloLabel(situacao: number | null | undefined): string {
  switch (situacao) {
    case TITULO_SITUACAO.ABERTO:
      return 'Aberto'
    case TITULO_SITUACAO.PARCIAL:
      return 'Parcial'
    case TITULO_SITUACAO.PAGO:
      return 'Pago'
    default:
      return situacao != null ? String(situacao) : '—'
  }
}

export function situacaoFromSaldo(valor: number, saldo: number): number {
  if (saldo <= 0) return TITULO_SITUACAO.PAGO
  if (saldo < valor) return TITULO_SITUACAO.PARCIAL
  return TITULO_SITUACAO.ABERTO
}

export function formatMoney(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatCompetencia(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m] = value.slice(0, 10).split('-')
  if (!y || !m) return value
  return `${m}/${y}`
}

/** Converte input type=month (YYYY-MM) para date do 1º dia */
export function competenciaToDate(monthValue: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(monthValue)) return null
  return `${monthValue}-01`
}

export function dateToCompetenciaInput(value: string | null | undefined): string {
  if (!value) return ''
  return value.slice(0, 7)
}

export function currentCompetenciaInput(): string {
  const now = new Date()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${m}`
}

export function lastDayOfCompetencia(monthValue: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(monthValue)) return null
  const [y, m] = monthValue.split('-').map(Number)
  const last = new Date(y, m, 0)
  const dd = String(last.getDate()).padStart(2, '0')
  const mm = String(last.getMonth() + 1).padStart(2, '0')
  return `${last.getFullYear()}-${mm}-${dd}`
}
