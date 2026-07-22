import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type CreateBody = {
  action: 'create'
  empresa_id: number
  tipo: 'mensalidade' | 'atividade' | 'mensalidade_lote'
  valor: number
  descricao?: string
  associado_id?: number | null
  receita_ids?: number[]
  atividade_id?: number | null
}

type StatusBody = {
  action: 'status'
  cobranca_id: number
}

type ConfigBody = {
  action: 'config'
  empresa_id?: number
  tipo?: 'mensalidade' | 'atividade' | 'mensalidade_lote'
  atividade_id?: number | null
}

type Body = CreateBody | StatusBody | ConfigBody

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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
  },
): Promise<SicrediConfig | null> {
  let ramoId = opts.ramoId ?? null

  if (opts.tipo === 'atividade') {
    if (ramoId == null && opts.atividadeId) {
      const { data: ativ } = await admin
        .from('atividades')
        .select('ramo')
        .eq('empresa_id', opts.empresaId)
        .eq('atividade_id', opts.atividadeId)
        .maybeSingle()
      ramoId = (ativ?.ramo as number | null) ?? null
    }

    if (ramoId != null) {
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
      if (fromRamo) return fromRamo
    }
  }

  if (opts.tipo === 'mensalidade' || opts.tipo === 'mensalidade_lote') {
    const { data: emp } = await admin
      .from('empresa')
      .select(
        'sicredi_pix_client_id, sicredi_pix_client_secret, sicredi_pix_chave, sicredi_pix_cert, sicredi_pix_key, sicredi_pix_base_url, sicredi_pix_ativo',
      )
      .eq('id', opts.empresaId)
      .maybeSingle()

    const fromEmpresa = configFromDbRow(
      emp as DbSicrediRow | null,
      'empresa',
    )
    if (fromEmpresa) return fromEmpresa
  }

  // Atividade sem ramo (grupo todo): usa PIX do grupo (mensalidades).
  if (opts.tipo === 'atividade' && ramoId == null) {
    const { data: emp } = await admin
      .from('empresa')
      .select(
        'sicredi_pix_client_id, sicredi_pix_client_secret, sicredi_pix_chave, sicredi_pix_cert, sicredi_pix_key, sicredi_pix_base_url, sicredi_pix_ativo',
      )
      .eq('id', opts.empresaId)
      .maybeSingle()

    const fromEmpresa = configFromDbRow(
      emp as DbSicrediRow | null,
      'empresa',
    )
    if (fromEmpresa) return fromEmpresa
  }

  // Atividade sem config de ramo: tenta secrets globais.
  if (opts.tipo === 'atividade') {
    return readSicrediEnvConfig()
  }

  return readSicrediEnvConfig()
}

function createMtlsClient(cfg: SicrediConfig): Deno.HttpClient {
  return Deno.createHttpClient({
    certChain: cfg.cert,
    privateKey: cfg.key,
  })
}

const tokenCache = new Map<string, { value: string; expiresAt: number }>()

async function getAccessToken(cfg: SicrediConfig): Promise<string> {
  const cacheKey = `${cfg.source}|${cfg.clientId}|${cfg.baseUrl}`
  const now = Date.now()
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > now + 30_000) {
    return cached.value
  }

  const client = createMtlsClient(cfg)
  try {
    const basic = btoa(`${cfg.clientId}:${cfg.clientSecret}`)
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'cob.write cob.read webhook.read webhook.write',
    })

    const res = await fetch(`${cfg.baseUrl}${cfg.oauthPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      client,
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.access_token) {
      throw new Error(
        data?.mensagem ||
          data?.error_description ||
          data?.error ||
          `Falha OAuth Sicredi (${res.status}).`,
      )
    }

    const entry = {
      value: String(data.access_token),
      expiresAt: now + Number(data.expires_in ?? 3000) * 1000,
    }
    tokenCache.set(cacheKey, entry)
    return entry.value
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

async function createCob(
  cfg: SicrediConfig,
  input: {
    valor: number
    descricao: string
    txid: string
  },
) {
  const token = await getAccessToken(cfg)
  const client = createMtlsClient(cfg)
  try {
    const payload = {
      calendario: { expiracao: 3600 },
      valor: { original: money2(input.valor) },
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

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        data?.detail ||
          data?.mensagem ||
          data?.title ||
          `Falha ao criar cobrança PIX (${res.status}).`,
      )
    }

    return data as {
      txid?: string
      status?: string
      location?: string
      pixCopiaECola?: string
      [key: string]: unknown
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
    .insert({ empresa_id: empresaId, nome: 'PIX', quita: true })
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

async function concluirEBaixar(
  admin: ReturnType<typeof createClient>,
  cob: Record<string, unknown>,
  statusPayload: Record<string, unknown> | null,
) {
  if (cob.baixado_em) {
    return { paid: true, baixado: true }
  }

  const tipopagtoId = await ensureTipoPagamentoPix(
    admin,
    cob.empresa_id as number,
  )
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
        await concluirEBaixar(admin, cob as Record<string, unknown>, payload)
      }

      return json({ ok: true })
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

    const body = (await req.json()) as Body

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
      const cfg = await resolveSicrediConfig(admin, {
        empresaId,
        tipo,
        atividadeId: body.atividade_id ?? null,
      })

      return json({
        configured: !!cfg,
        provider: 'sicredi',
        source: cfg?.source ?? null,
        message: cfg
          ? `PIX Sicredi configurado (${cfg.source}).`
          : tipo === 'atividade'
            ? 'Cadastre o PIX Sicredi do ramo na ficha do grupo.'
            : 'Cadastre o PIX Sicredi do grupo (mensalidades) na ficha do grupo.',
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

      let ramoId: number | null = null
      if (tipo === 'atividade' && atividadeId) {
        const { data: ativ } = await admin
          .from('atividades')
          .select('ramo')
          .eq('empresa_id', empresaId)
          .eq('atividade_id', atividadeId)
          .maybeSingle()
        ramoId = (ativ?.ramo as number | null) ?? null
      }

      const cfg = await resolveSicrediConfig(admin, {
        empresaId,
        tipo,
        atividadeId,
        ramoId,
      })

      if (!cfg) {
        return json(
          {
            error:
              tipo === 'atividade'
                ? 'PIX Sicredi do ramo não configurado. Cadastre a chave do ramo no grupo.'
                : 'PIX Sicredi do grupo não configurado. Cadastre as credenciais na ficha do grupo (mensalidades).',
            configured: false,
          },
          503,
        )
      }

      const txid = generateTxid()
      const descricao =
        body.descricao?.trim() ||
        (tipo === 'atividade' ? 'Pagamento de atividade' : 'Pagamento de mensalidade')

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

      const cfg = await resolveSicrediConfig(admin, {
        empresaId: cob.empresa_id as number,
        tipo: String(cob.tipo),
        atividadeId: (cob.atividade_id as number | null) ?? null,
        ramoId: (cob.ramo_id as number | null) ?? null,
      })
      if (!cfg) {
        return json(
          {
            error:
              'Credenciais PIX Sicredi não encontradas para consultar esta cobrança.',
            configured: false,
          },
          503,
        )
      }

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
