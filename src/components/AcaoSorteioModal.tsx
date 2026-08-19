import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export type SorteioGanhador = {
  premio?: number
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
  runSorteio: () => Promise<SorteioGanhador | SorteioGanhador[]>
  onClose: () => void
  onDone?: (ganhadores: SorteioGanhador[]) => void
}

const MENSAGENS = [
  'Preparando o sorteio…',
  'Embaralhando os números vendidos…',
  'Conferindo a lista de compradores…',
  'Quase lá…',
  'Sorteando o(s) ganhador(es)…',
] as const

function mensagemParaSegundos(sec: number, from: number): string {
  const progress = 1 - sec / from
  const idx = Math.min(
    MENSAGENS.length - 1,
    Math.floor(progress * MENSAGENS.length),
  )
  return MENSAGENS[idx]
}

function normalizeGanhadores(
  value: SorteioGanhador | SorteioGanhador[],
): SorteioGanhador[] {
  const list = Array.isArray(value) ? value : [value]
  return list
    .filter((g) => g && Number.isFinite(g.numero))
    .map((g, i) => ({
      ...g,
      premio: g.premio ?? i + 1,
    }))
    .sort((a, b) => (a.premio ?? 0) - (b.premio ?? 0))
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
  const [ganhadores, setGanhadores] = useState<SorteioGanhador[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return

    setPhase('countdown')
    setSeconds(countdownFrom)
    setGanhadores([])
    setError(null)
    setPending(false)

    let cancelled = false
    let result: SorteioGanhador[] | null = null
    let fail: string | null = null

    void (async () => {
      try {
        const raw = await runSorteio()
        result = normalizeGanhadores(raw)
        if (!cancelled) setPending(true)
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
          const started = Date.now()
          while (!cancelled && !result && !fail && Date.now() - started < 15000) {
            await new Promise((r) => setTimeout(r, 120))
          }
          if (cancelled) return
          if (fail || !result || result.length === 0) {
            setError(fail ?? 'Não foi possível concluir o sorteio.')
            setPhase('error')
            return
          }
          setGanhadores(result)
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

  const multi = ganhadores.length > 1

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

        {phase === 'reveal' && ganhadores.length > 0 ? (
          <>
            <p className="acao-sorteio-eyebrow">
              {multi ? 'Ganhadores' : 'Ganhador'}
            </p>
            <div className="acao-sorteio-lista">
              {ganhadores.map((g) => (
                <div key={`${g.premio}-${g.numero}`} className="acao-sorteio-item">
                  {multi ? (
                    <p className="acao-sorteio-premio">{g.premio}º prêmio</p>
                  ) : null}
                  <div className="acao-sorteio-numero">{g.numero}</div>
                  <strong className="acao-sorteio-nome">
                    {g.nome.trim() || 'Comprador não informado'}
                  </strong>
                  <p className="acao-sorteio-fone">
                    {g.telefone.trim()
                      ? g.telefone
                      : 'Telefone não informado'}
                  </p>
                </div>
              ))}
            </div>
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
