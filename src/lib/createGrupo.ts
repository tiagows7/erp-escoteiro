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

  const result = await createViaEdgeFunction(input)
  if (!result.ok && result.error) {
    return {
      ...result,
      error: mapEmpresaError(result.error, slug),
    }
  }
  return result
}

async function readFunctionsError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: Response })?.context
  if (!ctx || typeof ctx.json !== 'function') return null
  try {
    const body = (await ctx.json()) as { error?: string }
    if (body?.error) return String(body.error)
  } catch {
    /* ignore */
  }
  return null
}

async function createViaEdgeFunction(
  input: CreateGrupoInput,
): Promise<CreateGrupoResult> {
  const { data, error } = await supabase.functions.invoke('create-grupo', {
    body: input,
  })

  if (error) {
    const fromBody = await readFunctionsError(error)
    return {
      ok: false,
      error:
        fromBody ||
        error.message ||
        'Não foi possível criar o grupo (edge function).',
    }
  }

  if (data?.error) {
    return { ok: false, error: String(data.error) }
  }

  if (!data?.empresa?.id) {
    return {
      ok: false,
      error: 'Resposta inválida ao criar o grupo. Tente novamente.',
    }
  }

  return {
    ok: true,
    empresa: data.empresa,
    admin: data.admin,
  }
}
