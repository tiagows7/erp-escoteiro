import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'

const PREFIX = 'erp.formDraft.v1:'

function readDraft<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeDraft(key: string, value: unknown) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // quota / private mode
  }
}

function removeDraft(key: string) {
  try {
    sessionStorage.removeItem(PREFIX + key)
  } catch {
    /* ignore */
  }
}

/**
 * Remove rascunhos de um recurso na empresa.
 * Ex.: resourcePrefix "receita" apaga `1:receita:novo` e `1:receita?x=1:novo`.
 */
export function clearFormDraftsForResource(
  empresaId: number,
  resourcePrefix: string,
  record: 'novo' | 'all' = 'novo',
) {
  try {
    const toRemove: string[] = []
    const recordPart = record === 'novo' ? 'novo' : '[^:]+'
    const re = new RegExp(
      `^${empresaId}:${resourcePrefix}(\\?[^:]*)?:${recordPart}$`,
    )
    for (let i = 0; i < sessionStorage.length; i++) {
      const full = sessionStorage.key(i)
      if (!full?.startsWith(PREFIX)) continue
      const key = full.slice(PREFIX.length)
      if (re.test(key)) toRemove.push(full)
    }
    for (const full of toRemove) sessionStorage.removeItem(full)
  } catch {
    /* ignore */
  }
}

export type PersistedFormApi<T> = {
  /** Aplica dados do servidor só se não houver rascunho local. */
  hydrateFromServer: (server: T) => void
  /**
   * Remove o rascunho (chamar após salvar com sucesso).
   * Se `next` for passado, também reseta o formulário sem marcar dirty
   * (útil quando a tela permanece montada, ex.: recibo).
   */
  clearDraft: (next?: T) => void
  /** True se um rascunho foi restaurado ao montar. */
  restored: boolean
}

/**
 * Mantém o estado do formulário em sessionStorage enquanto a aba estiver aberta.
 * Só grava após alteração do usuário (não sobrescreve carga do servidor).
 * Passe `storageKey = null` para desligar a persistência (ex.: formulário "novo").
 */
export function usePersistedFormState<T>(
  storageKey: string | null,
  initial: T,
): [T, Dispatch<SetStateAction<T>>, PersistedFormApi<T>] {
  const keyRef = useRef(storageKey)
  keyRef.current = storageKey

  const restoredRef = useRef<T | null>(
    storageKey ? readDraft<T>(storageKey) : null,
  )
  const dirtyRef = useRef(restoredRef.current != null)

  const [form, setFormState] = useState<T>(
    () => restoredRef.current ?? initial,
  )

  const setForm = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    dirtyRef.current = true
    setFormState(action)
  }, [])

  useEffect(() => {
    if (!storageKey || !dirtyRef.current) return
    const timer = window.setTimeout(() => {
      // Revalida: clearDraft pode ter rodado enquanto o timer estava pendente.
      if (!dirtyRef.current || keyRef.current !== storageKey) return
      writeDraft(storageKey, form)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [storageKey, form])

  const hydrateFromServer = useCallback((server: T) => {
    if (restoredRef.current != null) return
    setFormState(server)
  }, [])

  const clearDraft = useCallback((next?: T) => {
    const key = keyRef.current
    if (key) removeDraft(key)
    restoredRef.current = null
    dirtyRef.current = false
    if (next !== undefined) {
      setFormState(next)
    }
  }, [])

  return [
    form,
    setForm,
    {
      hydrateFromServer,
      clearDraft,
      restored: restoredRef.current != null,
    },
  ]
}

/** Chave estável por empresa + recurso + id (ou "novo"). */
export function formDraftKey(
  empresaId: number | null | undefined,
  resource: string,
  id: string | undefined,
): string | null {
  if (empresaId == null) return null
  const record = !id || id === 'novo' ? 'novo' : id
  return `${empresaId}:${resource}:${record}`
}
