import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type Payload = {
  user_id: string
  password: string
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

    const adminClient = createClient(supabaseUrl, serviceKey)

    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role, ativo, empresa_id')
      .eq('id', caller.id)
      .maybeSingle()

    if (!callerProfile || callerProfile.ativo === false) {
      return json({ error: 'Perfil inválido.' }, 403)
    }

    const isGroupAdmin = ['super_admin', 'admin'].includes(
      callerProfile.role ?? '',
    )
    if (!isGroupAdmin) {
      return json({ error: 'Sem permissão para alterar senhas.' }, 403)
    }

    const body = (await req.json()) as Payload
    const userId = body.user_id?.trim()
    const password = body.password ?? ''

    if (!userId || password.length < 6) {
      return json(
        { error: 'Informe o usuário e a nova senha (mín. 6 caracteres).' },
        400,
      )
    }

    const { data: target } = await adminClient
      .from('profiles')
      .select('id, empresa_id')
      .eq('id', userId)
      .maybeSingle()

    if (!target) {
      return json({ error: 'Usuário não encontrado.' }, 404)
    }

    if (
      callerProfile.role !== 'super_admin' &&
      target.empresa_id !== callerProfile.empresa_id
    ) {
      return json(
        { error: 'Usuário não pertence ao seu grupo escoteiro.' },
        403,
      )
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      userId,
      { password },
    )

    if (updateError) {
      return json({ error: updateError.message }, 400)
    }

    return json({ ok: true })
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
