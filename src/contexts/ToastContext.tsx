import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ToastTone = 'success' | 'error' | 'info'

type ToastItem = {
  id: number
  tone: ToastTone
  title: string
  message?: string
}

type ConfirmOptions = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ToastContextValue = {
  push: (tone: ToastTone, title: string, message?: string) => void
  success: (title: string, message?: string) => void
  error: (title: string, message?: string) => void
  info: (title: string, message?: string) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (value: boolean) => void }) | null
  >(null)
  const idRef = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const push = useCallback(
    (tone: ToastTone, title: string, message?: string) => {
      const id = idRef.current++
      setToasts((prev) => [...prev, { id, tone, title, message }])
      window.setTimeout(() => dismiss(id), 4200)
    },
    [dismiss],
  )

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve })
    })
  }, [])

  const success = useCallback(
    (title: string, message?: string) => push('success', title, message),
    [push],
  )
  const error = useCallback(
    (title: string, message?: string) => push('error', title, message),
    [push],
  )
  const info = useCallback(
    (title: string, message?: string) => push('info', title, message),
    [push],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success,
      error,
      info,
      confirm,
    }),
    [push, success, error, info, confirm],
  )

  function closeConfirm(result: boolean) {
    confirmState?.resolve(result)
    setConfirmState(null)
  }

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.tone}`}
            role="status"
          >
            <span className="toast-icon" aria-hidden="true" />
            <div className="toast-body">
              <strong>{toast.title}</strong>
              {toast.message ? <p>{toast.message}</p> : null}
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Fechar"
              onClick={() => dismiss(toast.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {confirmState ? (
        <div className="confirm-overlay" role="presentation">
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
          >
            <div
              className={`confirm-icon${confirmState.danger ? ' danger' : ''}`}
              aria-hidden="true"
            />
            <h3 id="confirm-title">{confirmState.title}</h3>
            <p id="confirm-message">{confirmState.message}</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => closeConfirm(false)}
              >
                {confirmState.cancelLabel ?? 'Não'}
              </button>
              <button
                type="button"
                className={`btn ${confirmState.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => closeConfirm(true)}
                autoFocus
              >
                {confirmState.confirmLabel ?? 'Sim'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de ToastProvider')
  return ctx
}
