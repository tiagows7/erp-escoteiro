import { createClient } from 'npm:@supabase/supabase-js@2.49.8'
import forge from 'npm:node-forge@1.3.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type CreateBody = { action: 'create'; cobranca_id: number }
type StatusBody = { action: 'status'; pix_id: number }
type ConfigBody = { action: 'config' }
type PixRequestBody = CreateBody | StatusBody | ConfigBody

type EfiConfig = {
  clientId: string
  clientSecret: string
  chave: string
  certPem: string
  keyPem: string
  baseUrl: string
  sandbox: boolean
}

type TokenCache = { token: string; expiresAt: number }
let tokenCache: TokenCache | null = null

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function money2(value: number): string {
  return Number(value).toFixed(2)
}

function truncate(text: string, max: number): string {
  const t = text.trim()
  return t.length <= max ? t : t.slice(0, max)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function generateTxid(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(26))
  let out = 'erp'
  for (let i = 0; i < bytes.length; i++) {
    out += chars[bytes[i]! % chars.length]
  }
  return out.slice(0, 32)
}

function normalizePem(raw: string): string {
  let text = (raw ?? '').trim()
  if (text.includes('\\n') && !text.includes('\n')) {
    text = text.replace(/\\n/g, '\n')
  }
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

function splitPemCertificates(pem: string): string[] {
  return (
    normalizePem(pem).match(
      /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
    ) ?? []
  )
}

function extractPrivateKeyPem(pem: string): string | null {
  const n = normalizePem(pem)
  const m = n.match(
    /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/,
  )
  return m?.[0] ?? null
}

/** Converte P12 (base64) ou PEM misturado em cert+key PEM. */
function materializePemPair(
  certificado: string,
  certificadoSenha: string | null,
): { certPem: string; keyPem: string } {
  const raw = (certificado ?? '').trim()
  if (!raw) throw new Error('Certificado Efí não configurado.')

  const asPem = normalizePem(raw)
  if (asPem.includes('BEGIN CERTIFICATE')) {
    const key = extractPrivateKeyPem(asPem)
    if (!key) {
      throw new Error(
        'Arquivo PEM precisa incluir a chave privada (BEGIN PRIVATE KEY) além do certificado.',
      )
    }
    const certs = splitPemCertificates(asPem)
    return { certPem: certs.join('\n'), keyPem: key }
  }

  // Assume base64 PKCS#12
  let binary: string
  try {
    binary = atob(raw.replace(/\s+/g, ''))
  } catch {
    throw new Error('Certificado P12 inválido (esperado base64).')
  }

  const der = forge.util.createBuffer(binary, 'raw')
  const asn1 = forge.asn1.fromDer(der.getBytes())
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, certificadoSenha || '')

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[
    forge.pki.oids.certBag
  ]
  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] ??
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]

  const cert = certBags?.[0]?.cert
  const key = keyBags?.[0]?.key
  if (!cert || !key) {
    throw new Error(
      'Não foi possível extrair certificado/chave do P12. Confira a senha.',
    )
  }

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(key),
  }
}

function createMtlsClient(cfg: EfiConfig): Deno.HttpClient {
  const fullCert = normalizePem(cfg.certPem)
  const key = normalizePem(cfg.keyPem)
  const blocks = splitPemCertificates(fullCert)
  const leaf = blocks[0] ?? fullCert
  const caCerts = blocks.slice(1)

  try {
    return Deno.createHttpClient({
      cert: leaf,
      key,
      ...(caCerts.length > 0 ? { caCerts } : {}),
    } as Deno.CreateHttpClientOptions)
  } catch {
    return Deno.createHttpClient({
      certChain: fullCert,
      privateKey: key,
    } as Deno.CreateHttpClientOptions)
  }
}

function efiBaseUrl(sandbox: boolean, override: string | null): string {
  const custom = override?.trim()
  if (custom) return custom.replace(/\/$/, '')
  return sandbox
    ? 'https://pix-h.api.efipay.com.br'
    : 'https://pix.api.efipay.com.br'
}

