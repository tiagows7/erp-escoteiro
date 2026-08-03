import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { formatMoney } from '@/lib/receitas'
import {
  checkPixSicrediStatus,
  createPixSicrediCobranca,
  type PixCreateInput,
  type PixCobrancaResumo,
} from '@/lib/pixSicredi'
import { mensagemPixCopiaCola, openWhatsApp } from '@/lib/whatsapp'

type Props = {
  open: boolean
  title: string
  input: PixCreateInput | null
  onClose: () => void
  onPaid: () => void
}

function paymentKey(input: PixCreateInput): string {
  return [
    input.empresaId,
    input.tipo,
    input.valor,
    input.atividadeId ?? '',
    (input.receitaIds ?? []).join(','),
  ].join('|')
}

export function PixSicrediCheckoutModal({
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

    const key = paymentKey(input)

    // Já temos cobrança/resultado desta sessão — não recria.
    if (readyKeyRef.current === key) return

    // Já existe geração em andamento para a mesma chave.
    if (sessionKeyRef.current === key) return
    sessionKeyRef.current = key

    let cancelled = false

    void (async () => {
      setPhase('creating')
      setMessage(null)
      setCobranca(null)
      setQrDataUrl(null)

      const created = await createPixSicrediCobranca(input)
      if (cancelled) {
        // Permite nova tentativa se o efeito foi cancelado no meio.
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
      // Se ainda não ficou pronto, libera para o próximo efeito reiniciar.
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
    if (!open || phase !== 'waiting' || !cobranca?.id) return

    let stopped = false
    const tick = async () => {
      const result = await checkPixSicrediStatus(cobranca.id)
      if (stopped) return
      if (!result.ok) {
        setPhase('error')
        setMessage(
          result.error ||
            'Não foi possível confirmar o pagamento no Sicredi. Tente novamente.',
        )
        return
      }

      setCobranca(result.cobranca)
      if (result.paid) {
        setPhase('paid')
        setMessage(
          'Pagamento confirmado pelo Sicredi. A baixa da mensalidade foi registrada.',
        )
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
        aria-labelledby="pix-sicredi-title"
      >
        <header className="pix-sicredi-modal-header">
          <div>
            <h3 id="pix-sicredi-title">
              {phase === 'paid'
                ? 'Pagamento confirmado'
                : phase === 'error'
                  ? 'Pagamento não concluído'
                  : title}
            </h3>
            <p className="muted">PIX Sicredi · {formatMoney(input.valor)}</p>
          </div>
          {phase !== 'paid' && phase !== 'error' ? (
            <button type="button" className="btn btn-soft" onClick={onClose}>
              Fechar
            </button>
          ) : null}
        </header>

        {phase === 'creating' ? (
          <p className="loading">Gerando cobrança PIX no Sicredi…</p>
        ) : null}

        {phase === 'error' ? (
          <div className="pix-sicredi-status is-error">
            <p>
              {message ||
                'Ocorreu um erro no pagamento PIX. Verifique e tente novamente.'}
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
              Escaneie o QR Code no app do banco ou use o Pix Copia e Cola. A
              baixa só ocorre após confirmação do Sicredi.
            </p>

            {qrDataUrl ? (
              <div className="pix-sicredi-qr-wrap">
                <img
                  className="pix-sicredi-qr"
                  src={qrDataUrl}
                  alt="QR Code PIX"
                  width={240}
                  height={240}
                />
              </div>
            ) : null}

            {cobranca.pix_copia_e_cola ? (
              <>
                <textarea
                  className="input pix-sicredi-code"
                  readOnly
                  rows={4}
                  value={cobranca.pix_copia_e_cola}
                />
                <div className="pix-sicredi-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void copyPix()}
                  >
                    {copied ? 'Código copiado!' : 'Copiar Pix Copia e Cola'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-soft"
                    onClick={() =>
                      openWhatsApp({
                        text: mensagemPixCopiaCola({
                          titulo: title,
                          valor: formatMoney(input.valor),
                          pixCopiaECola: cobranca.pix_copia_e_cola!,
                        }),
                      })
                    }
                  >
                    Enviar no WhatsApp
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">
                Cobrança criada (txid {cobranca.txid}), mas o Sicredi ainda não
                devolveu o Pix Copia e Cola. Aguarde ou tente novamente.
              </p>
            )}
            <p className="pix-sicredi-poll muted">
              Aguardando pagamento… status: {cobranca.status || 'ATIVA'}
            </p>
          </div>
        ) : null}

        {phase === 'paid' ? (
          <div className="pix-sicredi-status is-ok">
            <p>
              {message ??
                'Pagamento confirmado pelo Sicredi. A baixa foi registrada.'}
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
      </div>
    </div>
  )
}
