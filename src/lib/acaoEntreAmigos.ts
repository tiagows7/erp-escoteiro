import type { AcaoEntreAmigosFaixa } from '@/types/database'

/** Faixas se sobrepõem (inclusive). */
export function faixasSobrepoem(
  aIni: number,
  aFim: number,
  bIni: number,
  bFim: number,
): boolean {
  return aIni <= bFim && bIni <= aFim
}

export function faixaDentroDaAcao(
  faixaIni: number,
  faixaFim: number,
  acaoIni: number,
  acaoFim: number,
): boolean {
  return faixaIni >= acaoIni && faixaFim <= acaoFim
}

export function faixaConflitaComOutras(
  ini: number,
  fim: number,
  outras: Pick<AcaoEntreAmigosFaixa, 'numero_inicial' | 'numero_final' | 'faixa_id'>[],
  ignoreFaixaId?: number | null,
): boolean {
  return outras.some((f) => {
    if (ignoreFaixaId != null && f.faixa_id === ignoreFaixaId) return false
    return faixasSobrepoem(ini, fim, f.numero_inicial, f.numero_final)
  })
}

export function numerosDaFaixa(ini: number, fim: number): number[] {
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) return []
  const out: number[] = []
  for (let n = ini; n <= fim; n += 1) out.push(n)
  return out
}
