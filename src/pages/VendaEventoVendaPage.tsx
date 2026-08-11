import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { PixSicrediPublicCheckoutModal } from '@/components/PixSicrediPublicCheckoutModal'
import { formatMoney } from '@/lib/despesas'
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
} from '@/types/database'

function formatDateBr(value: string | null | undefined) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function VendaEventoVendaPage() {
  const { id } = useParams()
  const eventoId = Number(id)
  const { empresa, profile, hasPermission } = useAuth()
  const empresaId = empresa?.id
  const associadoLogin = isAssociadoLogin(profile)
  const canStaffEdit = !associadoLogin && hasPermission('vendas.write')
  const toast = useToast()

  const [evento, setEvento] = useState<VendaEvento | null>(null)
  const [convites, setConvites] = useState<VendaEventoConvite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [quantidade, setQuantidade] = useState(1)
  const [nomes, setNomes] = useState<string[]>([''])
  const [telefone, setTelefone] = useState('')
  const [formaPagamento, setFormaPagamento] =
    useState<VendaEventoFormaPagamento | null>(null)
  const [saving, setSaving] = useState(false)
  const [ultimaNumeracao, setUltimaNumeracao] = useState<number[] | null>(null)
  const [pixOpen, setPixOpen] = useState(false)
  const [pixInput, setPixInput] = useState<PixPublicEventoInput | null>(null)

  const total = useMemo(() => {
    if (!evento) return 0
    return totalConvitesEvento(evento.numero_inicial, evento.numero_final)
  }, [evento])

  const vendidos = convites.length
  const disponiveis = Math.max(0, total - vendidos)
  const valorUnitario = Number(evento?.valor_convite ?? 0)
  const totalSelecionado = Math.max(0, quantidade) * valorUnitario

  async function reload() {
    if (!empresaId || !Number.isFinite(eventoId) || eventoId <= 0) return
    setLoading(true)
    setError(null)

    const [eventoRes, convitesRes] = await Promise.all([
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
          'convite_id, empresa_id, evento_id, compra_id, numero, nome, created_at',
        )
        .eq('evento_id', eventoId)
        .eq('empresa_id', empresaId)
        .order('numero'),
    ])

    if (eventoRes.error || !eventoRes.data) {
      setError(eventoRes.error?.message ?? 'Evento não encontrado.')
      setEvento(null)
      setConvites([])
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
    setError(null)
    setLoading(false)
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, eventoId])

  useEffect(() => {
    setNomes((prev) => {
      const next = Array.from({ length: Math.max(1, quantidade) }, (_, i) =>
        prev[i] ?? '',
      )
      return next
    })
  }, [quantidade])

  function limparCompra() {
    setQuantidade(1)
    setNomes([''])
    setTelefone('')
    setFormaPagamento(null)
    setUltimaNumeracao(null)
    setError(null)
    setPixOpen(false)
    setPixInput(null)
  }

  async function buscarNumeracaoAposPix(fone: string) {
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
      .select('numero')
      .eq('compra_id', compra.compra_id)
      .order('numero')

    const numeros = (rows ?? [])
      .map((r) => Number(r.numero))
      .filter((n) => Number.isFinite(n))
    return numeros.length > 0 ? numeros : null
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
    if (!formaPagamento) {
      setError(
        'Selecione a forma de pagamento: Dinheiro, PIX ou PIX direto.',
      )
      return
    }

    if (formaPagamento === 'pix') {
      if (!telefone.trim()) {
        setError('Informe o telefone para pagar com PIX.')
        return
      }
      if (!evento.link_token) {
        setError('Link PIX deste evento ainda não está disponível.')
        return
      }
      if (!Number.isFinite(valorUnitario) || valorUnitario <= 0) {
        setError('Este evento ainda não tem valor de convite configurado.')
        return
      }

      const valor = Math.round(valorUnitario * quantidade * 100) / 100
      setError(null)
      setUltimaNumeracao(null)
      setPixInput({
        kind: 'evento',
        linkToken: evento.link_token,
        nomes: nomesLimpos,
        compradorTelefone: telefone.trim(),
        valor,
        descricao: `${evento.nome} · ${quantidade} convite(s)`,
      })
      setPixOpen(true)
      return
    }

    setSaving(true)
    setError(null)

    const result = await comprarConvitesEvento({
      eventoId: evento.evento_id,
      nomes: nomesLimpos,
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
    toast.success('Compra registrada!', result.mensagem)
    setQuantidade(1)
    setNomes([''])
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
            {evento.nome} · {formatMoney(valorUnitario)} cada
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
                        disabled={saving}
                        required
                        placeholder="Nome completo"
                      />
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
                    title="Gera QR Code PIX via Sicredi (banco)"
                  >
                    PIX
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
                    PIX com confirmação no banco (Sicredi). Informe o telefone
                    antes de continuar.
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
        onPaid={() => {
          const fone = pixInput?.compradorTelefone?.trim() ?? telefone.trim()
          setPixOpen(false)
          setPixInput(null)
          setQuantidade(1)
          setNomes([''])
          setTelefone('')
          setFormaPagamento(null)
          void (async () => {
            const numeros = fone ? await buscarNumeracaoAposPix(fone) : null
            if (numeros) setUltimaNumeracao(numeros)
            toast.success(
              'Pagamento confirmado!',
              numeros
                ? `Convite(s): ${numeros.join(', ')}`
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
                </tr>
              </thead>
              <tbody>
                {convites.map((c) => (
                  <tr key={c.convite_id}>
                    <td>
                      <strong>{c.numero}</strong>
                    </td>
                    <td>{c.nome}</td>
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
