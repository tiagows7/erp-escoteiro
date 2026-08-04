import { supabase } from '@/lib/supabase'
import type { FinanceiroScope } from '@/lib/financeiroScope'

export type ProjetoLookup = {
  projeto_id: number
  descricao: string
  ramo: number | null
  secao: number | null
  valor: number
}

export function projetoLabel(p: ProjetoLookup): string {
  return p.descricao
}

/** Lista projetos da empresa, opcionalmente filtrados por ramo/seção. */
export async function loadProjetosLookup(
  empresaId: number,
  opts?: {
    ramo?: number | null
    secao?: number | null
    scope?: FinanceiroScope | null
  },
): Promise<{ data: ProjetoLookup[]; error: string | null }> {
  let query = supabase
    .from('projetos')
    .select('projeto_id, descricao, ramo, secao, valor')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(500)

  const ramo = opts?.scope?.ramo ?? opts?.ramo ?? null
  const secao = opts?.scope?.secao ?? opts?.secao ?? null
  if (ramo != null) {
    query = query.or(`ramo.eq.${ramo},ramo.is.null`)
  }
  if (secao != null) {
    query = query.or(`secao.eq.${secao},secao.is.null`)
  }

  const { data, error } = await query
  if (error) return { data: [], error: error.message }
  return { data: (data as ProjetoLookup[]) ?? [], error: null }
}
