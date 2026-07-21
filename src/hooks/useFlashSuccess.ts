import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useToast } from '@/contexts/ToastContext'

export type FlashLocationState = {
  flashSuccess?: string
}

/**
 * Lê mensagem de sucesso via navigate state, exibe toast
 * e retorna um contador para recarregar listas quando necessário.
 */
export function useFlashSuccess() {
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const [tick, setTick] = useState(0)
  const handledRef = useRef<string | null>(null)

  useEffect(() => {
    const flash = (location.state as FlashLocationState | null)?.flashSuccess
    if (!flash) return

    // Evita toast duplicado (React Strict Mode remonta o effect)
    const token = `${location.key}::${flash}`
    if (handledRef.current === token) return
    handledRef.current = token

    toast.success('Pronto!', flash)
    setTick((n) => n + 1)
    navigate(location.pathname + location.search, { replace: true, state: {} })
  }, [
    location.state,
    location.pathname,
    location.search,
    location.key,
    navigate,
    toast,
  ])

  return tick
}
