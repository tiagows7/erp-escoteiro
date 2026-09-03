import { createClient } from 'npm:@supabase/supabase-js@2.49.8'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type CreateBody = {
  action: 'create'
  empresa_id: number
  tipo:
    | 'mensalidade'
    | 'atividade'
    | 'mensalidade_lote'
    | 'acao_entre_amigos'
    | 'loja'
  valor: number
  descricao?: string
  associado_id?: number | null
  receita_ids?: number[]
  atividade_id?: number | null
  tipopagto_id?: number | null
  loja_itens?: unknown
  observacao?: string | null
}

type StatusBody = {
  action: 'status'
  cobranca_id: number
}

type ConfigBody = {
  action: 'config'
  empresa_id?: number
  tipo?:
    | 'mensalidade'
    | 'atividade'
    | 'mensalidade_lote'
    | 'acao_entre_amigos'
    | 'loja'
  atividade_id?: number | null
  ramo_id?: number | null
}

type CreatePublicBody = {
  action: 'create_public'
  link_token: string
  numeros: number[]
  comprador_nome: string
  comprador_telefone: string
  descricao?: string
}

type CreatePublicEventoBody = {
  action: 'create_public_evento'
  link_token: string
  nomes: string[]
  tipo_ids?: number[] | null
  restricoes_alimentares?: string[] | null
  comprador_telefone: string
  descricao?: string
}

type StatusPublicBody = {
  action: 'status_public'
  cobranca_id: number
  link_token: string
}

type PollPendingBody = {
  action: 'poll_pending'
}

type PixRequestBody =
  | CreateBody
  | StatusBody
  | ConfigBody
  | CreatePublicBody
  | CreatePublicEventoBody
  | StatusPublicBody
  | PollPendingBody

function tipoUsaPixRamo(tipo: string): boolean {
  return (
    tipo === 'atividade' ||
    tipo === 'acao_entre_amigos' ||
    tipo === 'venda_evento'
  )
}

type SicrediConfig = {
  clientId: string
  clientSecret: string
  chave: string
  cert: string
  key: string
  baseUrl: string
  oauthPath: string
  apiPath: string
  source: string
}

type DbSicrediRow = {
  sicredi_pix_client_id?: string | null
  sicredi_pix_client_secret?: string | null
  sicredi_pix_chave?: string | null
  sicredi_pix_cert?: string | null
  sicredi_pix_key?: string | null
  sicredi_pix_base_url?: string | null
  sicredi_pix_ativo?: boolean | null
}

