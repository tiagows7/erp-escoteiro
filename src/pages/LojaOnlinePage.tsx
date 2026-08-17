import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { PixSicrediCheckoutModal } from '@/components/PixSicrediCheckoutModal'
import { formatMoney } from '@/lib/despesas'
import { formatQty, parseQtyInput } from '@/lib/estoque'
import {
  empresaTemChavePixInformada,
  type PixCreateInput,
} from '@/lib/pixSicredi'
import { loadPixPendingForEmpresa } from '@/lib/pixSicrediPending'
import { isAssociadoLogin } from '@/lib/roles'

type ProdutoLoja = {
  produto_id: number
  nome: string
  grupo: number | null
  valor_venda: number | null
  estoque_atual: number | null
  controla_estoque: boolean | null
  imagem_url: string | null
}

type GrupoOpt = { grupoproduto_id: number; nome: string }

type TipoPagamento = {
  tipopagto_id: number
  nome: string
  quita: boolean | null
  comunica_banco: boolean | null
}

type CartItem = {
  produto_id: number
  nome: string
  unitario: number
  quantidade: number
  controla_estoque: boolean
  estoque_atual: number
}

export function LojaOnlinePage() {
  const { empresa, profile, hasPermission } = useAuth()
  const empresaId = empresa?.id
  const associadoLogin = isAssociadoLogin(profile)
  const canStaffSell = hasPermission('vendas.write')
  /** Associado compra só via PIX; equipe usa qualquer tipo de pagamento. */
  const canBuy = canStaffSell || associadoLogin

  const [produtos, setProdutos] = useState<ProdutoLoja[]>([])
  const [grupos, setGrupos] = useState<GrupoOpt[]>([])
  const [tiposPagamento, setTiposPagamento] = useState<TipoPagamento[]>([])
  const [filtroGrupo, setFiltroGrupo] = useState('')
  const [q, setQ] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [obs, setObs] = useState('')
  const [compradorNome, setCompradorNome] = useState('')
  const [compradorTelefone, setCompradorTelefone] = useState('')
  const [associadoId, setAssociadoId] = useState<number | null>(null)
  const [tipopagtoId, setTipopagtoId] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pixDisponivel, setPixDisponivel] = useState(false)
  const [pixTitle, setPixTitle] = useState('Loja online')
  const [pixInput, setPixInput] = useState<PixCreateInput | null>(null)

  const grupoMap = useMemo(
    () => new Map(grupos.map((g) => [g.grupoproduto_id, g.nome])),
    [grupos],
  )

  const tiposVisiveis = useMemo(
    () => tiposPagamento.filter((t) => t.comunica_banco),
    [tiposPagamento],
  )

  async function loadProdutos() {
    if (!empresaId) {
      setProdutos([])
      setGrupos([])
      setTiposPagamento([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [prodRes, grupoRes, tipoRes, pixOk] = await Promise.all([
      supabase
        .from('produto')
        .select(
          'produto_id, nome, grupo, valor_venda, estoque_atual, controla_estoque, imagem_url',
        )
        .eq('empresa_id', empresaId)
        .eq('ativo', true)
        .eq('venda', true)
        .order('nome'),
      supabase
        .from('grupo_produto')
        .select('grupoproduto_id, nome')
        .eq('empresa_id', empresaId)
        .order('nome'),
      supabase
        .from('tipo_pagamento')
        .select('tipopagto_id, nome, quita, comunica_banco')
        .eq('empresa_id', empresaId)
        .order('nome'),
      empresaTemChavePixInformada(empresaId),
    ])
    if (prodRes.error) {
      setError(prodRes.error.message)
      setProdutos([])
    } else {
      setError(null)
      setProdutos((prodRes.data as ProdutoLoja[]) ?? [])
    }
    setGrupos((grupoRes.data as GrupoOpt[]) ?? [])
    const tipos = (tipoRes.data as TipoPagamento[]) ?? []
    setTiposPagamento(tipos)
    setPixDisponivel(pixOk)

    if (associadoLogin && profile?.registro) {
      const registroNum = Number(String(profile.registro).replace(/\D/g, ''))
      if (Number.isFinite(registroNum) && registroNum > 0) {
        const { data: assoc } = await supabase
          .from('associados')
          .select('associado_id, nome, celular')
          .eq('empresa_id', empresaId)
          .eq('registro', registroNum)
          .maybeSingle()
        if (assoc?.associado_id) {
          setAssociadoId(assoc.associado_id as number)
          setCompradorNome((prev) => prev || String(assoc.nome ?? profile.nome ?? ''))
          setCompradorTelefone((prev) =>
            prev || String(assoc.celular ?? '').trim(),
          )
        }
      }
    } else if (!associadoLogin && profile?.nome) {
      setCompradorNome((prev) => prev || profile.nome)
    }

    const tiposOk = tipos.filter((t) => t.comunica_banco)
    setTipopagtoId((prev) => {
      if (prev && tiposOk.some((t) => String(t.tipopagto_id) === prev)) {
        return prev
      }
      return tiposOk.length >= 1 ? String(tiposOk[0].tipopagto_id) : ''
    })
    setLoading(false)
  }

  useEffect(() => {
    void loadProdutos()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on empresa/role
  }, [empresaId, canStaffSell])

  useEffect(() => {
    if (!empresaId) return
    const pending = loadPixPendingForEmpresa(empresaId, ['loja'])
    if (!pending) return
    setPixTitle(pending.title)
    setPixInput(pending.input)
  }, [empresaId])

  const produtosFiltrados = useMemo(() => {
    const term = q.trim().toLowerCase()
    return produtos.filter((p) => {
      if (filtroGrupo && String(p.grupo) !== filtroGrupo) return false
      if (!term) return true
      const grupoNome =
        p.grupo != null ? (grupoMap.get(p.grupo) ?? '').toLowerCase() : ''
      return p.nome.toLowerCase().includes(term) || grupoNome.includes(term)
    })
  }, [produtos, filtroGrupo, q, grupoMap])

  const total = useMemo(
    () => cart.reduce((acc, item) => acc + item.unitario * item.quantidade, 0),
    [cart],
  )

  const tipoSelecionado = useMemo(
    () => tiposVisiveis.find((t) => String(t.tipopagto_id) === tipopagtoId),
    [tiposVisiveis, tipopagtoId],
  )

  function addProduto(p: ProdutoLoja) {
    if (!canBuy) return
    setSuccess(null)
    setError(null)
    const unitario = Number(p.valor_venda ?? 0)
    if (!(unitario > 0)) {
      setError(`“${p.nome}” ainda não tem preço de venda.`)
      return
    }
    const estoque = Number(p.estoque_atual ?? 0)
    const controla = p.controla_estoque !== false

    setCart((prev) => {
      const existing = prev.find((c) => c.produto_id === p.produto_id)
      if (existing) {
        const nextQty = existing.quantidade + 1
        if (controla && nextQty > estoque) {
          setError(
            `Estoque insuficiente para “${p.nome}” (saldo ${formatQty(estoque)}).`,
          )
          return prev
        }
        return prev.map((c) =>
          c.produto_id === p.produto_id
            ? { ...c, quantidade: nextQty, estoque_atual: estoque }
            : c,
        )
      }
      if (controla && estoque < 1) {
        setError(`“${p.nome}” sem estoque disponível.`)
        return prev
      }
      return [
        ...prev,
        {
          produto_id: p.produto_id,
          nome: p.nome,
          unitario,
          quantidade: 1,
          controla_estoque: controla,
          estoque_atual: estoque,
        },
      ]
    })
  }

  function setQty(produtoId: number, raw: string) {
    setError(null)
    const qtd = parseQtyInput(raw)
    setCart((prev) =>
      prev.map((c) => {
        if (c.produto_id !== produtoId) return c
        if (c.controla_estoque && qtd > c.estoque_atual) {
          setError(
            `Estoque insuficiente para “${c.nome}” (saldo ${formatQty(c.estoque_atual)}).`,
          )
          return { ...c, quantidade: c.estoque_atual }
        }
        return { ...c, quantidade: qtd }
      }),
    )
  }

  function removeItem(produtoId: number) {
    setCart((prev) => prev.filter((c) => c.produto_id !== produtoId))
  }

  function clearCart() {
    setCart([])
    setObs('')
    setError(null)
  }

  async function finalizarCompra() {
    if (!canBuy) {
      setError('Sem permissão para comprar nesta loja.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (cart.length === 0) {
      setError('Adicione pelo menos um produto.')
      return
    }
    if (!compradorNome.trim()) {
      setError('Informe o nome do comprador.')
      return
    }
    if (!tipopagtoId) {
      setError(
        'Configure um tipo de pagamento que comunica com o banco (PIX) no grupo.',
      )
      return
    }
    for (const item of cart) {
      if (item.quantidade <= 0) {
        setError(`Quantidade inválida em “${item.nome}”.`)
        return
      }
      if (item.controla_estoque && item.quantidade > item.estoque_atual) {
        setError(
          `Estoque insuficiente para “${item.nome}” (saldo ${formatQty(item.estoque_atual)}).`,
        )
        return
      }
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    const itens = cart.map((item) => ({
      produto_id: item.produto_id,
      nome: item.nome,
      unitario: item.unitario,
      quantidade: item.quantidade,
    }))

    if (!tipoSelecionado?.comunica_banco) {
      setSaving(false)
      setError(
        'Na loja online só é permitido pagamento que comunica com o banco (PIX).',
      )
      return
    }
    if (!pixDisponivel) {
      setSaving(false)
      setError(
        'PIX Sicredi não está configurado. Cadastre a chave PIX na conta bancária do grupo.',
      )
      return
    }

    const nomes = itens.map((i) => i.nome).join(', ')
    const obsTxt = obs.trim()
    setPixTitle(`Loja online — ${formatMoney(total)}`)
    setPixInput({
      empresaId,
      tipo: 'loja',
      valor: Number(total.toFixed(2)),
      descricao: `Venda loja online — ${nomes}${
        obsTxt ? ` · ${obsTxt}` : ''
      }`.slice(0, 120),
      tipopagtoId: Number(tipopagtoId),
      associadoId,
      lojaItens: {
        canal: 'online',
        comprador_nome: compradorNome.trim(),
        comprador_telefone: compradorTelefone.trim() || null,
        itens,
      },
    })
    setSaving(false)
  }

  async function onPixPago() {
    setPixInput(null)
    clearCart()
    setSuccess(
      'Pagamento PIX confirmado — pedido, receita e estoque atualizados.',
    )
    await loadProdutos()
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

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Loja online</h2>
          <p>
            Catálogo com os produtos do estoque à venda —{' '}
            <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <div className="page-header-actions">
          {!associadoLogin ? (
            <Link className="btn btn-soft" to="/vendas/loja-online/vendas">
              Ver vendas
            </Link>
          ) : null}
          <Link className="btn btn-soft" to="/dashboard">
            Voltar
          </Link>
        </div>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}
      {success ? (
        <AlertMessage tone="success" title="OK">
          {success}
        </AlertMessage>
      ) : null}

      {!canBuy ? (
        <AlertMessage tone="info" title="Somente consulta">
          Você pode ver o catálogo, mas não tem permissão para comprar.
        </AlertMessage>
      ) : null}

      <div className="loja-online">
        <section className="panel loja-online-catalogo">
          <div className="toolbar">
            <input
              className="input"
              placeholder="Buscar produto…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={loading}
            />
            <select
              className="select"
              value={filtroGrupo}
              onChange={(e) => setFiltroGrupo(e.target.value)}
              disabled={loading}
              aria-label="Filtrar por grupo"
            >
              <option value="">Todos os grupos</option>
              {grupos.map((g) => (
                <option key={g.grupoproduto_id} value={g.grupoproduto_id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="loading">Carregando catálogo…</div>
          ) : produtosFiltrados.length === 0 ? (
            <div className="empty">
              Nenhum produto marcado para venda. Cadastre em Estoque → Produtos
              (ativo + venda).
            </div>
          ) : (
            <div className="loja-online-grid">
              {produtosFiltrados.map((p) => {
                const estoque = Number(p.estoque_atual ?? 0)
                const controla = p.controla_estoque !== false
                const semEstoque = controla && estoque <= 0
                const semPreco = !(Number(p.valor_venda ?? 0) > 0)
                const noCarrinho = cart.find(
                  (c) => c.produto_id === p.produto_id,
                )
                return (
                  <article
                    key={p.produto_id}
                    className={`loja-online-card${semEstoque || semPreco ? ' is-disabled' : ''}`}
                  >
                    {p.imagem_url ? (
                      <img
                        className="loja-online-card-img"
                        src={p.imagem_url}
                        alt={p.nome}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="loja-online-card-img loja-online-card-img--empty">
                        Sem foto
                      </div>
                    )}
                    <div className="loja-online-card-body">
                      <strong>{p.nome}</strong>
                      <span className="loja-online-card-meta">
                        {p.grupo != null
                          ? (grupoMap.get(p.grupo) ?? '—')
                          : 'Sem grupo'}
                      </span>
                      <span className="loja-online-card-price">
                        {formatMoney(p.valor_venda)}
                      </span>
                      <span className="loja-online-card-stock">
                        {controla
                          ? `Estoque: ${formatQty(estoque)}`
                          : 'Sem controle de estoque'}
                        {noCarrinho
                          ? ` · no carrinho: ${formatQty(noCarrinho.quantidade)}`
                          : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={
                        !canBuy || saving || semEstoque || semPreco
                      }
                      onClick={() => addProduto(p)}
                    >
                      {semEstoque
                        ? 'Indisponível'
                        : semPreco
                          ? 'Sem preço'
                          : 'Adicionar'}
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <aside className="panel loja-online-carrinho">
          <h3>Carrinho</h3>
          {cart.length === 0 ? (
            <p className="muted">Adicione produtos do catálogo.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.produto_id}>
                      <td>
                        <div>{item.nome}</div>
                        <span className="muted">
                          {formatMoney(item.unitario)} un.
                        </span>
                      </td>
                      <td style={{ minWidth: 88 }}>
                        <input
                          className="input"
                          inputMode="decimal"
                          value={String(item.quantidade).replace('.', ',')}
                          onChange={(e) =>
                            setQty(item.produto_id, e.target.value)
                          }
                          disabled={!canBuy || saving}
                          aria-label={`Quantidade ${item.nome}`}
                        />
                      </td>
                      <td>
                        {formatMoney(item.unitario * item.quantidade)}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-soft"
                          onClick={() => removeItem(item.produto_id)}
                          disabled={saving}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="field" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="loja_online_tipopagto">Tipo de pagamento</label>
            <select
              id="loja_online_tipopagto"
              className="select"
              value={tipopagtoId}
              onChange={(e) => setTipopagtoId(e.target.value)}
              disabled={!canBuy || saving || cart.length === 0}
              required
            >
              <option value="">Selecione…</option>
              {tiposVisiveis.map((t) => (
                <option key={t.tipopagto_id} value={t.tipopagto_id}>
                  {t.nome}
                </option>
              ))}
            </select>
            <span className="field-hint">
              {pixDisponivel && tiposVisiveis.length > 0
                ? 'Somente pagamentos que comunicam com o banco (PIX Sicredi).'
                : 'Cadastre um tipo de pagamento com “comunica com o banco” e o PIX Sicredi do grupo.'}
            </span>
          </div>

          <div className="field">
            <label htmlFor="loja_online_comprador">Nome do comprador</label>
            <input
              id="loja_online_comprador"
              className="input"
              value={compradorNome}
              onChange={(e) => setCompradorNome(e.target.value)}
              disabled={!canBuy || saving || cart.length === 0}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="loja_online_fone">Telefone (opcional)</label>
            <input
              id="loja_online_fone"
              className="input"
              value={compradorTelefone}
              onChange={(e) => setCompradorTelefone(e.target.value)}
              disabled={!canBuy || saving || cart.length === 0}
              inputMode="tel"
            />
          </div>

          {canStaffSell ? (
            <div className="field">
              <label htmlFor="loja_online_obs">Observação (opcional)</label>
              <input
                id="loja_online_obs"
                className="input"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                disabled={!canBuy || saving || cart.length === 0}
                maxLength={200}
              />
            </div>
          ) : null}

          <div className="loja-online-total">
            <span>Total</span>
            <strong>{formatMoney(total)}</strong>
          </div>

          <div className="form-actions">
            {canBuy ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    saving ||
                    cart.length === 0 ||
                    !tipopagtoId ||
                    tiposVisiveis.length === 0
                  }
                  onClick={() => void finalizarCompra()}
                >
                  {saving
                    ? 'Processando…'
                    : 'Pagar com PIX'}
                </button>
                <button
                  type="button"
                  className="btn btn-soft"
                  disabled={saving || cart.length === 0}
                  onClick={clearCart}
                >
                  Limpar
                </button>
              </>
            ) : (
              <p className="muted">Sem permissão para comprar.</p>
            )}
          </div>
        </aside>
      </div>

      <PixSicrediCheckoutModal
        open={!!pixInput}
        title={pixTitle}
        input={pixInput}
        onClose={() => setPixInput(null)}
        onPaid={() => void onPixPago()}
      />
    </>
  )
}
