import { normalizeInfinitePayHandle } from '@/lib/contaBancariaFields'
import { supabase } from '@/lib/supabase'

/**
 * Resolve a InfiniteTag da conta bancária do grupo/ramo.
 * Prioridade: conta do ramo → conta do grupo (sem ramo).
 * Sem tag = null → usar PIX Sicredi.
 */
export async function resolveInfinitePayHandle(
  empresaId: number,
  ramoId?: number | null,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('empresa_conta_bancaria')
    .select('id, ramo_id, infinitepay_handle')
    .eq('empresa_id', empresaId)
    .order('id', { ascending: true })

  if (error || !data?.length) return null

  const list = data as {
    id: number
    ramo_id: number | null
    infinitepay_handle: string | null
  }[]

  const candidatos =
    ramoId != null
      ? [
          ...list.filter((c) => c.ramo_id === ramoId),
          ...list.filter((c) => c.ramo_id == null),
        ]
      : list.filter((c) => c.ramo_id == null)

  for (const row of candidatos) {
    const handle = normalizeInfinitePayHandle(row.infinitepay_handle ?? '')
    if (handle) return handle
  }
  return null
}
