import { TITULO_SITUACAO, type PlataformaCobranca } from '@/lib/plataforma'
import { vencimentoCompetencia } from '@/lib/receitas'

/** Aviso quando a cobrança está aberta e faltam até N dias para o vencimento. */
export const PLATAFORMA_AVISO_DIAS = 5
/** Após o vencimento, o sistema ainda libera por N dias; depois bloqueia. */
export const PLATAFORMA_GRACA_DIAS = 10

export type PlataformaAcessoNivel = 'ok' | 'aviso' | 'bloqueado'

export type PlataformaAcessoState = {
  nivel: PlataformaAcessoNivel
  mensagem: string | null
  cobranca: PlataformaCobranca | null
  /** Dias até o vencimento (negativo = dias em atraso). */
  diasAteVencimento: number | null
}

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function todayLocal(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

export function diasEntre(de: Date, ate: Date): number {
  return Math.round((ate.getTime() - de.getTime()) / 86_400_000)
}

/**
 * Monta a data de vencimento na competência (YYYY-MM-01 ou YYYY-MM)
 * usando o dia cadastrado no grupo (1–28). Sem dia → último dia do mês.
 */
export function vencimentoPlataformaCompetencia(
  competencia: string,
  diaVencimento: number | null | undefined,
): string | null {
  return vencimentoCompetencia(competencia, diaVencimento)
}

function cobrancaEmAberto(c: PlataformaCobranca): boolean {
  return (
    Number(c.saldo) > 0 &&
    (c.situacao === TITULO_SITUACAO.ABERTO ||
      c.situacao === TITULO_SITUACAO.PARCIAL)
  )
}

/**
 * Avalia acesso do grupo à plataforma com base nas cobranças em aberto.
 * Super admin / isento / sem plano → ok.
 */
export function evaluatePlataformaAcesso(input: {
  isSuperAdmin: boolean
  isento: boolean
  temPlano: boolean
  cobrancas: PlataformaCobranca[]
}): PlataformaAcessoState {
  if (input.isSuperAdmin || input.isento || !input.temPlano) {
    return {
      nivel: 'ok',
      mensagem: null,
      cobranca: null,
      diasAteVencimento: null,
    }
  }

  const abertas = input.cobrancas
    .filter(cobrancaEmAberto)
    .filter((c) => !!c.vencimento)
    .sort((a, b) =>
      String(a.vencimento).localeCompare(String(b.vencimento)),
    )

  if (abertas.length === 0) {
    return {
      nivel: 'ok',
      mensagem: null,
      cobranca: null,
      diasAteVencimento: null,
    }
  }

  const hoje = todayLocal()
  let pior: PlataformaAcessoState = {
    nivel: 'ok',
    mensagem: null,
    cobranca: null,
    diasAteVencimento: null,
  }

  for (const cob of abertas) {
    const venc = parseLocalDate(String(cob.vencimento))
    const dias = diasEntre(hoje, venc)
    const nivel: PlataformaAcessoNivel =
      dias < -PLATAFORMA_GRACA_DIAS
        ? 'bloqueado'
        : dias <= PLATAFORMA_AVISO_DIAS
          ? 'aviso'
          : 'ok'

    const rank = { ok: 0, aviso: 1, bloqueado: 2 } as const
    if (rank[nivel] < rank[pior.nivel]) continue

    let mensagem: string | null = null
    if (nivel === 'bloqueado') {
      const atraso = Math.abs(dias)
      mensagem =
        `A mensalidade da plataforma venceu há ${atraso} dia(s). ` +
        `O acesso ao sistema está bloqueado até a quitação.`
    } else if (nivel === 'aviso') {
      if (dias < 0) {
        const restam = PLATAFORMA_GRACA_DIAS + dias
        mensagem =
          `A mensalidade da plataforma está vencida há ${Math.abs(dias)} dia(s). ` +
          `Restam ${Math.max(0, restam)} dia(s) de tolerância antes do bloqueio.`
      } else if (dias === 0) {
        mensagem =
          'A mensalidade da plataforma vence hoje. Regularize para evitar o bloqueio.'
      } else {
        mensagem =
          `A mensalidade da plataforma vence em ${dias} dia(s). ` +
          `Após o vencimento há ${PLATAFORMA_GRACA_DIAS} dias de tolerância.`
      }
    }

    pior = {
      nivel,
      mensagem,
      cobranca: cob,
      diasAteVencimento: dias,
    }
  }

  return pior
}
