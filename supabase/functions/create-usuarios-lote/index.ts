import { createClient } from 'npm:@supabase/supabase-js@2.50.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-retry-count, traceparent, tracestate, baggage',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GROUP_ROLES = [
  'admin',
  'tesoureiro',
  'chefe',
  'escotista',
  'leitura',
] as const

type UsuarioItem = {
  nome: string
  email?: string
  registro?: string | null
  password: string
  role: string
  ativo?: boolean
  codigo_ramo?: number | null
  codigo_secao?: number | null
  codigo_secao_nome?: number | null
  menu_keys?: string[] | null
}

type Payload = {
  empresa_id?: number | null
  usuarios: UsuarioItem[]
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
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401)

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser()
    if (callerError || !caller) return json({ error: 'Sessão inválida.' }, 401)

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: callerProfile } = await admin
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

    const body = (await req.json()) as Payload
    const items = Array.isArray(body.usuarios) ? body.usuarios : []
    if (items.length === 0) {
      return json({ error: 'Nenhum usuário informado.' }, 400)
    }
    if (items.length > 40) {
      return json({ error: 'Máximo de 40 usuários por lote.' }, 400)
    }

    let empresaId = callerProfile.empresa_id as number | null
    if (isSuper) {
      const fromBody = Number(body.empresa_id)
      if (Number.isFinite(fromBody) && fromBody > 0) empresaId = fromBody
    } else if (!empresaId) {
      return json({ error: 'Admin sem grupo vinculado.' }, 400)
    }
    if (!empresaId) {
      return json(
        {
          error:
            'Selecione o grupo (contexto) no menu antes de importar usuários.',
        },
        400,
      )
    }

    const emailToId = new Map<string, string>()
    const created: { registro: string | null; id: string }[] = []
    const skipped: { registro: string | null; motivo: string }[] = []
    const failed: { registro: string | null; nome: string; error: string }[] =
      []

    for (const raw of items) {
      const nome = (raw.nome ?? '').trim()
      const registro =
        (raw.registro ?? '').replace(/\D/g, '').slice(0, 20) || null
      let email = (raw.email ?? '').trim().toLowerCase()
      if (!email.includes('@') && registro) {
        email = `r${registro}@usuarios.local`
      }
      const password = raw.password ?? ''
      const role = (raw.role ?? '').trim()

      try {
        if (!nome || !email || password.length < 6) {
          failed.push({
            registro,
            nome: nome || '—',
            error: 'Nome/e-mail/registro ou senha inválidos.',
          })
          continue
        }
        if (!GROUP_ROLES.includes(role as (typeof GROUP_ROLES)[number])) {
          failed.push({ registro, nome, error: 'Papel inválido.' })
          continue
        }

        if (registro) {
          const { data: existingProfile } = await admin
            .from('profiles')
            .select('id')
            .eq('empresa_id', empresaId)
            .eq('registro', registro)
            .maybeSingle()

          if (existingProfile?.id) {
            skipped.push({ registro, motivo: 'Já existe perfil neste grupo.' })
            continue
          }
        }

        let userId = emailToId.get(email) ?? null
        if (!userId) {
          const { data: createdUser, error: userError } =
            await admin.auth.admin.createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: { nome },
            })
          if (userError || !createdUser.user) {
            const msg = (userError?.message ?? '').toLowerCase()
            if (
              msg.includes('already') ||
              msg.includes('registered') ||
              msg.includes('exists')
            ) {
              userId = await findUserIdByEmail(supabaseUrl, serviceKey, email)
              if (userId) {
                await admin.auth.admin.updateUserById(userId, {
                  password,
                  email_confirm: true,
                  user_metadata: { nome },
                })
              } else {
                failed.push({
                  registro,
                  nome,
                  error: userError?.message ?? 'Falha Auth.',
                })
                continue
              }
            } else {
              failed.push({
                registro,
                nome,
                error: userError?.message ?? 'Falha Auth.',
              })
              continue
            }
          } else {
            userId = createdUser.user.id
          }
          emailToId.set(email, userId)
        } else {
          await admin.auth.admin.updateUserById(userId, {
            password,
            email_confirm: true,
            user_metadata: { nome },
          })
        }

        const { data: profile, error: profileError } = await admin
          .from('profiles')
          .upsert(
            {
              id: userId,
              empresa_id: empresaId,
              nome,
              email,
              username: registro ?? email.split('@')[0],
              registro,
              role,
              tipo: roleToTipo(role),
              ativo: raw.ativo !== false,
              codigo_ramo: raw.codigo_ramo ?? null,
              codigo_secao: raw.codigo_secao ?? null,
              codigo_secao_nome: raw.codigo_secao_nome ?? null,
              menu_keys: Array.isArray(raw.menu_keys)
                ? raw.menu_keys.map((k) => String(k).trim()).filter(Boolean)
                : null,
            },
            { onConflict: 'id' },
          )
          .select('id, registro')
          .single()

        if (profileError || !profile) {
          failed.push({
            registro,
            nome,
            error: profileError?.message ?? 'Falha ao criar perfil.',
          })
          continue
        }

        created.push({ registro, id: profile.id })
      } catch (e) {
        failed.push({
          registro,
          nome: (raw.nome ?? '').trim() || '—',
          error: e instanceof Error ? e.message : 'Erro inesperado.',
        })
      }
    }

    return json({
      ok: true,
      empresa_id: empresaId,
      created: created.length,
      skipped: skipped.length,
      failed: failed.length,
      details: { created, skipped, failed },
    })
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      500,
    )
  }
})

async function findUserIdByEmail(
  supabaseUrl: string,
  serviceKey: string,
  email: string,
): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200`,
      {
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
        },
      },
    )
    if (!res.ok) return null
    const body = (await res.json()) as {
      users?: { id: string; email?: string }[]
    }
    const users = body.users ?? []
    const found = users.find(
      (u) => (u.email ?? '').toLowerCase() === email.toLowerCase(),
    )
    if (found) return found.id
    if (users.length < 200) break
  }
  return null
}

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
