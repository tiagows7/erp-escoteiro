import { supabase } from '@/lib/supabase'

export async function confirmarParticipacaoAtividade(
  atividadeId: number,
): Promise<{ ok: boolean; mensagem: string; confirmacaoId: number | null }> {
  const { data, error } = await supabase.rpc('atividade_confirmar_participacao', {
    p_atividade_id: atividadeId,
  })
  if (error) {
    return { ok: false, mensagem: error.message, confirmacaoId: null }
  }
  const row = Array.isArray(data) ? data[0] : data
  return {
    ok: !!row?.ok,
    mensagem: String(row?.mensagem ?? 'Não foi possível confirmar.'),
    confirmacaoId:
      row?.confirmacao_id != null ? Number(row.confirmacao_id) : null,
  }
}

export async function cancelarConfirmacaoAtividade(
  atividadeId: number,
): Promise<{ ok: boolean; mensagem: string }> {
  const { data, error } = await supabase.rpc('atividade_cancelar_confirmacao', {
    p_atividade_id: atividadeId,
  })
  if (error) {
    return { ok: false, mensagem: error.message }
  }
  const row = Array.isArray(data) ? data[0] : data
  return {
    ok: !!row?.ok,
    mensagem: String(row?.mensagem ?? 'Não foi possível cancelar.'),
  }
}
