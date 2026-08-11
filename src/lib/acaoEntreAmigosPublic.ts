import { supabase } from '@/lib/supabase'

export type AcaoPublicInfo = {
  acao_id: number
  acao_nome: string
  valor_numero: number
  numero_inicial: number
  numero_final: number
  vendedor_nome: string
  empresa_nome: string
  numeros_vendidos: number[]
  imagem_url: string | null
  data_sorteio: string | null
}

export function linkPublicoAcaoEntreAmigos(token: string): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/rifa/${token}`
}

export async function fetchAcaoPublicInfo(
  token: string,
): Promise<{ data: AcaoPublicInfo | null; error: string | null }> {
  const { data, error } = await supabase.rpc('acao_amigos_public_info', {
    p_token: token,
  })

  if (error) return { data: null, error: error.message }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { data: null, error: 'Link inválido ou expirado.' }

  return {
    data: {
      acao_id: Number(row.acao_id),
      acao_nome: String(row.acao_nome ?? ''),
      valor_numero: Number(row.valor_numero ?? 0),
      numero_inicial: Number(row.numero_inicial),
      numero_final: Number(row.numero_final),
      vendedor_nome: String(row.vendedor_nome ?? 'Vendedor'),
      empresa_nome: String(row.empresa_nome ?? ''),
      numeros_vendidos: Array.isArray(row.numeros_vendidos)
        ? row.numeros_vendidos.map((n: unknown) => Number(n))
        : [],
      imagem_url: row.imagem_url ? String(row.imagem_url) : null,
      data_sorteio: row.data_sorteio
        ? String(row.data_sorteio).slice(0, 10)
        : null,
    },
    error: null,
  }
}

export async function venderAcaoPublic(
  token: string,
  numeros: number[],
  compradorNome: string,
  compradorTelefone: string,
): Promise<{
  ok: boolean
  mensagem: string
  numerosSalvos: number[]
}> {
  const { data, error } = await supabase.rpc('acao_amigos_public_vender', {
    p_token: token,
    p_numeros: numeros,
    p_comprador_nome: compradorNome,
    p_comprador_telefone: compradorTelefone,
  })

  if (error) {
    return { ok: false, mensagem: error.message, numerosSalvos: [] }
  }

  const row = Array.isArray(data) ? data[0] : data
  return {
    ok: !!row?.ok,
    mensagem: String(row?.mensagem ?? 'Não foi possível concluir a venda.'),
    numerosSalvos: Array.isArray(row?.numeros_salvos)
      ? row.numeros_salvos.map((n: unknown) => Number(n))
      : [],
  }
}
