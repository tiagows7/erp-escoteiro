import { supabase } from '@/lib/supabase'
import type { FinanceiroScope } from '@/lib/financeiroScope'

export type AtividadeLookup = {
  atividade_id: number
  descricao: string
  local: string | null
  ramo: number | null
  secao: number | null
  valor: number
}

export function atividadeLabel(a: AtividadeLookup): string {
  const local = a.local?.trim()
  return local ? `${a.descricao} — ${local}` : a.descricao
}

/** Lista atividades da empresa, opcionalmente filtradas por ramo/seção. */
export async function loadAtividadesLookup(
  empresaId: number,
  opts?: {
    ramo?: number | null
    secao?: number | null
    scope?: FinanceiroScope | null
  },
): Promise<{ data: AtividadeLookup[]; error: string | null }> {
  let query = supabase
    .from('atividades')
    .select('atividade_id, descricao, local, ramo, secao, valor')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(500)

  const ramo = opts?.scope?.ramo ?? opts?.ramo ?? null
  const secao = opts?.scope?.secao ?? opts?.secao ?? null
  if (ramo != null) {
    // Inclui atividades do grupo todo (sem ramo).
    query = query.or(`ramo.eq.${ramo},ramo.is.null`)
  }
  if (secao != null) {
    query = query.or(`secao.eq.${secao},secao.is.null`)
  }

  const { data, error } = await query
  if (error) return { data: [], error: error.message }
  return { data: (data as AtividadeLookup[]) ?? [], error: null }
}
