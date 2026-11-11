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

/** Opções de ramo/staff pedidas na compra do convite. */
export const RAMO_STAFF_OPCOES = [
  { value: '1', label: 'Lobinho' },
  { value: '2', label: 'Escoteiro' },
  { value: '3', label: 'Sênior' },
  { value: '4', label: 'Pioneiro' },
  { value: 'staff', label: 'Staff' },
] as const

export type RamoStaffChoice = '' | '1' | '2' | '3' | '4' | 'staff'

export function parseRamoStaffChoice(choice: string): {
  ramo: number | null
  staff: boolean
} {
  if (choice === 'staff') return { ramo: null, staff: true }
  const n = Number(choice)
  if (n === 1 || n === 2 || n === 3 || n === 4) {
    return { ramo: n, staff: false }
  }
  return { ramo: null, staff: false }
}

export function normalizeRamoStaffEnvio(choices: string[]): {
  ramos: (number | null)[]
  staffs: boolean[]
} {
  const ramos: (number | null)[] = []
  const staffs: boolean[] = []
  for (const choice of choices) {
    const parsed = parseRamoStaffChoice(choice)
    ramos.push(parsed.staff ? null : parsed.ramo)
    staffs.push(parsed.staff)
  }
  return { ramos, staffs }
}

export function labelRamoStaffConvite(c: {
  convidado_ramo?: number | null
  eh_staff?: boolean | null
}): string {
  if (c.eh_staff) return 'Staff'
  switch (c.convidado_ramo) {
    case 1:
      return 'Lobinho'
    case 2:
      return 'Escoteiro'
    case 3:
      return 'Sênior'
    case 4:
      return 'Pioneiro'
    default:
      return '—'
  }
}

export async function comprarConvitesEvento(input: {
  eventoId: number
  nomes: string[]
  compradorTelefone?: string
  formaPagamento: VendaEventoFormaPagamento
  tipoIds?: number[]
  restricoes?: string[]
  participa?: boolean[]
  convidadoRamos?: (number | null)[]
  ehStaff?: boolean[]
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
    p_participa: input.participa ?? null,
    p_convidado_ramos: input.convidadoRamos ?? null,
    p_eh_staff: input.ehStaff ?? null,
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
export async function ensureMeuLinkEvento(
  eventoId: number,
  opts?: { empresaId?: number; registro?: string | null },
): Promise<{
  linkToken: string | null
  associadoId: number | null
  vendedorNome: string | null
  error: string | null
}> {
  const { data, error } = await supabase.rpc('venda_evento_meu_link', {
    p_evento_id: eventoId,
  })
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data
    if (row?.link_token) {
      return {
        linkToken: String(row.link_token),
        associadoId:
          row.associado_id != null ? Number(row.associado_id) : null,
        vendedorNome: row.vendedor_nome ? String(row.vendedor_nome) : null,
        error: null,
      }
    }
  }

  // Fallback: cria o link direto (mesmo critério da ação entre amigos).
  const empresaId = opts?.empresaId
  const registroNum = Number(String(opts?.registro ?? '').replace(/\D/g, ''))
  if (
    !empresaId ||
    !Number.isFinite(registroNum) ||
    registroNum <= 0
  ) {
    return {
      linkToken: null,
      associadoId: null,
      vendedorNome: null,
      error:
        error?.message ??
        'Não foi possível gerar seu link (verifique o registro do associado).',
    }
  }

  const { data: assoc, error: assocError } = await supabase
    .from('associados')
    .select('associado_id, nome')
    .eq('empresa_id', empresaId)
    .eq('registro', registroNum)
    .maybeSingle()

  if (assocError || !assoc?.associado_id) {
    return {
      linkToken: null,
      associadoId: null,
      vendedorNome: null,
      error:
        assocError?.message ??
        'Associado não encontrado para o seu registro.',
    }
  }

  const { data: existing } = await supabase
    .from('venda_evento_vendedor')
    .select('link_token')
    .eq('evento_id', eventoId)
    .eq('associado_id', assoc.associado_id)
    .maybeSingle()

  if (existing?.link_token) {
    return {
      linkToken: String(existing.link_token),
      associadoId: Number(assoc.associado_id),
      vendedorNome: assoc.nome ? String(assoc.nome) : null,
      error: null,
    }
  }

  const { data: created, error: createError } = await supabase
    .from('venda_evento_vendedor')
    .insert({
      empresa_id: empresaId,
      evento_id: eventoId,
      associado_id: assoc.associado_id,
    })
    .select('link_token')
    .single()

  if (createError || !created?.link_token) {
    return {
      linkToken: null,
      associadoId: Number(assoc.associado_id),
      vendedorNome: assoc.nome ? String(assoc.nome) : null,
      error:
        createError?.message ??
        'Não foi possível criar seu link de venda.',
    }
  }

  return {
    linkToken: String(created.link_token),
    associadoId: Number(assoc.associado_id),
    vendedorNome: assoc.nome ? String(assoc.nome) : null,
    error: null,
  }
}
