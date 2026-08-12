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

export async function comprarConvitesEvento(input: {
  eventoId: number
  nomes: string[]
  compradorTelefone?: string
  formaPagamento: VendaEventoFormaPagamento
  tipoIds?: number[]
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