type DbContaBancariaPix = {
  id?: number
  ramo_id?: number | null
  secao_id?: number | null
  api_client_id?: string | null
  api_client_secret?: string | null
  api_pix_chave?: string | null
  api_pix_cert?: string | null
  api_pix_key?: string | null
  api_pix_base_url?: string | null
  api_pix_ativo?: boolean | null
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type EventoTipoResolvido = {
  tipo_id: number
  label: string
  valor: number
}

async function resolveEventoTiposLinhas(
  admin: ReturnType<typeof createClient>,
  eventoId: number,
  nomesCount: number,
  tipoIdsRaw: unknown,
): Promise<
  | { ok: true; linhas: EventoTipoResolvido[]; valorTotal: number; tipoIds: number[] }
  | { ok: false; error: string }
> {
  const { data: tipos } = await admin
    .from('venda_evento_tipo')
    .select('tipo_id, label, valor, ordem')
    .eq('evento_id', eventoId)
    .eq('ativo', true)
    .order('ordem')
    .order('tipo_id')

  const lista = (tipos ?? []) as EventoTipoResolvido[]
  if (lista.length === 0) {
    const { data: evento } = await admin
      .from('venda_eventos')
      .select('valor_convite')
      .eq('evento_id', eventoId)
      .maybeSingle()
    const valor = Number(evento?.valor_convite ?? 0)
    const fallback = { tipo_id: 0, label: 'Inteira', valor }
    const linhas = Array.from({ length: nomesCount }, () => fallback)
    return {
      ok: true,
      linhas,
      valorTotal: Math.round(valor * nomesCount * 100) / 100,
      tipoIds: [],
    }
  }

  const defaultTipo = lista[0]
  const requested = Array.isArray(tipoIdsRaw)
    ? tipoIdsRaw.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
    : []

  const linhas: EventoTipoResolvido[] = []
  const tipoIds: number[] = []
  for (let i = 0; i < nomesCount; i += 1) {
    const id = requested[i] ?? defaultTipo.tipo_id
    const found = lista.find((t) => t.tipo_id === id) ?? defaultTipo
    linhas.push({
      tipo_id: found.tipo_id,
      label: String(found.label ?? ''),
      valor: Number(found.valor ?? 0),
    })
    tipoIds.push(found.tipo_id)
  }

  const valorTotal =
    Math.round(linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100
  return { ok: true, linhas, valorTotal, tipoIds }
}

function configFromDbRow(
  row: DbSicrediRow | null | undefined,
  source: string,
): SicrediConfig | null {
  if (!row || row.sicredi_pix_ativo !== true) return null

  const clientId = (row.sicredi_pix_client_id ?? '').trim()
  const clientSecret = (row.sicredi_pix_client_secret ?? '').trim()
  const chave = (row.sicredi_pix_chave ?? '').trim()
  const cert = (row.sicredi_pix_cert ?? '').replace(/\\n/g, '\n').trim()
  const key = (row.sicredi_pix_key ?? '').replace(/\\n/g, '\n').trim()
  const baseUrl = (
    row.sicredi_pix_base_url?.trim() ||
    Deno.env.get('SICREDI_PIX_BASE_URL') ||
    'https://api-pix.sicredi.com.br'
  ).replace(/\/$/, '')

  if (!clientId || !clientSecret || !chave || !cert || !key) return null

  return {
    clientId,
    clientSecret,
    chave,
    cert,
    key,
    baseUrl,
    oauthPath: Deno.env.get('SICREDI_PIX_OAUTH_PATH') ?? '/oauth/token',
    apiPath: Deno.env.get('SICREDI_PIX_API_PATH') ?? '/api/v2',
    source,
  }
}

function configFromContaBancaria(
  row: DbContaBancariaPix | null | undefined,
  source: string,
): SicrediConfig | null {
  if (!row || row.api_pix_ativo !== true) return null

  const clientId = (row.api_client_id ?? '').trim()
  const clientSecret = (row.api_client_secret ?? '').trim()
  const chave = (row.api_pix_chave ?? '').trim()
  const cert = (row.api_pix_cert ?? '').replace(/\\n/g, '\n').trim()
  const key = (row.api_pix_key ?? '').replace(/\\n/g, '\n').trim()
  const baseUrl = (
    row.api_pix_base_url?.trim() ||
    Deno.env.get('SICREDI_PIX_BASE_URL') ||
    'https://api-pix.sicredi.com.br'
  ).replace(/\/$/, '')

  if (!clientId || !clientSecret || !chave || !cert || !key) return null

  return {
    clientId,
    clientSecret,
    chave,
    cert,
    key,
    baseUrl,
    oauthPath: Deno.env.get('SICREDI_PIX_OAUTH_PATH') ?? '/oauth/token',
    apiPath: Deno.env.get('SICREDI_PIX_API_PATH') ?? '/api/v2',
    source,
  }
}

async function resolveConfigFromContas(
  admin: ReturnType<typeof createClient>,
  empresaId: number,
  ramoId: number | null,
  secaoId: number | null = null,
): Promise<{ cfg: SicrediConfig | null; hint: string | null }> {
  const { data: contas, error } = await admin
    .from('empresa_conta_bancaria')
    .select(
      'id, ramo_id, secao_id, api_client_id, api_client_secret, api_pix_chave, api_pix_cert, api_pix_key, api_pix_base_url, api_pix_ativo',
    )
    .eq('empresa_id', empresaId)
    .order('id', { ascending: true })

  if (error) {
    return {
      cfg: null,
      hint: `Erro ao ler contas bancárias: ${error.message}`,
    }
  }

  const list = (contas ?? []) as DbContaBancariaPix[]
  if (list.length === 0) {
    return {
      cfg: null,
      hint: 'Nenhuma conta bancária cadastrada. Use Cadastrar banco.',
    }
  }

  // Preferência: seção → ramo (sem seção) → grupo.
  const ordered: DbContaBancariaPix[] = []
  const seen = new Set<number>()
  const pushAll = (rows: DbContaBancariaPix[]) => {
    for (const row of rows) {
      const id = Number(row.id ?? 0)
      if (!id || seen.has(id)) continue
      seen.add(id)
      ordered.push(row)
    }
  }

  if (secaoId != null) {
    pushAll(list.filter((c) => c.secao_id === secaoId))
  }
  if (ramoId != null) {
    pushAll(
      list.filter((c) => c.ramo_id === ramoId && c.secao_id == null),
    )
  }
  pushAll(list.filter((c) => c.ramo_id == null && c.secao_id == null))

  // Mensalidade / escopo só-grupo: não usar contas de ramo/seção.
  const candidatos =
    ramoId == null && secaoId == null
      ? list.filter((c) => c.ramo_id == null && c.secao_id == null)
      : ordered

  if (candidatos.length === 0) {
    return {
      cfg: null,
      hint:
        secaoId != null || ramoId != null
          ? 'Cadastre uma conta bancária da seção, do ramo ou do grupo com PIX ativo.'
          : 'Para mensalidades, cadastre uma conta bancária do grupo (sem ramo) com PIX ativo.',
    }
  }

  for (const row of candidatos) {
    const source =
      row.secao_id != null
        ? `conta:${row.id}:secao:${row.secao_id}`
        : row.ramo_id != null
          ? `conta:${row.id}:ramo:${row.ramo_id}`
          : `conta:${row.id}:grupo`
    const cfg = configFromContaBancaria(row, source)
    if (cfg) return { cfg, hint: null }
  }

  const incompleta = candidatos.find((c) => c.api_pix_ativo === true)
  if (incompleta) {
    const faltando: string[] = []
    if (!(incompleta.api_client_id ?? '').trim()) faltando.push('Client ID')
    if (!(incompleta.api_client_secret ?? '').trim()) {
      faltando.push('Client Secret')
    }
    if (!(incompleta.api_pix_chave ?? '').trim()) faltando.push('Chave PIX')
    if (!(incompleta.api_pix_cert ?? '').trim()) faltando.push('Certificado')
    if (!(incompleta.api_pix_key ?? '').trim()) faltando.push('Chave privada')
    return {
      cfg: null,
      hint:
        faltando.length > 0
          ? `Conta com PIX ativo incompleta. Preencha: ${faltando.join(', ')}.`
          : 'Conta bancária com PIX ativo incompleta.',
    }
  }

  return {
    cfg: null,
    hint: 'Há conta bancária, mas nenhuma com "PIX Sicredi ativo" marcado.',
  }
}

/** Fallback global (secrets do Supabase), se o grupo ainda não cadastrou. */
function readSicrediEnvConfig(): SicrediConfig | null {
  const clientId = Deno.env.get('SICREDI_PIX_CLIENT_ID')?.trim() ?? ''
  const clientSecret = Deno.env.get('SICREDI_PIX_CLIENT_SECRET')?.trim() ?? ''
  const chave = Deno.env.get('SICREDI_PIX_CHAVE')?.trim() ?? ''
  const cert = (Deno.env.get('SICREDI_PIX_CERT') ?? '')
    .replace(/\\n/g, '\n')
    .trim()
  const key = (Deno.env.get('SICREDI_PIX_KEY') ?? '')
    .replace(/\\n/g, '\n')
    .trim()
  const baseUrl = (
    Deno.env.get('SICREDI_PIX_BASE_URL') ?? 'https://api-pix.sicredi.com.br'
  ).replace(/\/$/, '')

  if (!clientId || !clientSecret || !chave || !cert || !key) {
    return null
  }

  return {
    clientId,
    clientSecret,
    chave,
    cert,
    key,
    baseUrl,
    oauthPath: Deno.env.get('SICREDI_PIX_OAUTH_PATH') ?? '/oauth/token',
    apiPath: Deno.env.get('SICREDI_PIX_API_PATH') ?? '/api/v2',
    source: 'env',
  }
}

async function resolveSicrediConfig(
  admin: ReturnType<typeof createClient>,
  opts: {
    empresaId: number
    tipo: string
    atividadeId?: number | null
    ramoId?: number | null
    secaoId?: number | null
  },
): Promise<{ cfg: SicrediConfig | null; hint: string | null }> {
  let ramoId = opts.ramoId ?? null
  let secaoId = opts.secaoId ?? null

  // Atividade: sempre ler ramo/seção do cadastro (PIX da conta do ramo/seção).
  if (opts.tipo === 'atividade' && opts.atividadeId) {
    const { data: ativ } = await admin
      .from('atividades')
      .select('ramo, secao')
      .eq('empresa_id', opts.empresaId)
      .eq('atividade_id', opts.atividadeId)
      .maybeSingle()
    if (ativ) {
      ramoId = (ativ.ramo as number | null) ?? null
      secaoId = (ativ.secao as number | null) ?? null
    }
  }

  if (ramoId == null && secaoId != null) {
    const { data: secaoRow } = await admin
      .from('secao')
      .select('ramo')
      .eq('secao_id', secaoId)
      .maybeSingle()
    ramoId = (secaoRow?.ramo as number | null) ?? null
  }

  // Preferência: credenciais no cadastro de bancos.
  const fromConta = await resolveConfigFromContas(
    admin,
    opts.empresaId,
    tipoUsaPixRamo(opts.tipo) ? ramoId : null,
    tipoUsaPixRamo(opts.tipo) ? secaoId : null,
  )
  if (fromConta.cfg) return fromConta

  // Fallback legado: empresa / ramo_pix_sicredi / env.
  if (tipoUsaPixRamo(opts.tipo) && ramoId != null) {
    const { data: ramoCfg } = await admin
      .from('empresa_ramo_pix_sicredi')
      .select(
        'sicredi_pix_client_id, sicredi_pix_client_secret, sicredi_pix_chave, sicredi_pix_cert, sicredi_pix_key, sicredi_pix_base_url, sicredi_pix_ativo',
      )
      .eq('empresa_id', opts.empresaId)
      .eq('ramo_id', ramoId)
      .maybeSingle()

    const fromRamo = configFromDbRow(
      ramoCfg as DbSicrediRow | null,
      `ramo:${ramoId}`,
    )
    if (fromRamo) return { cfg: fromRamo, hint: null }
  }

  const { data: emp } = await admin
    .from('empresa')
    .select(
      'sicredi_pix_client_id, sicredi_pix_client_secret, sicredi_pix_chave, sicredi_pix_cert, sicredi_pix_key, sicredi_pix_base_url, sicredi_pix_ativo',
    )
    .eq('id', opts.empresaId)
    .maybeSingle()

  const fromEmpresa = configFromDbRow(emp as DbSicrediRow | null, 'empresa')
  if (fromEmpresa) return { cfg: fromEmpresa, hint: null }

  const fromEnv = readSicrediEnvConfig()
  if (fromEnv) return { cfg: fromEnv, hint: null }

  return {
    cfg: null,
    hint:
      fromConta.hint ||
      (tipoUsaPixRamo(opts.tipo)
        ? 'Cadastre uma conta bancária com PIX ativo para o ramo (ou do grupo) em Cadastrar banco.'
        : 'Cadastre uma conta bancária do grupo (sem ramo) com PIX ativo em Cadastrar banco.'),
  }
}

/** Normaliza PEM colado no formulário (\\n literais, CRLF, espaços). */
function normalizePem(pem: string): string {
  let text = (pem ?? '').trim()
  if (!text) return ''
  // Conteúdo veio com "\n" literal (uma barra).
  if (text.includes('\\n') && !text.includes('\n')) {
    text = text.replace(/\\n/g, '\n')
  }
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  // Remove espaços no início de cada linha (comum ao colar).
  text = text
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
  return text
}

function splitPemCertificates(pem: string): string[] {
  return (
    normalizePem(pem).match(
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    ) ?? []
  )
}

/**
 * mTLS para Sicredi.
 * Deno moderno usa { cert, key }; a API antiga { certChain, privateKey }
 * é ignorada em vários runtimes → Access Denied sem certificado cliente.
 */
function createMtlsClient(cfg: SicrediConfig): Deno.HttpClient {
  const fullCert = normalizePem(cfg.cert)
  const key = normalizePem(cfg.key)
  const blocks = splitPemCertificates(fullCert)
  const leaf = blocks[0] ?? fullCert
  const caCerts = blocks.slice(1)

  // Preferência: API atual do Deno (cert/key).
  try {
    return Deno.createHttpClient({
      cert: leaf,
      key,
      ...(caCerts.length > 0 ? { caCerts } : {}),
    } as Deno.CreateHttpClientOptions)
  } catch {
    /* runtime antigo */
  }

  return Deno.createHttpClient({
    certChain: fullCert,
    privateKey: key,
  } as Deno.CreateHttpClientOptions)
}

function oauthScope(): string {
  return (
    Deno.env.get('SICREDI_PIX_OAUTH_SCOPE')?.trim() ||
    'cob.write cob.read pix.read webhook.read webhook.write'
  )
}

function isAccessDeniedHtml(body: string): boolean {
  const t = body.toLowerCase()
  return (
    t.includes('access denied') ||
    t.includes('<title>access denied</title>') ||
    t.includes('access denied for this environment')
  )
}

function oauthErrorHint(
  status: number,
  baseUrl: string,
  rawBody: string,
): string {
  const homolog = baseUrl.includes('api-pix-h')
  if (status === 403 && isAccessDeniedHtml(rawBody)) {
    return homolog
      ? 'Sicredi bloqueou o acesso (Access Denied) na homologação. Confira certificado aprovado (não CSR), Client ID/Secret e URL de homologação.'
      : 'Sicredi bloqueou o acesso (Access Denied) na produção. Com certificado correto isso costuma ser falha de mTLS no servidor. Confira se o .cer aprovado e a chave .key (sem senha) estão salvos na conta bancária.'
  }
  if (status === 403) {
    return [
      'OAuth 403: Sicredi recusou a autenticação.',
      'Confira Client ID/Secret + certificado da mesma aplicação,',
      homolog
        ? 'URL de homologação com credenciais de homologação,'
        : 'se for homologação use https://api-pix-h.sicredi.com.br,',
      'e escopos cob.write / cob.read no portal.',
    ].join(' ')
  }
  if (status === 401) {
    return 'OAuth 401: Client ID ou Client Secret incorretos.'
  }
  return `Falha OAuth Sicredi (${status}).`
}

function assertPemPair(cert: string, key: string) {
  const c = normalizePem(cert)
  const k = normalizePem(key)
  if (c.includes('BEGIN CERTIFICATE REQUEST')) {
    throw new Error(
      'Você colou o CSR (pedido de certificado), não o certificado. No Portal Sicredi, baixe o .crt/.cer já APROVADO — ele começa com -----BEGIN CERTIFICATE----- (sem a palavra REQUEST).',
    )
  }
  if (!c.includes('BEGIN CERTIFICATE')) {
    throw new Error(
      'Certificado inválido: cole o conteúdo completo do .crt/.cer aprovado (com -----BEGIN CERTIFICATE-----).',
    )
  }
  if (k.includes('ENCRYPTED PRIVATE KEY')) {
    throw new Error(
      'A chave privada está com senha (BEGIN ENCRYPTED PRIVATE KEY). O PIX Sicredi precisa da chave sem senha. Gere com: openssl pkcs8 -inform PEM -in sua.key -outform PEM -out chave-sem-senha.key -nocrypt — depois cole o arquivo em Cadastrar banco (Grupo).',
    )
  }
  if (
    !k.includes('BEGIN PRIVATE KEY') &&
    !k.includes('BEGIN RSA PRIVATE KEY') &&
    !k.includes('BEGIN EC PRIVATE KEY')
  ) {
    throw new Error(
      'Chave privada inválida: cole o conteúdo completo do .key sem senha (-----BEGIN PRIVATE KEY----- ou -----BEGIN RSA PRIVATE KEY-----). Se o arquivo tiver senha, converta antes com openssl pkcs8 … -nocrypt.',
    )
  }
}

const tokenCache = new Map<string, { value: string; expiresAt: number }>()

async function getAccessToken(cfg: SicrediConfig): Promise<string> {
  const cacheKey = `${cfg.source}|${cfg.clientId}|${cfg.baseUrl}|${oauthScope()}`
  const now = Date.now()
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > now + 30_000) {
    return cached.value
  }

  assertPemPair(cfg.cert, cfg.key)

  const oauthPaths = Array.from(
    new Set(
      [
        cfg.oauthPath,
        '/oauth/token',
        '/auth/openapi/token',
      ].filter(Boolean),
    ),
  )

  const client = createMtlsClient(cfg)
  try {
    const basic = btoa(`${cfg.clientId}:${cfg.clientSecret}`)
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: oauthScope(),
    })

    let lastStatus = 0
    let lastRaw = ''

    for (const path of oauthPaths) {
      const res = await fetch(`${cfg.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'erp-escoteiro/pix-sicredi',
        },
        body,
        client,
      })

      const raw = await res.text()
      lastStatus = res.status
      lastRaw = raw

      let data: Record<string, unknown> = {}
      try {
        data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      } catch {
        /* corpo não-JSON */
      }

      if (res.ok && data?.access_token) {
        const entry = {
          value: String(data.access_token),
          expiresAt: now + Number(data.expires_in ?? 3000) * 1000,
        }
        tokenCache.set(cacheKey, entry)
        return entry.value
      }

      // Access Denied / 404 em um path: tenta o próximo.
      if (
        res.status === 404 ||
        (res.status === 403 && isAccessDeniedHtml(raw))
      ) {
        continue
      }

      const detail = String(
        data?.mensagem ||
          data?.error_description ||
          data?.error ||
          data?.detail ||
          raw?.slice(0, 180) ||
          '',
      ).trim()
      const hint = oauthErrorHint(res.status, cfg.baseUrl, raw)
      throw new Error(detail && !isAccessDeniedHtml(detail) ? `${hint} Detalhe: ${detail}` : hint)
    }

    const hint = oauthErrorHint(lastStatus || 403, cfg.baseUrl, lastRaw)
    throw new Error(hint)
  } finally {
    client.close()
  }
}

function generateTxid(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(26))
  let out = 'erp'
  for (let i = 0; i < bytes.length; i++) {
    out += chars[bytes[i] % chars.length]
  }
  return out.slice(0, 32)
}

function money2(value: number): string {
  return Number(value).toFixed(2)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function truncate(text: string, max: number): string {
  const t = text.trim()
  return t.length <= max ? t : t.slice(0, max)
}

function extractPixCopiaECola(data: Record<string, unknown>): string | null {
  const direct = data.pixCopiaECola ?? data.pix_copia_e_cola
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const nested = data.pix as Record<string, unknown> | undefined
  const fromNested = nested?.pixCopiaECola ?? nested?.pix_copia_e_cola
  if (typeof fromNested === 'string' && fromNested.trim()) {
    return fromNested.trim()
  }
  return null
}

/** URL pública que o Sicredi chama quando o PIX é pago. */
function webhookPublicUrl(): string {
  const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')
  const secret = Deno.env.get('PIX_SICREDI_WEBHOOK_SECRET')?.trim()
  let url = `${base}/functions/v1/pix-sicredi?webhook=1`
  if (secret) url += `&secret=${encodeURIComponent(secret)}`
  return url
}

/**
 * Garante webhook na chave PIX do Sicredi para baixar sem o usuário
 * voltar à tela do app.
 */
async function ensureSicrediWebhook(cfg: SicrediConfig): Promise<void> {
  const webhookUrl = webhookPublicUrl()
  if (!webhookUrl.startsWith('https://')) return

  const token = await getAccessToken(cfg)
  const client = createMtlsClient(cfg)
  try {
    const chavePath = encodeURIComponent(cfg.chave)
    const res = await fetch(
      `${cfg.baseUrl}${cfg.apiPath}/webhook/${chavePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ webhookUrl }),
        client,
      },
    )
    if (!res.ok) {
      const raw = await res.text().catch(() => '')
      console.error(
        'ensureSicrediWebhook falhou',
        res.status,
        cfg.source,
        raw.slice(0, 300),
      )
    }
  } catch (e) {
    console.error('ensureSicrediWebhook erro', cfg.source, e)
  } finally {
    client.close()
  }
}

