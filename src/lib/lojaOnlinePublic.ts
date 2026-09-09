import { supabase } from '@/lib/supabase'

export type LojaPublicProduto = {
  produto_id: number
  nome: string
  grupo: number | null
  valor_venda: number
  estoque_atual: number
  controla_estoque: boolean
  imagem_url: string | null
}

export type LojaPublicGrupo = {
  grupoproduto_id: number
  nome: string
}

export type LojaPublicInfo = {
  empresa_nome: string
  produtos: LojaPublicProduto[]
  grupos: LojaPublicGrupo[]
}

export function linkPublicoLojaOnline(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/loja/${token}`
}

export async function fetchLojaPublicInfo(
  token: string,
): Promise<{ data: LojaPublicInfo | null; error: string | null }> {
  const { data, error } = await supabase.rpc('loja_online_public_info', {
    p_token: token,
  })
  if (error) return { data: null, error: error.message }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) return { data: null, error: 'Link inválido ou expirado.' }

  return {
    data: {
      empresa_nome: String(row.empresa_nome ?? ''),
      produtos: Array.isArray(row.produtos)
        ? row.produtos.map((item: Record<string, unknown>) => ({
            produto_id: Number(item.produto_id),
            nome: String(item.nome ?? ''),
            grupo: item.grupo == null ? null : Number(item.grupo),
            valor_venda: Number(item.valor_venda ?? 0),
            estoque_atual: Number(item.estoque_atual ?? 0),
            controla_estoque: item.controla_estoque !== false,
            imagem_url: item.imagem_url ? String(item.imagem_url) : null,
          }))
        : [],
      grupos: Array.isArray(row.grupos)
        ? row.grupos.map((item: Record<string, unknown>) => ({
            grupoproduto_id: Number(item.grupoproduto_id),
            nome: String(item.nome ?? ''),
          }))
        : [],
    },
    error: null,
  }
}
