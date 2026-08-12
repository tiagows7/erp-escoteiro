import { supabase } from '@/lib/supabase'

export type EventoPagamentoConfig = {
  encerrado: boolean
  infinitepay: boolean
  pix_sicredi: boolean
  prefer: 'infinitepay' | 'pix_sicredi' | 'nenhum'
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

export async function fetchEventoPagamentoConfig(
  linkToken: string,
): Promise<
  | { ok: true; config: EventoPagamentoConfig }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke(
    'infinitepay-checkout',
    {
      body: { action: 'config_evento', link_token: linkToken },
    },
  )

  if (error) {
    const fromBody = await readFunctionsError(error)
    return { ok: false, error: fromBody || error.message }
  }
  if (data?.error) return { ok: false, error: String(data.error) }

  return {
    ok: true,
    config: {
      encerrado: !!data?.encerrado,
      infinitepay: !!data?.infinitepay,
      pix_sicredi: !!data?.pix_sicredi,
      prefer:
        data?.prefer === 'infinitepay' || data?.prefer === 'pix_sicredi'
          ? data.prefer
          : 'nenhum',
    },
  }
}

export async function createInfinitePayEventoCheckout(input: {
  linkToken: string
  nomes: string[]
  compradorTelefone: string
  valor: number
  descricao: string
  redirectUrl?: string
}): Promise<
  | { ok: true; url: string; orderNsu: string }
  | { ok: false; error: string; usePix?: boolean }
> {
  const siteOrigin =
    typeof window !== 'undefined' ? window.location.origin : ''

  const { data, error } = await supabase.functions.invoke(
    'infinitepay-checkout',
    {
      body: {
        action: 'create_evento',
        link_token: input.linkToken,
        nomes: input.nomes,
        comprador_telefone: input.compradorTelefone,
        descricao: input.descricao,
        redirect_url: input.redirectUrl,
        site_origin: siteOrigin,
      },
    },
  )

  // Resposta útil pode vir em data mesmo com status de erro (use_pix).
  if (data?.url) {
    return {
      ok: true,
      url: String(data.url),
      orderNsu: String(data.order_nsu ?? ''),
    }
  }
  if (data?.use_pix) {
    return {
      ok: false,
      error: String(data.error || 'InfinitePay indisponível.'),
      usePix: true,
    }
  }
  if (data?.error) {
    return {
      ok: false,
      error: String(data.error),
      usePix: !!data.use_pix,
    }
  }

  if (error) {
    const fromBody = await readFunctionsError(error)
    return { ok: false, error: fromBody || error.message }
  }

  return {
    ok: false,
    error: 'Não foi possível gerar o checkout InfinitePay.',
  }
}

export type EventoConvitePago = {
  numero: number
  nome: string
}

function parseConvitesPago(raw: unknown): EventoConvitePago[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const row = item as { numero?: unknown; nome?: unknown }
      const numero = Number(row.numero)
      if (!Number.isFinite(numero)) return null
      return { numero, nome: String(row.nome ?? '').trim() }
    })
    .filter((c): c is EventoConvitePago => c != null)
}

export async function checkInfinitePayPedidoStatus(
  orderNsu: string,
  opts?: { slug?: string; transactionNsu?: string },
): Promise<
  | { ok: true; paid: boolean; compraId: number | null; convites: EventoConvitePago[] }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke(
    'infinitepay-checkout',
    {
      body: {
        action: 'status',
        order_nsu: orderNsu,
        slug: opts?.slug,
        transaction_nsu: opts?.transactionNsu,
      },
    },
  )

  if (error) {
    const fromBody = await readFunctionsError(error)
    return { ok: false, error: fromBody || error.message }
  }
  if (data?.error) return { ok: false, error: String(data.error) }
  return {
    ok: true,
    paid: !!data?.paid,
    compraId: data?.compra_id != null ? Number(data.compra_id) : null,
    convites: parseConvitesPago(data?.convites),
  }
}
