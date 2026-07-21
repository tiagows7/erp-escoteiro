import type { Atividade } from '@/types/database'

export type AssociadoAtividadeCtx = {
  ramo: number | null
  secao: number | null
  patrulha_matilha: number | null
}

/** Atividade visível para o associado (ramo / seção / patrulha). */
export function atividadeVisivelPara(
  atividade: Pick<Atividade, 'ramo' | 'secao' | 'patrulha_matilha'>,
  associado: AssociadoAtividadeCtx,
): boolean {
  if (atividade.ramo != null && associado.ramo != null) {
    if (atividade.ramo !== associado.ramo) return false
  } else if (atividade.ramo != null && associado.ramo == null) {
    return false
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
