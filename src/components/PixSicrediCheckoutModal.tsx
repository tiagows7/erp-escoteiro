import { useEffect, useRef, useState } from 'react'
import { formatMoney } from '@/lib/receitas'
import {
  checkPixSicrediStatus,
  createPixSicrediCobranca,
  getPixSicrediConfig,
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

export function PixSicrediCheckoutModal({
  open,
  title,
  input,
  onClose,
  onPaid,
}: Props) {
  const [phase, setPhase] = useState<
    'idle' | 'checking' | 'creating' | 'waiting' | 'paid' | 'error'
  >('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [cobranca, setCobranca] = useState<PixCobrancaResumo | null>(null)
  const [copied, setCopied] = useState(false)
  const startedKey = useRef<string | null>(null)
  const paidNotified = useRef(false)

  useEffect(() => {
    if (!open || !input) {
      setPhase('idle')
      setMessage(null)
      setCobranca(null)
      setCopied(false)
      startedKey.current = null
      paidNotified.current = false
      return
    }

    const key = [
      input.tipo,
      input.valor,
      input.atividadeId ?? '',
      (input.receitaIds ?? []).join(','),
    ].join('|')

    if (startedKey.current === key) return
    startedKey.current = key

    let cancelled = false

    void (async () => {
      setPhase('checking')
      setMessage(null)

      const cfg = await getPixSicrediConfig({
        empresaId: input.empresaId,
        tipo: input.tipo,
        atividadeId: input.atividadeId,
      })
      if (cancelled) return

      if (!cfg.configured) {
        setPhase('error')
        setMessage(
          cfg.message ||
            'PIX Sicredi não configurado. Cadastre as credenciais na ficha do grupo (mensalidades) ou por ramo (atividades).',
        )
        return
      }

      setPhase('creating')
      const created = await createPixSicrediCobranca(input)
      if (cancelled) return

      if (!created.ok) {
        setPhase('error')
        setMessage(created.error)
        return
      }

      setCobranca(created.cobranca)
      setPhase('waiting')
    })()

    return () => {
      cancelled = true
    }
  }, [open, input])

  useEffect(() => {
    if (!open || phase !== 'waiting' || !cobranca?.id) return

    let stopped = false
    const tick = async () => {
      const result = await checkPixSicrediStatus(cobranca.id)
      if (stopped) return
      if (!result.ok) {
        setMessage(result.error)
        return
      }

      setCobranca(result.cobranca)
      if (result.paid) {
        setPhase('paid')
        setMessage('Pagamento confirmado pelo Sicredi. Baixa registrada.')
        if (!paidNotified.current) {
          paidNotified.current = true
          onPaid()
        }
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), 4000)
    return () => {
      stopped = true
      window.clearInterval(id)
    }
  }, [open, phase, cobranca?.id, onPaid])

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
    <div className="confirm-overlay" role="presentation" onClick={onClose}>
      <div
        className="confirm-dialog pix-sicredi-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pix-sicredi-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pix-sicredi-modal-header">
          <div>
            <h3 id="pix-sicredi-title">{title}</h3>
            <p className="muted">PIX Sicredi · {formatMoney(input.valor)}</p>
          </div>
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Fechar
          </button>
        </header>

        {phase === 'checking' || phase === 'creating' ? (
          <p className="loading">
            {phase === 'checking'
              ? 'Verificando integração Sicredi…'
              : 'Gerando cobrança PIX no Sicredi…'}
          </p>
        ) : null}

        {phase === 'error' ? (
          <div className="pix-sicredi-status is-error">
            <p>{message}</p>
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              Cadastre as credenciais na ficha do grupo: PIX Sicredi do grupo
              (mensalidades) ou PIX Sicredi por ramo (atividades).
            </p>
          </div>
        ) : null}

        {phase === 'waiting' && cobranca ? (
          <div className="pix-sicredi-waiting">
            <p>
              Escaneie o QR no app do banco ou use o Pix Copia e Cola. O sistema
              consulta o Sicredi e só dá baixa após a confirmação.
            </p>
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
                Cobrança criada (txid {cobranca.txid}). Aguardando retorno do
                QR/copia e cola…
              </p>
            )}
            <p className="pix-sicredi-poll muted">
              Aguardando pagamento… status: {cobranca.status || 'ATIVA'}
            </p>
            {message ? <p className="muted">{message}</p> : null}
          </div>
        ) : null}

        {phase === 'paid' ? (
          <div className="pix-sicredi-status is-ok">
            <p>{message ?? 'Pagamento confirmado e baixa efetuada.'}</p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Concluir
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