async function resolveConfigForCobranca(
  admin: ReturnType<typeof createClient>,
  cob: Record<string, unknown>,
): Promise<{ cfg: SicrediConfig | null; hint: string | null }> {
  let resolved = await resolveSicrediConfig(admin, {
    empresaId: cob.empresa_id as number,
    tipo: String(cob.tipo),
    atividadeId: (cob.atividade_id as number | null) ?? null,
    ramoId: (cob.ramo_id as number | null) ?? null,
    secaoId: null,
  })
  if (resolved.cfg) return resolved

  const tipo = String(cob.tipo)
  if (tipo === 'venda_evento' && cob.evento_id) {
    const { data: ev } = await admin
      .from('venda_eventos')
      .select('ramo, secao')
      .eq('evento_id', cob.evento_id)
      .maybeSingle()
    if (ev) {
      resolved = await resolveSicrediConfig(admin, {
        empresaId: cob.empresa_id as number,
        tipo: 'venda_evento',
        ramoId: (ev.ramo as number | null) ?? null,
        secaoId: (ev.secao as number | null) ?? null,
      })
    }
  } else if (tipo === 'acao_entre_amigos' && cob.acao_id) {
    const { data: acao } = await admin
      .from('acao_entre_amigos')
      .select('ramo, secao')
      .eq('acao_id', cob.acao_id)
      .maybeSingle()
    if (acao) {
      resolved = await resolveSicrediConfig(admin, {
        empresaId: cob.empresa_id as number,
        tipo: 'acao_entre_amigos',
        ramoId: (acao.ramo as number | null) ?? null,
        secaoId: (acao.secao as number | null) ?? null,
      })
    }
  }
  return resolved
}

async function reconfirmAndBaixarCobranca(
  admin: ReturnType<typeof createClient>,
  cob: Record<string, unknown>,
): Promise<{ ok: boolean; paid: boolean; reason?: string }> {
  if (cob.baixado_em) return { ok: true, paid: true }
  const resolved = await resolveConfigForCobranca(admin, cob)
  if (!resolved.cfg) {
    return { ok: false, paid: false, reason: resolved.hint ?? 'Sem config PIX' }
  }
  const remote = await getCob(resolved.cfg, String(cob.txid))
  const remoteStatus = String(remote.status ?? cob.status ?? '')
  await admin
    .from('pix_cobrancas')
    .update({
      status: remoteStatus || cob.status,
      pix_copia_e_cola:
        remote.pixCopiaECola ?? cob.pix_copia_e_cola ?? null,
      raw_status: remote,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cob.id)

  if (remoteStatus !== 'CONCLUIDA') {
    return { ok: true, paid: false, reason: remoteStatus }
  }
  await concluirEBaixar(admin, cob, remote)
  return { ok: true, paid: true }
}

/** Varre cobranças abertas e baixa as que o Sicredi já marcou como pagas. */
async function pollPendingCobrancas(
  admin: ReturnType<typeof createClient>,
): Promise<{ checked: number; paid: number; errors: number }> {
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const { data: pending, error } = await admin
    .from('pix_cobrancas')
    .select('*')
    .is('baixado_em', null)
    .neq('status', 'REMOVIDA')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(40)

  if (error) throw new Error(error.message)

  let paid = 0
  let errors = 0
  for (const cob of pending ?? []) {
    try {
      const result = await reconfirmAndBaixarCobranca(
        admin,
        cob as Record<string, unknown>,
      )
      if (result.paid) paid += 1
    } catch (e) {
      errors += 1
      console.error('poll_pending baixa', cob.id, cob.txid, e)
    }
  }
  return { checked: (pending ?? []).length, paid, errors }
}

async function createCob(
  cfg: SicrediConfig,
  input: {
    valor: number
    descricao: string
    txid: string
  },
) {
  // Garante escuta do Sicredi (não bloqueia a cobrança se falhar).
  void ensureSicrediWebhook(cfg).catch(() => undefined)

  const token = await getAccessToken(cfg)
  const client = createMtlsClient(cfg)
  try {
    const payload = {
      calendario: { expiracao: 3600 },
      valor: {
        original: money2(input.valor),
        // 0 = valor fixo (pagador não altera no app do banco)
        modalidadeAlteracao: 0,
      },
      chave: cfg.chave,
      solicitacaoPagador: truncate(input.descricao, 140),
    }

    const res = await fetch(
      `${cfg.baseUrl}${cfg.apiPath}/cob/${input.txid}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        client,
      },
    )

    let data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      throw new Error(
        String(
          data?.detail ||
            data?.mensagem ||
            data?.title ||
            `Falha ao criar cobrança PIX (${res.status}).`,
        ),
      )
    }

    // Algumas respostas do PUT vêm sem o BR Code; consulta GET.
    let pixCopiaECola = extractPixCopiaECola(data)
    if (!pixCopiaECola) {
      const got = await getCob(cfg, String(data.txid ?? input.txid))
      data = { ...data, ...got }
      pixCopiaECola = extractPixCopiaECola(got as Record<string, unknown>)
    }

    return {
      ...data,
      txid: String(data.txid ?? input.txid),
      status: String(data.status ?? 'ATIVA'),
      location:
        typeof data.location === 'string' ? data.location : null,
      pixCopiaECola,
    }
  } finally {
    client.close()
  }
}

async function getCob(cfg: SicrediConfig, txid: string) {
  const token = await getAccessToken(cfg)
  const client = createMtlsClient(cfg)
  try {
    const res = await fetch(`${cfg.baseUrl}${cfg.apiPath}/cob/${txid}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      client,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        data?.detail ||
          data?.mensagem ||
          data?.title ||
          `Falha ao consultar cobrança PIX (${res.status}).`,
      )
    }
    return data as {
      txid?: string
      status?: string
      pixCopiaECola?: string
      [key: string]: unknown
    }
  } finally {
    client.close()
  }
}

