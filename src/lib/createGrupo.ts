import { supabase } from '@/lib/supabase'

export type CreateGrupoInput = {
  grupo: {
    nome: string
    slug: string
    cnpj?: string
    email?: string
    telefone?: string
    estado?: string
    cidade?: string
    ativo: boolean
    portal_transparencia?: boolean
    plataforma_plano_id?: number | null
    plataforma_isento?: boolean
    plataforma_dia_vencimento?: number | null
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
 * Cria grupo + admin via Edge Function (service role).
 * Não usa signUp no cliente: isso trocava a sessão e fazia a tela “piscar”
 * sem mensagem quando a function respondia 4xx.
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

  let lastError = 'Não foi possível criar o grupo (edge function).'
  for (let attempt = 0; attempt < 3; attempt++) {
    await supabase.auth.refreshSession()
    const result = await createViaEdgeFunction(input)
    if (result.ok) {
      return result
    }
    lastError = result.error || lastError
    if (!isTransientEdgeError(lastError) || attempt === 2) {
      return {
        ok: false,
        error: mapEmpresaError(lastError, slug),
      }
    }
    await sleep(400 * (attempt + 1) ** 2)
  }

  return { ok: false, error: mapEmpresaError(lastError, slug) }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

async function createViaEdgeFunction(
  input: CreateGrupoInput,
): Promise<CreateGrupoResult> {
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
    const res = await fetch(`${baseUrl}/functions/v1/create-grupo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
      },
      body: JSON.stringify(input),
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

    const empresa = data?.empresa as CreateGrupoResult['empresa']
    if (!empresa?.id) {
      return {
        ok: false,
        error: 'Resposta inválida ao criar o grupo. Tente novamente.',
      }
    }

    return {
      ok: true,
      empresa,
      admin: data?.admin as CreateGrupoResult['admin'],
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
