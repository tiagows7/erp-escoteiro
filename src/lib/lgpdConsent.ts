import { supabase } from '@/lib/supabase'

/** Versão dos documentos legais (alinhar com as páginas públicas). */
export const LGPD_TERMOS_VERSAO = '2026-08-03'

export const LGPD_TEXTO_MENOR =
  'Li e concordo com os Termos de Uso e Política de Privacidade e dou meu consentimento para o tratamento dos dados do menor.'

export const LGPD_TEXTO_ADULTO =
  'Li e concordo com os Termos de Uso e Política de Privacidade e dou meu consentimento para o tratamento dos dados pessoais.'

export function idadeEmAnos(
  dataNascimento: string | null | undefined,
  ref: Date = new Date(),
): number | null {
  const raw = (dataNascimento ?? '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const [y, m, d] = raw.split('-').map(Number)
  const nasc = new Date(y, m - 1, d)
  if (Number.isNaN(nasc.getTime())) return null
  let age = ref.getFullYear() - nasc.getFullYear()
  const md = ref.getMonth() - nasc.getMonth()
  if (md < 0 || (md === 0 && ref.getDate() < nasc.getDate())) age -= 1
  return age
}

export function isMenorDeIdade(
  dataNascimento: string | null | undefined,
): boolean {
  const age = idadeEmAnos(dataNascimento)
  return age != null && age < 18
}

export function textoConsentimentoLgpd(menor: boolean): string {
  return menor ? LGPD_TEXTO_MENOR : LGPD_TEXTO_ADULTO
}

export async function registrarConsentimentoLgpd(input: {
  associadoId: number
  empresaId: number
  menorIdade: boolean
  textoConsentimento: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke(
    'registrar-lgpd-consentimento',
    {
      body: {
        associado_id: input.associadoId,
        empresa_id: input.empresaId,
        versao_termos: LGPD_TERMOS_VERSAO,
        texto_consentimento: input.textoConsentimento,
        menor_idade: input.menorIdade,
        user_agent:
          typeof navigator !== 'undefined' ? navigator.userAgent : null,
      },
    },
  )

  if (error) {
    return { ok: false, error: error.message }
  }
  if (data?.error) {
    return { ok: false, error: String(data.error) }
  }
  return { ok: true }
}

export function formatLgpdAceite(
  em: string | null | undefined,
  ip: string | null | undefined,
): string | null {
  if (!em) return null
  const dt = new Date(em)
  if (Number.isNaN(dt.getTime())) return em
  const data = dt.toLocaleString('pt-BR')
  return ip ? `${data} · IP ${ip}` : data
}
