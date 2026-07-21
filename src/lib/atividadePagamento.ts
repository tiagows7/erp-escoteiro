import { supabase } from '@/lib/supabase'
import { RECEITA_ORIGEM, TITULO_SITUACAO } from '@/lib/receitas'
import type { Atividade } from '@/types/database'

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function truncate(text: string, max: number): string {
  const t = text.trim()
  return t.length <= max ? t : t.slice(0, max)
}

/** Garante tipo de pagamento PIX na empresa; cria se não existir. */
export async function ensureTipoPagamentoPix(
  empresaId: number,
): Promise<{ tipopagto_id: number } | { error: string }> {
  const { data: existing, error: findError } = await supabase
    .from('tipo_pagamento')
    .select('tipopagto_id')
    .eq('empresa_id', empresaId)
    .ilike('nome', 'PIX')
    .maybeSingle()

  if (findError) return { error: findError.message }
  if (existing?.tipopagto_id) {
    return { tipopagto_id: existing.tipopagto_id }
  }

  const { data: created, error: createError } = await supabase
    .from('tipo_pagamento')
    .insert({
      empresa_id: empresaId,
      nome: 'PIX',
      quita: true,
    })
    .select('tipopagto_id')
    .single()

  if (createError || !created?.tipopagto_id) {
    return {
      error: createError?.message ?? 'Não foi possível criar o tipo PIX.',
    }
  }

  return { tipopagto_id: created.tipopagto_id }
}

export type RegistrarPagamentoAtividadeInput = {
  empresaId: number
  associadoId: number
  atividade: Pick<
    Atividade,
    'atividade_id' | 'descricao' | 'local' | 'valor' | 'ramo' | 'secao'
  >
}

/**
 * Registra pagamento da atividade + receita (contas a receber) quitada +
 * recebimento com documento/tipo PIX.
 */
export async function registrarPagamentoAtividade(
  input: RegistrarPagamentoAtividadeInput,
): Promise<{ ok: true; receita_id: number | null } | { ok: false; error: string }> {
  const valor = Number(input.atividade.valor ?? 0)
  const hoje = todayISO()
  const descricao = truncate(
    `Atividade: ${input.atividade.descricao}`,
    120,
  )
  const observacao = truncate(
    [
      `Pagamento atividade #${input.atividade.atividade_id}`,
      input.atividade.local ? `Local: ${input.atividade.local}` : null,
      'Documento: PIX',
    ]
      .filter(Boolean)
      .join(' · '),
    200,
  )

  let receitaId: number | null = null

  if (valor > 0) {
    const pix = await ensureTipoPagamentoPix(input.empresaId)
    if ('error' in pix) return { ok: false, error: pix.error }

    const { data: receita, error: receitaError } = await supabase
      .from('receitas')
      .insert({
        empresa_id: input.empresaId,
        associado_id: input.associadoId,
        receita_origem: RECEITA_ORIGEM.AVULSA,
        receita_descricao: descricao,
        receita_ramo: input.atividade.ramo,
        receita_secao: input.atividade.secao,
        atividade_id: input.atividade.atividade_id,
        receita_emissao: hoje,
        receita_vencimento: hoje,
        receita_valor: valor,
        receita_saldo: 0,
        receita_situacao: TITULO_SITUACAO.PAGO,
        receita_observacao: observacao,
      })
      .select('receita_id')
      .single()

    if (receitaError || !receita?.receita_id) {
      return {
        ok: false,
        error: receitaError?.message ?? 'Falha ao criar conta a receber.',
      }
    }

    receitaId = receita.receita_id

    const { error: baixaError } = await supabase.from('receita_pagamento').insert({
      empresa_id: input.empresaId,
      receita_id: receitaId,
      tipopagto_id: pix.tipopagto_id,
      data_pagamento: hoje,
      valor,
      observacao: truncate('Recebimento PIX — atividade', 200),
    })

    if (baixaError) {
      await supabase.from('receitas').delete().eq('receita_id', receitaId)
      return { ok: false, error: baixaError.message }
    }
  }

  const { error: ativPagError } = await supabase
    .from('atividade_pagamento')
    .insert({
      empresa_id: input.empresaId,
      atividade_id: input.atividade.atividade_id,
      associado_id: input.associadoId,
      valor,
      receita_id: receitaId,
    })

  if (ativPagError) {
    if (receitaId != null) {
      await supabase.from('receitas').delete().eq('receita_id', receitaId)
    }
    return { ok: false, error: ativPagError.message }
  }

  return { ok: true, receita_id: receitaId }
}

/** Remove pagamento da atividade e a receita/recebimento vinculados. */
export async function removerPagamentoAtividade(opts: {
  empresaId: number
  atividadeId: number
  associadoId: number
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: pag, error: findError } = await supabase
    .from('atividade_pagamento')
    .select('pagamento_id, receita_id')
    .eq('empresa_id', opts.empresaId)
    .eq('atividade_id', opts.atividadeId)
    .eq('associado_id', opts.associadoId)
    .maybeSingle()

  if (findError) return { ok: false, error: findError.message }
  if (!pag) return { ok: true }

  const receitaId = (pag as { receita_id: number | null }).receita_id

  const { error: delPagError } = await supabase
    .from('atividade_pagamento')
    .delete()
    .eq('pagamento_id', (pag as { pagamento_id: number }).pagamento_id)

  if (delPagError) return { ok: false, error: delPagError.message }

  if (receitaId != null) {
    const { error: delRecError } = await supabase
      .from('receitas')
      .delete()
      .eq('receita_id', receitaId)
      .eq('empresa_id', opts.empresaId)

    if (delRecError) return { ok: false, error: delRecError.message }
  }

  return { ok: true }
}
