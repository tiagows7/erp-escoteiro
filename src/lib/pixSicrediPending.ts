import type { PixCobrancaResumo, PixCreateInput } from '@/lib/pixSicredi'

const STORAGE_KEY = 'erp-escoteiro:pix-sicredi-pending'
const MAX_AGE_MS = 2 * 60 * 60 * 1000

export type PixPendingSession = {
  title: string
  input: PixCreateInput
  cobranca: PixCobrancaResumo
  savedAt: number
}

export function pixPaymentKey(input: PixCreateInput): string {
  const itensKey =
    input.tipo === 'loja'
      ? (input.lojaItens ?? [])
          .map((i) => `${i.produto_id}:${i.quantidade}`)
          .join(',')
      : ''
  return [
    input.empresaId,
    input.tipo,
    input.valor,
    input.atividadeId ?? '',
    (input.receitaIds ?? []).join(','),
    input.tipopagtoId ?? '',
    itensKey,
  ].join('|')
}

export function savePixPending(session: {
  title: string
  input: PixCreateInput
  cobranca: PixCobrancaResumo
}): void {
  try {
    const payload: PixPendingSession = {
      ...session,
      savedAt: Date.now(),
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadPixPending(): PixPendingSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PixPendingSession
    if (!parsed?.input || !parsed?.cobranca?.id) {
      clearPixPending()
      return null
    }
    if (
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > MAX_AGE_MS
    ) {
      clearPixPending()
      return null
    }
    return parsed
  } catch {
    clearPixPending()
    return null
  }
}

export function clearPixPending(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function loadPixPendingForEmpresa(
  empresaId: number,
  tipos: PixCreateInput['tipo'][],
): PixPendingSession | null {
  const pending = loadPixPending()
  if (!pending) return null
  if (pending.input.empresaId !== empresaId) return null
  if (!tipos.includes(pending.input.tipo)) return null
  return pending
}
