import { supabase } from '@/lib/supabase'

/** Busca mapa associado_id → registro_provisorio para enriquecer listas de RPC. */
export async function mapRegistroProvisorio(
  associadoIds: number[],
): Promise<Map<number, boolean>> {
  const ids = [...new Set(associadoIds.filter((id) => Number.isFinite(id) && id > 0))]
  const map = new Map<number, boolean>()
  if (ids.length === 0) return map

  const { data } = await supabase
    .from('associados')
    .select('associado_id, registro_provisorio')
    .in('associado_id', ids)

  for (const row of data ?? []) {
    map.set(
      row.associado_id as number,
      row.registro_provisorio === true,
    )
  }
  return map
}
