import { supabase } from '@/lib/supabase'

export type PixCobrancaTipo =
  | 'mensalidade'
  | 'mensalidade_lote'
  | 'atividade'
  | 'loja'

function chavePixInformada(
  chave: string | null | undefined,
  ativo: boolean | null | undefined,
): boolean {
  return ativo === true && !!(chave ?? '').trim()
}

/** Há chave PIX ativa em alguma conta bancária (ou fallback legado). */
export async function empresaTemChavePixInformada(
  empresaId: number,
): Promise<boolean> {
  return empresaTemPixParaEscopo({ empresaId })
}

/**
 * PIX disponível para o escopo da venda:
 * - seção da ação (conta com secao_id)
 * - ramo da ação (conta do ramo sem seção)
 * - grupo (conta sem ramo/seção)
 * Sem ramo/seção no escopo → só conta do grupo.
 */
export async function empresaTemPixParaEscopo(opts: {
  empresaId: number
  ramoId?: number | null
  secaoId?: number | null
}): Promise<boolean> {
  const empresaId = opts.empresaId
  const ramoId = opts.ramoId ?? null
  const secaoId = opts.secaoId ?? null

  try {
    const { data: contas } = await supabase
      .from('empresa_conta_bancaria')
      .select('ramo_id, secao_id, api_pix_chave, api_pix_ativo')
      .eq('empresa_id', empresaId)
      .eq('api_pix_ativo', true)

    const list = ((contas ?? []) as {
      ramo_id: number | null
      secao_id: number | null
      api_pix_chave: string | null
      api_pix_ativo: boolean | null
    }[]).filter((row) =>
      chavePixInformada(row.api_pix_chave, row.api_pix_ativo),
    )

    if (secaoId != null && list.some((c) => c.secao_id === secaoId)) {
      return true
    }
    if (
      ramoId != null &&
      list.some((c) => c.ramo_id === ramoId && c.secao_id == null)
    ) {
      return true
    }
    if (list.some((c) => c.ramo_id == null && c.secao_id == null)) {
      return true
    }

    // Escopo amplo (qualquer PIX) — usado por empresaTemChavePixInformada.
    if (ramoId == null && secaoId == null && list.length > 0) {
      return true
    }

    const [{ data: emp }, { data: ramos }] = await Promise.all([
      supabase
        .from('empresa')
        .select('sicredi_pix_chave, sicredi_pix_ativo')
        .eq('id', empresaId)
        .maybeSingle(),
      ramoId != null
        ? supabase
            .from('empresa_ramo_pix_sicredi')
            .select('sicredi_pix_chave, sicredi_pix_ativo')
            .eq('empresa_id', empresaId)
            .eq('ramo_id', ramoId)
        : ramoId == null && secaoId == null
          ? supabase
              .from('empresa_ramo_pix_sicredi')
              .select('sicredi_pix_chave, sicredi_pix_ativo')
              .eq('empresa_id', empresaId)
          : Promise.resolve({ data: [] as unknown[] }),
    ])

    if (chavePixInformada(emp?.sicredi_pix_chave, emp?.sicredi_pix_ativo)) {
      return true
    }

    return ((ramos ?? []) as {
      sicredi_pix_chave: string | null
      sicredi_pix_ativo: boolean | null
    }[]).some((row) =>
      chavePixInformada(row.sicredi_pix_chave, row.sicredi_pix_ativo),
    )
  } catch {
    return false
  }
}

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

export type PixLojaItem = {
  produto_id: number
  nome: string
  unitario: number
  quantidade: number
}

export type PixLojaItensPayload =
  | PixLojaItem[]
  | {
      canal?: 'online' | 'local'
      comprador_nome?: string | null
      comprador_telefone?: string | null
      itens: PixLojaItem[]
    }

export type PixCreateInput = {
  empresaId: number
  tipo: PixCobrancaTipo
  valor: number
  descricao: string
  associadoId?: number | null
  receitaIds?: number[]
  atividadeId?: number | null
  tipopagtoId?: number | null
  lojaItens?: PixLojaItensPayload
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
      tipopagto_id: input.tipopagtoId ?? null,
      loja_itens: input.lojaItens ?? null,
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
