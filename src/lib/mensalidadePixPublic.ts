import { supabase } from '@/lib/supabase'

export type MensalidadePixPublic = {
  id: number
  valor: number
  pix_copia_e_cola: string | null
  descricao: string | null
  status: string | null
  baixado_em: string | null
  paid_at: string | null
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

export async function fetchMensalidadePixPublic(
  linkToken: string,
): Promise<
  | { ok: true; paid: boolean; cobranca: MensalidadePixPublic }
  | { ok: false; error: string }
> {
  const token = linkToken.trim()
  if (!token) return { ok: false, error: 'Link inválido.' }

  const { data, error } = await supabase.functions.invoke('pix-sicredi', {
    body: { action: 'get_mensalidade_pix', link_token: token },
  })

  if (error) {
    const fromBody = await readFunctionsError(error)
    return { ok: false, error: fromBody || error.message }
  }

  if (data?.error) {
    return { ok: false, error: String(data.error) }
  }

  const cob = data?.cobranca as MensalidadePixPublic | undefined
  if (!cob?.id) {
    return { ok: false, error: 'Cobrança não encontrada.' }
  }

  return {
    ok: true,
    paid: !!data?.paid,
    cobranca: {
      id: Number(cob.id),
      valor: Number(cob.valor ?? 0),
      pix_copia_e_cola: cob.pix_copia_e_cola ?? null,
      descricao: cob.descricao ?? null,
      status: cob.status ?? null,
      baixado_em: cob.baixado_em ?? null,
      paid_at: cob.paid_at ?? null,
    },
  }
}
