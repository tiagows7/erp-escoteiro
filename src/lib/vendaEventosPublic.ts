import { supabase } from '@/lib/supabase'

export type EventoPublicInfo = {
  evento_id: number
  evento_nome: string
  valor_convite: number
  numero_inicial: number
  numero_final: number
  data_evento: string | null
  imagem_url: string | null
  empresa_nome: string
  disponiveis: number
  total: number
}

export function linkPublicoVendaEvento(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/ingresso/${token}`
}

export async function fetchEventoPublicInfo(
  token: string,
): Promise<{ data: EventoPublicInfo | null; error: string | null }> {
  const { data, error } = await supabase.rpc('venda_evento_public_info', {
    p_token: token,
  })

  if (error) return { data: null, error: error.message }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { data: null, error: 'Link inválido ou expirado.' }

  return {
    data: {
      evento_id: Number(row.evento_id),
      evento_nome: String(row.evento_nome ?? ''),
      valor_convite: Number(row.valor_convite ?? 0),
      numero_inicial: Number(row.numero_inicial),
      numero_final: Number(row.numero_final),
      data_evento: row.data_evento
        ? String(row.data_evento).slice(0, 10)
        : null,
      imagem_url: row.imagem_url ? String(row.imagem_url) : null,
      empresa_nome: String(row.empresa_nome ?? ''),
      disponiveis: Number(row.disponiveis ?? 0),
      total: Number(row.total ?? 0),
    },
    error: null,
  }
}
