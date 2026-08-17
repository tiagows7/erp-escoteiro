import { useEffect, useState } from 'react'

const DISMISS_KEY = 'erp-escoteiro:pwa-install-dismissed'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  )
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Banner para instalar o app na tela inicial (PWA).
 * Android/Chrome: usa beforeinstallprompt.
 * iOS Safari: mostra instrução (Compartilhar → Adicionar à Tela de Início).
 */
export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  )
  const [visible, setVisible] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return
    } catch {
      /* ignore */
    }

    if (isIos()) {
      setIosHint(true)
      setVisible(true)
      return
    }

    function onBeforeInstall(e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
    }
  }, [])

  function dismiss() {
    setVisible(false)
    setDeferred(null)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    const choice = await deferred.userChoice
    setDeferred(null)
    setVisible(false)
    if (choice.outcome === 'accepted') {
      try {
        localStorage.setItem(DISMISS_KEY, '1')
      } catch {
        /* ignore */
      }
    }
  }

  if (!visible) return null

  return (
    <div className="pwa-install-banner" role="region" aria-label="Instalar app">
      <div className="pwa-install-banner-text">
        <strong>Instalar na tela inicial</strong>
        {iosHint ? (
          <span>
            No Safari: toque em <em>Compartilhar</em> e depois em{' '}
            <em>Adicionar à Tela de Início</em>.
          </span>
        ) : (
          <span>Use o ERP Escoteiro como app, sem abrir o navegador.</span>
        )}
      </div>
      <div className="pwa-install-banner-actions">
        {!iosHint && deferred ? (
          <button type="button" className="btn btn-primary" onClick={() => void install()}>
            Instalar
          </button>
        ) : null}
        <button type="button" className="btn btn-soft" onClick={dismiss}>
          Agora não
        </button>
      </div>
    </div>
  )
}
