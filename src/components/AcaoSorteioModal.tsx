import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export type SorteioGanhador = {
  numero: number
  nome: string
  telefone: string
}

type Phase = 'countdown' | 'reveal' | 'error'

type Props = {
  open: boolean
  acaoNome?: string
  countdownFrom?: number
  /** Inicia o sorteio (RPC). Resolvido durante a contagem. */
  runSorteio: () => Promise<SorteioGanhador>
  onClose: () => void
  onDone?: (ganhador: SorteioGanhador) => void
}

const MENSAGENS = [
  'Preparando o sorteio…',
  'Embaralhando os números vendidos…',
  'Conferindo a lista de compradores…',
  'Quase lá…',
  'Sorteando o ganhador…',
] as const

function mensagemParaSegundos(sec: number, from: number): string {
  const progress = 1 - sec / from
  const idx = Math.min(
    MENSAGENS.length - 1,
    Math.floor(progress * MENSAGENS.length),
  )
  return MENSAGENS[idx]
}

export function AcaoSorteioModal({
  open,
  acaoNome,
  countdownFrom = 10,
  runSorteio,
  onClose,
  onDone,
}: Props) {
  const [phase, setPhase] = useState<Phase>('countdown')
  const [seconds, setSeconds] = useState(countdownFrom)
  const [ganhador, setGanhador] = useState<SorteioGanhador | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<SorteioGanhador | null>(null)

  useEffect(() => {
    if (!open) return

    setPhase('countdown')
    setSeconds(countdownFrom)
    setGanhador(null)
    setError(null)
    setPending(null)

    let cancelled = false
    let result: SorteioGanhador | null = null
    let fail: string | null = null

    void (async () => {
      try {
        result = await runSorteio()
        if (!cancelled) setPending(result)
      } catch (e) {
        fail = e instanceof Error ? e.message : 'Falha no sorteio.'
        if (!cancelled) setError(fail)
      }
    })()

    let left = countdownFrom
    const timer = window.setInterval(() => {
      left -= 1
      if (cancelled) return
      setSeconds(left)
      if (left <= 0) {
        window.clearInterval(timer)
        void (async () => {
          // espera resultado se ainda estiver carregando
          const started = Date.now()
          while (!cancelled && !result && !fail && Date.now() - started < 15000) {
            await new Promise((r) => setTimeout(r, 120))
          }
          if (cancelled) return
          if (fail || !result) {
            setError(fail ?? 'Não foi possível concluir o sorteio.')
            setPhase('error')
            return
          }
          setGanhador(result)
          setPhase('reveal')
          onDone?.(result)
        })()
      }
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per open
  }, [open, countdownFrom])

  if (!open) return null

  return createPortal(
    <div className="waiting-overlay acao-sorteio-overlay" role="dialog" aria-modal="true">
      <div className="waiting-dialog acao-sorteio-dialog">
        {phase === 'countdown' ? (
          <>
            <div className="acao-sorteio-countdown" aria-live="polite">
              {seconds}
            </div>
            <strong>Aguarde o sorteio</strong>
            <p>
              {acaoNome
                ? `Sorteando a ação “${acaoNome}”…`
                : 'Sorteando entre os números vendidos…'}
            </p>
            <p className="waiting-detail">
              {mensagemParaSegundos(seconds, countdownFrom)}
            </p>
            {pending ? (
              <p className="muted" style={{ marginTop: '0.85rem', fontSize: '0.82rem' }}>
                Resultado pronto — revelando em instantes…
              </p>
            ) : null}
          </>
        ) : null}

        {phase === 'reveal' && ganhador ? (
          <>
            <p className="acao-sorteio-eyebrow">Ganhador</p>
            <div className="acao-sorteio-numero">{ganhador.numero}</div>
            <strong className="acao-sorteio-nome">
              {ganhador.nome.trim() || 'Comprador não informado'}
            </strong>
            <p className="acao-sorteio-fone">
              {ganhador.telefone.trim()
                ? ganhador.telefone
                : 'Telefone não informado'}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: '1.1rem' }}
              onClick={onClose}
            >
              Fechar
            </button>
          </>
        ) : null}

        {phase === 'error' ? (
          <>
            <strong>Não foi possível sortear</strong>
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-soft"
              style={{ marginTop: '1rem' }}
              onClick={onClose}
            >
              Fechar
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
