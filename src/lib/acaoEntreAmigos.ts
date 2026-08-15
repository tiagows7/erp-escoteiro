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

/** Pode sortear (primeira vez) ou refazer (já há ganhador). */
export function podeSortearAcao(input: {
  encerrado_em?: string | null
  data_limite_venda?: string | null
  numero_inicial?: number
  numero_final?: number
  qtde_vendidos?: number
  numero_sorteado?: number | null
}): boolean {
  // Já sorteou: sempre permite refazer (o RPC valida os vendidos no servidor)
  if (input.numero_sorteado != null) return true
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

/** Dinheiro / PIX direto — RPC (associado não tem INSERT direto após RLS 071). */
export async function venderAcaoEntreAmigos(input: {
  acaoId: number
  numeros: number[]
  compradorNome: string
  compradorTelefone: string
  formaPagamento: 'dinheiro' | 'pix_direto'
}): Promise<{ ok: boolean; mensagem: string; numerosSalvos: number[] }> {
  const { data, error } = await supabase.rpc('acao_amigos_vender', {
    p_acao_id: input.acaoId,
    p_numeros: input.numeros,
    p_comprador_nome: input.compradorNome,
    p_comprador_telefone: input.compradorTelefone,
    p_forma_pagamento: input.formaPagamento,
  })
  if (error) {
    return { ok: false, mensagem: error.message, numerosSalvos: [] }
  }
  const row = Array.isArray(data) ? data[0] : data
  return {
    ok: !!row?.ok,
    mensagem: String(row?.mensagem ?? 'Não foi possível registrar a venda.'),
    numerosSalvos: Array.isArray(row?.numeros_salvos)
      ? row.numeros_salvos.map((n: unknown) => Number(n))
      : [],
  }
}
