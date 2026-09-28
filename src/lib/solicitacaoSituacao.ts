export const SOLICITACAO_SITUACOES = [
  'em_andamento',
  'realizada',
  'nao_realizada',
] as const

export type SolicitacaoSituacao = (typeof SOLICITACAO_SITUACOES)[number]

export function isSolicitacaoSituacao(
  value: string | null | undefined,
): value is SolicitacaoSituacao {
  return (
    value === 'em_andamento' ||
    value === 'realizada' ||
    value === 'nao_realizada'
  )
}

export function solicitacaoSituacaoLabel(situacao: SolicitacaoSituacao): string {
  switch (situacao) {
    case 'realizada':
      return 'Realizada'
    case 'nao_realizada':
      return 'Não realizada'
    default:
      return 'Em andamento'
  }
}

/** Usuário da equipe sem ramo (1–5) no cadastro. */
export function usuarioSemRamo(
  codigoRamo: number | null | undefined,
): boolean {
  return codigoRamo == null || codigoRamo < 1 || codigoRamo > 5
}

export function nomeEhDirigente(nome: string | null | undefined): boolean {
  const texto = (nome ?? '').toUpperCase()
  return (
    texto.includes('DIRIGENTE') ||
    texto.includes('DIRETOR') ||
    texto.includes('DIRETO')
  )
}
