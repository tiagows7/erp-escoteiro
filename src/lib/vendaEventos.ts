import { supabase } from '@/lib/supabase'
import type { VendaEventoFormaPagamento } from '@/types/database'

export function totalConvitesEvento(
  numeroInicial: number,
  numeroFinal: number,
): number {
  if (
    !Number.isFinite(numeroInicial) ||
    !Number.isFinite(numeroFinal) ||
    numeroFinal < numeroInicial
  ) {
    return 0
  }
  return numeroFinal - numeroInicial + 1
}

/** Paralelo a nomes: texto da restrição ou '' se não houver. */
export function normalizeRestricoesAlimentares(
  temRestricao: boolean[],
  textos: string[],
): string[] {
  return textos.map((t, i) =>
    temRestricao[i] ? String(t ?? '').trim().slice(0, 120) : '',
  )
}

export async function comprarConvitesEvento(input: {
  eventoId: number
  nomes: string[]
  compradorTelefone?: string
  formaPagamento: VendaEventoFormaPagamento
  tipoIds?: number[]
  restricoes?: string[]
}): Promise<{
  ok: boolean
  mensagem: string
  compraId: number | null
  numeros: number[]
}> {
  const { data, error } = await supabase.rpc('venda_evento_comprar', {
    p_evento_id: input.eventoId,
    p_nomes: input.nomes,
    p_comprador_telefone: input.compradorTelefone?.trim() || null,
    p_forma_pagamento: input.formaPagamento,
    p_tipo_ids: input.tipoIds ?? null,
    p_restricoes: input.restricoes ?? null,
  })

  if (error) {
    return {
      ok: false,
      mensagem: error.message,
      compraId: null,
      numeros: [],
    }
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    ok: !!row?.ok,
    mensagem: String(row?.mensagem ?? 'Não foi possível concluir a compra.'),
    compraId: row?.compra_id != null ? Number(row.compra_id) : null,
    numeros: Array.isArray(row?.numeros)
      ? row.numeros.map((n: unknown) => Number(n))
      : [],
  }
}

/** Garante link público do associado logado para o evento. */
export async function ensureMeuLinkEvento(eventoId: number): Promise<{
  linkToken: string | null
  associadoId: number | null
  vendedorNome: string | null
  error: string | null
}> {
  const { data, error } = await supabase.rpc('venda_evento_meu_link', {
    p_evento_id: eventoId,
  })
  if (error) {
    return {
      linkToken: null,
      associadoId: null,
      vendedorNome: null,
      error: error.message,
    }
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row?.link_token) {
    return {
      linkToken: null,
      associadoId: null,
      vendedorNome: null,
      error: 'Não foi possível gerar seu link (verifique o registro do associado).',
    }
  }
  return {
    linkToken: String(row.link_token),
    associadoId:
      row.associado_id != null ? Number(row.associado_id) : null,
    vendedorNome: row.vendedor_nome ? String(row.vendedor_nome) : null,
    error: null,
  }
}
