import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertMessage } from '@/components/AlertMessage'
import { PixSicrediPublicCheckoutModal } from '@/components/PixSicrediPublicCheckoutModal'
import { formatMoney } from '@/lib/despesas'
import type { PixPublicEventoInput } from '@/lib/pixSicrediPublic'
import {
  fetchEventoPublicInfo,
  type EventoPublicInfo,
} from '@/lib/vendaEventosPublic'

function formatDateBr(value: string | null | undefined) {
  if (!value) return null
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function VendaEventoPublicPage() {
  const { token } = useParams()
  const [info, setInfo] = useState<EventoPublicInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [quantidade, setQuantidade] = useState(1)
  const [nomes, setNomes] = useState<string[]>([''])
  const [telefone, setTelefone] = useState('')
  const [pixOpen, setPixOpen] = useState(false)
  const [pixInput, setPixInput] = useState<PixPublicEventoInput | null>(null)

  async function load() {
    if (!token) {
      setError('Link inválido.')
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await fetchEventoPublicInfo(token)
    if (res.error || !res.data) {
      setError(res.error ?? 'Link inválido.')
      setInfo(null)
      setLoading(false)
      return
    }
    setInfo(res.data)
    setError(null)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    setNomes((prev) =>
      Array.from({ length: Math.max(1, quantidade) }, (_, i) => prev[i] ?? ''),
    )
  }, [quantidade])

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token || !info) return
    if (info.disponiveis <= 0) {
      setError('Não há mais convites disponíveis.')
      return
    }
    if (quantidade < 1 || quantidade > info.disponiveis) {
      setError(`Informe uma quantidade entre 1 e ${info.disponiveis}.`)
      return
    }
    const nomesLimpos = nomes.map((n) => n.trim())
    if (nomesLimpos.some((n) => !n)) {
      setError('Preencha o nome de cada convite.')
      return
    }
    if (!telefone.trim()) {
      setError('Informe o seu telefone.')
      return
    }

    const valorUnitario = Number(info.valor_convite ?? 0)
    if (!Number.isFinite(valorUnitario) || valorUnitario <= 0) {
      setError('Este evento ainda não tem valor de convite configurado.')
      return
    }

    const valor = Math.round(valorUnitario * quantidade * 100) / 100

    setError(null)
    setSuccess(null)
    setPixInput({
      kind: 'evento',
      linkToken: token,
      nomes: nomesLimpos,
      compradorTelefone: telefone.trim(),
      valor,
      descricao: `${info.evento_nome} · ${quantidade} convite(s)`,
    })
    setPixOpen(true)
  }

  if (loading) {
    return (
      <div className="public-rifa-page">
        <div className="loading">Carregando evento…</div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="public-rifa-page">
        <section className="panel">
          <AlertMessage tone="error" title="Link inválido">
            {error ?? 'Este link de compra não está disponível.'}
          </AlertMessage>
          <Link className="btn btn-soft" to="/login">
            Ir para o login
          </Link>
        </section>
      </div>
    )
  }

  const valorUnitario = Number(info.valor_convite ?? 0)
  const total = quantidade * valorUnitario
  const dataLabel = formatDateBr(info.data_evento)

  return (
    <div className="public-rifa-page">
      <header className="public-rifa-header">
        <p className="muted">{info.empresa_nome}</p>
        <h1>{info.evento_nome}</h1>
        <p>
          {formatMoney(valorUnitario)} por convite
          {dataLabel ? ` · ${dataLabel}` : ''}
        </p>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}
      {success ? (
        <AlertMessage tone="success" title="Pronto!">
          {success}
        </AlertMessage>
      ) : null}

      <section className="panel">
        <div
          className={`acao-venda-layout ${info.imagem_url ? 'has-imagem' : ''}`}
        >
          {info.imagem_url ? (
            <div className="acao-imagem-side">
              <img
                className="acao-imagem-banner"
                src={info.imagem_url}
                alt={`Imagem do evento ${info.evento_nome}`}
              />
            </div>
          ) : null}
          <div className="acao-venda-numeros">
            <p className="muted" style={{ marginTop: 0 }}>
              {info.disponiveis} de {info.total} convite(s) disponível(is).
              Informe a quantidade, os nomes e pague via PIX para confirmar.
            </p>

            <form
              className="form-grid form-grid-2"
              onSubmit={(e) => onSubmit(e)}
            >
              <div className="field">
                <label htmlFor="quantidade">Quantidade</label>
                <input
                  id="quantidade"
                  className="input"
                  type="number"
                  min={1}
                  max={Math.max(1, info.disponiveis)}
                  value={quantidade}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    setQuantidade(
                      Number.isFinite(n)
                        ? Math.min(
                            Math.max(1, Math.floor(n)),
                            Math.max(1, info.disponiveis || 1),
                          )
                        : 1,
                    )
                  }}
                  disabled={pixOpen || info.disponiveis === 0}
                  required
                />
              </div>
              <div className="field">
                <label>Total</label>
                <div
                  className="input"
                  style={{ display: 'flex', alignItems: 'center' }}
                >
                  {formatMoney(total)}
                </div>
              </div>

              {nomes.map((nome, index) => (
                <div
                  key={`nome-${index}`}
                  className={`field ${quantidade === 1 ? 'field-span-2' : ''}`}
                >
                  <label htmlFor={`nome_${index}`}>
                    Nome do convite {index + 1}
                  </label>
                  <input
                    id={`nome_${index}`}
                    className="input"
                    value={nome}
                    onChange={(e) => {
                      const value = e.target.value
                      setNomes((prev) =>
                        prev.map((n, i) => (i === index ? value : n)),
                      )
                    }}
                    disabled={pixOpen}
                    required
                  />
                </div>
              ))}

              <div className="field field-span-2">
                <label htmlFor="telefone">Seu telefone</label>
                <input
                  id="telefone"
                  className="input"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  disabled={pixOpen}
                  required
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div className="form-actions field-span-2">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={pixOpen || info.disponiveis === 0}
                >
                  Pagar com PIX
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <PixSicrediPublicCheckoutModal
        open={pixOpen}
        title="Pagamento PIX"
        input={pixInput}
        paidMessage="Pagamento confirmado. Seus convites foram registrados."
        onClose={() => {
          setPixOpen(false)
          setPixInput(null)
        }}
        onPaid={() => {
          setSuccess(
            'Pagamento confirmado! Seus convites já constam na lista do evento.',
          )
          setQuantidade(1)
          setNomes([''])
          setTelefone('')
          setPixOpen(false)
          setPixInput(null)
          void load()
        }}
      />
    </div>
  )
}
