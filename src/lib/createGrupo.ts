import { supabase } from '@/lib/supabase'

export type CreateGrupoInput = {
  grupo: {
    nome: string
    slug: string
    cnpj?: string
    email?: string
    telefone?: string
    ativo: boolean
  }
  admin: {
    nome: string
    email: string
    password: string
  }
}

export type CreateGrupoResult = {
  ok: boolean
  error?: string
  empresa?: { id: number; nome: string; slug: string | null }
  admin?: { id: string; email: string; nome: string; role: string }
}

export function mapEmpresaError(message: string, slug?: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('empresa_slug_uidx') ||
    (lower.includes('duplicate key') && lower.includes('slug'))
  ) {
    return slug
      ? `Já existe um grupo com o identificador "${slug}". Escolha outro slug.`
      : 'Já existe um grupo com este identificador (slug). Escolha outro.'
  }
  if (lower.includes('duplicate key') && lower.includes('email')) {
    return 'Este e-mail de administrador já está em uso.'
  }
  return message
}

/** Retorna true se o slug já estiver em uso (opcionalmente ignorando um id na edição). */
export async function slugJaExiste(
  slug: string,
  ignoreEmpresaId?: number,
): Promise<boolean> {
  let query = supabase
    .from('empresa')
    .select('id')
    .eq('slug', slug)
    .limit(1)

  if (ignoreEmpresaId != null) {
    query = query.neq('id', ignoreEmpresaId)
  }

  const { data } = await query.maybeSingle()
  return !!data
}

/**
 * Preferência: Edge Function (service role, usuário já confirmado).
 * Fallback: signUp + restaura sessão do super admin.
 */
export async function createGrupoComAdmin(
  input: CreateGrupoInput,
): Promise<CreateGrupoResult> {
  const slug = input.grupo.slug.trim()
  if (await slugJaExiste(slug)) {
    return {
      ok: false,
      error: `Já existe um grupo com o identificador "${slug}". Escolha outro slug.`,
    }
  }

  const viaFunction = await createViaEdgeFunction(input)
  if (viaFunction.ok || !shouldFallback(viaFunction.error)) {
    if (!viaFunction.ok && viaFunction.error) {
      return {
        ...viaFunction,
        error: mapEmpresaError(viaFunction.error, slug),
      }
    }
    return viaFunction
  }
  return createViaSignUpFallback(input)
}

function shouldFallback(error?: string) {
  if (!error) return false
  const lower = error.toLowerCase()
  return (
    lower.includes('failed to send') ||
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('functionsrelayerror') ||
    lower.includes('edge function')
  )
}

async function createViaEdgeFunction(
  input: CreateGrupoInput,
): Promise<CreateGrupoResult> {
  const { data, error } = await supabase.functions.invoke('create-grupo', {
    body: input,
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  if (data?.error) {
    return { ok: false, error: String(data.error) }
  }

  return {
    ok: true,
    empresa: data.empresa,
    admin: data.admin,
  }
}

async function createViaSignUpFallback(
  input: CreateGrupoInput,
): Promise<CreateGrupoResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const current = sessionData.session
  if (!current) {
    return { ok: false, error: 'Sessão do super admin não encontrada.' }
  }

  const { data: empresa, error: empresaError } = await supabase
    .from('empresa')
    .insert({
      nome: input.grupo.nome.toUpperCase(),
      slug: input.grupo.slug,
      cnpj: input.grupo.cnpj?.replace(/\D/g, '') || null,
      email: input.grupo.email?.trim() || null,
      telefone: input.grupo.telefone?.trim() || null,
      ativo: input.grupo.ativo,
    })
    .select('id, nome, slug')
    .single()

  if (empresaError || !empresa) {
    return {
      ok: false,
      error: mapEmpresaError(
        empresaError?.message ?? 'Falha ao criar grupo.',
        input.grupo.slug,
      ),
    }
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: input.admin.email.trim().toLowerCase(),
    password: input.admin.password,
    options: {
      data: { nome: input.admin.nome.trim() },
    },
  })

  // Sempre tenta restaurar a sessão do super admin
  await supabase.auth.setSession({
    access_token: current.access_token,
    refresh_token: current.refresh_token,
  })

  if (signUpError || !signUpData.user) {
    await supabase.from('empresa').delete().eq('id', empresa.id)
    return {
      ok: false,
      error:
        signUpError?.message ??
        'Falha ao criar usuário. Verifique se o e-mail já existe.',
    }
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: signUpData.user.id,
    empresa_id: empresa.id,
    nome: input.admin.nome.trim(),
    username: input.admin.email.split('@')[0],
    role: 'admin',
    tipo: 'A',
    ativo: true,
  })

  if (profileError) {
    await supabase.from('empresa').delete().eq('id', empresa.id)
    return {
      ok: false,
      error: `Usuário Auth criado, mas falhou o perfil: ${profileError.message}`,
    }
  }

  return {
    ok: true,
    empresa,
    admin: {
      id: signUpData.user.id,
      email: input.admin.email.trim().toLowerCase(),
      nome: input.admin.nome.trim(),
      role: 'admin',
    },
  }
}
