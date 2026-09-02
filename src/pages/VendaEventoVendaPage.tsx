import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  EventoConvitesImpressos,
  type ConviteImpressoItem,
} from '@/components/EventoConvitesImpressos'
import { PixSicrediPublicCheckoutModal } from '@/components/PixSicrediPublicCheckoutModal'
import { formatMoney } from '@/lib/despesas'
import {
  checkInfinitePayPedidoStatus,
} from '@/lib/infinitePayCheckout'
import type { PixPublicEventoInput } from '@/lib/pixSicrediPublic'
import {
  comprarConvitesEvento,
  totalConvitesEvento,
} from '@/lib/vendaEventos'
import { isEncerrado } from '@/lib/encerrado'
import { linkPublicoVendaEvento } from '@/lib/vendaEventosPublic'
import { isAssociadoLogin } from '@/lib/roles'
import type {
  VendaEvento,
  VendaEventoConvite,
  VendaEventoFormaPagamento,
  VendaEventoTipo,
} from '@/types/database'

function formatDateBr(value: string | null | undefined) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function tipoOptionLabel(t: Pick<VendaEventoTipo, 'label' | 'valor'>) {
  return `${t.label} · ${formatMoney(Number(t.valor ?? 0))}`
}

export function VendaEventoVendaPage() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const eventoId = Number(id)
  const { empresa, profile, hasPermission } = useAuth()
  const empresaId = empresa?.id
  const associadoLogin = isAssociadoLogin(profile)
  const canStaffEdit = !associadoLogin && hasPermission('vendas.write')
  const toast = useToast()

  const [evento, setEvento] = useState<VendaEvento | null>(null)
  const [tipos, setTipos] = useState<VendaEventoTipo[]>([])
  const [convites, setConvites] = useState<VendaEventoConvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quantidade, setQuantidade] = useState(1)
  const [nomes, setNomes] = useState<string[]>([''])
  const [tipoIds, setTipoIds] = useState<number[]>([0])
  const [telefone, setTelefone] = useState('')
  const [formaPagamento, setFormaPagamento] =
    useState<VendaEventoFormaPagamento | null>(null)
  const [saving, setSaving] = useState(false)
  const [ultimaNumeracao, setUltimaNumeracao] = useState<number[] | null>(null)
  const [convitesPagos, setConvitesPagos] = useState<ConviteImpressoItem[]>([])
  const [pixOpen, setPixOpen] = useState(false)
  const [pixInput, setPixInput] = useState<PixPublicEventoInput | null>(null)

  const total = useMemo(() => {
    if (!evento) return 0
    return totalConvitesEvento(evento.numero_inicial, evento.numero_final)
  }, [evento])

  const vendidos = convites.length
  const disponiveis = Math.max(0, total - vendidos)
  const tipoPadraoId = tipos[0]?.tipo_id ?? 0
  const totalSelecionado = useMemo(() => {
    return tipoIds.reduce((sum, id) => {
      const t = tipos.find((x) => x.tipo_id === id) ?? tipos[0]
      return sum + Number(t?.valor ?? 0)
    }, 0)
  }, [tipoIds, tipos])

  async function reload() {
    if (!empresaId || !Number.isFinite(eventoId) || eventoId <= 0) return
    setLoading(true)
    setError(null)

    const [eventoRes, convitesRes, tiposRes] = await Promise.all([
      supabase
        .from('venda_eventos')
        .select(
          'evento_id, empresa_id, nome, numero_inicial, numero_final, valor_convite, data_evento, imagem_url, link_token, encerrado_em, created_at',
        )
        .eq('evento_id', eventoId)
        .eq('empresa_id', empresaId)
        .maybeSingle(),
      supabase
        .from('venda_evento_convite')
        .select(
          'convite_id, empresa_id, evento_id, compra_id, numero, nome, tipo_id, valor_unitario, tipo_label, created_at',
        )
        .eq('evento_id', eventoId)
        .eq('empresa_id', empresaId)
        .order('numero'),
      supabase
        .from('venda_evento_tipo')
        .select(
          'tipo_id, empresa_id, evento_id, label, valor, ordem, ativo, created_at',
        )
        .eq('evento_id', eventoId)
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .order('ordem')
        .order('tipo_id'),
    ])

    if (eventoRes.error || !eventoRes.data) {
      setError(eventoRes.error?.message ?? 'Evento não encontrado.')
      setEvento(null)
      setConvites([])
      setTipos([])
      setLoading(false)
      return
    }

    if (convitesRes.error) {
      setError(convitesRes.error.message)
      setLoading(false)
      return
    }

    setEvento(eventoRes.data as VendaEvento)
    setConvites((convitesRes.data ?? []) as VendaEventoConvite[])
    const tiposLoaded = (tiposRes.data ?? []) as VendaEventoTipo[]
    if (tiposLoaded.length > 0) {
      setTipos(tiposLoaded)
    } else {
      setTipos([
        {
          tipo_id: 0,
          empresa_id: empresaId,
          evento_id: eventoId,
          label: 'Inteira',
          valor: Number(eventoRes.data.valor_convite ?? 0),
          ordem: 0,
          ativo: true,
          created_at: null,
        },
      ])
    }
    setError(null)
    setLoading(false)
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, eventoId])

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
        if (status.convites.length > 0) {
          setConvitesPagos(status.convites)
          setUltimaNumeracao(status.convites.map((c) => c.numero))
        }
        toast.success(
          'Pagamento confirmado!',
          status.convites.length > 0
            ? `Convite(s): ${status.convites.map((c) => c.numero).join(', ')}`
            : 'Os convites já constam na lista do evento.',
        )
        setQuantidade(1)
        setNomes([''])
        setTelefone('')
        setFormaPagamento(null)
        await reload()
      } else if (!status.ok) {
        setError(status.error)
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

  useEffect(() => {
    setNomes((prev) => {
      const next = Array.from({ length: Math.max(1, quantidade) }, (_, i) =>
        prev[i] ?? '',
      )
      return next
    })
    setTipoIds((prev) => {
      const fallback = tipoPadraoId
      return Array.from(
        { length: Math.max(1, quantidade) },
        (_, i) => prev[i] || fallback,
      )
    })
  }, [quantidade, tipoPadraoId])

  function limparCompra() {
    setQuantidade(1)
    setNomes([''])
    setTipoIds([tipoPadraoId])
    setTelefone('')
    setFormaPagamento(null)
    setUltimaNumeracao(null)
    setConvitesPagos([])
    setError(null)
    setPixOpen(false)
    setPixInput(null)
  }

  async function buscarConvitesAposPix(fone: string) {
    if (!empresaId || !evento?.evento_id) return null
    const { data: compra } = await supabase
      .from('venda_evento_compra')
      .select('compra_id')
      .eq('empresa_id', empresaId)
      .eq('evento_id', evento.evento_id)
      .eq('forma_pagamento', 'pix')
      .eq('comprador_telefone', fone.slice(0, 40))
      .order('compra_id', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!compra?.compra_id) return null

    const { data: rows } = await supabase
      .from('venda_evento_convite')
      .select('numero, nome, tipo_label, valor_unitario')
      .eq('compra_id', compra.compra_id)
      .order('numero')

    const itens = (rows ?? [])
      .map((r) => ({
        numero: Number(r.numero),
        nome: String(r.nome ?? ''),
        tipo_label: r.tipo_label != null ? String(r.tipo_label) : null,
        valor_unitario:
          r.valor_unitario != null && Number.isFinite(Number(r.valor_unitario))
            ? Number(r.valor_unitario)
            : null,
      }))
      .filter((c) => Number.isFinite(c.numero))
    return itens.length > 0 ? itens : null
  }

  async function copiarLink(token: string | null | undefined) {
    if (!token) {
      toast.error('Atenção', 'Link ainda não disponível para este evento.')
      return
    }
    const url = linkPublicoVendaEvento(token)
    try {
      await navigator.clipboard.writeText(url)
      toast.success(
        'Link copiado!',
        'Envie para quem for comprar os convites fora do app.',
      )
    } catch {
      window.prompt('Copie o link:', url)
    }
  }

  async function onComprar(event: FormEvent) {
    event.preventDefault()
    if (!evento) return
    if (isEncerrado(evento.encerrado_em)) {
      setError('Este evento está encerrado — não é possível comprar.')
      return
    }

    if (quantidade < 1) {
      setError('Informe a quantidade de convites.')
      return
    }
    if (quantidade > disponiveis) {
      setError(`Só há ${disponiveis} convite(s) disponível(is).`)
      return
    }

    const nomesLimpos = nomes.map((n) => n.trim())
    if (nomesLimpos.some((n) => !n)) {
      setError('Preencha o nome de cada convite.')
      return
    }
    if (tipos.length === 0 || tipoIds.some((id) => !id && tipos[0]?.tipo_id !== 0)) {
      setError('Selecione o tipo de cada convite.')
      return
    }
    if (!formaPagamento) {
      setError(
        'Selecione a forma de pagamento: Dinheiro, PIX ou PIX direto.',
      )
      return
    }

    const valor = Math.round(totalSelecionado * 100) / 100
    const tipoIdsEnvio =
      tipoPadraoId > 0
        ? tipoIds.map((id) => id || tipoPadraoId)
        : undefined

    if (formaPagamento === 'pix') {
      if (!telefone.trim()) {
        setError('Informe o telefone para pagar online.')
        return
      }
      if (!evento.link_token) {
        setError('Link de pagamento deste evento ainda não está disponível.')
        return
      }
      if (!(valor > 0)) {
        setError(
          'Para convites isentos (R$ 0), use Dinheiro ou PIX direto.',
        )
        return
      }

      const descricao = `${evento.nome} · ${quantidade} convite(s)`
      const fone = telefone.trim()
      setError(null)
      setUltimaNumeracao(null)
      setConvitesPagos([])

      // PIX Sicredi online (ramo/seção/grupo). InfinitePay desligado por enquanto.
      setPixInput({
        kind: 'evento',
        linkToken: evento.link_token,
        nomes: nomesLimpos,
        tipoIds: tipoIdsEnvio,
        compradorTelefone: fone,
        valor,
        descricao,
      })
      setPixOpen(true)
      return
    }

    setSaving(true)
    setError(null)

    const result = await comprarConvitesEvento({
      eventoId: evento.evento_id,
      nomes: nomesLimpos,
      tipoIds: tipoIdsEnvio,
      compradorTelefone: telefone,
      formaPagamento,
    })

    setSaving(false)

    if (!result.ok) {
      setError(result.mensagem)
      await reload()
      return
    }

    setUltimaNumeracao(result.numeros)
    setConvitesPagos(
      result.numeros.map((numero, i) => {
        const tipoId = tipoIdsEnvio?.[i] ?? tipoPadraoId
        const tipo = tipos.find((t) => t.tipo_id === tipoId) ?? tipos[0]
        return {
          numero,
          nome: nomesLimpos[i] ?? '',
          tipo_label: tipo?.label ?? null,
          valor_unitario:
            tipo?.valor != null ? Number(tipo.valor) : null,
        }
      }),
    )
    toast.success('Compra registrada!', result.mensagem)
    setQuantidade(1)
    setNomes([''])
    setTipoIds([tipoPadraoId])
    setTelefone('')
    setFormaPagamento(null)
    await reload()
  }

  if (!empresaId) {
    return (
      <section className="panel">
        <p className="muted">
          Seu usuário precisa estar vinculado a um grupo escoteiro.
        </p>
      </section>
    )
  }

  if (loading) {
    return <div className="loading">Carregando evento…</div>
  }

  if (!evento) {
    return (
      <section className="panel">
        <AlertMessage tone="error" title="Atenção">
          {error ?? 'Evento não encontrado'}
        </AlertMessage>
        <Link className="btn btn-soft" to="/vendas/eventos">
          Voltar
        </Link>
      </section>
    )
  }

  const encerrado = isEncerrado(evento.encerrado_em)

  return (
    <>
      <header className="page-header">
        <div>
          <h2>
            {encerrado
              ? 'Lista de convites'
              : associadoLogin
                ? 'Comprar convites'
                : 'Vender convites'}{' '}
            {encerrado ? (
              <span className="badge badge-danger">Encerrado</span>
            ) : null}
          </h2>
          <p>
            {evento.nome}
            {tipos.length > 0
              ? ` · ${tipos.map((t) => tipoOptionLabel(t)).join(' · ')}`
              : ''}
            {evento.data_evento
              ? ` · ${formatDateBr(evento.data_evento)}`
              : ''}
          </p>
        </div>
        <div className="page-header-actions actions-pair">
          {evento.link_token && !encerrado ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void copiarLink(evento.link_token)}
            >
              Copiar link de compra
            </button>
          ) : null}
          {canStaffEdit ? (
            <Link
              className="btn btn-soft"
              to={`/vendas/eventos/${evento.evento_id}`}
            >
              {encerrado ? 'Ver evento' : 'Editar evento'}
            </Link>
          ) : null}
          <Link className="btn btn-soft" to="/vendas/eventos">
            Voltar
          </Link>
        </div>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}
      {encerrado ? (
        <AlertMessage tone="info" title="Evento encerrado">
          Não é possível comprar ou vender novos convites.
        </AlertMessage>
      ) : null}

      {ultimaNumeracao && ultimaNumeracao.length > 0 ? (
        <AlertMessage tone="success" title="Numeração atribuída">
          Convite(s): <strong>{ultimaNumeracao.join(', ')}</strong>
        </AlertMessage>
      ) : null}

      {convitesPagos.length > 0 && evento ? (
        <section className="panel">
          <EventoConvitesImpressos
            eventoNome={evento.nome}
            empresaNome={empresa?.nome}
            dataEvento={evento.data_evento}
            imagemUrl={evento.imagem_url}
            convites={convitesPagos}
          />
        </section>
      ) : null}

      <section className="panel">
        <div
          className={`acao-venda-layout ${evento.imagem_url ? 'has-imagem' : ''}`}
        >
          {evento.imagem_url ? (
            <div className="acao-imagem-side">
              <img
                className="acao-imagem-banner"
                src={evento.imagem_url}
                alt={`Imagem do evento ${evento.nome}`}
              />
            </div>
          ) : null}
          <div className="acao-venda-numeros">
            <p className="muted" style={{ marginTop: 0 }}>
              {vendidos} de {total} convite(s) vendido(s) · {disponiveis}{' '}
              disponível(is) · faixa {evento.numero_inicial}–
              {evento.numero_final}
            </p>
            {!encerrado ? (
              <p className="field-hint">
                Informe a quantidade. Em seguida preencha o nome de cada
                convite; a numeração é atribuída automaticamente na ordem
                disponível.
              </p>
            ) : null}

            {!encerrado ? (
            <form
              className="form-grid form-grid-2"
              onSubmit={(e) => void onComprar(e)}
            >
              <div className="field">
                <label htmlFor="quantidade">Quantidade</label>
                <input
                  id="quantidade"
                  className="input"
                  type="number"
                  min={1}
                  max={Math.max(1, disponiveis)}
                  value={quantidade}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    setQuantidade(
                      Number.isFinite(n)
                        ? Math.min(Math.max(1, Math.floor(n)), Math.max(1, disponiveis || 1))
                        : 1,
                    )
                    setUltimaNumeracao(null)
                    setConvitesPagos([])
                  }}
                  disabled={saving || disponiveis === 0}
                  required
                />
              </div>
              <div className="field">
                <label>Total</label>
                <div className="input" style={{ display: 'flex', alignItems: 'center' }}>
                  {formatMoney(totalSelecionado)}
                </div>
              </div>

              {quantidade > 0 && disponiveis > 0
                ? nomes.map((nome, index) => (
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
                            disabled={saving}
                            required
                            placeholder="Nome completo"
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
                                prev.map((t, i) =>
                                  i === index ? value : t,
                                ),
                              )
                            }}
                            disabled={saving || tipos.length === 0}
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
                  ))
                : null}

              <div className="field">
                <label htmlFor="telefone">
                  Telefone
                  {formaPagamento === 'pix' ? '' : ' (opcional)'}
                </label>
                <input
                  id="telefone"
                  className="input"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  disabled={saving || pixOpen}
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                  required={formaPagamento === 'pix'}
                />
              </div>

              <div className="field field-span-2">
                <label>Forma de pagamento</label>
                <div
                  className="pagamento-opcoes"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.9rem',
                    marginTop: '0.35rem',
                  }}
                >
                  <button
                    type="button"
                    className={`btn ${
                      formaPagamento === 'dinheiro' ? 'btn-primary' : 'btn-soft'
                    }`}
                    disabled={saving || pixOpen}
                    onClick={() => setFormaPagamento('dinheiro')}
                  >
                    Dinheiro
                  </button>
                  <button
                    type="button"
                    className={`btn ${
                      formaPagamento === 'pix' ? 'btn-primary' : 'btn-soft'
                    }`}
                    disabled={saving || pixOpen}
                    onClick={() => setFormaPagamento('pix')}
                    title="PIX Sicredi da conta do ramo ou do grupo"
                  >
                    PIX online
                  </button>
                  <button
                    type="button"
                    className={`btn ${
                      formaPagamento === 'pix_direto'
                        ? 'btn-primary'
                        : 'btn-soft'
                    }`}
                    disabled={saving || pixOpen}
                    onClick={() => setFormaPagamento('pix_direto')}
                  >
                    PIX direto
                  </button>
                </div>
                {formaPagamento === 'pix' ? (
                  <p className="field-hint" style={{ marginBottom: 0 }}>
                    Gera cobrança PIX Sicredi com a conta bancária do ramo (ou
                    do grupo, se o evento for geral). Informe o telefone antes
                    de continuar.
                  </p>
                ) : null}
              </div>

              <div className="form-actions field-span-2">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={
                    saving ||
                    pixOpen ||
                    disponiveis === 0 ||
                    !formaPagamento
                  }
                >
                  {saving
                    ? 'Salvando…'
                    : formaPagamento === 'pix'
                      ? 'Pagar com PIX'
                      : associadoLogin
                        ? quantidade === 1
                          ? 'Comprar 1 convite'
                          : `Comprar ${quantidade} convites`
                        : quantidade === 1
                          ? 'Confirmar 1 convite'
                          : `Confirmar ${quantidade} convites`}
                </button>
                <button
                  type="button"
                  className="btn btn-soft"
                  disabled={saving || pixOpen}
                  onClick={limparCompra}
                >
                  Limpar
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
          const fone = pixInput?.compradorTelefone?.trim() ?? telefone.trim()
          setPixOpen(false)
          setPixInput(null)
          setQuantidade(1)
          setNomes([''])
          setTelefone('')
          setFormaPagamento(null)
          void (async () => {
            const fromPayload =
              payload?.convites && payload.convites.length > 0
                ? payload.convites
                : null
            const itens =
              fromPayload ?? (fone ? await buscarConvitesAposPix(fone) : null)
            if (itens) {
              setConvitesPagos(itens)
              setUltimaNumeracao(itens.map((c) => c.numero))
            }
            toast.success(
              'Pagamento confirmado!',
              itens
                ? `Convite(s): ${itens.map((c) => c.numero).join(', ')}`
                : 'Os convites já constam na lista do evento.',
            )
            await reload()
          })()
        }}
      />

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Lista para conferência</h3>
        <p className="muted">
          Convites já vendidos, ordenados pelo número — use no dia do evento.
        </p>
        {convites.length === 0 ? (
          <div className="empty">Nenhum convite vendido ainda.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Nome</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {convites.map((c) => (
                  <tr key={c.convite_id}>
                    <td>
                      <strong>{c.numero}</strong>
                    </td>
                    <td>{c.nome}</td>
                    <td>
                      {c.tipo_label
                        ? `${c.tipo_label}${
                            c.valor_unitario != null
                              ? ` · ${formatMoney(Number(c.valor_unitario))}`
                              : ''
                          }`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
