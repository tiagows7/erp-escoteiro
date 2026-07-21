import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const GROUP_ROLES = [
  'admin',
  'tesoureiro',
  'chefe',
  'escotista',
  'leitura',
] as const

type Payload = {
  nome: string
  email?: string
  registro?: string | null
  password: string
  role: string
  ativo?: boolean
  codigo_ramo?: number | null
  codigo_secao?: number | null
  codigo_secao_nome?: number | null
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

    const isSuper = callerProfile.role === 'super_admin'
    const isGroupAdmin = ['super_admin', 'admin'].includes(
      callerProfile.role ?? '',
    )

    if (!isGroupAdmin) {
      return json({ error: 'Sem permissão para criar usuários.' }, 403)
    }

    if (!isSuper && !callerProfile.empresa_id) {
      return json({ error: 'Admin sem grupo vinculado.' }, 400)
    }

    const body = (await req.json()) as Payload
    const nome = body.nome?.trim()
    const registro = (body.registro ?? '').replace(/\D/g, '').slice(0, 20) || null
    let email = body.email?.trim().toLowerCase() || ''
    if (!email.includes('@') && registro) {
      email = `r${registro}@usuarios.local`
    }
    const password = body.password ?? ''
    const role = body.role?.trim()

    if (!nome || !email || password.length < 6) {
      return json(
        {
          error:
            'Informe nome, e-mail ou nº de registro, e senha (mín. 6 caracteres).',
        },
        400,
      )
    }

    if (!GROUP_ROLES.includes(role as (typeof GROUP_ROLES)[number])) {
      return json({ error: 'Papel de usuário inválido.' }, 400)
    }

    const empresaId = callerProfile.empresa_id
    if (!empresaId) {
      return json(
        {
          error:
            'Super admin precisa estar vinculado a um grupo para criar usuários por esta tela.',
        },
        400,
      )
    }

    const { data: createdUser, error: userError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nome },
      })

    if (userError || !createdUser.user) {
      return json(
        { error: userError?.message ?? 'Falha ao criar usuário de acesso.' },
        400,
      )
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .insert({
        id: createdUser.user.id,
        empresa_id: empresaId,
        nome,
        email,
        username: registro ?? email.split('@')[0],
        registro,
        role,
        tipo: roleToTipo(role),
        ativo: body.ativo !== false,
        codigo_ramo: body.codigo_ramo ?? null,
        codigo_secao: body.codigo_secao ?? null,
        codigo_secao_nome: body.codigo_secao_nome ?? null,
      })
      .select('id, nome, email, role, ativo, registro')
      .single()

    if (profileError || !profile) {
      await adminClient.auth.admin.deleteUser(createdUser.user.id)
      return json(
        { error: profileError?.message ?? 'Falha ao criar perfil.' },
        400,
      )
    }

    return json({ ok: true, profile })
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      500,
    )
  }
})

function roleToTipo(role: string): string {
  switch (role) {
    case 'admin':
      return 'A'
    case 'tesoureiro':
      return 'T'
    case 'chefe':
      return 'C'
    case 'escotista':
      return 'E'
    case 'leitura':
      return 'L'
    default:
      return 'E'
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
