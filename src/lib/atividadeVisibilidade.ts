import type { Atividade } from '@/types/database'

export type AssociadoAtividadeCtx = {
  ramo: number | null
  secao: number | null
  patrulha_matilha: number | null
}

/** Sem ramo e sem seção = atividade do grupo inteiro. */
export function atividadeGrupoTodo(
  atividade: Pick<Atividade, 'ramo' | 'secao'>,
): boolean {
  return atividade.ramo == null && atividade.secao == null
}

/** Rótulo legível do escopo (ramo / seção) da atividade. */
export function labelAtividadeEscopo(
  atividade: Pick<Atividade, 'ramo' | 'secao'>,
  ramoMap: Map<number, string>,
  secaoMap: Map<number, string>,
): string {
  if (atividadeGrupoTodo(atividade)) return 'Grupo todo'
  const parts: string[] = []
  if (atividade.ramo != null) {
    parts.push(ramoMap.get(atividade.ramo) ?? `Ramo ${atividade.ramo}`)
  }
  if (atividade.secao != null) {
    parts.push(secaoMap.get(atividade.secao) ?? `Seção ${atividade.secao}`)
  }
  return parts.length > 0 ? parts.join(' · ') : '—'
}

/**
 * Filtro Supabase: atividades do ramo informado OU do grupo todo (ramo null).
 * Uso: query.or(filtroAtividadesRamoOuGrupo(ramoId))
 */
export function filtroAtividadesRamoOuGrupo(ramoId: number): string {
  return `ramo.eq.${ramoId},ramo.is.null`
}

/**
 * Filtro Supabase: grupo todo, ramo inteiro (sem seção) ou ramo+seção do usuário.
 * Uso: query.or(filtroAtividadesRamoSecaoOuGrupo(ramoId, secaoId))
 */
export function filtroAtividadesRamoSecaoOuGrupo(
  ramoId: number,
  secaoId: number,
): string {
  return [
    'and(ramo.is.null,secao.is.null)',
    `and(ramo.eq.${ramoId},secao.is.null)`,
    `and(ramo.eq.${ramoId},secao.eq.${secaoId})`,
  ].join(',')
}

/** Atividade visível para staff com ramo (e opcionalmente seção). */
export function atividadeVisivelParaStaff(
  atividade: Pick<Atividade, 'ramo' | 'secao'>,
  codigoRamo: number,
  codigoSecao: number | null,
): boolean {
  if (atividadeGrupoTodo(atividade)) return true
  if (atividade.ramo !== codigoRamo) return false
  if (codigoSecao == null) return true
  // Com seção no perfil: vê atividades do ramo sem seção ou da mesma seção.
  return atividade.secao == null || atividade.secao === codigoSecao
}

/** Atividade visível para o associado (ramo / seção / patrulha). */
export function atividadeVisivelPara(
  atividade: Pick<Atividade, 'ramo' | 'secao' | 'patrulha_matilha'>,
  associado: AssociadoAtividadeCtx,
): boolean {
  // Grupo todo: aparece para qualquer associado do grupo.
  if (atividadeGrupoTodo(atividade)) {
    return true
  }

  // Com ramo: só o mesmo ramo (ou associado sem ramo não vê atividade de ramo).
  if (atividade.ramo != null) {
    if (associado.ramo == null || atividade.ramo !== associado.ramo) {
      return false
    }
  }

  if (atividade.secao != null) {
    if (associado.secao == null || atividade.secao !== associado.secao) {
      return false
    }
  }

  if (atividade.patrulha_matilha != null) {
    if (
      associado.patrulha_matilha == null ||
      atividade.patrulha_matilha !== associado.patrulha_matilha
    ) {
      return false
    }
  }

  return true
}

/** Staff com ramo: vê atividades do seu ramo e as do grupo todo. */
export function atividadeVisivelParaStaffRamo(
  atividade: Pick<Atividade, 'ramo'>,
  codigoRamo: number,
): boolean {
  if (atividade.ramo == null) return true
  return atividade.ramo === codigoRamo
}
