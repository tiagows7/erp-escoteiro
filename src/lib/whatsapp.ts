/** Normaliza telefone BR para E.164 sem "+" (ex.: 5511999998888). */
export function normalizeWhatsAppPhone(
  phone: string | null | undefined,
): string | null {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return null

  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return digits
  }

  // Celular com DDD (10 ou 11 dígitos)
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }

  return null
}

export function buildWhatsAppUrl(opts: {
  phone?: string | null
  text: string
}): string | null {
  const text = opts.text.trim()
  if (!text) return null

  const phone = normalizeWhatsAppPhone(opts.phone)
  const q = encodeURIComponent(text)

  // Sem telefone: abre o WhatsApp para o usuário escolher o contato.
  if (!phone) return `https://wa.me/?text=${q}`
  return `https://wa.me/${phone}?text=${q}`
}

export function openWhatsApp(opts: {
  phone?: string | null
  text: string
}): boolean {
  const url = buildWhatsAppUrl(opts)
  if (!url) return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

/** URL pública do app (VITE_APP_URL ou origem atual). */
export function appAccessUrl(): string {
  const fromEnv = String(import.meta.env.VITE_APP_URL ?? '').trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

function blocoAcessoPagamento(registro?: string | number | null): string[] {
  const url = appAccessUrl()
  const reg =
    registro != null && String(registro).trim()
      ? String(registro).replace(/\D/g, '')
      : ''

  const linhas = [
    '',
    'Para efetuar o pagamento, acesse o aplicativo do grupo:',
  ]
  if (url) linhas.push(url)
  linhas.push(
    '',
    'No login, use o número de registro do associado e a senha cadastrada.',
  )
  if (reg) {
    linhas.push(`Registro para login: ${reg}`)
  }
  linhas.push(
    'No painel inicial, abra Mensalidades em aberto e toque em Pagar.',
  )
  return linhas
}

export function mensagemCobrancaMensalidade(opts: {
  nomeGrupo?: string | null
  nomeAssociado: string
  registro?: string | number | null
  qtd: number
  total: string
  detalhes?: string[]
}): string {
  const grupo = opts.nomeGrupo?.trim() || 'Grupo Escoteiro'
  const reg = opts.registro != null && String(opts.registro).trim()
    ? ` (reg. ${opts.registro})`
    : ''
  const linhas = [
    `Olá! Mensagem do ${grupo}.`,
    '',
    `${opts.nomeAssociado}${reg} possui ${opts.qtd} mensalidade(s) em aberto.`,
    `Total: ${opts.total}.`,
  ]
  if (opts.detalhes?.length) {
    linhas.push('', ...opts.detalhes.map((d) => `• ${d}`))
  }
  linhas.push(...blocoAcessoPagamento(opts.registro))
  linhas.push('', 'Qualquer dúvida, fale conosco. Obrigado!')
  return linhas.join('\n')
}

export function mensagemContatoAssociado(opts: {
  nomeGrupo?: string | null
  nomeAssociado: string
  registro?: string | number | null
}): string {
  const grupo = opts.nomeGrupo?.trim() || 'Grupo Escoteiro'
  const reg = opts.registro != null && String(opts.registro).trim()
    ? ` (reg. ${opts.registro})`
    : ''
  return [
    `Olá! Mensagem do ${grupo}.`,
    '',
    `Referente a ${opts.nomeAssociado}${reg}.`,
    'Entramos em contato pelo WhatsApp do grupo escoteiro.',
    '',
    'Qualquer dúvida, fale conosco. Obrigado!',
  ].join('\n')
}

export function mensagemPixCopiaCola(opts: {
  titulo: string
  valor: string
  pixCopiaECola: string
}): string {
  return [
    opts.titulo,
    `Valor: ${opts.valor}`,
    '',
    'Pix Copia e Cola:',
    opts.pixCopiaECola,
  ].join('\n')
}

export function mensagemAtividade(opts: {
  nomeGrupo?: string | null
  nomeAssociado?: string | null
  registro?: string | number | null
  descricao: string
  valor: string
  local?: string | null
}): string {
  const grupo = opts.nomeGrupo?.trim() || 'Grupo Escoteiro'
  const quem = opts.nomeAssociado?.trim()
  return [
    `Olá! Mensagem do ${grupo}.`,
    '',
    quem ? `Associado: ${quem}` : null,
    `Atividade: ${opts.descricao}`,
    opts.local ? `Local: ${opts.local}` : null,
    `Valor: ${opts.valor}`,
    ...blocoAcessoPagamento(opts.registro),
    '',
    'Qualquer dúvida, fale conosco. Obrigado!',
  ]
    .filter(Boolean)
    .join('\n')
}
