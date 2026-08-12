import { supabase } from '@/lib/supabase'
import type { PixCobrancaResumo } from '@/lib/pixSicredi'

export type PixPublicAcaoInput = {
  kind?: 'acao'
  linkToken: string
  numeros: number[]
  compradorNome: string
  compradorTelefone: string
  valor: number
  descricao: string
}

export type PixPublicEventoInput = {
  kind: 'evento'
  linkToken: string
  nomes: string[]
  tipoIds?: number[]
  compradorTelefone: string
  valor: number
  descricao: string
}

export type PixPublicInput = PixPublicAcaoInput | PixPublicEventoInput

function isEventoInput(input: PixPublicInput): input is PixPublicEventoInput {
  return input.kind === 'evento'
}

async function readFunctionsError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: Response })?.context
  if (!ctx || typeof ctx.json !== 'function') return null
  try {
    const body = await ctx.json()
    if (body?.error) return String(body.error)
  } catch {
    /* ignore */
  }
  return null
}

export function pixPublicPaymentKey(input: PixPublicInput): string {
  if (isEventoInput(input)) {
    return [
      'evento',
      input.linkToken,
      input.valor,
      input.nomes.join('|'),
      (input.tipoIds ?? []).join(','),
      input.compradorTelefone.trim(),
    ].join('|')
  }
  return [
    'acao',
    input.linkToken,
    input.valor,
    [...input.numeros].sort((a, b) => a - b).join(','),
    input.compradorNome.trim(),
    input.compradorTelefone.trim(),
  ].join('|')
}

export async function createPixSicrediPublic(
  input: PixPublicInput,
): Promise<
  | { ok: true; cobranca: PixCobrancaResumo }
  | { ok: false; error: string; configured?: boolean }
> {
  const body = isEventoInput(input)
    ? {
        action: 'create_public_evento',
        link_token: input.linkToken,
        nomes: input.nomes,
        tipo_ids: input.tipoIds ?? null,
        comprador_telefone: input.compradorTelefone,
        descricao: input.descricao,
      }
    : {
        action: 'create_public',
        link_token: input.linkToken,
        numeros: input.numeros,
        comprador_nome: input.compradorNome,
        comprador_telefone: input.compradorTelefone,
        descricao: input.descricao,
      }

  const { data, error } = await supabase.functions.invoke('pix-sicredi', {
    body,
  })

  if (error) {
    const fromBody = await readFunctionsError(error)
    return {
      ok: false,
      error: fromBody || error.message,
      configured: false,
    }
  }

  if (data?.error) {
    return {
      ok: false,
      error: String(data.error),
      configured: data.configured !== false,
    }
  }

  if (!data?.cobranca?.id) {
    return { ok: false, error: 'Resposta inválida ao criar cobrança PIX.' }
  }

  return { ok: true, cobranca: data.cobranca as PixCobrancaResumo }
}

/** @deprecated use createPixSicrediPublic */
export async function createPixSicrediPublicAcao(
  input: PixPublicAcaoInput,
): Promise<
  | { ok: true; cobranca: PixCobrancaResumo }
  | { ok: false; error: string; configured?: boolean }
> {
  return createPixSicrediPublic(input)
}

export type EventoConvitePagoPublic = {
  numero: number
  nome: string
  tipo_label?: string | null
  valor_unitario?: number | null
}

function parseConvitesPago(raw: unknown): EventoConvitePagoPublic[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const row = item as {
        numero?: unknown
        nome?: unknown
        tipo_label?: unknown
        valor_unitario?: unknown
      }
      const numero = Number(row.numero)
      if (!Number.isFinite(numero)) return null
      const valor =
        row.valor_unitario != null && Number.isFinite(Number(row.valor_unitario))
          ? Number(row.valor_unitario)
          : null
      return {
        numero,
        nome: String(row.nome ?? '').trim(),
        tipo_label:
          row.tipo_label != null && String(row.tipo_label).trim()
            ? String(row.tipo_label).trim()
            : null,
        valor_unitario: valor,
      }
    })
    .filter((c): c is EventoConvitePagoPublic => c != null)
}

export async function checkPixSicrediPublicStatus(
  cobrancaId: number,
  linkToken: string,
): Promise<
  | {
      ok: true
      paid: boolean
      baixado: boolean
      cobranca: PixCobrancaResumo
      convites: EventoConvitePagoPublic[]
    }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke('pix-sicredi', {
    body: {
      action: 'status_public',
      cobranca_id: cobrancaId,
      link_token: linkToken,
    },
  })

  if (error) {
    const fromBody = await readFunctionsError(error)
    return { ok: false, error: fromBody || error.message }
  }

  if (data?.error) {
    return { ok: false, error: String(data.error) }
  }

  return {
    ok: true,
    paid: !!data?.paid,
    baixado: !!data?.baixado,
    cobranca: data.cobranca as PixCobrancaResumo,
    convites: parseConvitesPago(data?.convites),
  }
}