async function ensureTipoPagamentoPix(
  admin: ReturnType<typeof createClient>,
  empresaId: number,
): Promise<number> {
  const { data: existing } = await admin
    .from('tipo_pagamento')
    .select('tipopagto_id')
    .eq('empresa_id', empresaId)
    .ilike('nome', 'PIX')
    .maybeSingle()

  if (existing?.tipopagto_id) return existing.tipopagto_id as number

  const { data: created, error } = await admin
    .from('tipo_pagamento')
    .insert({
      empresa_id: empresaId,
      nome: 'PIX',
      quita: true,
      comunica_banco: true,
    })
    .select('tipopagto_id')
    .single()

  if (error || !created?.tipopagto_id) {
    throw new Error(error?.message ?? 'Não foi possível criar tipo PIX.')
  }
  return created.tipopagto_id as number
}

async function baixarMensalidades(
  admin: ReturnType<typeof createClient>,
  opts: {
    empresaId: number
    receitaIds: number[]
    tipopagtoId: number
    txid: string
  },
) {
  for (const receitaId of opts.receitaIds) {
    const { data: receita, error } = await admin
      .from('receitas')
      .select('receita_id, receita_valor, receita_saldo, receita_situacao')
      .eq('empresa_id', opts.empresaId)
      .eq('receita_id', receitaId)
      .maybeSingle()

    if (error || !receita) {
      throw new Error(error?.message ?? `Receita ${receitaId} não encontrada.`)
    }

    const saldo = Number(receita.receita_saldo ?? 0)
    if (saldo <= 0) continue

    const { error: pagError } = await admin.from('receita_pagamento').insert({
      empresa_id: opts.empresaId,
      receita_id: receitaId,
      tipopagto_id: opts.tipopagtoId,
      data_pagamento: todayISO(),
      valor: saldo,
      observacao: truncate(`PIX Sicredi txid ${opts.txid}`, 200),
    })
    if (pagError) throw new Error(pagError.message)

    const { error: updError } = await admin
      .from('receitas')
      .update({
        receita_saldo: 0,
        receita_situacao: 3,
      })
      .eq('receita_id', receitaId)
      .eq('empresa_id', opts.empresaId)

    if (updError) throw new Error(updError.message)
  }
}

async function baixarAtividade(
  admin: ReturnType<typeof createClient>,
  opts: {
    empresaId: number
    associadoId: number
    atividadeId: number
    valor: number
    tipopagtoId: number
    txid: string
    descricao: string | null
  },
) {
  const { data: existing } = await admin
    .from('atividade_pagamento')
    .select('pagamento_id')
    .eq('empresa_id', opts.empresaId)
    .eq('atividade_id', opts.atividadeId)
    .eq('associado_id', opts.associadoId)
    .maybeSingle()

  if (existing?.pagamento_id) return

  const { data: atividade } = await admin
    .from('atividades')
    .select('atividade_id, descricao, local, valor, ramo, secao')
    .eq('empresa_id', opts.empresaId)
    .eq('atividade_id', opts.atividadeId)
    .maybeSingle()

  const valor = Number(opts.valor || atividade?.valor || 0)
  let receitaId: number | null = null

  if (valor > 0) {
    const descricao = truncate(
      opts.descricao || `Atividade: ${atividade?.descricao ?? opts.atividadeId}`,
      120,
    )
    const { data: receita, error: recError } = await admin
      .from('receitas')
      .insert({
        empresa_id: opts.empresaId,
        associado_id: opts.associadoId,
        receita_origem: 'A',
        receita_descricao: descricao,
        receita_ramo: atividade?.ramo ?? null,
        receita_secao: atividade?.secao ?? null,
        atividade_id: opts.atividadeId,
        receita_emissao: todayISO(),
        receita_vencimento: todayISO(),
        receita_valor: valor,
        receita_saldo: 0,
        receita_situacao: 3,
        receita_observacao: truncate(`PIX Sicredi txid ${opts.txid}`, 200),
      })
      .select('receita_id')
      .single()

    if (recError || !receita?.receita_id) {
      throw new Error(recError?.message ?? 'Falha ao criar receita da atividade.')
    }
    receitaId = receita.receita_id as number

    const { error: pagError } = await admin.from('receita_pagamento').insert({
      empresa_id: opts.empresaId,
      receita_id: receitaId,
      tipopagto_id: opts.tipopagtoId,
      data_pagamento: todayISO(),
      valor,
      observacao: truncate(`Recebimento PIX Sicredi — atividade`, 200),
    })
    if (pagError) {
      await admin.from('receitas').delete().eq('receita_id', receitaId)
      throw new Error(pagError.message)
    }
  }

  const { error: ativError } = await admin.from('atividade_pagamento').insert({
    empresa_id: opts.empresaId,
    atividade_id: opts.atividadeId,
    associado_id: opts.associadoId,
    valor,
    receita_id: receitaId,
  })

  if (ativError) {
    if (receitaId != null) {
      await admin.from('receitas').delete().eq('receita_id', receitaId)
    }
    throw new Error(ativError.message)
  }
}

type LojaItemCob = {
  produto_id: number
  nome: string
  unitario: number
  quantidade: number
}

function parseLojaItens(raw: unknown): LojaItemCob[] {
  let list: unknown[] = []
  if (Array.isArray(raw)) {
    list = raw
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    if (Array.isArray(obj.itens)) list = obj.itens
  }
  const out: LojaItemCob[] = []
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const produto_id = Number(r.produto_id)
    const unitario = Number(r.unitario)
    const quantidade = Number(r.quantidade)
    const nome = String(r.nome ?? '').trim() || `Produto ${produto_id}`
    if (
      !Number.isFinite(produto_id) ||
      produto_id <= 0 ||
      !Number.isFinite(quantidade) ||
      quantidade <= 0 ||
      !Number.isFinite(unitario) ||
      unitario < 0
    ) {
      continue
    }
    out.push({ produto_id, nome, unitario, quantidade })
  }
  return out
}

function parseLojaMeta(raw: unknown): {
  canal: 'online' | 'local'
  compradorNome: string | null
  compradorTelefone: string | null
} {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>
    const canal =
      String(obj.canal ?? '').toLowerCase() === 'online' ? 'online' : 'local'
    return {
      canal,
      compradorNome: String(obj.comprador_nome ?? '').trim() || null,
      compradorTelefone: String(obj.comprador_telefone ?? '').trim() || null,
    }
  }
  return { canal: 'local', compradorNome: null, compradorTelefone: null }
}

