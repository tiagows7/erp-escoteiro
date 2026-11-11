import { supabase } from '@/lib/supabase'

export type AcompanhanteInput = {
  nome: string
  cpf: string
}

export type ListaTransporteItem = {
  tipo: 'jovem' | 'acompanhante' | string
  associado_id: number
  nome: string
  cpf: string
  confirmacao_id: number
}

function digitsOnly(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '')
}

export function formatCpfDisplay(value: string | null | undefined): string {
  const d = digitsOnly(value).slice(0, 11)
  if (d.length !== 11) return value?.trim() || '—'
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export async function confirmarParticipacaoAtividade(
  atividadeId: number,
  opts?: {
    acompanhantes?: AcompanhanteInput[]
  },
): Promise<{ ok: boolean; mensagem: string; confirmacaoId: number | null }> {
  const acompanhantes = (opts?.acompanhantes ?? [])
    .map((a) => ({
      nome: a.nome.trim(),
      cpf: digitsOnly(a.cpf),
    }))
    .filter((a) => a.nome || a.cpf)

  const { data, error } = await supabase.rpc('atividade_confirmar_participacao', {
    p_atividade_id: atividadeId,
    p_acompanhantes: acompanhantes,
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

export async function carregarAcompanhantesAtividade(
  empresaId: number,
  confirmacaoId: number,
): Promise<AcompanhanteInput[]> {
  const { data, error } = await supabase
    .from('atividade_acompanhante')
    .select('nome, cpf')
    .eq('empresa_id', empresaId)
    .eq('confirmacao_id', confirmacaoId)
    .order('acompanhante_id', { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as { nome: string; cpf: string }[]).map((row) => ({
    nome: row.nome ?? '',
    cpf: row.cpf ?? '',
  }))
}

function normalizarAcompanhantes(
  acompanhantes: AcompanhanteInput[],
): AcompanhanteInput[] {
  return acompanhantes
    .map((a) => ({
      nome: a.nome.trim(),
      cpf: digitsOnly(a.cpf),
    }))
    .filter((a) => a.nome || a.cpf)
}

export async function salvarAcompanhantesConfirmacao(params: {
  empresaId: number
  atividadeId: number
  associadoId: number
  confirmacaoId: number
  acompanhantes: AcompanhanteInput[]
}): Promise<{ ok: boolean; mensagem: string }> {
  const rows = normalizarAcompanhantes(params.acompanhantes)

  for (const row of rows) {
    if (!row.nome) {
      return { ok: false, mensagem: 'Informe o nome de cada pessoa da família.' }
    }
    if (row.cpf.length < 11) {
      return {
        ok: false,
        mensagem: 'Informe o CPF (11 dígitos) de cada pessoa da família.',
      }
    }
  }

  const { error: delError } = await supabase
    .from('atividade_acompanhante')
    .delete()
    .eq('empresa_id', params.empresaId)
    .eq('confirmacao_id', params.confirmacaoId)

  if (delError) {
    return { ok: false, mensagem: delError.message }
  }

  if (rows.length === 0) {
    return { ok: true, mensagem: 'Familiares atualizados.' }
  }

  const { error: insError } = await supabase
    .from('atividade_acompanhante')
    .insert(
      rows.map((row) => ({
        empresa_id: params.empresaId,
        confirmacao_id: params.confirmacaoId,
        atividade_id: params.atividadeId,
        associado_id: params.associadoId,
        nome: row.nome,
        cpf: row.cpf.slice(0, 15),
      })),
    )

  if (insError) {
    return { ok: false, mensagem: insError.message }
  }

  return { ok: true, mensagem: 'Familiares atualizados.' }
}

export async function carregarListaTransporte(
  atividadeId: number,
): Promise<ListaTransporteItem[]> {
  const { data, error } = await supabase.rpc('atividade_lista_transporte', {
    p_atividade_id: atividadeId,
  })
  if (error) throw new Error(error.message)
  return ((data ?? []) as ListaTransporteItem[]).map((row) => ({
    tipo: String(row.tipo ?? ''),
    associado_id: Number(row.associado_id),
    nome: String(row.nome ?? ''),
    cpf: String(row.cpf ?? ''),
    confirmacao_id: Number(row.confirmacao_id),
  }))
}
