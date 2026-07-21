import {
  financeiroScopeFromProfile,
  isRamoFinanceiroScoped,
} from '@/lib/roles'

export type FinanceiroScope = {
  ramo: number
  secao: number | null
}

export function resolveFinanceiroScope(profile: {
  registro?: string | null
  codigo_ramo?: number | null
  codigo_secao?: number | null
} | null): FinanceiroScope | null {
  if (!isRamoFinanceiroScoped(profile)) return null
  return financeiroScopeFromProfile(profile)
}

/** True se o título pertence ao ramo/seção do escopo (ou se não há escopo). */
export function matchesFinanceiroScope(
  scope: FinanceiroScope | null,
  ramo: number | null | undefined,
  secao: number | null | undefined,
): boolean {
  if (!scope) return true
  if (ramo !== scope.ramo) return false
  if (scope.secao != null && secao !== scope.secao) return false
  return true
}

/** Aplica filtro de ramo/seção em queries de despesas. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyDespesaScope(query: any, scope: FinanceiroScope | null) {
  if (!scope) return query
  let q = query.eq('despesa_ramo', scope.ramo)
  if (scope.secao != null) q = q.eq('despesa_secao', scope.secao)
  return q
}

/** Aplica filtro de ramo/seção em queries de receitas. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyReceitaScope(query: any, scope: FinanceiroScope | null) {
  if (!scope) return query
  let q = query.eq('receita_ramo', scope.ramo)
  if (scope.secao != null) q = q.eq('receita_secao', scope.secao)
  return q
}