async function loadEfiConfig(
  admin: ReturnType<typeof createClient>,
): Promise<EfiConfig> {
  const { data, error } = await admin
    .from('plataforma_efi_pix')
    .select(
      'client_id, client_secret, pix_chave, certificado, certificado_senha, sandbox, ativo, base_url',
    )
    .eq('id', 1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data || data.ativo !== true) {
    throw new Error(
      'PIX Efí não está ativo. Configure em Mensalidade plataforma → PIX Efí.',
    )
  }
  if (!data.client_id?.trim() || !data.client_secret?.trim()) {
    throw new Error('Client ID / Client Secret Efí incompletos.')
  }
  if (!data.pix_chave?.trim()) {
    throw new Error('Chave PIX Efí não configurada.')
  }
  if (!data.certificado?.trim()) {
    throw new Error('Certificado Efí não configurado.')
  }

  const { certPem, keyPem } = materializePemPair(
    data.certificado,
    data.certificado_senha ?? null,
  )

  return {
    clientId: data.client_id.trim(),
    clientSecret: data.client_secret.trim(),
    chave: data.pix_chave.trim(),
    certPem,
    keyPem,
    sandbox: data.sandbox === true,
    baseUrl: efiBaseUrl(data.sandbox === true, data.base_url ?? null),
  }
}

async function getAccessToken(cfg: EfiConfig): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.token
  }

  const basic = btoa(`${cfg.clientId}:${cfg.clientSecret}`)
  const client = createMtlsClient(cfg)
  try {
    const res = await fetch(`${cfg.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
      client,
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || typeof data.access_token !== 'string') {
      throw new Error(
        String(
          data?.error_description ||
            data?.message ||
            data?.mensagem ||
            `Falha OAuth Efí (${res.status}).`,
        ),
      )
    }
    const expiresIn = Number(data.expires_in ?? 3600)
    tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
    }
    return data.access_token
  } finally {
    client.close()
  }
}

function extractPixCopiaECola(data: Record<string, unknown>): string | null {
  const direct = data.pixCopiaECola ?? data.pix_copia_e_cola
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  return null
}

async function createCob(
  cfg: EfiConfig,
  input: { valor: number; descricao: string; txid: string },
) {
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

    const res = await fetch(`${cfg.baseUrl}/v2/cob/${input.txid}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      client,
    })

    let data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      throw new Error(
        String(
          data?.detail ||
            data?.mensagem ||
            data?.title ||
            data?.message ||
            `Falha ao criar cobrança PIX Efí (${res.status}).`,
        ),
      )
    }

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
      location: typeof data.location === 'string' ? data.location : null,
      pixCopiaECola,
    }
  } finally {
    client.close()
  }
}

async function getCob(cfg: EfiConfig, txid: string) {
  const token = await getAccessToken(cfg)
  const client = createMtlsClient(cfg)
  try {
    const res = await fetch(`${cfg.baseUrl}/v2/cob/${txid}`, {
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
        (data as { detail?: string })?.detail ||
          (data as { mensagem?: string })?.mensagem ||
          `Falha ao consultar cobrança PIX Efí (${res.status}).`,
      )
    }
    return data as Record<string, unknown>
  } finally {
    client.close()
  }
}

async function requireAuthUser(
  admin: ReturnType<typeof createClient>,
  authHeader: string | null,
) {
  if (!authHeader) throw Object.assign(new Error('Não autenticado.'), { status: 401 })
  const anon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const {
    data: { user },
    error,
  } = await anon.auth.getUser()
  if (error || !user) {
    throw Object.assign(new Error('Sessão inválida.'), { status: 401 })
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role, ativo, empresa_id')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.ativo === false) {
    throw Object.assign(new Error('Perfil inválido.'), { status: 403 })
  }
  return {
    user,
    profile: profile as {
      role: string
      ativo: boolean
      empresa_id: number | null
    },
  }
}

function assertCanPayCobranca(
  profile: { role: string; empresa_id: number | null },
  cobrancaEmpresaId: number,
) {
  if (profile.role === 'super_admin') return
  if (
    profile.empresa_id != null &&
    Number(profile.empresa_id) === Number(cobrancaEmpresaId)
  ) {
    return
  }
  throw Object.assign(
    new Error('Sem permissão para pagar esta cobrança.'),
    { status: 403 },
  )
}

