import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/lib/roles'

export type CreateUsuarioInput = {
  nome: string
  email?: string
  registro?: string | null
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

function normalizeRegistro(value: string | null | undefined): string | null {
  const digits = (value ?? '').replace(/\D/g, '').slice(0, 20)
  return digits || null
}

/** E-mail real ou sintetico a partir do registro (Auth exige e-mail). */
export function authEmailFromLogin(
  email: string | null | undefined,
  registro: string | null | undefined,
): string | null {
  const e = (email ?? '').trim().toLowerCase()
  if (e.includes('@')) return e
  const reg = normalizeRegistro(registro)
  if (reg) return `r${reg}@usuarios.local`
  return null
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
  // Login por registro usa e-mail sintetico: signUp dispara e-mail e estoura rate limit.
  // So usa fallback quando a function nao esta disponivel E ha e-mail real.
  const hasRealEmail = (input.email ?? '').includes('@')
  if (
    viaFunction.ok ||
    !hasRealEmail ||
    !shouldFallback(viaFunction.error)
  ) {
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
    // Tenta extrair mensagem do body da function (ex.: 400 com { error })
    const fromBody = await readFunctionsError(error)
    return { ok: false, error: fromBody || error.message }
  }
  if (data?.error) {
    return { ok: false, error: String(data.error) }
  }

  return { ok: true, profile: data.profile }
}

async function readFunctionsError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: Response })?.context
  if (!ctx || typeof ctx.json !== 'function') return null
  try {
    const body = await ctx.json()
    if (body?.error) return String(body.error)
  } catch {
    /* ignore */
  }
  return null
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

  const email =
    authEmailFromLogin(input.email, input.registro) ??
    input.email?.trim().toLowerCase() ??
    ''
  const registro = normalizeRegistro(input.registro)

  if (!email) {
    return {
      ok: false,
      error: 'Informe o e-mail ou o número de registro.',
    }
  }

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
        'Falha ao criar usuário. Verifique se o e-mail/registro já existe.',
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: signUpData.user.id,
      empresa_id: me.empresa_id,
      nome: input.nome.trim(),
      email,
      username: registro ?? email.split('@')[0],
      registro,
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

export type UpdateUsuarioSenhaResult = {
  ok: boolean
  error?: string
}

/** Altera a senha de um usuário já existente (via Edge Function com service role). */
export async function updateUsuarioSenha(
  userId: string,
  password: string,
): Promise<UpdateUsuarioSenhaResult> {
  const { data, error } = await supabase.functions.invoke(
    'update-usuario-senha',
    {
      body: { user_id: userId, password },
    },
  )

  if (error) {
    const fromBody = await readFunctionsError(error)
    return { ok: false, error: fromBody || error.message }
  }
  if (data?.error) {
    return { ok: false, error: String(data.error) }
  }

  return { ok: true }
}
