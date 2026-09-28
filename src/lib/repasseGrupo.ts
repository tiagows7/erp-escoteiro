export type ValorGrupoTipo = 'percentual' | 'por_jovem'

export function isValorGrupoTipo(value: string | null | undefined): value is ValorGrupoTipo {
  return value === 'percentual' || value === 'por_jovem'
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Percentual incide sobre o valor recebido. Por jovem multiplica a quantidade. */
export function calcRepasseGrupo(opts: {
  tipo: ValorGrupoTipo
  valor: number
  jovens: number
  baseRecebida: number
}): { repasse: number; jovens: number; base: number } {
  const jovens = Math.max(0, Math.floor(opts.jovens))
  const base = roundMoney(Math.max(0, opts.baseRecebida))
  const valor = Math.max(0, opts.valor)
  if (opts.tipo === 'percentual') {
    const pct = Math.min(valor, 100)
    return { repasse: roundMoney(base * (pct / 100)), jovens, base }
  }
  return { repasse: roundMoney(valor * jovens), jovens, base }
}

export function valorGrupoTipoLabel(tipo: ValorGrupoTipo): string {
  return tipo === 'percentual' ? 'Percentual' : 'Valor por jovem'
}

export const REPASSE_DESPESA_FINALIDADE = 'Repasse ao grupo escoteiro'

/** Abre a despesa já lançada ou o formulário preenchido com o valor do repasse. */
export function repasseDespesaPath(opts: {
  origem: 'atividade' | 'evento'
  origemId: number
  despesaId?: number | null
}): string {
  if (opts.despesaId) return `/despesas/inclusao/${opts.despesaId}`
  const param = opts.origem === 'atividade' ? 'atividade_id' : 'evento_id'
  return `/despesas/inclusao/novo?${param}=${opts.origemId}&repasse=1`
}
