import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/lib/roles'

export type CreateUsuarioInput = {
  nome: string
  email: string
  password: string
  role: AppRole
  ativo: boolean
  codigo_ramo?: number | null
  codigo_secao?: number | null
  codigo_secao_nome?: number | null
}

export type CreateUsuarioResult = {
  ok: boolean
  error?: string
  profile?: {
    id: string
    nome: string
    email: string | null
    role: string
    ativo: boolean
  }
}

function roleToTipo(role: AppRole): string {
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

export async function createUsuario(
  input: CreateUsuarioInput,
): Promise<CreateUsuarioResult> {
  const viaFunction = await createViaEdgeFunction(input)
  if (viaFunction.ok || !shouldFallback(viaFunction.error)) {
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
  input: CreateUsuarioInput,
): Promise<CreateUsuarioResult> {
  const { data, error } = await supabase.functions.invoke('create-usuario', {
    body: input,
  })

  if (error) {
    return { ok: false, error: error.message }
  }
  if (data?.error) {
    return { ok: false, error: String(data.error) }
  }

  return { ok: true, profile: data.profile }
}

async function createViaSignUpFallback(
  input: CreateUsuarioInput,
): Promise<CreateUsuarioResult> {
  const { data: sessionData } = await supabase.auth.getSession()
  const current = sessionData.session
  if (!current) {
    return { ok: false, error: 'Sessão não encontrada.' }
  }

  const { data: me } = await supabase
    .from('profiles')
    .select('empresa_id')
    .eq('id', current.user.id)
    .maybeSingle()

  if (!me?.empresa_id) {
    return {
      ok: false,
      error: 'Seu usuário precisa estar vinculado a um grupo.',
    }
  }

  const email = input.email.trim().toLowerCase()
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: { data: { nome: input.nome.trim() } },
  })

  await supabase.auth.setSession({
    access_token: current.access_token,
    refresh_token: current.refresh_token,
  })

  if (signUpError || !signUpData.user) {
    return {
      ok: false,
      error:
        signUpError?.message ??
        'Falha ao criar usuário. Verifique se o e-mail já existe.',
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: signUpData.user.id,
      empresa_id: me.empresa_id,
      nome: input.nome.trim(),
      email,
      username: email.split('@')[0],
      role: input.role,
      tipo: roleToTipo(input.role),
      ativo: input.ativo,
      codigo_ramo: input.codigo_ramo ?? null,
      codigo_secao: input.codigo_secao ?? null,
      codigo_secao_nome: input.codigo_secao_nome ?? null,
    })
    .select('id, nome, email, role, ativo')
    .single()

  if (profileError || !profile) {
    return {
      ok: false,
      error: profileError?.message ?? 'Falha ao criar perfil.',
    }
  }

  return { ok: true, profile: profile as CreateUsuarioResult['profile'] }
}
