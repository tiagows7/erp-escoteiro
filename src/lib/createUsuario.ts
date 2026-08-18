import { supabase } from '@/lib/supabase'
import type { AppRole } from '@/lib/roles'

export type CreateUsuarioInput = {
  nome: string
  email?: string
  registro?: string | null
  password: string
  role: AppRole
  ativo: boolean
  /** Obrigatório para super_admin sem empresa_id no perfil. */
  empresa_id?: number | null
  codigo_ramo?: number | null
  codigo_secao?: number | null
  codigo_secao_nome?: number | null
  menu_keys?: string[] | null
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
  const viaFunction = await createViaEdgeFunctionWithRetry(input)
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Só cai no fallback se a function estiver inacessível — não em 4xx de negócio. */
function shouldFallback(error?: string) {
  if (!error) return false
  const lower = error.toLowerCase()
  // "Edge Function returned a non-2xx..." = erro de negócio (400/403), NÃO fallback
  if (lower.includes('non-2xx')) return false
  return (
    lower.includes('failed to send') ||
    lower.includes('failed to fetch') ||
    lower.includes('functionsrelayerror') ||
    lower.includes('network') ||
    lower.includes('404') ||
    (lower.includes('not found') && lower.includes('function'))
  )
}

function isTransientEdgeError(error?: string) {
  if (!error) return false
  const lower = error.toLowerCase()
  return (
    lower.includes('failed to send') ||
    lower.includes('failed to fetch') ||
    lower.includes('functionsrelayerror') ||
    lower.includes('network') ||
    lower.includes('timeout') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504')
  )
}

async function createViaEdgeFunctionWithRetry(
  input: CreateUsuarioInput,
): Promise<CreateUsuarioResult> {
  let last: CreateUsuarioResult = { ok: false, error: 'Falha ao criar usuário.' }
  for (let attempt = 0; attempt < 4; attempt++) {
    last = await createViaEdgeFunction(input)
    if (last.ok) return last
    if (!isTransientEdgeError(last.error) || attempt === 3) return last
    await sleep(400 * (attempt + 1) ** 2)
  }
  return last
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
    .select('empresa_id, role')
    .eq('id', current.user.id)
    .maybeSingle()

  const empresaId =
    input.empresa_id ??
    (me?.empresa_id != null ? Number(me.empresa_id) : null)

  if (!empresaId) {
    return {
      ok: false,
      error:
        'Selecione um grupo escoteiro no menu (contexto) antes de criar usuários.',
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

  if (input.role === 'super_admin') {
    return {
      ok: false,
      error: 'Apenas a plataforma pode criar super admin.',
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: signUpData.user.id,
      empresa_id: empresaId,
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
      menu_keys: input.menu_keys ?? null,
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

export type ExcluirUsuarioResult = {
  ok: boolean
  error?: string
}

/** Exclui usuário do Auth (e o profile em cascade), inclusive admin. */
export async function excluirUsuario(
  userId: string,
): Promise<ExcluirUsuarioResult> {
  const { data, error } = await supabase.functions.invoke('excluir-usuario', {
    body: { user_id: userId },
  })

  if (error) {
    const fromBody = await readFunctionsError(error)
    return { ok: false, error: fromBody || error.message }
  }
  if (data?.error) {
    return { ok: false, error: String(data.error) }
  }

  return { ok: true }
}

export type CreateUsuarioLoteItem = {
  nome: string
  registro: string
  password: string
  role: AppRole
  ativo: boolean
  codigo_ramo?: number | null
  codigo_secao?: number | null
  menu_keys?: string[] | null
}

export type CreateUsuariosLoteResult = {
  ok: boolean
  error?: string
  created?: number
  skipped?: number
  failed?: number
  details?: {
    created: { registro: string | null; id: string }[]
    skipped: { registro: string | null; motivo: string }[]
    failed: { registro: string | null; nome: string; error: string }[]
  }
}

export async function createUsuariosLote(
  empresaId: number,
  usuarios: CreateUsuarioLoteItem[],
): Promise<CreateUsuariosLoteResult> {
  if (usuarios.length === 0) {
    return { ok: true, created: 0, skipped: 0, failed: 0 }
  }

  let lastError = 'Falha ao criar usuários em lote.'
  for (let attempt = 0; attempt < 4; attempt++) {
    await supabase.auth.refreshSession()
    const result = await invokeUsuariosLote(empresaId, usuarios)

    if (!result.ok) {
      lastError = result.error || lastError
      if (!isTransientEdgeError(lastError) || attempt === 3) break
      await sleep(500 * (attempt + 1) ** 2)
      continue
    }

    return result
  }

  // Fallback: cria um a um (mais lento, mas contorna falha de rede no lote).
  if (isTransientEdgeError(lastError)) {
    return createUsuariosLoteSequencial(empresaId, usuarios)
  }

  return { ok: false, error: lastError }
}

async function invokeUsuariosLote(
  empresaId: number,
  usuarios: CreateUsuarioLoteItem[],
): Promise<CreateUsuariosLoteResult> {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!baseUrl || !anonKey) {
    return { ok: false, error: 'Configuração Supabase ausente.' }
  }
  if (!session?.access_token) {
    return { ok: false, error: 'Sessão não encontrada.' }
  }

  try {
    const res = await fetch(`${baseUrl}/functions/v1/create-usuarios-lote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ empresa_id: empresaId, usuarios }),
    })

    const text = await res.text()
    let data: Record<string, unknown> | null = null
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : null
    } catch {
      data = null
    }

    if (!res.ok) {
      const msg =
        (data?.error != null ? String(data.error) : null) ||
        text ||
        `HTTP ${res.status}`
      return { ok: false, error: msg }
    }

    if (data?.error) {
      return { ok: false, error: String(data.error) }
    }

    const details = data?.details as CreateUsuariosLoteResult['details']
    return {
      ok: true,
      created: Number(data?.created ?? 0),
      skipped: Number(data?.skipped ?? 0),
      failed: Number(data?.failed ?? 0),
      details,
    }
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message || 'Failed to send a request to the Edge Function'
          : 'Failed to send a request to the Edge Function',
    }
  }
}

async function createUsuariosLoteSequencial(
  empresaId: number,
  usuarios: CreateUsuarioLoteItem[],
): Promise<CreateUsuariosLoteResult> {
  const created: { registro: string | null; id: string }[] = []
  const skipped: { registro: string | null; motivo: string }[] = []
  const failed: { registro: string | null; nome: string; error: string }[] = []

  for (let i = 0; i < usuarios.length; i++) {
    const u = usuarios[i]
    if (i > 0 && i % 5 === 0) {
      await supabase.auth.refreshSession()
      await sleep(300)
    }
    const result = await createUsuario({
      ...u,
      empresa_id: empresaId,
    })
    if (result.ok) {
      created.push({ registro: u.registro, id: result.profile?.id ?? '' })
      continue
    }
    const msg = (result.error ?? '').toLowerCase()
    if (
      msg.includes('already') ||
      msg.includes('registered') ||
      msg.includes('duplicate') ||
      msg.includes('unique') ||
      msg.includes('já') ||
      msg.includes('ja ') ||
      msg.includes('existe')
    ) {
      skipped.push({ registro: u.registro, motivo: result.error || 'Já existe' })
    } else {
      failed.push({
        registro: u.registro,
        nome: u.nome,
        error: result.error || 'Falha ao criar usuário',
      })
    }
  }

  return {
    ok: true,
    created: created.length,
    skipped: skipped.length,
    failed: failed.length,
    details: { created, skipped, failed },
  }
}
