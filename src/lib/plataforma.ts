import { formatMoney, situacaoFromSaldo, TITULO_SITUACAO } from '@/lib/receitas'

export type PlataformaPlano = {
  plano_id: number
  nome: string
  valor: number
  ativo: boolean
}

export type PlataformaCobranca = {
  cobranca_id: number
  empresa_id: number
  plano_id: number | null
  competencia: string
  vencimento: string | null
  descricao: string
  valor: number
  saldo: number
  situacao: number
  observacao: string | null
  pago_em: string | null
  empresa?: { id: number; nome: string; slug: string | null } | null
  plataforma_plano?: { plano_id: number; nome: string } | null
}

export { formatMoney, situacaoFromSaldo, TITULO_SITUACAO }

export function plataformaSituacaoLabel(situacao: number | null | undefined) {
  switch (situacao) {
    case TITULO_SITUACAO.ABERTO:
      return 'Em aberto'
    case TITULO_SITUACAO.PARCIAL:
      return 'Parcial'
    case TITULO_SITUACAO.PAGO:
      return 'Pago'
    default:
      return '—'
  }
}
