import { formatMoney } from '@/lib/despesas'
import { situacaoTituloLabel } from '@/lib/receitas'

export type PortalGrupo = {
  id: number
  nome: string
  slug: string
  logo_url: string | null
  telefone: string | null
  email: string | null
}

export type PortalResumo = {
  total_despesas: number
  total_receitas: number
  despesas_pagas: number
  receitas_recebidas: number
  saldo_lancado: number
  saldo_realizado: number
  /** Soma recebida − paga antes do início do período (regime de caixa). */
  saldo_anterior: number
  /** saldo_anterior + (recebido − pago) do período. */
  saldo_final: number
  /** Saldo em aberto de mensalidades vencidas (snapshot atual). */
  mensalidades_atraso: number
}

export const PORTAL_MESES = [
  { id: 1, label: 'Janeiro' },
  { id: 2, label: 'Fevereiro' },
  { id: 3, label: 'Março' },
  { id: 4, label: 'Abril' },
  { id: 5, label: 'Maio' },
  { id: 6, label: 'Junho' },
  { id: 7, label: 'Julho' },
  { id: 8, label: 'Agosto' },
  { id: 9, label: 'Setembro' },
  { id: 10, label: 'Outubro' },
  { id: 11, label: 'Novembro' },
  { id: 12, label: 'Dezembro' },
] as const

export function portalPeriodoLabel(
  ano: number,
  mes: number | null,
): string {
  if (mes == null || mes < 1 || mes > 12) return `Ano ${ano}`
  const nome = PORTAL_MESES.find((m) => m.id === mes)?.label ?? String(mes)
  return `${nome}/${ano}`
}

export type PortalDespesa = {
  despesa_id: number
  despesa_emissao: string | null
  despesa_vencimento: string | null
  despesa_finalidade: string | null
  fornecedor_nome: string | null
  ramo_nome: string | null
  secao_id: number | null
  secao_nome: string | null
  despesa_valor: number | null
  despesa_saldo: number | null
  despesa_situacao: number | null
  despesa_documento: string | null
}

export type PortalReceita = {
  receita_id: number
  receita_emissao: string | null
  receita_vencimento: string | null
  receita_competencia: string | null
  receita_descricao: string | null
  receita_origem: string | null
  ramo_nome?: string | null
  secao_id: number | null
  secao_nome: string | null
  receita_valor: number | null
  receita_saldo: number | null
  receita_situacao: number | null
  receita_documento: string | null
}

export type PortalSecao = {
  secao_id: number
  secao_nome: string
}

export type PortalSaldoLocal = {
  id: number
  nome: string
  valor: number
  ordem: number
  secao_id: number | null
  secao_nome: string | null
}

/** -1 = Geral (todos); 0 = caixa do grupo; 1-4 = ramos */
export const PORTAL_CAIXA_GERAL = -1 as const

export type PortalCaixaId = typeof PORTAL_CAIXA_GERAL | 0 | 1 | 2 | 3 | 4

export type PortalCaixaOption = {
  id: PortalCaixaId
  label: string
}

/** Caixas reais (cadastro de locais, etc.) — sem a aba Geral. */
export const PORTAL_CAIXAS: PortalCaixaOption[] = [
  { id: 0, label: 'Caixa do grupo' },
  { id: 1, label: 'Lobinho' },
  { id: 2, label: 'Escoteiro' },
  { id: 3, label: 'Sênior' },
  { id: 4, label: 'Pioneiro' },
]

/**
 * Usuário logado com ramo: só caixa do grupo + caixa do seu ramo.
 * Sem ramo / visitante público: Geral + todos os caixas.
 */
export function portalCaixasVisiveis(
  codigoRamo: number | null | undefined,
): PortalCaixaOption[] {
  if (codigoRamo != null && codigoRamo >= 1 && codigoRamo <= 4) {
    return PORTAL_CAIXAS.filter((c) => c.id === 0 || c.id === codigoRamo)
  }
  return [{ id: PORTAL_CAIXA_GERAL, label: 'Geral' }, ...PORTAL_CAIXAS]
}

export function parsePortalCaixaId(
  value: string | null | undefined,
): PortalCaixaId | null {
  if (value == null || value === '') return null
  const raw = Number(value)
  if (raw === PORTAL_CAIXA_GERAL || raw === 0 || (raw >= 1 && raw <= 4)) {
    return raw as PortalCaixaId
  }
  return null
}

export { formatMoney, situacaoTituloLabel }

export function formatPortalDate(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function origemReceitaLabel(origem: string | null | undefined): string {
  if (origem === 'M') return 'Mensalidade'
  if (origem === 'A') return 'Avulsa'
  return origem || '—'
}

export function currentPortalYear(): number {
  return new Date().getFullYear()
}

export function portalYearOptions(span = 5): number[] {
  const y = currentPortalYear()
  return Array.from({ length: span }, (_, i) => y - i)
}

/** Agrupa linhas por seção para exibição no portal. */
export function groupBySecao<T extends { secao_id: number | null; secao_nome: string | null }>(
  rows: T[],
): { key: string; secao_id: number | null; secao_nome: string; items: T[] }[] {
  const map = new Map<string, { secao_id: number | null; secao_nome: string; items: T[] }>()

  for (const row of rows) {
    const key =
      row.secao_id != null ? `s-${row.secao_id}` : 's-none'
    const nome = row.secao_nome?.trim() || 'Sem seção'
    const cur = map.get(key) ?? {
      secao_id: row.secao_id,
      secao_nome: nome,
      items: [],
    }
    cur.items.push(row)
    map.set(key, cur)
  }

  return [...map.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => {
      if (a.secao_id == null && b.secao_id != null) return 1
      if (a.secao_id != null && b.secao_id == null) return -1
      return a.secao_nome.localeCompare(b.secao_nome, 'pt-BR')
    })
}
