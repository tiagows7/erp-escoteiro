import { supabase } from '@/lib/supabase'
import type { FinanceiroScope } from '@/lib/financeiroScope'

export type EventoLookup = {
  evento_id: number
  nome: string
  ramo: number | null
  secao: number | null
  data_evento: string | null
  encerrado_em: string | null
}

export function eventoLabel(e: EventoLookup): string {
  const base = (() => {
    if (!e.data_evento) return e.nome
    const [y, m, d] = e.data_evento.slice(0, 10).split('-')
    if (!y || !m || !d) return e.nome
    return `${e.nome} (${d}/${m}/${y})`
  })()
  return e.encerrado_em ? `${base} (encerrado)` : base
}

/** Lista eventos da empresa, opcionalmente filtrados por ramo/seção. */
export async function loadEventosLookup(
  empresaId: number,
  opts?: {
    ramo?: number | null
    secao?: number | null
    scope?: FinanceiroScope | null
    /** Se false, inclui encerrados (padrão: só abertos). */
    incluirEncerrados?: boolean
  },
): Promise<{ data: EventoLookup[]; error: string | null }> {
  let query = supabase
    .from('venda_eventos')
    .select('evento_id, nome, ramo, secao, data_evento, encerrado_em')
    .eq('empresa_id', empresaId)
    .order('data_evento', { ascending: false })
    .limit(500)

  if (!opts?.incluirEncerrados) {
    query = query.is('encerrado_em', null)
  }

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
  return { data: (data as EventoLookup[]) ?? [], error: null }
}
