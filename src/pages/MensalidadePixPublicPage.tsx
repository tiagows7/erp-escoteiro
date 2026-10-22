import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { AlertMessage } from '@/components/AlertMessage'
import { formatMoney } from '@/lib/receitas'
import {
  fetchMensalidadePixPublic,
  type MensalidadePixPublic,
} from '@/lib/mensalidadePixPublic'

export function MensalidadePixPublicPage() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)
  const [cobranca, setCobranca] = useState<MensalidadePixPublic | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function load(quiet = false) {
    if (!token.trim()) {
      setError('Link inválido.')
      setLoading(false)
      return
    }
    if (!quiet) setLoading(true)
    const res = await fetchMensalidadePixPublic(token)
    if (!res.ok) {
      setError(res.error)
      setCobranca(null)
      if (!quiet) setLoading(false)
      return
    }
    setError(null)
    setPaid(res.paid)
    setCobranca(res.cobranca)
    if (!quiet) setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    const code = cobranca?.pix_copia_e_cola?.trim()
    if (!code || paid) {
      setQrDataUrl(null)
      return
    }
    let cancelled = false
    void QRCode.toDataURL(code, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [cobranca?.pix_copia_e_cola, paid])

  useEffect(() => {
    if (paid || !cobranca?.id) return
    let stopped = false
    const tick = () => {
      if (stopped || document.visibilityState === 'hidden') return
      void load(true)
    }
    const id = window.setInterval(tick, 8000)
    const onResume = () => tick()
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('focus', onResume)
    return () => {
      stopped = true
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onResume)
      window.removeEventListener('focus', onResume)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paid, cobranca?.id, token])

  async function copyPix() {
    const code = cobranca?.pix_copia_e_cola
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Não foi possível copiar o código PIX.')
    }
  }

  if (loading) {
    return (
      <div className="public-rifa-page">
        <div className="loading">Carregando cobrança PIX…</div>
      </div>
    )
  }

  if (!cobranca) {
    return (
      <div className="public-rifa-page">
        <section className="panel">
          <AlertMessage tone="error" title="Link inválido">
            {error ?? 'Esta cobrança de mensalidade não está disponível.'}
          </AlertMessage>
          <Link className="btn btn-soft" to="/login">
            Ir para o login
          </Link>
        </section>
      </div>
    )
  }

  return (
    <div className="public-rifa-page">
      <header className="public-rifa-header">
        <p className="muted">Pagamento de mensalidade</p>
        <h1>
          {paid ? 'Pagamento confirmado' : 'Pagar com PIX'}
        </h1>
        <p>
          {cobranca.descricao?.trim() || 'Mensalidade'} ·{' '}
          <strong>{formatMoney(cobranca.valor)}</strong>
        </p>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}

      <section className="panel">
        {paid ? (
          <div className="pix-sicredi-status is-ok">
            <p>
              Pagamento confirmado. A baixa da mensalidade foi registrada
              automaticamente.
            </p>
            <Link className="btn btn-primary" to="/login" style={{ marginTop: '1rem' }}>
              Ir para o login
            </Link>
          </div>
        ) : (
          <div className="pix-sicredi-waiting">
            <p>
              Escaneie o QR Code no app do banco ou use o Pix Copia e Cola. A
              baixa ocorre automaticamente após a confirmação do pagamento.
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
                </div>
              </>
            ) : (
              <p className="muted">
                Cobrança sem código PIX. Peça um novo link ao grupo.
              </p>
            )}

            <p className="pix-sicredi-poll muted">
              Aguardando pagamento… status: {cobranca.status || 'ATIVA'}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
