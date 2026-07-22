import { supabase } from '@/lib/supabase'
import { situacaoFromSaldo } from '@/lib/receitas'
import { ensureTipoPagamentoPix } from '@/lib/atividadePagamento'

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

export type MensalidadeAberta = {
  receita_id: number
  receita_descricao: string | null
  receita_competencia: string | null
  receita_vencimento: string | null
  receita_valor: number
  receita_saldo: number
}

/**
 * Registra recebimento PIX da mensalidade (quita o saldo em aberto).
 */
export async function registrarPagamentoMensalidade(opts: {
  empresaId: number
  receita: Pick<
    MensalidadeAberta,
    'receita_id' | 'receita_valor' | 'receita_saldo'
  >
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const saldo = Number(opts.receita.receita_saldo ?? 0)
  if (!(saldo > 0)) {
    return { ok: false, error: 'Esta mensalidade já está quitada.' }
  }

  const pix = await ensureTipoPagamentoPix(opts.empresaId)
  if ('error' in pix) return { ok: false, error: pix.error }

  const { error: baixaError } = await supabase.from('receita_pagamento').insert({
    empresa_id: opts.empresaId,
    receita_id: opts.receita.receita_id,
    tipopagto_id: pix.tipopagto_id,
    data_pagamento: todayISO(),
    valor: saldo,
    observacao: truncate('Recebimento PIX — mensalidade (associado)', 200),
  })

  if (baixaError) return { ok: false, error: baixaError.message }

  const newSaldo = 0
  const { error: updateError } = await supabase
    .from('receitas')
    .update({
      receita_saldo: newSaldo,
      receita_situacao: situacaoFromSaldo(
        Number(opts.receita.receita_valor ?? 0),
        newSaldo,
      ),
    })
    .eq('receita_id', opts.receita.receita_id)
    .eq('empresa_id', opts.empresaId)

  if (updateError) return { ok: false, error: updateError.message }

  return { ok: true }
}
