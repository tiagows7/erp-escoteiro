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

/**
 * Filtro Supabase: atividades do ramo informado OU do grupo todo (ramo null).
 * Uso: query.or(filtroAtividadesRamoOuGrupo(ramoId))
 */
export function filtroAtividadesRamoOuGrupo(ramoId: number): string {
  return `ramo.eq.${ramoId},ramo.is.null`
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
