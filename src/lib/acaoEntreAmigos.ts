import { supabase } from '@/lib/supabase'
import type { AcaoEntreAmigosFaixa } from '@/types/database'

/** Faixas se sobrepõem (inclusive). */
export function faixasSobrepoem(
  aIni: number,
  aFim: number,
  bIni: number,
  bFim: number,
): boolean {
  return aIni <= bFim && bIni <= aFim
}

export function faixaDentroDaAcao(
  faixaIni: number,
  faixaFim: number,
  acaoIni: number,
  acaoFim: number,
): boolean {
  return faixaIni >= acaoIni && faixaFim <= acaoFim
}

export function faixaConflitaComOutras(
  ini: number,
  fim: number,
  outras: Pick<AcaoEntreAmigosFaixa, 'numero_inicial' | 'numero_final' | 'faixa_id'>[],
  ignoreFaixaId?: number | null,
): boolean {
  return outras.some((f) => {
    if (ignoreFaixaId != null && f.faixa_id === ignoreFaixaId) return false
    return faixasSobrepoem(ini, fim, f.numero_inicial, f.numero_final)
  })
}

export function numerosDaFaixa(ini: number, fim: number): number[] {
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) return []
  const out: number[] = []
  for (let n = ini; n <= fim; n += 1) out.push(n)
  return out
}

/** Data local YYYY-MM-DD (fuso do navegador). */
export function hojeLocalISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatDateBR(value: string | null | undefined): string {
  if (!value) return '—'
  const [y, m, d] = String(value).slice(0, 10).split('-')
  if (!y || !m || !d) return String(value)
  return `${d}/${m}/${y}`
}

/** Prazo de vendas passou (depois do dia limite, inclusive o dia limite ainda vende). */
export function isAcaoPrazoVendasExpirado(
  dataLimiteVenda: string | null | undefined,
  hoje = hojeLocalISO(),
): boolean {
  if (!dataLimiteVenda) return false
  return String(dataLimiteVenda).slice(0, 10) < hoje
}

export function isAcaoTodosVendidos(
  numeroInicial: number,
  numeroFinal: number,
  qtdeVendidos: number,
): boolean {
  const total = numeroFinal - numeroInicial + 1
  return total > 0 && qtdeVendidos >= total
}

/** Vendas bloqueadas: encerrada, prazo expirado ou todos vendidos. */
export function isAcaoVendasBloqueadas(input: {
  encerrado_em?: string | null
  data_limite_venda?: string | null
  numero_inicial?: number
  numero_final?: number
  qtde_vendidos?: number
}): boolean {
  if (input.encerrado_em) return true
  if (isAcaoPrazoVendasExpirado(input.data_limite_venda)) return true
  if (
    input.numero_inicial != null &&
    input.numero_final != null &&
    input.qtde_vendidos != null &&
    isAcaoTodosVendidos(
      input.numero_inicial,
      input.numero_final,
      input.qtde_vendidos,
    )
  ) {
    return true
  }
  return false
}

/** Pode sortear (ou refazer) quando vendas estão bloqueadas e há vendidos. */
export function podeSortearAcao(input: {
  encerrado_em?: string | null
  data_limite_venda?: string | null
  numero_inicial?: number
  numero_final?: number
  qtde_vendidos?: number
  numero_sorteado?: number | null
}): boolean {
  if ((input.qtde_vendidos ?? 0) < 1) return false
  return isAcaoVendasBloqueadas(input)
}

export async function executarSorteioAcao(
  acaoId: number,
  refazer = false,
): Promise<{
  numero: number
  nome: string
  telefone: string
}> {
  const { data, error } = await supabase.rpc('acao_amigos_sortear', {
    p_acao_id: acaoId,
    p_refazer: refazer,
  })
  const row = Array.isArray(data) ? data[0] : data
  if (error || !row?.ok || row.numero_sorteado == null) {
    throw new Error(
      error?.message ??
        String(row?.mensagem ?? 'Não foi possível realizar o sorteio.'),
    )
  }
  return {
    numero: Number(row.numero_sorteado),
    nome: String(row.comprador_nome ?? ''),
    telefone: String(row.comprador_telefone ?? ''),
  }
}
