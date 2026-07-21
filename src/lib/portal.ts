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
}

export type PortalDespesa = {
  despesa_id: number
  despesa_emissao: string | null
  despesa_vencimento: string | null
  despesa_finalidade: string | null
  fornecedor_nome: string | null
  ramo_nome: string | null
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
  receita_valor: number | null
  receita_saldo: number | null
  receita_situacao: number | null
  receita_documento: string | null
}

/** 0 = caixa do grupo; 1-4 = ramos */
export type PortalCaixaId = 0 | 1 | 2 | 3 | 4

export type PortalCaixaOption = {
  id: PortalCaixaId
  label: string
}

export const PORTAL_CAIXAS: PortalCaixaOption[] = [
  { id: 0, label: 'Caixa do grupo' },
  { id: 1, label: 'Lobinho' },
  { id: 2, label: 'Escoteiro' },
  { id: 3, label: 'Sênior' },
  { id: 4, label: 'Pioneiro' },
]

/**
 * Usuário logado com ramo: só caixa do grupo + caixa do seu ramo.
 * Sem ramo: vê todos os caixas.
 */
export function portalCaixasVisiveis(
  codigoRamo: number | null | undefined,
): PortalCaixaOption[] {
  if (codigoRamo != null && codigoRamo >= 1 && codigoRamo <= 4) {
    return PORTAL_CAIXAS.filter((c) => c.id === 0 || c.id === codigoRamo)
  }
  return PORTAL_CAIXAS
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
