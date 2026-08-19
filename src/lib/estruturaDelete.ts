import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Remove vínculos de patrulha/matilha (secao_nome) antes de excluir o cadastro.
 */
export async function clearPatrulhaMatilhaRefs(
  client: SupabaseClient,
  empresaId: number,
  secaonomeIds: number[],
): Promise<{ error: string | null }> {
  const ids = [...new Set(secaonomeIds.filter((n) => Number.isFinite(n) && n > 0))]
  if (ids.length === 0) return { error: null }

  const updates: { table: string; column: string }[] = [
    { table: 'associados', column: 'patrulha_matilha' },
    { table: 'atividades', column: 'patrulha_matilha' },
    { table: 'acao_entre_amigos', column: 'patrulha_matilha' },
    { table: 'venda_eventos', column: 'patrulha_matilha' },
  ]

  for (const { table, column } of updates) {
    const { error } = await client
      .from(table)
      .update({ [column]: null })
      .eq('empresa_id', empresaId)
      .in(column, ids)
    if (error) {
      return {
        error: `Não foi possível desvincular ${table}: ${error.message}`,
      }
    }
  }

  const { error: profileError } = await client
    .from('profiles')
    .update({ codigo_secao_nome: null })
    .eq('empresa_id', empresaId)
    .in('codigo_secao_nome', ids)
  if (profileError) {
    return {
      error: `Não foi possível desvincular usuários: ${profileError.message}`,
    }
  }

  return { error: null }
}

/**
 * Remove vínculos de seção e exclui patrulhas/matilhas da seção.
 */
export async function clearSecaoRefsAndPatrulhas(
  client: SupabaseClient,
  empresaId: number,
  secaoId: number,
): Promise<{ error: string | null }> {
  const { data: patrulhas, error: listError } = await client
    .from('secao_nome')
    .select('secaonome_id')
    .eq('empresa_id', empresaId)
    .eq('secao', secaoId)

  if (listError) {
    return { error: listError.message }
  }

  const patrulhaIds = (patrulhas ?? []).map((p) => Number(p.secaonome_id))
  const clearPat = await clearPatrulhaMatilhaRefs(client, empresaId, patrulhaIds)
  if (clearPat.error) return clearPat

  const secaoUpdates: { table: string; column: string }[] = [
    { table: 'associados', column: 'secao' },
    { table: 'atividades', column: 'secao' },
    { table: 'acao_entre_amigos', column: 'secao' },
    { table: 'venda_eventos', column: 'secao' },
    { table: 'projetos', column: 'secao' },
    { table: 'calendario_grupo', column: 'secao' },
  ]

  for (const { table, column } of secaoUpdates) {
    const { error } = await client
      .from(table)
      .update({ [column]: null })
      .eq('empresa_id', empresaId)
      .eq(column, secaoId)
    if (error) {
      return {
        error: `Não foi possível desvincular ${table}: ${error.message}`,
      }
    }
  }

  const { error: profileError } = await client
    .from('profiles')
    .update({ codigo_secao: null })
    .eq('empresa_id', empresaId)
    .eq('codigo_secao', secaoId)
  if (profileError) {
    return {
      error: `Não foi possível desvincular usuários: ${profileError.message}`,
    }
  }

  if (patrulhaIds.length > 0) {
    const { error: delPatError } = await client
      .from('secao_nome')
      .delete()
      .eq('empresa_id', empresaId)
      .eq('secao', secaoId)
    if (delPatError) {
      return {
        error: `Não foi possível excluir patrulhas/matilhas: ${delPatError.message}`,
      }
    }
  }

  return { error: null }
}