async function baixarLoja(
  admin: ReturnType<typeof createClient>,
  opts: {
    empresaId: number
    valor: number
    tipopagtoId: number
    tipopagtoNome?: string | null
    txid: string
    descricao: string | null
    observacao: string | null
    itens: LojaItemCob[]
    canal?: 'online' | 'local'
    compradorNome?: string | null
    compradorTelefone?: string | null
    associadoId?: number | null
    criadoPor?: string | null
  },
) {
  if (!opts.itens.length) {
    throw new Error('Cobrança da loja sem itens.')
  }

  const total = Number(
    opts.itens
      .reduce((acc, item) => acc + item.unitario * item.quantidade, 0)
      .toFixed(2),
  )
  const valor = Number(opts.valor || total)
  if (!(valor > 0)) throw new Error('Valor da venda inválido.')

  const canal =
    opts.canal === 'online' ||
    /loja online/i.test(String(opts.descricao ?? ''))
      ? 'online'
      : 'local'
  const canalLabel = canal === 'online' ? 'loja online' : 'loja'

  const nomes = opts.itens.map((i) => i.nome).join(', ')
  const descricao = truncate(
    opts.descricao || `Venda ${canalLabel} — ${nomes}`,
    120,
  )
  const tipoNome = (opts.tipopagtoNome ?? '').trim()
  const obsUser = (opts.observacao ?? '').trim()
  const observacaoReceita = truncate(
    [
      `Venda ${canalLabel} · ${opts.itens.length} item(ns)`,
      'Pagamento: PIX Sicredi',
      tipoNome ? `Tipo: ${tipoNome}` : null,
      `txid ${opts.txid}`,
      obsUser || null,
    ]
      .filter(Boolean)
      .join(' · '),
    200,
  )

  const { data: receita, error: recError } = await admin
    .from('receitas')
    .insert({
      empresa_id: opts.empresaId,
      receita_origem: 'A',
      receita_descricao: descricao,
      receita_emissao: todayISO(),
      receita_vencimento: todayISO(),
      receita_valor: valor,
      receita_saldo: 0,
      receita_situacao: 3,
      receita_observacao: observacaoReceita,
      receita_ramo: null,
      receita_secao: null,
    })
    .select('receita_id')
    .single()

  if (recError || !receita?.receita_id) {
    throw new Error(recError?.message ?? 'Falha ao criar receita da loja.')
  }

  const receitaId = receita.receita_id as number

  const { error: pagError } = await admin.from('receita_pagamento').insert({
    empresa_id: opts.empresaId,
    receita_id: receitaId,
    tipopagto_id: opts.tipopagtoId,
    data_pagamento: todayISO(),
    valor,
    observacao: truncate(
      `Recebimento PIX Sicredi — ${canalLabel} txid ${opts.txid}`,
      200,
    ),
  })

  if (pagError) {
    await admin.from('receitas').delete().eq('receita_id', receitaId)
    throw new Error(pagError.message)
  }

  const { data: maxRow } = await admin
    .from('movimento_estoque')
    .select('movimentoest_numero')
    .eq('empresa_id', opts.empresaId)
    .order('movimentoest_numero', { ascending: false })
    .limit(1)
    .maybeSingle()

  let proximoNumero = Number(maxRow?.movimentoest_numero ?? 0) + 1
  const stockPayload = opts.itens.map((item) => {
    const row = {
      empresa_id: opts.empresaId,
      movimentoest_numero: proximoNumero,
      movimentoest_operacao: 10,
      movimentoest_emissao: todayISO(),
      movimentoest_sinal: '-',
      movimentoest_produto: item.produto_id,
      movimentoest_quantidade: item.quantidade,
      movimentoest_unitario: item.unitario,
      movimentoest_total: Number((item.quantidade * item.unitario).toFixed(2)),
      movimentoest_origem: 'loja',
      movimentoest_obs: truncate(
        [`Receita #${receitaId}`, `PIX ${opts.txid}`, obsUser || null]
          .filter(Boolean)
          .join(' · '),
        200,
      ),
    }
    proximoNumero += 1
    return row
  })

  const { error: stockError } = await admin
    .from('movimento_estoque')
    .insert(stockPayload)

  if (stockError) {
    await admin.from('receitas').delete().eq('receita_id', receitaId)
    throw new Error(stockError.message)
  }

  if (canal === 'online') {
    const { data: pedido, error: pedError } = await admin
      .from('loja_pedido')
      .insert({
        empresa_id: opts.empresaId,
        receita_id: receitaId,
        canal: 'online',
        comprador_nome: opts.compradorNome ?? null,
        comprador_telefone: opts.compradorTelefone ?? null,
        associado_id: opts.associadoId ?? null,
        total: valor,
        observacao: obsUser || null,
        criado_por: opts.criadoPor ?? null,
      })
      .select('pedido_id')
      .single()

    if (!pedError && pedido?.pedido_id) {
      await admin.from('loja_pedido_item').insert(
        opts.itens.map((item) => ({
          pedido_id: pedido.pedido_id,
          empresa_id: opts.empresaId,
          produto_id: item.produto_id,
          nome: item.nome,
          quantidade: item.quantidade,
          unitario: item.unitario,
          total: Number((item.quantidade * item.unitario).toFixed(2)),
        })),
      )
    }
  }
}

