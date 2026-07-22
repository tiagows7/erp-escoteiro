import { supabase } from '@/lib/supabase'

export type PixCobrancaTipo =
  | 'mensalidade'
  | 'mensalidade_lote'
  | 'atividade'

export type PixCobrancaResumo = {
  id: number
  txid: string
  status: string
  valor: number
  pix_copia_e_cola: string | null
  location?: string | null
  descricao?: string | null
  created_at?: string
}

export type PixCreateInput = {
  empresaId: number
  tipo: PixCobrancaTipo
  valor: number
  descricao: string
  associadoId?: number | null
  receitaIds?: number[]
  atividadeId?: number | null
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

export async function getPixSicrediConfig(opts?: {
  empresaId?: number
  tipo?: PixCobrancaTipo
  atividadeId?: number | null
}): Promise<{
  configured: boolean
  message: string
}> {
  const { data, error } = await supabase.functions.invoke('pix-sicredi', {
    body: {
      action: 'config',
      empresa_id: opts?.empresaId,
      tipo: opts?.tipo ?? 'mensalidade',
      atividade_id: opts?.atividadeId ?? null,
    },
  })

  if (error) {
    const fromBody = await readFunctionsError(error)
    return {
      configured: false,
      message:
        fromBody ||
        'Não foi possível verificar a configuração do PIX Sicredi.',
    }
  }

  return {
    configured: !!data?.configured,
    message:
      String(data?.message ?? '') ||
      (data?.configured
        ? 'PIX Sicredi configurado.'
        : 'Aguardando credenciais Sicredi.'),
  }
}

export async function createPixSicrediCobranca(
  input: PixCreateInput,
): Promise<
  | { ok: true; cobranca: PixCobrancaResumo }
  | { ok: false; error: string; configured?: boolean }
> {
  const { data, error } = await supabase.functions.invoke('pix-sicredi', {
    body: {
      action: 'create',
      empresa_id: input.empresaId,
      tipo: input.tipo,
      valor: input.valor,
      descricao: input.descricao,
      associado_id: input.associadoId ?? null,
      receita_ids: input.receitaIds ?? [],
      atividade_id: input.atividadeId ?? null,
    },
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

export async function checkPixSicrediStatus(
  cobrancaId: number,
): Promise<
  | {
      ok: true
      paid: boolean
      baixado: boolean
      cobranca: PixCobrancaResumo
    }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase.functions.invoke('pix-sicredi', {
    body: { action: 'status', cobranca_id: cobrancaId },
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
  }
}