async function concluirEBaixar(
  admin: ReturnType<typeof createClient>,
  pixRow: {
    id: number
    cobranca_id: number
    empresa_id: number
    valor: number
    txid: string
    baixado_em: string | null
  },
  cobData: Record<string, unknown>,
  userId: string | null,
) {
  if (pixRow.baixado_em) {
    return { already: true as const }
  }

  const { data: cobranca, error: cobErr } = await admin
    .from('plataforma_cobranca')
    .select('cobranca_id, empresa_id, valor, saldo, situacao')
    .eq('cobranca_id', pixRow.cobranca_id)
    .maybeSingle()

  if (cobErr || !cobranca) {
    throw new Error(cobErr?.message ?? 'Cobrança da plataforma não encontrada.')
  }

  const saldo = Number(cobranca.saldo ?? 0)
  if (saldo > 0) {
    const { error: pagErr } = await admin
      .from('plataforma_cobranca_pagamento')
      .insert({
        cobranca_id: cobranca.cobranca_id,
        empresa_id: cobranca.empresa_id,
        data_pagamento: todayISO(),
        valor: saldo,
        observacao: `PIX Efí txid ${pixRow.txid}`,
        created_by: userId,
      })
    if (pagErr) throw new Error(pagErr.message)

    const { error: upErr } = await admin
      .from('plataforma_cobranca')
      .update({
        saldo: 0,
        situacao: 3,
        pago_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('cobranca_id', cobranca.cobranca_id)
    if (upErr) throw new Error(upErr.message)
  }

  const { error: pixUpErr } = await admin
    .from('plataforma_pix_cobrancas')
    .update({
      status: String(cobData.status ?? 'CONCLUIDA'),
      paid_at: new Date().toISOString(),
      baixado_em: new Date().toISOString(),
      raw_status: cobData,
      updated_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', pixRow.id)

  if (pixUpErr) throw new Error(pixUpErr.message)
  return { already: false as const }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const isWebhook = url.searchParams.get('webhook') === '1'

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  try {
    if (isWebhook && req.method === 'POST') {
      const expected = Deno.env.get('PIX_EFI_WEBHOOK_SECRET')?.trim()
      if (expected) {
        const got =
          req.headers.get('x-webhook-secret') ||
          url.searchParams.get('secret') ||
          ''
        if (got !== expected) {
          return json({ error: 'Webhook não autorizado.' }, 401)
        }
      }

      const body = (await req.json().catch(() => ({}))) as {
        pix?: { txid?: string }[]
      }
      const txids = (body.pix ?? [])
        .map((p) => p.txid)
        .filter((t): t is string => !!t?.trim())

      const cfg = await loadEfiConfig(admin)
      for (const txid of txids) {
        const { data: pixRow } = await admin
          .from('plataforma_pix_cobrancas')
          .select(
            'id, cobranca_id, empresa_id, valor, txid, baixado_em',
          )
          .eq('txid', txid)
          .maybeSingle()
        if (!pixRow || pixRow.baixado_em) continue

        const cobData = await getCob(cfg, txid)
        if (String(cobData.status) === 'CONCLUIDA') {
          await concluirEBaixar(admin, pixRow, cobData, null)
        }
      }
      return json({ ok: true })
    }

    if (req.method !== 'POST') {
      return json({ error: 'Método não permitido.' }, 405)
    }

    const authHeader = req.headers.get('Authorization')
    const { user, profile } = await requireAuthUser(admin, authHeader)
    const body = (await req.json()) as PixRequestBody

    if (body.action === 'config') {
      try {
        await loadEfiConfig(admin)
        return json({ configured: true })
      } catch (e) {
        return json({
          configured: false,
          message: e instanceof Error ? e.message : String(e),
        })
      }
    }

    if (body.action === 'create') {
      const cobrancaId = Number(body.cobranca_id)
      if (!Number.isFinite(cobrancaId) || cobrancaId <= 0) {
        return json({ error: 'cobranca_id inválido.' }, 400)
      }

      const { data: cobranca, error: cobErr } = await admin
        .from('plataforma_cobranca')
        .select(
          'cobranca_id, empresa_id, descricao, valor, saldo, situacao, competencia, empresa:empresa_id(nome)',
        )
        .eq('cobranca_id', cobrancaId)
        .maybeSingle()

      if (cobErr || !cobranca) {
        return json(
          { error: cobErr?.message ?? 'Cobrança não encontrada.' },
          404,
        )
      }

      try {
        assertCanPayCobranca(profile, Number(cobranca.empresa_id))
      } catch (e) {
        const err = e as Error & { status?: number }
        return json({ error: err.message }, err.status ?? 403)
      }

      const saldo = Number(cobranca.saldo ?? 0)
      if (saldo <= 0 || cobranca.situacao === 3) {
        return json({ error: 'Esta cobrança já está quitada.' }, 400)
      }

      const cfg = await loadEfiConfig(admin)
      const empresaNome =
        (cobranca.empresa as { nome?: string } | null)?.nome ??
        `Grupo #${cobranca.empresa_id}`
      const descricao = truncate(
        cobranca.descricao ||
          `Mensalidade plataforma — ${empresaNome}`,
        140,
      )
      const txid = generateTxid()
      const cobRes = await createCob(cfg, {
        valor: saldo,
        descricao,
        txid,
      })

      if (!cobRes.pixCopiaECola) {
        return json(
          { error: 'Efí criou a cobrança, mas não retornou o Pix Copia e Cola.' },
          502,
        )
      }

      const { data: inserted, error: insErr } = await admin
        .from('plataforma_pix_cobrancas')
        .insert({
          cobranca_id: cobranca.cobranca_id,
          empresa_id: cobranca.empresa_id,
          created_by: user.id,
          valor: saldo,
          txid: cobRes.txid,
          status: cobRes.status,
          pix_copia_e_cola: cobRes.pixCopiaECola,
          location: cobRes.location,
          descricao,
          raw_create: cobRes,
        })
        .select(
          'id, cobranca_id, valor, txid, status, pix_copia_e_cola, location, descricao',
        )
        .single()

      if (insErr || !inserted) {
        return json(
          { error: insErr?.message ?? 'Falha ao salvar cobrança PIX.' },
          500,
        )
      }

      return json({ cobranca: inserted })
    }

    if (body.action === 'status') {
      const pixId = Number(body.pix_id)
      if (!Number.isFinite(pixId) || pixId <= 0) {
        return json({ error: 'pix_id inválido.' }, 400)
      }

      const { data: pixRow, error: pixErr } = await admin
        .from('plataforma_pix_cobrancas')
        .select(
          'id, cobranca_id, empresa_id, valor, txid, status, pix_copia_e_cola, baixado_em, location, descricao',
        )
        .eq('id', pixId)
        .maybeSingle()

      if (pixErr || !pixRow) {
        return json(
          { error: pixErr?.message ?? 'PIX não encontrado.' },
          404,
        )
      }

      try {
        assertCanPayCobranca(profile, Number(pixRow.empresa_id))
      } catch (e) {
        const err = e as Error & { status?: number }
        return json({ error: err.message }, err.status ?? 403)
      }

      if (pixRow.baixado_em) {
        return json({
          paid: true,
          cobranca: pixRow,
        })
      }

      const cfg = await loadEfiConfig(admin)
      const cobData = await getCob(cfg, pixRow.txid)
      const status = String(cobData.status ?? pixRow.status)
      const paid = status === 'CONCLUIDA'

      if (paid) {
        await concluirEBaixar(admin, pixRow, cobData, user.id)
      } else {
        await admin
          .from('plataforma_pix_cobrancas')
          .update({
            status,
            raw_status: cobData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pixRow.id)
      }

      return json({
        paid,
        cobranca: {
          ...pixRow,
          status,
          pix_copia_e_cola:
            extractPixCopiaECola(cobData) ?? pixRow.pix_copia_e_cola,
        },
      })
    }

    return json({ error: 'Ação inválida.' }, 400)
  } catch (e) {
    const status = (e as { status?: number })?.status ?? 500
    const message = e instanceof Error ? e.message : String(e)
    console.error('pix-efi', message)
    return json({ error: message }, status)
  }
})
