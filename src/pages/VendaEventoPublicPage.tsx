import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AlertMessage } from '@/components/AlertMessage'
import {
  EventoConvitesImpressos,
  type ConviteImpressoItem,
} from '@/components/EventoConvitesImpressos'
import { PixSicrediPublicCheckoutModal } from '@/components/PixSicrediPublicCheckoutModal'
import { formatMoney } from '@/lib/despesas'
import {
  checkInfinitePayPedidoStatus,
  createInfinitePayEventoCheckout,
  fetchEventoPagamentoConfig,
  type EventoPagamentoConfig,
} from '@/lib/infinitePayCheckout'
import type { PixPublicEventoInput } from '@/lib/pixSicrediPublic'
import {
  fetchEventoPublicInfo,
  type EventoPublicInfo,
  type EventoPublicTipo,
} from '@/lib/vendaEventosPublic'

function formatDateBr(value: string | null | undefined) {
  if (!value) return null
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function tipoOptionLabel(t: Pick<EventoPublicTipo, 'label' | 'valor'>) {
  return `${t.label} · ${formatMoney(Number(t.valor ?? 0))}`
}

export function VendaEventoPublicPage() {
  const { token } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [info, setInfo] = useState<EventoPublicInfo | null>(null)
  const [payConfig, setPayConfig] = useState<EventoPagamentoConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [quantidade, setQuantidade] = useState(1)
  const [nomes, setNomes] = useState<string[]>([''])
  const [tipoIds, setTipoIds] = useState<number[]>([0])
  const [telefone, setTelefone] = useState('')
  const [pixOpen, setPixOpen] = useState(false)
  const [pixInput, setPixInput] = useState<PixPublicEventoInput | null>(null)
  const [convitesPagos, setConvitesPagos] = useState<ConviteImpressoItem[]>([])

  const tipos = info?.tipos ?? []
  const tipoPadraoId = tipos[0]?.tipo_id ?? 0
  const totalSelecionado = useMemo(() => {
    return tipoIds.reduce((sum, id) => {
      const t = tipos.find((x) => x.tipo_id === id) ?? tipos[0]
      return sum + Number(t?.valor ?? 0)
    }, 0)
  }, [tipoIds, tipos])

  async function load() {
    if (!token) {
      setError('Link inválido.')
      setLoading(false)
      return
    }
    setLoading(true)
    const [res, cfg] = await Promise.all([
      fetchEventoPublicInfo(token),
      fetchEventoPagamentoConfig(token),
    ])
    if (res.error || !res.data) {
      setError(res.error ?? 'Link inválido.')
      setInfo(null)
      setPayConfig(null)
      setLoading(false)
      return
    }
    setInfo(res.data)
    setPayConfig(cfg.ok ? cfg.config : null)
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
    setTipoIds((prev) => {
      const fallback = tipoPadraoId
      return Array.from(
        { length: Math.max(1, quantidade) },
        (_, i) => prev[i] || fallback,
      )
    })
  }, [quantidade, tipoPadraoId])

  // Retorno do checkout InfinitePay
  useEffect(() => {
    const pago = searchParams.get('pago')
    const orderNsu = searchParams.get('order_nsu')
    if (pago !== '1' || !orderNsu) return

    let cancelled = false
    void (async () => {
      const slug = searchParams.get('slug') ?? undefined
      const transactionNsu =
        searchParams.get('transaction_nsu') ?? undefined
      const status = await checkInfinitePayPedidoStatus(orderNsu, {
        slug,
        transactionNsu,
      })
      if (cancelled) return
      if (status.ok && status.paid) {
        setSuccess(
          'Pagamento confirmado! Seus convites já constam na lista do evento.',
        )
        if (status.convites.length > 0) {
          setConvitesPagos(status.convites)
        }
        setQuantidade(1)
        setNomes([''])
        setTelefone('')
        void load()
      } else if (!status.ok) {
        setError(status.error)
      } else {
        setSuccess(
          'Recebemos o retorno do pagamento. Se os convites não aparecerem em instantes, aguarde a confirmação.',
        )
        void load()
      }
      const next = new URLSearchParams(searchParams)
      next.delete('pago')
      next.delete('order_nsu')
      next.delete('slug')
      next.delete('transaction_nsu')
      next.delete('receipt_url')
      next.delete('capture_method')
      setSearchParams(next, { replace: true })
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function openPixSicredi(
    nomesLimpos: string[],
    tipoIdsEnvio: number[] | undefined,
    fone: string,
    valor: number,
    descricao: string,
  ) {
    if (!token) return
    setPixInput({
      kind: 'evento',
      linkToken: token,
      nomes: nomesLimpos,
      tipoIds: tipoIdsEnvio,
      compradorTelefone: fone,
      valor,
      descricao,
    })
    setPixOpen(true)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!token || !info) return
    if (info.encerrado) {
      setError('Este evento está encerrado.')
      return
    }
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

    const valor = Math.round(totalSelecionado * 100) / 100
    if (!(valor > 0)) {
      setError(
        'Não é possível pagar online convites isentos (R$ 0). Procure a organização do evento.',
      )
      return
    }

    const tipoIdsEnvio =
      tipoPadraoId > 0
        ? tipoIds.map((id) => id || tipoPadraoId)
        : undefined
    const descricao = `${info.evento_nome} · ${quantidade} convite(s)`
    const fone = telefone.trim()

    setError(null)
    setSuccess(null)
    setConvitesPagos([])

    const prefer = payConfig?.prefer ?? 'nenhum'
    const hasInfinite = payConfig?.infinitepay === true
    const hasPix = payConfig?.pix_sicredi === true

    if (!hasInfinite && !hasPix) {
      setError(
        'Nenhuma forma de pagamento online configurada para este evento. Cadastre o PIX Sicredi na conta bancária do grupo/ramo.',
      )
      return
    }

    // Por enquanto: PIX Sicredi (ramo/grupo). InfinitePay só se for a única opção.
    if (hasPix && (prefer === 'pix_sicredi' || !hasInfinite)) {
      openPixSicredi(nomesLimpos, tipoIdsEnvio, fone, valor, descricao)
      return
    }

    if (hasInfinite) {
      setPaying(true)
      const created = await createInfinitePayEventoCheckout({
        linkToken: token,
        nomes: nomesLimpos,
        tipoIds: tipoIdsEnvio,
        compradorTelefone: fone,
        valor,
        descricao,
      })
      setPaying(false)

      if (created.ok) {
        window.location.href = created.url
        return
      }
      if (created.usePix && hasPix) {
        openPixSicredi(nomesLimpos, tipoIdsEnvio, fone, valor, descricao)
        return
      }
      setError(created.error)
      return
    }

    openPixSicredi(nomesLimpos, tipoIdsEnvio, fone, valor, descricao)
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

  const total = totalSelecionado
  const dataLabel = formatDateBr(info.data_evento)
  const payLabel = payConfig?.pix_sicredi
    ? 'Pagar com PIX'
    : payConfig?.prefer === 'infinitepay'
      ? 'Pagar com InfinitePay'
      : 'Pagar'

  return (
    <div className="public-rifa-page">
      <header className="public-rifa-header">
        <p className="muted">{info.empresa_nome}</p>
        <h1>
          {info.evento_nome}{' '}
          {info.encerrado ? (
            <span className="badge badge-danger">Encerrado</span>
          ) : null}
        </h1>
        <p>
          {tipos.map((t) => tipoOptionLabel(t)).join(' · ') ||
            `${formatMoney(info.valor_convite)} por convite`}
          {dataLabel ? ` · ${dataLabel}` : ''}
        </p>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}
      {info.encerrado ? (
        <AlertMessage tone="info" title="Evento encerrado">
          Este link não aceita mais compras de convites.
        </AlertMessage>
      ) : null}
      {success ? (
        <AlertMessage tone="success" title="Pronto!">
          {success}
        </AlertMessage>
      ) : null}

      {convitesPagos.length > 0 ? (
        <section className="panel">
          <EventoConvitesImpressos
            eventoNome={info.evento_nome}
            empresaNome={info.empresa_nome}
            dataEvento={info.data_evento}
            imagemUrl={info.imagem_url}
            convites={convitesPagos}
          />
        </section>
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
              {!info.encerrado
                ? payConfig?.pix_sicredi
                  ? ' Informe a quantidade, os nomes e pague via PIX para confirmar.'
                  : payConfig?.prefer === 'infinitepay'
                    ? ' Informe a quantidade, os nomes e pague no checkout InfinitePay (Pix ou cartão).'
                    : ' Informe a quantidade, os nomes e pague via PIX para confirmar.'
                : ''}
            </p>

            {!info.encerrado ? (
              <form
                className="form-grid form-grid-2"
                onSubmit={(e) => void onSubmit(e)}
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
                    disabled={pixOpen || paying || info.disponiveis === 0}
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
                    key={`linha-${index}`}
                    className="field field-span-2 evento-convite-linha"
                  >
                    <div className="evento-convite-linha-grid">
                      <div className="field" style={{ margin: 0 }}>
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
                          disabled={pixOpen || paying}
                          required
                        />
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label htmlFor={`tipo_${index}`}>Tipo</label>
                        <select
                          id={`tipo_${index}`}
                          className="select"
                          value={tipoIds[index] || tipoPadraoId}
                          onChange={(e) => {
                            const value = Number(e.target.value)
                            setTipoIds((prev) =>
                              prev.map((t, i) => (i === index ? value : t)),
                            )
                          }}
                          disabled={pixOpen || paying || tipos.length === 0}
                          required
                        >
                          {tipos.map((t) => (
                            <option key={t.tipo_id} value={t.tipo_id}>
                              {tipoOptionLabel(t)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="field field-span-2">
                  <label htmlFor="telefone">Seu telefone</label>
                  <input
                    id="telefone"
                    className="input"
                    value={telefone}
                    onChange={(e) => setTelefone(e.target.value)}
                    disabled={pixOpen || paying}
                    required
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                  />
                </div>

                <div className="form-actions field-span-2">
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={
                      pixOpen || paying || info.disponiveis === 0
                    }
                  >
                    {paying ? 'Redirecionando…' : payLabel}
                  </button>
                </div>
              </form>
            ) : null}
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
        onPaid={(payload) => {
          setSuccess(
            'Pagamento confirmado! Seus convites já constam na lista do evento.',
          )
          if (payload?.convites?.length) {
            setConvitesPagos(payload.convites)
          }
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
