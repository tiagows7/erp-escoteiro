import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type Payload = {
  associado_id: number
  empresa_id: number
  versao_termos: string
  texto_consentimento: string
  menor_idade?: boolean
  user_agent?: string | null
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    null
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Não autenticado.' }, 401)
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser()

    if (callerError || !caller) {
      return json({ error: 'Sessão inválida.' }, 401)
    }

    const body = (await req.json()) as Payload
    const associadoId = Number(body.associado_id)
    const empresaId = Number(body.empresa_id)
    const versao = String(body.versao_termos ?? '').trim()
    const texto = String(body.texto_consentimento ?? '').trim()

    if (!associadoId || !empresaId || !versao || !texto) {
      return json({ error: 'Dados de consentimento incompletos.' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey)

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('empresa_id, role, ativo')
      .eq('id', caller.id)
      .maybeSingle()

    if (!callerProfile || callerProfile.ativo === false) {
      return json({ error: 'Perfil inválido.' }, 403)
    }

    const isSuper = callerProfile.role === 'super_admin'
    if (!isSuper && callerProfile.empresa_id !== empresaId) {
      return json({ error: 'Sem acesso a este grupo.' }, 403)
    }

    const { data: associado } = await admin
      .from('associados')
      .select('associado_id, empresa_id')
      .eq('associado_id', associadoId)
      .eq('empresa_id', empresaId)
      .maybeSingle()

    if (!associado) {
      return json({ error: 'Associado não encontrado.' }, 404)
    }

    const ip = clientIp(req)
    const aceitoEm = new Date().toISOString()
    const userAgent =
      String(body.user_agent ?? '').trim() ||
      req.headers.get('user-agent') ||
      null

    const { error: updError } = await admin
      .from('associados')
      .update({
        lgpd_aceite_em: aceitoEm,
        lgpd_aceite_ip: ip,
        lgpd_aceite_por: caller.id,
        lgpd_aceite_versao: versao,
        lgpd_aceite_texto: texto,
      })
      .eq('associado_id', associadoId)
      .eq('empresa_id', empresaId)

    if (updError) {
      return json({ error: updError.message }, 400)
    }

    const { data: log, error: logError } = await admin
      .from('lgpd_consentimento_log')
      .insert({
        empresa_id: empresaId,
        associado_id: associadoId,
        user_id: caller.id,
        aceito_em: aceitoEm,
        ip,
        user_agent: userAgent,
        versao_termos: versao,
        texto_consentimento: texto,
        menor_idade: body.menor_idade === true,
      })
      .select('id, aceito_em, ip')
      .single()

    if (logError) {
      return json({ error: logError.message }, 400)
    }

    return json({ ok: true, log })
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      500,
    )
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
