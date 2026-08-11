import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { formatMoney } from '@/lib/receitas'
import type { PixCobrancaResumo } from '@/lib/pixSicredi'
import {
  checkPixSicrediPublicStatus,
  createPixSicrediPublicAcao,
  pixPublicPaymentKey,
  type PixPublicAcaoInput,
} from '@/lib/pixSicrediPublic'

type Props = {
  open: boolean
  title: string
  input: PixPublicAcaoInput | null
  onClose: () => void
  onPaid: () => void
}

export function PixSicrediPublicCheckoutModal({
  open,
  title,
  input,
  onClose,
  onPaid,
}: Props) {
  const [phase, setPhase] = useState<
    'idle' | 'creating' | 'waiting' | 'paid' | 'error'
  >('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [cobranca, setCobranca] = useState<PixCobrancaResumo | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const sessionKeyRef = useRef<string | null>(null)
  const readyKeyRef = useRef<string | null>(null)
  const paidNotified = useRef(false)
  const onPaidRef = useRef(onPaid)
  onPaidRef.current = onPaid

  useEffect(() => {
    if (!open || !input) {
      setPhase('idle')
      setMessage(null)
      setCobranca(null)
      setQrDataUrl(null)
      setCopied(false)
      sessionKeyRef.current = null
      readyKeyRef.current = null
      paidNotified.current = false
      return
    }

    const key = pixPublicPaymentKey(input)
    if (readyKeyRef.current === key) return
    if (sessionKeyRef.current === key) return
    sessionKeyRef.current = key

    let cancelled = false
    void (async () => {
      setPhase('creating')
      setMessage(null)
      setCobranca(null)
      setQrDataUrl(null)

      const created = await createPixSicrediPublicAcao(input)
      if (cancelled) {
        if (sessionKeyRef.current === key && readyKeyRef.current !== key) {
          sessionKeyRef.current = null
        }
        return
      }

      if (!created.ok) {
        readyKeyRef.current = key
        setPhase('error')
        setMessage(created.error)
        return
      }

      readyKeyRef.current = key
      setCobranca(created.cobranca)
      setPhase('waiting')
    })()

    return () => {
      cancelled = true
      if (readyKeyRef.current !== key && sessionKeyRef.current === key) {
        sessionKeyRef.current = null
      }
    }
  }, [open, input])

  useEffect(() => {
    const code = cobranca?.pix_copia_e_cola?.trim()
    if (!code) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    void QRCode.toDataURL(code, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [cobranca?.pix_copia_e_cola])

  useEffect(() => {
    if (!open || phase !== 'waiting' || !cobranca?.id || !input) return

    let stopped = false
    const cobrancaId = cobranca.id
    const token = input.linkToken

    const tick = async () => {
      const result = await checkPixSicrediPublicStatus(cobrancaId, token)
      if (stopped) return
      if (!result.ok) {
        setMessage(result.error)
        return
      }

      setMessage(null)
      setCobranca(result.cobranca)

      if (result.paid) {
        setPhase('paid')
        setMessage('Pagamento confirmado. Seus números foram reservados.')
        if (!paidNotified.current) {
          paidNotified.current = true
          onPaidRef.current()
        }
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), 4000)

    const onResume = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)
    window.addEventListener('pageshow', onResume)

    return () => {
      stopped = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('focus', onResume)
      window.removeEventListener('pageshow', onResume)
    }
  }, [open, phase, cobranca?.id, input])

  if (!open || !input) return null

  async function copyPix() {
    const code = cobranca?.pix_copia_e_cola
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setMessage('Não foi possível copiar o código PIX.')
    }
  }

  return (
    <div className="confirm-overlay" role="presentation">
      <div
        className="confirm-dialog pix-sicredi-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pix-public-title"
      >
        <header className="pix-sicredi-modal-header">
          <div>
            <h3 id="pix-public-title">
              {phase === 'paid'
                ? 'Pagamento confirmado'
                : phase === 'error'
                  ? 'Pagamento não concluído'
                  : title}
            </h3>
            <p className="muted">PIX · {formatMoney(input.valor)}</p>
          </div>
          {phase !== 'paid' && phase !== 'error' ? (
            <button type="button" className="btn btn-soft" onClick={onClose}>
              Fechar
            </button>
          ) : null}
        </header>

        {phase === 'creating' ? (
          <p className="loading">Gerando cobrança PIX…</p>
        ) : null}

        {phase === 'error' ? (
          <div className="pix-sicredi-status is-error">
            <p>
              {message ||
                'Não foi possível gerar o PIX. Verifique e tente novamente.'}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onClose}
              style={{ marginTop: '1rem' }}
            >
              OK
            </button>
          </div>
        ) : null}

        {phase === 'waiting' && cobranca ? (
          <div className="pix-sicredi-waiting">
            <p>
              Escaneie o QR Code ou use o Pix Copia e Cola. Os números só são
              gravados após a confirmação do pagamento.
            </p>
            {message ? <p className="muted">{message}</p> : null}
            {qrDataUrl ? (
              <img
                className="pix-sicredi-qr"
                src={qrDataUrl}
                alt="QR Code PIX"
              />
            ) : null}
            {cobranca.pix_copia_e_cola ? (
              <div className="pix-sicredi-copia">
                <textarea
                  className="input"
                  readOnly
                  rows={3}
                  value={cobranca.pix_copia_e_cola}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void copyPix()}
                >
                  {copied ? 'Copiado!' : 'Copiar Pix Copia e Cola'}
                </button>
              </div>
            ) : (
              <p className="muted">Aguardando código PIX…</p>
            )}
            <p className="field-hint">
              Números: {input.numeros.join(', ')} · Aguardando confirmação…
            </p>
          </div>
        ) : null}

        {phase === 'paid' ? (
          <div className="pix-sicredi-status is-ok">
            <p>{message || 'Pagamento confirmado.'}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onClose}
              style={{ marginTop: '1rem' }}
            >
              OK
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
