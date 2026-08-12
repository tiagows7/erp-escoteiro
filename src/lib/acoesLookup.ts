import { supabase } from '@/lib/supabase'
import type { FinanceiroScope } from '@/lib/financeiroScope'

export type AcaoLookup = {
  acao_id: number
  nome: string
  ramo: number | null
  secao: number | null
  data_sorteio: string | null
  encerrado_em: string | null
}

export function acaoLabel(a: AcaoLookup): string {
  const base = (() => {
    if (!a.data_sorteio) return a.nome
    const [y, m, d] = a.data_sorteio.slice(0, 10).split('-')
    if (!y || !m || !d) return a.nome
    return `${a.nome} (${d}/${m}/${y})`
  })()
  return a.encerrado_em ? `${base} (encerrado)` : base
}

/** Lista ações entre amigos da empresa, opcionalmente filtradas por ramo/seção. */
export async function loadAcoesLookup(
  empresaId: number,
  opts?: {
    ramo?: number | null
    secao?: number | null
    scope?: FinanceiroScope | null
    /** Se false, inclui encerradas (padrão: só abertas). */
    incluirEncerrados?: boolean
  },
): Promise<{ data: AcaoLookup[]; error: string | null }> {
  let query = supabase
    .from('acao_entre_amigos')
    .select('acao_id, nome, ramo, secao, data_sorteio, encerrado_em')
    .eq('empresa_id', empresaId)
    .order('data_sorteio', { ascending: false })
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
  return { data: (data as AcaoLookup[]) ?? [], error: null }
}
