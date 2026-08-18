import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { formatMoney } from '@/lib/receitas'
import {
  checkPixEfiStatus,
  createPixEfiCobranca,
  type PixEfiCobrancaResumo,
} from '@/lib/pixEfi'

type Props = {
  open: boolean
  cobrancaId: number | null
  titulo: string
  valor: number
  onClose: () => void
  onPaid: () => void
}

export function PixEfiCheckoutModal({
  open,
  cobrancaId,
  titulo,
  valor,
  onClose,
  onPaid,
}: Props) {
  const [phase, setPhase] = useState<
    'idle' | 'creating' | 'waiting' | 'paid' | 'error'
  >('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [cobranca, setCobranca] = useState<PixEfiCobrancaResumo | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const startedFor = useRef<number | null>(null)
  const paidNotified = useRef(false)
  const onPaidRef = useRef(onPaid)
  onPaidRef.current = onPaid

  useEffect(() => {
    if (!open || cobrancaId == null) {
      setPhase('idle')
      setMessage(null)
      setCobranca(null)
      setQrDataUrl(null)
      setCopied(false)
      startedFor.current = null
      paidNotified.current = false
      return
    }

    if (startedFor.current === cobrancaId) return
    startedFor.current = cobrancaId

    let cancelled = false
    void (async () => {
      setPhase('creating')
      setMessage(null)
      setCobranca(null)
      setQrDataUrl(null)

      const created = await createPixEfiCobranca(cobrancaId)
      if (cancelled) return
      if (!created.ok || !created.cobranca) {
        setPhase('error')
        setMessage(created.error ?? 'Falha ao gerar PIX.')
        return
      }
      setCobranca(created.cobranca)
      setPhase('waiting')
    })()

    return () => {
      cancelled = true
    }
  }, [open, cobrancaId])

  useEffect(() => {
    if (!open || phase !== 'waiting' || !cobranca?.pix_copia_e_cola) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    void QRCode.toDataURL(cobranca.pix_copia_e_cola, {
      width: 240,
      margin: 2,
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [open, phase, cobranca?.pix_copia_e_cola])

  useEffect(() => {
    if (!open || phase !== 'waiting' || !cobranca?.id) return

    let stopped = false
    async function tick() {
      if (stopped || !cobranca?.id) return
      const res = await checkPixEfiStatus(cobranca.id)
      if (stopped) return
      if (!res.ok) {
        setMessage(res.error ?? null)
        return
      }
      if (res.cobranca) setCobranca(res.cobranca)
      if (res.paid) {
        setPhase('paid')
        if (!paidNotified.current) {
          paidNotified.current = true
          onPaidRef.current()
        }
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), 4000)
    return () => {
      stopped = true
      window.clearInterval(id)
    }
  }, [open, phase, cobranca?.id])

  if (!open || cobrancaId == null) return null

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
        aria-labelledby="pix-efi-title"
      >
        <header className="pix-sicredi-modal-header">
          <div>
            <h3 id="pix-efi-title">
              {phase === 'paid'
                ? 'Pagamento confirmado'
                : phase === 'error'
                  ? 'Pagamento não concluído'
                  : titulo}
            </h3>
            <p className="muted">PIX Efí · {formatMoney(valor)}</p>
          </div>
          {phase !== 'paid' && phase !== 'error' ? (
            <button type="button" className="btn btn-soft" onClick={onClose}>
              Fechar
            </button>
          ) : null}
        </header>

        {phase === 'creating' ? (
          <p className="loading">Gerando cobrança PIX na Efí…</p>
        ) : null}

        {phase === 'error' ? (
          <div className="pix-sicredi-status is-error">
            <p>{message || 'Não foi possível gerar o PIX Efí.'}</p>
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
              Escaneie o QR Code ou use o Pix Copia e Cola. A baixa ocorre após
              confirmação da Efí.
            </p>
            {qrDataUrl ? (
              <img
                className="pix-sicredi-qr"
                src={qrDataUrl}
                alt="QR Code PIX"
              />
            ) : (
              <div className="loading">Montando QR Code…</div>
            )}
            <textarea
              className="input"
              readOnly
              rows={4}
              value={cobranca.pix_copia_e_cola ?? ''}
            />
            <div className="actions-pair" style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void copyPix()}
              >
                {copied ? 'Copiado!' : 'Copiar Pix'}
              </button>
              <button type="button" className="btn btn-soft" onClick={onClose}>
                Fechar
              </button>
            </div>
            {message ? <p className="muted">{message}</p> : null}
          </div>
        ) : null}

        {phase === 'paid' ? (
          <div className="pix-sicredi-status is-ok">
            <p>Pagamento confirmado e cobrança baixada.</p>
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