async function concluirEBaixar(
  admin: ReturnType<typeof createClient>,
  cob: Record<string, unknown>,
  statusPayload: Record<string, unknown> | null,
) {
  if (cob.baixado_em) {
    return { paid: true, baixado: true }
  }

  const tipopagtoIdCob = Number(cob.tipopagto_id ?? 0)
  const tipopagtoId =
    Number.isFinite(tipopagtoIdCob) && tipopagtoIdCob > 0
      ? tipopagtoIdCob
      : await ensureTipoPagamentoPix(admin, cob.empresa_id as number)
  const tipo = String(cob.tipo)
  const receitaIds = (cob.receita_ids as number[]) ?? []

  if (tipo === 'mensalidade' || tipo === 'mensalidade_lote') {
    await baixarMensalidades(admin, {
      empresaId: cob.empresa_id as number,
      receitaIds,
      tipopagtoId,
      txid: String(cob.txid),
    })
  } else if (tipo === 'atividade') {
    if (!cob.associado_id || !cob.atividade_id) {
      throw new Error('Cobrança de atividade incompleta.')
    }
    await baixarAtividade(admin, {
      empresaId: cob.empresa_id as number,
      associadoId: cob.associado_id as number,
      atividadeId: cob.atividade_id as number,
      valor: Number(cob.valor),
      tipopagtoId,
      txid: String(cob.txid),
      descricao: (cob.descricao as string | null) ?? null,
    })
  } else if (tipo === 'acao_entre_amigos') {
    await baixarAcaoEntreAmigos(admin, cob)
  } else if (tipo === 'venda_evento') {
    await baixarVendaEvento(admin, cob)
  } else if (tipo === 'loja') {
    const itens = parseLojaItens(cob.loja_itens)
    const meta = parseLojaMeta(cob.loja_itens)
    let tipopagtoNome: string | null = null
    if (tipopagtoId) {
      const { data: tp } = await admin
        .from('tipo_pagamento')
        .select('nome')
        .eq('tipopagto_id', tipopagtoId)
        .maybeSingle()
      tipopagtoNome = (tp?.nome as string | null) ?? null
    }
    await baixarLoja(admin, {
      empresaId: cob.empresa_id as number,
      valor: Number(cob.valor),
      tipopagtoId,
      tipopagtoNome,
      txid: String(cob.txid),
      descricao: (cob.descricao as string | null) ?? null,
      observacao: null,
      itens,
      canal: meta.canal,
      compradorNome: meta.compradorNome,
      compradorTelefone: meta.compradorTelefone,
      associadoId: (cob.associado_id as number | null) ?? null,
      criadoPor: (cob.created_by as string | null) ?? null,
    })
  }

  const { error } = await admin
    .from('pix_cobrancas')
    .update({
      status: 'CONCLUIDA',
      paid_at: new Date().toISOString(),
      baixado_em: new Date().toISOString(),
      raw_status: statusPayload,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', cob.id)

  if (error) throw new Error(error.message)
  return { paid: true, baixado: true }
}

async function fetchConvitesVendaEventoByCobranca(
  admin: ReturnType<typeof createClient>,
  cobrancaId: number,
  tipo: string,
): Promise<
  {
    numero: number
    nome: string
    tipo_label: string | null
    valor_unitario: number | null
  }[]
> {
  if (tipo !== 'venda_evento') return []
  const { data: compras } = await admin
    .from('venda_evento_compra')
    .select('compra_id')
    .eq('pix_cobranca_id', cobrancaId)
    .order('compra_id', { ascending: true })
  const compraIds = (compras ?? [])
    .map((c) => Number(c.compra_id))
    .filter((id) => Number.isFinite(id) && id > 0)
  if (compraIds.length === 0) return []
  const { data } = await admin
    .from('venda_evento_convite')
    .select('numero, nome, tipo_label, valor_unitario')
    .in('compra_id', compraIds)
    .eq('ativo', true)
    .order('numero')
  return (data ?? []).map((r) => ({
    numero: Number(r.numero),
    nome: String(r.nome ?? ''),
    tipo_label: r.tipo_label != null ? String(r.tipo_label) : null,
    valor_unitario:
      r.valor_unitario != null && Number.isFinite(Number(r.valor_unitario))
        ? Number(r.valor_unitario)
        : null,
  }))
}

async function baixarVendaEvento(
  admin: ReturnType<typeof createClient>,
  cob: Record<string, unknown>,
) {
  const empresaId = cob.empresa_id as number
  const eventoId = cob.evento_id as number
  const cobrancaId = cob.id as number
  const telefone = String(cob.comprador_telefone ?? '').trim()
  const nomesRaw = Array.isArray(cob.nomes) ? (cob.nomes as unknown[]) : []
  const restricoesRaw = Array.isArray(cob.restricoes_alimentares)
    ? (cob.restricoes_alimentares as unknown[])
    : []
  const pares = nomesRaw
    .map((n, i) => {
      const nome = String(n ?? '').trim().slice(0, 200)
      const restricao = String(restricoesRaw[i] ?? '')
        .trim()
        .slice(0, 120)
      return { nome, restricao: restricao || null }
    })
    .filter((p) => p.nome)
  const nomes = pares.map((p) => p.nome)
  const restricoes = pares.map((p) => p.restricao)
  const valorTotal = Number(cob.valor)

  if (!eventoId || nomes.length === 0) {
    throw new Error('Cobrança de evento incompleta.')
  }

  const { data: comprasExistentes } = await admin
    .from('venda_evento_compra')
    .select('compra_id')
    .eq('pix_cobranca_id', cobrancaId)
    .order('compra_id', { ascending: true })

  const compraIds = (comprasExistentes ?? [])
    .map((c) => Number(c.compra_id))
    .filter((id) => Number.isFinite(id) && id > 0)

  if (compraIds.length > 0) {
    const { count: convitesExistentes } = await admin
      .from('venda_evento_convite')
      .select('convite_id', { count: 'exact', head: true })
      .in('compra_id', compraIds)
    if ((convitesExistentes ?? 0) > 0) return
  }

  const resolvedTipos = await resolveEventoTiposLinhas(
    admin,
    eventoId,
    nomes.length,
    cob.tipo_ids,
  )
  if (!resolvedTipos.ok) {
    throw new Error(resolvedTipos.error)
  }

  const { data: evento, error: eventoError } = await admin
    .from('venda_eventos')
    .select('evento_id, empresa_id, numero_inicial, numero_final')
    .eq('evento_id', eventoId)
    .eq('empresa_id', empresaId)
    .maybeSingle()

  if (eventoError || !evento) {
    throw new Error(eventoError?.message ?? 'Evento não encontrado.')
  }

  const { data: ocupados } = await admin
    .from('venda_evento_convite')
    .select('numero')
    .eq('evento_id', eventoId)
    .eq('ativo', true)

  const ocupadosSet = new Set(
    (ocupados ?? []).map((r) => Number(r.numero)),
  )
  const livres: number[] = []
  for (
    let n = Number(evento.numero_inicial);
    n <= Number(evento.numero_final);
    n += 1
  ) {
    if (!ocupadosSet.has(n)) {
      livres.push(n)
      if (livres.length >= nomes.length) break
    }
  }

  if (livres.length < nomes.length) {
    throw new Error(
      `Só há ${livres.length} convite(s) disponível(is) após o pagamento.`,
    )
  }

  let compraId = compraIds[0] ?? null
  if (compraId == null) {
    const { data: compra, error: compraError } = await admin
      .from('venda_evento_compra')
      .insert({
        empresa_id: empresaId,
        evento_id: eventoId,
        quantidade: nomes.length,
        comprador_telefone: telefone ? telefone.slice(0, 40) : null,
        valor: Number.isFinite(valorTotal)
          ? valorTotal
          : resolvedTipos.valorTotal,
        forma_pagamento: 'pix',
        vendido_por: null,
        pix_cobranca_id: cobrancaId,
      })
      .select('compra_id')
      .single()

    if (compraError) {
      // Corrida: outra requisição já criou a compra desta cobrança.
      const { data: raced } = await admin
        .from('venda_evento_compra')
        .select('compra_id')
        .eq('pix_cobranca_id', cobrancaId)
        .order('compra_id', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (!raced?.compra_id) {
        throw new Error(compraError.message ?? 'Falha ao gravar compra.')
      }
      compraId = Number(raced.compra_id)
      const { count: convitesRaced } = await admin
        .from('venda_evento_convite')
        .select('convite_id', { count: 'exact', head: true })
        .eq('compra_id', compraId)
      if ((convitesRaced ?? 0) > 0) return
    } else if (!compra) {
      throw new Error('Falha ao gravar compra.')
    } else {
      compraId = Number(compra.compra_id)
    }
  }

  const rows = nomes.map((nome, i) => {
    const linha = resolvedTipos.linhas[i]
    const tipoId = linha?.tipo_id && linha.tipo_id > 0 ? linha.tipo_id : null
    return {
      empresa_id: empresaId,
      evento_id: eventoId,
      compra_id: compraId,
      numero: livres[i],
      nome,
      tipo_id: tipoId,
      valor_unitario: linha?.valor ?? 0,
      tipo_label: linha?.label ?? null,
      restricao_alimentar: restricoes[i] ?? null,
      ativo: true,
    }
  })

  const { error: conviteError } = await admin
    .from('venda_evento_convite')
    .insert(rows)

  if (conviteError) {
    // Outra corrida pode ter gravado os convites no mesmo instante.
    const { count: afterRace } = await admin
      .from('venda_evento_convite')
      .select('convite_id', { count: 'exact', head: true })
      .eq('compra_id', compraId)
    if ((afterRace ?? 0) > 0) return
    throw new Error(conviteError.message)
  }
}

async function baixarAcaoEntreAmigos(
  admin: ReturnType<typeof createClient>,
  cob: Record<string, unknown>,
) {
  const empresaId = cob.empresa_id as number
  const acaoId = cob.acao_id as number
  const associadoId = cob.associado_id as number | null
  const numeros = Array.isArray(cob.numeros)
    ? (cob.numeros as unknown[]).map(Number).filter((n) => Number.isFinite(n))
    : []
  const compradorNome = String(cob.comprador_nome ?? '').trim()
  const compradorTelefone = String(cob.comprador_telefone ?? '').trim()
  const valorTotal = Number(cob.valor)
  const cobrancaId = cob.id as number

  if (!acaoId || numeros.length === 0 || !compradorNome || !compradorTelefone) {
    throw new Error('Cobrança de ação entre amigos incompleta.')
  }

  const valorUnitario = Math.round((valorTotal / numeros.length) * 100) / 100

  const rows = numeros.map((numero) => ({
    empresa_id: empresaId,
    acao_id: acaoId,
    numero,
    comprador_nome: compradorNome.slice(0, 200),
    comprador_telefone: compradorTelefone.slice(0, 40),
    valor: valorUnitario,
    forma_pagamento: 'pix',
    associado_vendedor_id: associadoId,
    vendido_por: null,
    pix_cobranca_id: cobrancaId,
  }))

  const { error } = await admin.from('acao_entre_amigos_venda').insert(rows)
  if (error) {
    if (
      error.message.includes('duplicate') ||
      error.message.includes('unique')
    ) {
      // Idempotência: se já gravou as vendas desta cobrança, segue.
      const { count } = await admin
        .from('acao_entre_amigos_venda')
        .select('venda_id', { count: 'exact', head: true })
        .eq('pix_cobranca_id', cobrancaId)
      if ((count ?? 0) > 0) return
    }
    throw new Error(error.message)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const admin = createClient(supabaseUrl, serviceKey)

    // Webhook público do Sicredi (sem JWT do app)
    const url = new URL(req.url)
    if (req.method === 'POST' && url.searchParams.get('webhook') === '1') {
      const expectedSecret = Deno.env.get('PIX_SICREDI_WEBHOOK_SECRET')?.trim()
      if (expectedSecret) {
        const got =
          req.headers.get('x-webhook-secret')?.trim() ||
          req.headers.get('x-pix-webhook-secret')?.trim() ||
          url.searchParams.get('secret')?.trim() ||
          ''
        if (got !== expectedSecret) {
          return json({ error: 'Webhook não autorizado.' }, 401)
        }
      }

      const payload = await req.json().catch(() => ({}))
      const pixList = Array.isArray(payload?.pix) ? payload.pix : []
      // Fallback: alguns PSP enviam txid no root
      const txids = new Set<string>()
      for (const item of pixList) {
        if (item?.txid) txids.add(String(item.txid))
      }
      if (payload?.txid) txids.add(String(payload.txid))

      for (const txid of txids) {
        const { data: cob } = await admin
          .from('pix_cobrancas')
          .select('*')
          .eq('txid', txid)
          .maybeSingle()
        if (!cob || cob.baixado_em) continue

        try {
          await reconfirmAndBaixarCobranca(
            admin,
            cob as Record<string, unknown>,
          )
        } catch (e) {
          console.error('pix webhook reconfirm/baixa', txid, e)
        }
      }

      return json({ ok: true })
    }

    // Endpoints públicos (link da rifa) — sem JWT do app
    if (req.method === 'POST') {
      const peek = (await req
        .clone()
        .json()
        .catch(() => null)) as PixRequestBody | null

      if (peek?.action === 'poll_pending') {
        try {
          const result = await pollPendingCobrancas(admin)
          return json({ ok: true, ...result })
        } catch (e) {
          console.error('poll_pending', e)
          return json(
            {
              error:
                e instanceof Error
                  ? e.message
                  : 'Falha ao consultar cobranças pendentes.',
            },
            500,
          )
        }
      }

      if (peek?.action === 'create_public') {
        const body = peek as CreatePublicBody
        const token = String(body.link_token ?? '').trim()
        const nome = String(body.comprador_nome ?? '').trim()
        const fone = String(body.comprador_telefone ?? '').trim()
        const numerosRaw = Array.isArray(body.numeros) ? body.numeros : []
        const numeros = [
          ...new Set(
            numerosRaw.map(Number).filter((n) => Number.isFinite(n) && n >= 0),
          ),
        ].sort((a, b) => a - b)

        if (!token) return json({ error: 'Link inválido.' }, 400)
        if (!nome) return json({ error: 'Informe o nome do comprador.' }, 400)
        if (!fone) return json({ error: 'Informe o telefone do comprador.' }, 400)
        if (numeros.length === 0) {
          return json({ error: 'Selecione ao menos um número.' }, 400)
        }

        const { data: faixa, error: faixaError } = await admin
          .from('acao_entre_amigos_faixa')
          .select(
            'faixa_id, empresa_id, acao_id, associado_id, numero_inicial, numero_final, link_token',
          )
          .eq('link_token', token)
          .maybeSingle()

        if (faixaError || !faixa) {
          return json({ error: 'Link inválido ou expirado.' }, 404)
        }

        const { data: acao, error: acaoError } = await admin
          .from('acao_entre_amigos')
          .select(
            'acao_id, empresa_id, nome, valor_numero, ramo, secao, encerrado_em, data_limite_venda, numero_sorteado',
          )
          .eq('acao_id', faixa.acao_id)
          .eq('empresa_id', faixa.empresa_id)
          .maybeSingle()

        if (acaoError || !acao) {
          return json({ error: 'Ação não encontrada.' }, 404)
        }
        if (acao.encerrado_em || acao.numero_sorteado != null) {
          return json(
            { error: 'Esta ação entre amigos está encerrada.' },
            409,
          )
        }
        if (acao.data_limite_venda) {
          const hoje = new Date()
          const y = hoje.getFullYear()
          const m = String(hoje.getMonth() + 1).padStart(2, '0')
          const d = String(hoje.getDate()).padStart(2, '0')
          const hojeIso = `${y}-${m}-${d}`
          if (String(acao.data_limite_venda).slice(0, 10) < hojeIso) {
            return json(
              { error: 'O prazo de vendas desta ação já encerrou.' },
              409,
            )
          }
        }

        const ini = Number(faixa.numero_inicial)
        const fim = Number(faixa.numero_final)
        if (numeros.some((n) => n < ini || n > fim)) {
          return json(
            { error: 'Há números fora da faixa deste vendedor.' },
            400,
          )
        }

        const { data: jaVendidos } = await admin
          .from('acao_entre_amigos_venda')
          .select('numero')
          .eq('acao_id', faixa.acao_id)
          .in('numero', numeros)

        if ((jaVendidos ?? []).length > 0) {
          const list = (jaVendidos ?? [])
            .map((r) => r.numero)
            .sort((a, b) => Number(a) - Number(b))
            .join(', ')
          return json(
            { error: `Número(s) já vendido(s): ${list}` },
            409,
          )
        }

        const valorUnit = Number(acao.valor_numero ?? 0)
        if (!Number.isFinite(valorUnit) || valorUnit <= 0) {
          return json(
            { error: 'Valor do número não configurado nesta ação.' },
            400,
          )
        }
        const valor = Math.round(valorUnit * numeros.length * 100) / 100
        let ramoId = (acao.ramo as number | null) ?? null
        const secaoId = (acao.secao as number | null) ?? null
        if (ramoId == null && secaoId != null) {
          const { data: secaoRow } = await admin
            .from('secao')
            .select('ramo')
            .eq('secao_id', secaoId)
            .maybeSingle()
          ramoId = (secaoRow?.ramo as number | null) ?? null
        }

        const resolved = await resolveSicrediConfig(admin, {
          empresaId: faixa.empresa_id as number,
          tipo: 'acao_entre_amigos',
          ramoId,
          secaoId,
        })
        if (!resolved.cfg) {
          return json(
            {
              error:
                resolved.hint ||
                'PIX Sicredi não configurado para a seção/grupo desta ação.',
              configured: false,
            },
            503,
          )
        }

        const cfg = resolved.cfg
        const txid = generateTxid()
        const descricao =
          body.descricao?.trim() ||
          `${acao.nome} · nº ${numeros.join(', ')}`

        const cobRes = await createCob(cfg, { valor, descricao, txid })
        const status = String(cobRes.status ?? 'ATIVA')

        const { data: row, error: insertError } = await admin
          .from('pix_cobrancas')
          .insert({
            empresa_id: faixa.empresa_id,
            associado_id: faixa.associado_id,
            created_by: null,
            tipo: 'acao_entre_amigos',
            receita_ids: [],
            atividade_id: null,
            ramo_id: ramoId,
            acao_id: faixa.acao_id,
            faixa_id: faixa.faixa_id,
            link_token: token,
            numeros,
            comprador_nome: nome.slice(0, 200),
            comprador_telefone: fone.slice(0, 40),
            valor,
            txid: cobRes.txid ?? txid,
            status,
            pix_copia_e_cola: cobRes.pixCopiaECola ?? null,
            location: cobRes.location ?? null,
            descricao,
            raw_create: cobRes,
          })
          .select(
            'id, txid, status, valor, pix_copia_e_cola, location, descricao, created_at',
          )
          .single()

        if (insertError || !row) {
          return json(
            { error: insertError?.message ?? 'Falha ao salvar cobrança.' },
            400,
          )
        }

        return json({ ok: true, configured: true, cobranca: row })
      }

      if (peek?.action === 'create_public_evento') {
        const body = peek as CreatePublicEventoBody
        const token = String(body.link_token ?? '').trim()
        const fone = String(body.comprador_telefone ?? '').trim()
        const nomesRaw = Array.isArray(body.nomes) ? body.nomes : []
        const restricoesRaw = Array.isArray(body.restricoes_alimentares)
          ? body.restricoes_alimentares
          : []
        const pares = nomesRaw
          .map((n, i) => {
            const nome = String(n ?? '').trim().slice(0, 200)
            const restricao = String(restricoesRaw[i] ?? '')
              .trim()
              .slice(0, 120)
            return { nome, restricao }
          })
          .filter((p) => p.nome)
        const nomesOrdered = pares.map((p) => p.nome)
        const restricoesOrdered = pares.map((p) => p.restricao)

        if (!token) return json({ error: 'Link inválido.' }, 400)
        if (!fone) {
          return json({ error: 'Informe o telefone do comprador.' }, 400)
        }
        if (nomesOrdered.length === 0) {
          return json({ error: 'Informe ao menos um nome.' }, 400)
        }

        const { data: evento, error: eventoError } = await admin
          .from('venda_eventos')
          .select(
            'evento_id, empresa_id, nome, valor_convite, numero_inicial, numero_final, link_token, ramo, secao, encerrado_em',
          )
          .eq('link_token', token)
          .maybeSingle()

        if (eventoError || !evento) {
          return json({ error: 'Link inválido ou expirado.' }, 404)
        }
        if (evento.encerrado_em) {
          return json({ error: 'Este evento está encerrado.' }, 409)
        }

        const total =
          Number(evento.numero_final) - Number(evento.numero_inicial) + 1
        const { count: vendidos } = await admin
          .from('venda_evento_convite')
          .select('convite_id', { count: 'exact', head: true })
          .eq('evento_id', evento.evento_id)
          .eq('ativo', true)
        const disponiveis = Math.max(0, total - (vendidos ?? 0))

        if (nomesOrdered.length > disponiveis) {
          return json(
            {
              error: `Só há ${disponiveis} convite(s) disponível(is).`,
            },
            409,
          )
        }

        const resolvedTipos = await resolveEventoTiposLinhas(
          admin,
          Number(evento.evento_id),
          nomesOrdered.length,
          body.tipo_ids,
        )
        if (!resolvedTipos.ok) {
          return json({ error: resolvedTipos.error }, 400)
        }
        const valor = resolvedTipos.valorTotal
        if (!Number.isFinite(valor) || valor <= 0) {
          return json(
            {
              error:
                'Valor total inválido. Convites isentos (R$ 0) devem ser registrados pela organização.',
            },
            400,
          )
        }

        // Preferência: PIX da seção → ramo → grupo.
        let ramoId = (evento.ramo as number | null) ?? null
        const secaoId = (evento.secao as number | null) ?? null
        if (ramoId == null && secaoId != null) {
          const { data: secaoRow } = await admin
            .from('secao')
            .select('ramo')
            .eq('empresa_id', evento.empresa_id)
            .eq('secao_id', secaoId)
            .maybeSingle()
          ramoId = (secaoRow?.ramo as number | null) ?? null
        }

        const resolved = await resolveSicrediConfig(admin, {
          empresaId: evento.empresa_id as number,
          tipo: 'venda_evento',
          ramoId,
          secaoId,
        })
        if (!resolved.cfg) {
          return json(
            {
              error:
                resolved.hint ||
                (secaoId != null || ramoId != null
                  ? 'PIX Sicredi não configurado para o ramo/seção deste evento.'
                  : 'PIX Sicredi não configurado para este grupo.'),
              configured: false,
            },
            503,
          )
        }

        const cfg = resolved.cfg
        const txid = generateTxid()
        const descricao =
          body.descricao?.trim() ||
          `${evento.nome} · ${nomesOrdered.length} convite(s)`

        const cobRes = await createCob(cfg, { valor, descricao, txid })
        const status = String(cobRes.status ?? 'ATIVA')

        const { data: row, error: insertError } = await admin
          .from('pix_cobrancas')
          .insert({
            empresa_id: evento.empresa_id,
            associado_id: null,
            created_by: null,
            tipo: 'venda_evento',
            receita_ids: [],
            atividade_id: null,
            ramo_id: ramoId,
            evento_id: evento.evento_id,
            link_token: token,
            nomes: nomesOrdered,
            tipo_ids: resolvedTipos.tipoIds,
            restricoes_alimentares: restricoesOrdered,
            comprador_telefone: fone.slice(0, 40),
            comprador_nome: nomesOrdered[0] ?? null,
            valor,
            txid: cobRes.txid ?? txid,
            status,
            pix_copia_e_cola: cobRes.pixCopiaECola ?? null,
            location: cobRes.location ?? null,
            descricao,
            raw_create: cobRes,
          })
          .select(
            'id, txid, status, valor, pix_copia_e_cola, location, descricao, created_at',
          )
          .single()

        if (insertError || !row) {
          return json(
            { error: insertError?.message ?? 'Falha ao salvar cobrança.' },
            400,
          )
        }

        return json({ ok: true, configured: true, cobranca: row })
      }

      if (peek?.action === 'status_public') {
        const body = peek as StatusPublicBody
        const cobrancaId = Number(body.cobranca_id)
        const token = String(body.link_token ?? '').trim()
        if (!cobrancaId || !token) {
          return json({ error: 'Cobrança inválida.' }, 400)
        }

        const { data: cob, error: cobError } = await admin
          .from('pix_cobrancas')
          .select('*')
          .eq('id', cobrancaId)
          .in('tipo', ['acao_entre_amigos', 'venda_evento'])
          .eq('link_token', token)
          .maybeSingle()

        if (cobError || !cob) {
          return json(
            { error: cobError?.message ?? 'Cobrança não encontrada.' },
            404,
          )
        }

        if (cob.baixado_em || cob.status === 'CONCLUIDA') {
          const convites = await fetchConvitesVendaEventoByCobranca(
            admin,
            Number(cob.id),
            String(cob.tipo),
          )
          return json({
            ok: true,
            paid: true,
            baixado: true,
            convites,
            cobranca: {
              id: cob.id,
              txid: cob.txid,
              status: cob.status,
              valor: cob.valor,
              pix_copia_e_cola: cob.pix_copia_e_cola,
            },
          })
        }

        const resolved = await resolveConfigForCobranca(
          admin,
          cob as Record<string, unknown>,
        )
        if (!resolved.cfg) {
          return json(
            {
              error:
                resolved.hint ||
                'Credenciais PIX Sicredi não encontradas para consultar esta cobrança.',
              configured: false,
            },
            503,
          )
        }

        const remote = await getCob(resolved.cfg, String(cob.txid))
        const remoteStatus = String(remote.status ?? cob.status)

        await admin
          .from('pix_cobrancas')
          .update({
            status: remoteStatus,
            pix_copia_e_cola:
              remote.pixCopiaECola ?? cob.pix_copia_e_cola ?? null,
            raw_status: remote,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cob.id)

        if (remoteStatus === 'CONCLUIDA') {
          const result = await concluirEBaixar(
            admin,
            cob as Record<string, unknown>,
            remote,
          )
          const convites = await fetchConvitesVendaEventoByCobranca(
            admin,
            Number(cob.id),
            String(cob.tipo),
          )
          return json({
            ok: true,
            ...result,
            convites,
            cobranca: {
              id: cob.id,
              txid: cob.txid,
              status: 'CONCLUIDA',
              valor: cob.valor,
              pix_copia_e_cola: remote.pixCopiaECola ?? cob.pix_copia_e_cola,
            },
          })
        }

        return json({
          ok: true,
          paid: false,
          baixado: false,
          cobranca: {
            id: cob.id,
            txid: cob.txid,
            status: remoteStatus,
            valor: cob.valor,
            pix_copia_e_cola: remote.pixCopiaECola ?? cob.pix_copia_e_cola,
          },
        })
      }
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser()
    if (userError || !user) return json({ error: 'Sessão inválida.' }, 401)

    const body = (await req.json()) as PixRequestBody

    const { data: profile } = await admin
      .from('profiles')
      .select('id, empresa_id, ativo, registro')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || profile.ativo === false) {
      return json({ error: 'Perfil inválido.' }, 403)
    }

    if (body.action === 'config') {
      const empresaId = Number(body.empresa_id || profile.empresa_id)
      if (!empresaId || profile.empresa_id !== empresaId) {
        return json({
          configured: false,
          provider: 'sicredi',
          message: 'Usuário sem grupo para PIX Sicredi.',
        })
      }

      const tipo = body.tipo || 'mensalidade'
      const resolved = await resolveSicrediConfig(admin, {
        empresaId,
        tipo,
        atividadeId: body.atividade_id ?? null,
      })

      return json({
        configured: !!resolved.cfg,
        provider: 'sicredi',
        source: resolved.cfg?.source ?? null,
        message: resolved.cfg
          ? `PIX Sicredi configurado (${resolved.cfg.source}).`
          : resolved.hint ||
            'Cadastre uma conta bancária com PIX ativo em Cadastrar banco.',
      })
    }

    if (body.action === 'create') {
      const empresaId = Number(body.empresa_id)
      if (!empresaId || profile.empresa_id !== empresaId) {
        return json({ error: 'Grupo inválido para esta cobrança.' }, 403)
      }

      const valor = Number(body.valor)
      if (!Number.isFinite(valor) || valor <= 0) {
        return json({ error: 'Valor inválido.' }, 400)
      }

      const tipo = body.tipo
      const receitaIds = Array.isArray(body.receita_ids)
        ? body.receita_ids.map(Number).filter((n) => n > 0)
        : []
      const atividadeId = body.atividade_id ? Number(body.atividade_id) : null
      const associadoId = body.associado_id ? Number(body.associado_id) : null

      if (
        (tipo === 'mensalidade' || tipo === 'mensalidade_lote') &&
        receitaIds.length === 0
      ) {
        return json({ error: 'Informe as mensalidades a pagar.' }, 400)
      }
      if (tipo === 'atividade' && (!atividadeId || !associadoId)) {
        return json({ error: 'Informe atividade e associado.' }, 400)
      }

      const lojaItens =
        tipo === 'loja' ? parseLojaItens(body.loja_itens) : []
      if (tipo === 'loja' && lojaItens.length === 0) {
        return json({ error: 'Informe os itens da venda da loja.' }, 400)
      }
      const lojaMeta = tipo === 'loja' ? parseLojaMeta(body.loja_itens) : null
      const lojaPayload =
        tipo === 'loja'
          ? {
              canal: lojaMeta?.canal ?? 'local',
              comprador_nome: lojaMeta?.compradorNome ?? null,
              comprador_telefone: lojaMeta?.compradorTelefone ?? null,
              itens: lojaItens,
            }
          : null
      const tipopagtoIdBody = body.tipopagto_id
        ? Number(body.tipopagto_id)
        : null

      let ramoId: number | null = null
      let secaoId: number | null = null
      if (tipo === 'atividade' && atividadeId) {
        const { data: ativ } = await admin
          .from('atividades')
          .select('ramo, secao')
          .eq('empresa_id', empresaId)
          .eq('atividade_id', atividadeId)
          .maybeSingle()
        ramoId = (ativ?.ramo as number | null) ?? null
        secaoId = (ativ?.secao as number | null) ?? null
      }

      const resolved = await resolveSicrediConfig(admin, {
        empresaId,
        tipo,
        atividadeId,
        ramoId,
        secaoId,
      })

      if (!resolved.cfg) {
        return json(
          {
            error:
              resolved.hint ||
              'PIX Sicredi não configurado. Cadastre uma conta bancária com PIX ativo em Cadastrar banco.',
            configured: false,
          },
          503,
        )
      }

      const cfg = resolved.cfg
      const txid = generateTxid()
      const descricao =
        body.descricao?.trim() ||
        (tipo === 'atividade'
          ? 'Pagamento de atividade'
          : tipo === 'loja'
            ? 'Venda loja'
            : 'Pagamento de mensalidade')

      const cobRes = await createCob(cfg, { valor, descricao, txid })
      const status = String(cobRes.status ?? 'ATIVA')

      const { data: row, error: insertError } = await admin
        .from('pix_cobrancas')
        .insert({
          empresa_id: empresaId,
          associado_id: associadoId,
          created_by: user.id,
          tipo,
          receita_ids: receitaIds,
          atividade_id: atividadeId,
          ramo_id: ramoId,
          valor,
          txid: cobRes.txid ?? txid,
          status,
          pix_copia_e_cola: cobRes.pixCopiaECola ?? null,
          location: cobRes.location ?? null,
          descricao,
          raw_create: cobRes,
          loja_itens: tipo === 'loja' ? lojaPayload : null,
          tipopagto_id:
            Number.isFinite(tipopagtoIdBody) && (tipopagtoIdBody as number) > 0
              ? tipopagtoIdBody
              : null,
        })
        .select(
          'id, txid, status, valor, pix_copia_e_cola, location, descricao, created_at',
        )
        .single()

      if (insertError || !row) {
        return json(
          { error: insertError?.message ?? 'Falha ao salvar cobrança.' },
          400,
        )
      }

      return json({
        ok: true,
        configured: true,
        cobranca: row,
      })
    }

    if (body.action === 'status') {
      const cobrancaId = Number(body.cobranca_id)
      if (!cobrancaId) return json({ error: 'Cobrança inválida.' }, 400)

      const { data: cob, error: cobError } = await admin
        .from('pix_cobrancas')
        .select('*')
        .eq('id', cobrancaId)
        .maybeSingle()

      if (cobError || !cob) {
        return json({ error: cobError?.message ?? 'Cobrança não encontrada.' }, 404)
      }

      if (profile.empresa_id !== cob.empresa_id) {
        return json({ error: 'Sem permissão nesta cobrança.' }, 403)
      }

      if (cob.baixado_em || cob.status === 'CONCLUIDA') {
        return json({
          ok: true,
          paid: true,
          baixado: true,
          cobranca: {
            id: cob.id,
            txid: cob.txid,
            status: cob.status,
            valor: cob.valor,
            pix_copia_e_cola: cob.pix_copia_e_cola,
          },
        })
      }

      const resolved = await resolveConfigForCobranca(
        admin,
        cob as Record<string, unknown>,
      )
      if (!resolved.cfg) {
        return json(
          {
            error:
              resolved.hint ||
              'Credenciais PIX Sicredi não encontradas para consultar esta cobrança.',
            configured: false,
          },
          503,
        )
      }

      const cfg = resolved.cfg
      const remote = await getCob(cfg, String(cob.txid))
      const remoteStatus = String(remote.status ?? cob.status)

      await admin
        .from('pix_cobrancas')
        .update({
          status: remoteStatus,
          pix_copia_e_cola:
            remote.pixCopiaECola ?? cob.pix_copia_e_cola ?? null,
          raw_status: remote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cob.id)

      if (remoteStatus === 'CONCLUIDA') {
        const result = await concluirEBaixar(
          admin,
          cob as Record<string, unknown>,
          remote,
        )
        return json({
          ok: true,
          ...result,
          cobranca: {
            id: cob.id,
            txid: cob.txid,
            status: 'CONCLUIDA',
            valor: cob.valor,
            pix_copia_e_cola: remote.pixCopiaECola ?? cob.pix_copia_e_cola,
          },
        })
      }

      return json({
        ok: true,
        paid: false,
        baixado: false,
        cobranca: {
          id: cob.id,
          txid: cob.txid,
          status: remoteStatus,
          valor: cob.valor,
          pix_copia_e_cola: remote.pixCopiaECola ?? cob.pix_copia_e_cola,
        },
      })
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Erro interno PIX Sicredi.' },
      500,
    )
  }
})
