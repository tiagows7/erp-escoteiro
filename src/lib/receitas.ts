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

/**
 * Data de vencimento na competência (YYYY-MM ou YYYY-MM-01)
 * com dia cadastrado (1–28). Sem dia → último dia do mês.
 */
export function vencimentoCompetencia(
  competencia: string,
  diaVencimento: number | null | undefined,
): string | null {
  const ym = competencia.slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(ym)) return null
  if (diaVencimento == null || !Number.isFinite(Number(diaVencimento))) {
    return lastDayOfCompetencia(ym)
  }
  const dia = Math.min(28, Math.max(1, Math.trunc(Number(diaVencimento))))
  const [y, m] = ym.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  const d = Math.min(dia, ultimo)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayLocalISO(): string {
  const n = new Date()
  const y = n.getFullYear()
  const m = String(n.getMonth() + 1).padStart(2, '0')
  const d = String(n.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Título em atraso: saldo aberto e vencimento anterior a hoje. */
export function isTituloEmAtraso(input: {
  receita_vencimento?: string | null
  receita_saldo?: number | null
  receita_situacao?: number | null
}): boolean {
  const saldo = Number(input.receita_saldo ?? 0)
  if (saldo <= 0) return false
  if (input.receita_situacao === TITULO_SITUACAO.PAGO) return false
  const venc = input.receita_vencimento?.slice(0, 10)
  if (!venc || !/^\d{4}-\d{2}-\d{2}$/.test(venc)) return false
  return venc < todayLocalISO()
}
