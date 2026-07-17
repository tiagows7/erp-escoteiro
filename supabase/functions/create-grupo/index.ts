import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

type Payload = {
  grupo: {
    nome: string
    slug: string
    cnpj?: string | null
    email?: string | null
    telefone?: string | null
    ativo?: boolean
  }
  admin: {
    nome: string
    email: string
    password: string
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

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role, ativo')
      .eq('id', caller.id)
      .maybeSingle()

    if (!profile || profile.ativo === false || profile.role !== 'super_admin') {
      return json({ error: 'Apenas super admin pode criar grupos.' }, 403)
    }

    const body = (await req.json()) as Payload
    const nomeGrupo = body.grupo?.nome?.trim()
    const slug = body.grupo?.slug?.trim()
    const adminNome = body.admin?.nome?.trim()
    const adminEmail = body.admin?.email?.trim().toLowerCase()
    const adminPassword = body.admin?.password ?? ''

    if (!nomeGrupo || !slug) {
      return json({ error: 'Informe nome e slug do grupo.' }, 400)
    }
    if (!adminNome || !adminEmail || adminPassword.length < 6) {
      return json(
        { error: 'Informe nome, e-mail e senha (mín. 6 caracteres) do admin.' },
        400,
      )
    }

    const { data: slugExistente } = await adminClient
      .from('empresa')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (slugExistente) {
      return json(
        {
          error: `Já existe um grupo com o identificador "${slug}". Escolha outro slug.`,
        },
        400,
      )
    }

    const { data: empresa, error: empresaError } = await adminClient
      .from('empresa')
      .insert({
        nome: nomeGrupo.toUpperCase(),
        slug,
        cnpj: body.grupo.cnpj?.replace(/\D/g, '') || null,
        email: body.grupo.email?.trim() || null,
        telefone: body.grupo.telefone?.trim() || null,
        ativo: body.grupo.ativo !== false,
      })
      .select('id, nome, slug')
      .single()

    if (empresaError || !empresa) {
      const msg = empresaError?.message ?? 'Falha ao criar grupo.'
      const friendly =
        msg.toLowerCase().includes('empresa_slug_uidx') ||
        (msg.toLowerCase().includes('duplicate key') &&
          msg.toLowerCase().includes('slug'))
          ? `Já existe um grupo com o identificador "${slug}". Escolha outro slug.`
          : msg
      return json({ error: friendly }, 400)
    }

    const { data: createdUser, error: userError } =
      await adminClient.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { nome: adminNome },
      })

    if (userError || !createdUser.user) {
      await adminClient.from('empresa').delete().eq('id', empresa.id)
      return json(
        {
          error:
            userError?.message ??
            'Falha ao criar usuário. O grupo não foi mantido.',
        },
        400,
      )
    }

    const { error: profileError } = await adminClient.from('profiles').insert({
      id: createdUser.user.id,
      empresa_id: empresa.id,
      nome: adminNome,
      username: adminEmail.split('@')[0],
      role: 'admin',
      tipo: 'A',
      ativo: true,
    })

    if (profileError) {
      await adminClient.auth.admin.deleteUser(createdUser.user.id)
      await adminClient.from('empresa').delete().eq('id', empresa.id)
      return json(
        { error: profileError.message ?? 'Falha ao vincular perfil.' },
        400,
      )
    }

    return json({
      ok: true,
      empresa,
      admin: {
        id: createdUser.user.id,
        email: adminEmail,
        nome: adminNome,
        role: 'admin',
      },
    })
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      500,
    )
  }
})

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
