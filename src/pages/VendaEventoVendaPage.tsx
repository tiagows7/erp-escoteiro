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
import { QuantidadeStepper } from '@/components/QuantidadeStepper'
import { formatMoney } from '@/lib/despesas'
import {
  checkInfinitePayPedidoStatus,
} from '@/lib/infinitePayCheckout'
import type { PixPublicEventoInput } from '@/lib/pixSicrediPublic'
import {
  comprarConvitesEvento,
  normalizeRestricoesAlimentares,
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

function tipoLabelConvite(c: Pick<VendaEventoConvite, 'tipo_label'>) {
  return (c.tipo_label ?? 'Sem tipo').trim() || 'Sem tipo'
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
  const [temRestricao, setTemRestricao] = useState<boolean[]>([false])
  const [restricoesTexto, setRestricoesTexto] = useState<string[]>([''])
  const [telefone, setTelefone] = useState('')
  const [formaPagamento, setFormaPagamento] =
    useState<VendaEventoFormaPagamento | null>(null)
  const [saving, setSaving] = useState(false)
  const [ultimaNumeracao, setUltimaNumeracao] = useState<number[] | null>(null)
  const [convitesPagos, setConvitesPagos] = useState<ConviteImpressoItem[]>([])
  const [pixOpen, setPixOpen] = useState(false)
  const [pixInput, setPixInput] = useState<PixPublicEventoInput | null>(null)
  const [editandoConviteId, setEditandoConviteId] = useState<number | null>(
    null,
  )
  const [nomeEdit, setNomeEdit] = useState('')
  const [salvandoConviteId, setSalvandoConviteId] = useState<number | null>(
    null,
  )
  const [filtroTipos, setFiltroTipos] = useState<Record<string, boolean>>({})

  const total = useMemo(() => {
    if (!evento) return 0
    return totalConvitesEvento(evento.numero_inicial, evento.numero_final)
  }, [evento])

  const convitesAtivos = useMemo(
    () => convites.filter((c) => c.ativo !== false),
    [convites],
  )
  const vendidos = convitesAtivos.length
  const disponiveis = Math.max(0, total - vendidos)
  const tipoPadraoId = tipos[0]?.tipo_id ?? 0
  const totalSelecionado = useMemo(() => {
    return tipoIds.reduce((sum, id) => {
      const t = tipos.find((x) => x.tipo_id === id) ?? tipos[0]
      return sum + Number(t?.valor ?? 0)
    }, 0)
  }, [tipoIds, tipos])

  const tiposNaLista = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of convites) {
      const label = tipoLabelConvite(c)
      map.set(label, (map.get(label) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [convites])

  useEffect(() => {
    setFiltroTipos((prev) => {
      const next: Record<string, boolean> = {}
      let changed = false
      for (const [label] of tiposNaLista) {
        next[label] = label in prev ? prev[label] : true
        if (!(label in prev) || next[label] !== prev[label]) changed = true
      }
      for (const key of Object.keys(prev)) {
        if (!(key in next)) {
          changed = true
          break
        }
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev
      }
      return next
    })
  }, [tiposNaLista])

  const tiposFiltroAtivos = useMemo(() => {
    const selected = tiposNaLista
      .map(([label]) => label)
      .filter((label) => filtroTipos[label] !== false)
    return new Set(selected)
  }, [tiposNaLista, filtroTipos])

  const filtroTiposParcial =
    tiposNaLista.length > 0 &&
    tiposFiltroAtivos.size > 0 &&
    tiposFiltroAtivos.size < tiposNaLista.length

  const todosTiposMarcados =
    tiposNaLista.length > 0 && tiposFiltroAtivos.size === tiposNaLista.length

  const convitesFiltrados = useMemo(() => {
    if (tiposNaLista.length === 0 || todosTiposMarcados) return convites
    return convites.filter((c) => tiposFiltroAtivos.has(tipoLabelConvite(c)))
  }, [convites, tiposNaLista.length, todosTiposMarcados, tiposFiltroAtivos])

  const convitesFiltradosAtivos = useMemo(
    () => convitesFiltrados.filter((c) => c.ativo !== false),
    [convitesFiltrados],
  )

  const totaisLista = useMemo(() => {
    const porTipo = new Map<string, { qtde: number; valor: number }>()
    const porRestricao = new Map<string, number>()
    let valorArrecadado = 0
    for (const c of convitesFiltradosAtivos) {
      const tipo = tipoLabelConvite(c)
      const unit =
        c.valor_unitario != null && Number.isFinite(Number(c.valor_unitario))
          ? Number(c.valor_unitario)
          : 0
      valorArrecadado += unit
      const atual = porTipo.get(tipo) ?? { qtde: 0, valor: 0 }
      porTipo.set(tipo, { qtde: atual.qtde + 1, valor: atual.valor + unit })
      const r = (c.restricao_alimentar ?? '').trim()
      if (r) {
        porRestricao.set(r, (porRestricao.get(r) ?? 0) + 1)
      }
    }
    return {
      total: convitesFiltradosAtivos.length,
      inativos: convitesFiltrados.length - convitesFiltradosAtivos.length,
      valorArrecadado: Math.round(valorArrecadado * 100) / 100,
      porTipo: [...porTipo.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      porRestricao: [...porRestricao.entries()].sort((a, b) =>
        a[0].localeCompare(b[0]),
      ),
      comRestricao: [...porRestricao.values()].reduce((s, n) => s + n, 0),
    }
  }, [convitesFiltrados, convitesFiltradosAtivos])

  function imprimirListaConvites() {
    document.body.classList.add('print-evento-lista')
    const cleanup = () => {
      document.body.classList.remove('print-evento-lista')
      window.removeEventListener('afterprint', cleanup)
    }
    window.addEventListener('afterprint', cleanup)
    window.print()
  }

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
          'convite_id, empresa_id, evento_id, compra_id, numero, nome, tipo_id, valor_unitario, tipo_label, restricao_alimentar, ativo, created_at',
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
        setTemRestricao([false])
        setRestricoesTexto([''])
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
    setTemRestricao((prev) =>
      Array.from({ length: Math.max(1, quantidade) }, (_, i) => prev[i] ?? false),
    )
    setRestricoesTexto((prev) =>
      Array.from({ length: Math.max(1, quantidade) }, (_, i) => prev[i] ?? ''),
    )
  }, [quantidade, tipoPadraoId])

  function limparCompra() {
    setQuantidade(1)
    setNomes([''])
    setTipoIds([tipoPadraoId])
    setTemRestricao([false])
    setRestricoesTexto([''])
    setTelefone('')
    setFormaPagamento(null)
    setUltimaNumeracao(null)
    setConvitesPagos([])
    setError(null)
    setPixOpen(false)
    setPixInput(null)
  }

  function iniciarEdicaoNome(c: VendaEventoConvite) {
    setEditandoConviteId(c.convite_id)
    setNomeEdit(c.nome)
  }

  function cancelarEdicaoNome() {
    setEditandoConviteId(null)
    setNomeEdit('')
  }

  async function salvarNomeConvite(conviteId: number) {
    const nome = nomeEdit.trim().slice(0, 200)
    if (!nome) {
      toast.error('Informe o nome.', 'O nome do convite não pode ficar vazio.')
      return
    }
    setSalvandoConviteId(conviteId)
    const { error: updError } = await supabase
      .from('venda_evento_convite')
      .update({ nome })
      .eq('convite_id', conviteId)
      .eq('empresa_id', empresaId!)
    setSalvandoConviteId(null)
    if (updError) {
      toast.error('Não foi possível alterar o nome.', updError.message)
      return
    }
    setConvites((prev) =>
      prev.map((c) =>
        c.convite_id === conviteId ? { ...c, nome } : c,
      ),
    )
    cancelarEdicaoNome()
    toast.success('Nome atualizado.', `Convite atualizado para “${nome}”.`)
  }

  async function alternarAtivoConvite(c: VendaEventoConvite) {
    const novoAtivo = c.ativo === false
    const acao = novoAtivo ? 'reativar' : 'inativar'
    if (
      !window.confirm(
        novoAtivo
          ? `Reativar o convite nº ${c.numero} (${c.nome})?`
          : `Inativar o convite nº ${c.numero} (${c.nome})?\nO número ficará disponível para nova venda.`,
      )
    ) {
      return
    }
    setSalvandoConviteId(c.convite_id)
    const { error: updError } = await supabase
      .from('venda_evento_convite')
      .update({ ativo: novoAtivo })
      .eq('convite_id', c.convite_id)
      .eq('empresa_id', empresaId!)
    setSalvandoConviteId(null)
    if (updError) {
      toast.error(
        `Não foi possível ${acao} o convite.`,
        updError.message.includes('venda_evento_convite_numero_ativo_uq')
          ? `O número ${c.numero} já está em uso por outro convite ativo.`
          : updError.message,
      )
      return
    }
    setConvites((prev) =>
      prev.map((row) =>
        row.convite_id === c.convite_id ? { ...row, ativo: novoAtivo } : row,
      ),
    )
    if (editandoConviteId === c.convite_id) cancelarEdicaoNome()
    toast.success(
      novoAtivo ? 'Convite reativado.' : 'Convite inativado.',
      `Nº ${c.numero} · ${c.nome}`,
    )
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
    for (let i = 0; i < quantidade; i += 1) {
      if (temRestricao[i] && !restricoesTexto[i]?.trim()) {
        setError(
          `Informe a restrição alimentar do convite ${i + 1} (ex.: vegano, vegetariano).`,
        )
        return
      }
    }
    if (!formaPagamento) {
      setError(
        'Selecione a forma de pagamento: Dinheiro, PIX, PIX direto ou Em aberto.',
      )
      return
    }

    const valor = Math.round(totalSelecionado * 100) / 100
    const tipoIdsEnvio =
      tipoPadraoId > 0
        ? tipoIds.map((id) => id || tipoPadraoId)
        : undefined
    const restricoesEnvio = normalizeRestricoesAlimentares(
      temRestricao,
      restricoesTexto,
    )

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
          'Para convites isentos (R$ 0), use Dinheiro, PIX direto ou Em aberto.',
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
        restricoes: restricoesEnvio,
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
      restricoes: restricoesEnvio,
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
    setTemRestricao([false])
    setRestricoesTexto([''])
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
      <header className="page-header no-print">
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
          <p style={{ marginBottom: tipos.length > 0 ? '0.35rem' : undefined }}>
            {evento.nome}
            {evento.data_evento
              ? ` · ${formatDateBr(evento.data_evento)}`
              : ''}
          </p>
          {tipos.length > 0 ? (
            <div className="evento-tipos-precos">
              {tipos.map((t) => (
                <p key={t.tipo_id} className="muted" style={{ margin: 0 }}>
                  {t.label} = {formatMoney(Number(t.valor ?? 0))}
                </p>
              ))}
            </div>
          ) : null}
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
        <div className="no-print">
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        </div>
      ) : null}
      {encerrado ? (
        <div className="no-print">
          <AlertMessage tone="info" title="Evento encerrado">
            Não é possível comprar ou vender novos convites.
          </AlertMessage>
        </div>
      ) : null}

      {ultimaNumeracao && ultimaNumeracao.length > 0 ? (
        <div className="no-print">
          <AlertMessage tone="success" title="Numeração atribuída">
            Convite(s): <strong>{ultimaNumeracao.join(', ')}</strong>
          </AlertMessage>
        </div>
      ) : null}

      {convitesPagos.length > 0 && evento ? (
        <section className="panel no-print-evento-lista">
          <EventoConvitesImpressos
            eventoNome={evento.nome}
            empresaNome={empresa?.nome}
            dataEvento={evento.data_evento}
            imagemUrl={evento.imagem_url}
            convites={convitesPagos}
          />
        </section>
      ) : null}

      <section className="panel no-print-evento-lista">
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
              <AlertMessage tone="info" title="Impressão dos comprovantes">
                Após o pagamento, volte a esta tela do aplicativo para imprimir
                os comprovantes dos ingressos.
              </AlertMessage>
            ) : null}

            {!encerrado ? (
            <form
              className="form-grid form-grid-2"
              onSubmit={(e) => void onComprar(e)}
            >
              <div className="field">
                <label htmlFor="quantidade">Quantidade</label>
                <QuantidadeStepper
                  id="quantidade"
                  value={quantidade}
                  max={Math.max(1, disponiveis)}
                  disabled={saving || disponiveis === 0}
                  onChange={(n) => {
                    setQuantidade(n)
                    setUltimaNumeracao(null)
                    setConvitesPagos([])
                  }}
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
                      <div className="evento-convite-restricao">
                        <label
                          className="checkbox-label"
                          htmlFor={`restricao_chk_${index}`}
                        >
                          <input
                            id={`restricao_chk_${index}`}
                            type="checkbox"
                            checked={!!temRestricao[index]}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setTemRestricao((prev) =>
                                prev.map((v, i) =>
                                  i === index ? checked : v,
                                ),
                              )
                              if (!checked) {
                                setRestricoesTexto((prev) =>
                                  prev.map((v, i) =>
                                    i === index ? '' : v,
                                  ),
                                )
                              }
                            }}
                            disabled={saving}
                          />
                          <span>Restrição alimentar</span>
                        </label>
                        {temRestricao[index] ? (
                          <input
                            id={`restricao_${index}`}
                            className="input"
                            value={restricoesTexto[index] ?? ''}
                            onChange={(e) => {
                              const value = e.target.value
                              setRestricoesTexto((prev) =>
                                prev.map((v, i) =>
                                  i === index ? value : v,
                                ),
                              )
                            }}
                            disabled={saving}
                            required
                            placeholder="Ex.: vegano, vegetariano, sem glúten"
                            maxLength={120}
                          />
                        ) : null}
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
                  <button
                    type="button"
                    className={`btn ${
                      formaPagamento === 'em_aberto'
                        ? 'btn-primary'
                        : 'btn-soft'
                    }`}
                    disabled={saving || pixOpen}
                    onClick={() => setFormaPagamento('em_aberto')}
                    title="Confirma o convite e deixa a receita em aberto para cobrar depois"
                  >
                    Em aberto
                  </button>
                </div>
                {formaPagamento === 'pix' ? (
                  <p className="field-hint" style={{ marginBottom: 0 }}>
                    Gera cobrança PIX Sicredi com a conta bancária do ramo (ou
                    do grupo, se o evento for geral). Informe o telefone antes
                    de continuar.
                  </p>
                ) : formaPagamento === 'em_aberto' ? (
                  <p className="field-hint" style={{ marginBottom: 0 }}>
                    Confirma o(s) convite(s) agora e lança a receita em aberto
                    (a receber) para cobrança posterior em Receitas.
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
          setTemRestricao([false])
          setRestricoesTexto([''])
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

      <section className="panel evento-lista-conferencia">
        <div className="evento-lista-conferencia-cabecalho print-only">
          <h2>Lista de convites — {evento.nome}</h2>
          <p>
            {[empresa?.nome, formatDateBr(evento.data_evento)]
              .filter((x) => x && x !== '—')
              .join(' · ')}
          </p>
          {filtroTiposParcial ? (
            <p>
              Tipos: {[...tiposFiltroAtivos].sort((a, b) => a.localeCompare(b)).join(', ')}
            </p>
          ) : null}
        </div>
        <div
          className="evento-lista-conferencia-toolbar no-print"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '0.75rem',
          }}
        >
          <div>
            <h3 style={{ marginTop: 0, marginBottom: '0.35rem' }}>
              Lista para conferência
            </h3>
            <p className="muted" style={{ margin: 0 }}>
              Convites já vendidos, ordenados pelo número — use no dia do
              evento. Marque os tipos para filtrar a lista e a impressão.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-soft"
            disabled={
              convitesFiltrados.length === 0 || tiposFiltroAtivos.size === 0
            }
            onClick={imprimirListaConvites}
          >
            Imprimir lista
          </button>
        </div>
        {convites.length === 0 ? (
          <div className="empty">Nenhum convite vendido ainda.</div>
        ) : (
          <>
            {tiposNaLista.length > 1 ? (
              <div className="evento-lista-filtro-tipos no-print">
                <div className="evento-lista-filtro-tipos-head">
                  <strong>Filtrar por tipo</strong>
                  <div className="evento-lista-filtro-tipos-acoes">
                    <button
                      type="button"
                      className="btn btn-soft"
                      disabled={todosTiposMarcados}
                      onClick={() =>
                        setFiltroTipos(
                          Object.fromEntries(
                            tiposNaLista.map(([label]) => [label, true]),
                          ),
                        )
                      }
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      className="btn btn-soft"
                      disabled={tiposFiltroAtivos.size === 0}
                      onClick={() =>
                        setFiltroTipos(
                          Object.fromEntries(
                            tiposNaLista.map(([label]) => [label, false]),
                          ),
                        )
                      }
                    >
                      Nenhum
                    </button>
                  </div>
                </div>
                <div className="evento-lista-filtro-tipos-opcoes">
                  {tiposNaLista.map(([label, qtde]) => (
                    <label key={label} className="evento-lista-filtro-tipo">
                      <input
                        type="checkbox"
                        checked={filtroTipos[label] !== false}
                        onChange={(e) =>
                          setFiltroTipos((prev) => ({
                            ...prev,
                            [label]: e.target.checked,
                          }))
                        }
                      />
                      <span>
                        {label} ({qtde})
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
            {tiposFiltroAtivos.size === 0 ? (
              <div className="empty">
                Selecione ao menos um tipo de convite para exibir ou imprimir.
              </div>
            ) : (
              <>
            <div className="evento-convites-totais">
              <p style={{ margin: 0 }}>
                <strong>Total:</strong> {totaisLista.total} convite
                {totaisLista.total === 1 ? '' : 's'} ativo
                {totaisLista.total === 1 ? '' : 's'}
                {totaisLista.inativos > 0
                  ? ` · ${totaisLista.inativos} inativo${
                      totaisLista.inativos === 1 ? '' : 's'
                    }`
                  : ''}
                {filtroTiposParcial
                  ? ` · filtro: ${[...tiposFiltroAtivos]
                      .sort((a, b) => a.localeCompare(b))
                      .join(', ')}`
                  : ''}
                {' · '}
                <strong>Arrecadado:</strong>{' '}
                {formatMoney(totaisLista.valorArrecadado)}
              </p>
              {totaisLista.porTipo.length > 0 ? (
                <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                  Por tipo:{' '}
                  {totaisLista.porTipo
                    .map(
                      ([label, info]) =>
                        `${label} (${info.qtde} · ${formatMoney(info.valor)})`,
                    )
                    .join(' · ')}
                </p>
              ) : null}
              {totaisLista.comRestricao > 0 ? (
                <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                  Restrições ({totaisLista.comRestricao}):{' '}
                  {totaisLista.porRestricao
                    .map(([label, qtde]) => `${label} (${qtde})`)
                    .join(' · ')}
                </p>
              ) : (
                <p className="muted" style={{ margin: '0.35rem 0 0' }}>
                  Nenhuma restrição alimentar informada.
                </p>
              )}
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Nº</th>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Restrição</th>
                    <th>Situação</th>
                    {canStaffEdit ? (
                      <th className="no-print">Ações</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {convitesFiltrados.map((c) => {
                    const inativo = c.ativo === false
                    const editando = editandoConviteId === c.convite_id
                    const salvando = salvandoConviteId === c.convite_id
                    return (
                      <tr
                        key={c.convite_id}
                        className={
                          inativo ? 'evento-convite-row-inativo' : undefined
                        }
                      >
                        <td>
                          <strong>{c.numero}</strong>
                        </td>
                        <td>
                          {editando ? (
                            <div className="evento-convite-nome-edit no-print">
                              <input
                                className="input"
                                value={nomeEdit}
                                onChange={(e) => setNomeEdit(e.target.value)}
                                disabled={salvando}
                                maxLength={200}
                                autoFocus
                              />
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={salvando}
                                onClick={() =>
                                  void salvarNomeConvite(c.convite_id)
                                }
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                className="btn btn-soft"
                                disabled={salvando}
                                onClick={cancelarEdicaoNome}
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            c.nome
                          )}
                          {editando ? (
                            <span className="print-only">{c.nome}</span>
                          ) : null}
                        </td>
                        <td>
                          {c.tipo_label
                            ? `${c.tipo_label}${
                                c.valor_unitario != null
                                  ? ` · ${formatMoney(Number(c.valor_unitario))}`
                                  : ''
                              }`
                            : '—'}
                        </td>
                        <td>
                          {(c.restricao_alimentar ?? '').trim() || '—'}
                        </td>
                        <td>
                          {inativo ? (
                            <span className="badge badge-danger">Inativo</span>
                          ) : (
                            <span className="badge">Ativo</span>
                          )}
                        </td>
                        {canStaffEdit ? (
                          <td className="no-print">
                            <div className="evento-convite-acoes">
                              {!editando ? (
                                <button
                                  type="button"
                                  className="btn btn-soft"
                                  disabled={salvando}
                                  onClick={() => iniciarEdicaoNome(c)}
                                >
                                  Alterar nome
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={`btn ${
                                  inativo ? 'btn-soft' : 'btn-danger'
                                }`}
                                disabled={salvando || editando}
                                onClick={() => void alternarAtivoConvite(c)}
                              >
                                {inativo ? 'Reativar' : 'Inativar'}
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
              </>
            )}
          </>
        )}
      </section>
    </>
  )
}
