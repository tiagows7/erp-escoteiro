import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { PixSicrediCheckoutModal } from '@/components/PixSicrediCheckoutModal'
import { formatMoney } from '@/lib/despesas'
import { formatQty, parseQtyInput } from '@/lib/estoque'
import { finalizarVendaLoja } from '@/lib/lojaVenda'
import {
  empresaTemChavePixInformada,
  type PixCreateInput,
} from '@/lib/pixSicredi'
import { loadPixPendingForEmpresa } from '@/lib/pixSicrediPending'

type ProdutoLoja = {
  produto_id: number
  nome: string
  grupo: number | null
  valor_venda: number | null
  estoque_atual: number | null
  controla_estoque: boolean | null
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

export function LojaPage() {
  const { empresa, hasPermission } = useAuth()
  const empresaId = empresa?.id
  const canSell = hasPermission('vendas.write')

  const [produtos, setProdutos] = useState<ProdutoLoja[]>([])
  const [grupos, setGrupos] = useState<GrupoOpt[]>([])
  const [tiposPagamento, setTiposPagamento] = useState<TipoPagamento[]>([])
  const [filtroGrupo, setFiltroGrupo] = useState('')
  const [q, setQ] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [obs, setObs] = useState('')
  const [tipopagtoId, setTipopagtoId] = useState('')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pixDisponivel, setPixDisponivel] = useState(false)
  const [pixTitle, setPixTitle] = useState('Venda loja')
  const [pixInput, setPixInput] = useState<PixCreateInput | null>(null)

  const grupoMap = useMemo(
    () => new Map(grupos.map((g) => [g.grupoproduto_id, g.nome])),
    [grupos],
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
          'produto_id, nome, grupo, valor_venda, estoque_atual, controla_estoque',
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
    setTipopagtoId((prev) => {
      if (prev && tipos.some((t) => String(t.tipopagto_id) === prev)) return prev
      return tipos.length === 1 ? String(tipos[0].tipopagto_id) : ''
    })
    setLoading(false)
  }

  useEffect(() => {
    void loadProdutos()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on empresa
  }, [empresaId])

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
    () => tiposPagamento.find((t) => String(t.tipopagto_id) === tipopagtoId),
    [tiposPagamento, tipopagtoId],
  )

  function addProduto(p: ProdutoLoja) {
    setSuccess(null)
    setError(null)
    const unitario = Number(p.valor_venda ?? 0)
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

  async function finalizarVenda() {
    if (!canSell) {
      setError('Sem permissão para registrar venda.')
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
    if (!tipopagtoId) {
      setError('Selecione o tipo de pagamento.')
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

    if (tipoSelecionado?.comunica_banco) {
      if (!pixDisponivel) {
        setSaving(false)
        setError(
          'Este tipo comunica com o banco, mas o PIX Sicredi não está configurado. Cadastre a chave PIX na conta bancária do grupo (sem ramo) ou use outro tipo de pagamento.',
        )
        return
      }
      const nomes = itens.map((i) => i.nome).join(', ')
      setPixTitle(`Loja — ${formatMoney(total)}`)
      setPixInput({
        empresaId,
        tipo: 'loja',
        valor: Number(total.toFixed(2)),
        descricao: `Venda loja — ${nomes}`.slice(0, 120),
        tipopagtoId: Number(tipopagtoId),
        lojaItens: itens,
      })
      setSaving(false)
      return
    }

    const result = await finalizarVendaLoja({
      empresaId,
      itens,
      tipopagtoId: Number(tipopagtoId),
      tipopagtoNome: tipoSelecionado?.nome ?? null,
      observacao: obs,
    })

    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }

    clearCart()
    setSuccess(
      `Venda #${result.receita_id} · ${result.itens} item(ns) · ${formatMoney(result.total)}${
        tipoSelecionado ? ` · ${tipoSelecionado.nome}` : ''
      } — receita e estoque atualizados.`,
    )
    await loadProdutos()
  }

  async function onPixPago() {
    setPixInput(null)
    clearCart()
    setSuccess('Pagamento PIX confirmado — venda, receita e estoque atualizados.')
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
          <h2>Loja</h2>
          <p>
            PDV simples de venda — <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn btn-soft" to="/vendas/loja/caixa">
            Caixa
          </Link>
          <Link className="btn btn-soft" to="/dashboard">
            Fechar loja
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

      <div className="loja-pdv">
        <section className="panel loja-pdv-produtos">
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
            <div className="loading">Carregando produtos…</div>
          ) : produtosFiltrados.length === 0 ? (
            <div className="empty">
              Nenhum produto marcado para venda. Cadastre em Estoque → Produtos.
            </div>
          ) : (
            <div className="loja-pdv-grid">
              {produtosFiltrados.map((p) => {
                const estoque = Number(p.estoque_atual ?? 0)
                const controla = p.controla_estoque !== false
                const semEstoque = controla && estoque <= 0
                return (
                  <button
                    key={p.produto_id}
                    type="button"
                    className="loja-pdv-card"
                    disabled={!canSell || saving || semEstoque}
                    onClick={() => addProduto(p)}
                  >
                    <strong>{p.nome}</strong>
                    <span className="loja-pdv-card-meta">
                      {p.grupo != null
                        ? (grupoMap.get(p.grupo) ?? '—')
                        : '—'}
                    </span>
                    <span className="loja-pdv-card-price">
                      {formatMoney(p.valor_venda)}
                    </span>
                    <span className="loja-pdv-card-stock">
                      {controla
                        ? `Estoque: ${formatQty(estoque)}`
                        : 'Sem controle de estoque'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <aside className="panel loja-pdv-carrinho">
          <h3>Carrinho</h3>
          {cart.length === 0 ? (
            <p className="muted">Clique em um produto para adicionar.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Unit.</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => (
                    <tr key={item.produto_id}>
                      <td>{item.nome}</td>
                      <td style={{ minWidth: 88 }}>
                        <input
                          className="input"
                          inputMode="decimal"
                          value={String(item.quantidade).replace('.', ',')}
                          onChange={(e) =>
                            setQty(item.produto_id, e.target.value)
                          }
                          disabled={!canSell || saving}
                          aria-label={`Quantidade ${item.nome}`}
                        />
                      </td>
                      <td>{formatMoney(item.unitario)}</td>
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
            <label htmlFor="loja_tipopagto">Tipo de pagamento</label>
            <select
              id="loja_tipopagto"
              className="select"
              value={tipopagtoId}
              onChange={(e) => setTipopagtoId(e.target.value)}
              disabled={!canSell || saving || cart.length === 0}
              required
            >
              <option value="">Selecione…</option>
              {tiposPagamento.map((t) => (
                <option key={t.tipopagto_id} value={t.tipopagto_id}>
                  {t.nome}
                  {t.comunica_banco ? ' (PIX banco)' : ''}
                </option>
              ))}
            </select>
            {tiposPagamento.length === 0 ? (
              <span className="field-hint">
                Cadastre em Cadastros → Tipo de pagamento (ex.: Dinheiro, PIX).
              </span>
            ) : tipoSelecionado?.comunica_banco ? (
              <span className="field-hint">
                {pixDisponivel
                  ? 'Ao finalizar, abre o PIX Sicredi — a venda só fecha após o banco confirmar.'
                  : 'Marcado para comunicar com o banco, mas o PIX Sicredi ainda não está configurado na conta do grupo.'}
              </span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="loja_obs">Observação (opcional)</label>
            <input
              id="loja_obs"
              className="input"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              disabled={!canSell || saving || cart.length === 0}
              maxLength={200}
            />
          </div>

          <div className="loja-pdv-total">
            <span>Total</span>
            <strong>{formatMoney(total)}</strong>
          </div>

          <div className="form-actions">
            {canSell ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    saving ||
                    cart.length === 0 ||
                    !tipopagtoId ||
                    tiposPagamento.length === 0
                  }
                  onClick={() => void finalizarVenda()}
                >
                  {saving ? 'Registrando…' : 'Finalizar venda'}
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
              <p className="muted">Modo leitura — sem permissão para vender.</p>
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
