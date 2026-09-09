import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertMessage } from '@/components/AlertMessage'
import { PixSicrediPublicCheckoutModal } from '@/components/PixSicrediPublicCheckoutModal'
import { QuantidadeStepper } from '@/components/QuantidadeStepper'
import {
  fetchLojaPublicInfo,
  type LojaPublicInfo,
  type LojaPublicProduto,
} from '@/lib/lojaOnlinePublic'
import type { PixPublicLojaInput } from '@/lib/pixSicrediPublic'
import { formatMoney } from '@/lib/despesas'
import { formatQty } from '@/lib/estoque'

type CartItem = LojaPublicProduto & { quantidade: number }

export function LojaOnlinePublicPage() {
  const { token = '' } = useParams()
  const [info, setInfo] = useState<LojaPublicInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [grupo, setGrupo] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [compradorNome, setCompradorNome] = useState('')
  const [compradorTelefone, setCompradorTelefone] = useState('')
  const [pixInput, setPixInput] = useState<PixPublicLojaInput | null>(null)

  async function load() {
    if (!token) {
      setError('Link inválido.')
      setLoading(false)
      return
    }
    setLoading(true)
    const result = await fetchLojaPublicInfo(token)
    setInfo(result.data)
    setError(result.error)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const grupoMap = useMemo(
    () =>
      new Map(
        (info?.grupos ?? []).map((item) => [
          item.grupoproduto_id,
          item.nome,
        ]),
      ),
    [info?.grupos],
  )

  const produtos = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return (info?.produtos ?? []).filter((produto) => {
      if (grupo && String(produto.grupo) !== grupo) return false
      const grupoNome =
        produto.grupo == null
          ? ''
          : (grupoMap.get(produto.grupo) ?? '').toLowerCase()
      return (
        !termo ||
        produto.nome.toLowerCase().includes(termo) ||
        grupoNome.includes(termo)
      )
    })
  }, [busca, grupo, grupoMap, info?.produtos])

  const total = useMemo(
    () =>
      cart.reduce(
        (soma, item) => soma + item.valor_venda * item.quantidade,
        0,
      ),
    [cart],
  )

  function adicionar(produto: LojaPublicProduto) {
    setError(null)
    setSuccess(null)
    if (!(produto.valor_venda > 0)) {
      setError(`“${produto.nome}” está sem preço de venda.`)
      return
    }
    if (produto.controla_estoque && produto.estoque_atual < 1) return
    setCart((atual) => {
      const existente = atual.find(
        (item) => item.produto_id === produto.produto_id,
      )
      if (!existente) return [...atual, { ...produto, quantidade: 1 }]
      const max = produto.controla_estoque
        ? produto.estoque_atual
        : Number.MAX_SAFE_INTEGER
      return atual.map((item) =>
        item.produto_id === produto.produto_id
          ? { ...item, quantidade: Math.min(item.quantidade + 1, max) }
          : item,
      )
    })
  }

  function setQuantidade(produtoId: number, quantidade: number) {
    setCart((atual) =>
      atual.map((item) =>
        item.produto_id === produtoId ? { ...item, quantidade } : item,
      ),
    )
  }

  function pagar() {
    setError(null)
    setSuccess(null)
    if (!compradorNome.trim()) {
      setError('Informe o nome do comprador.')
      return
    }
    if (!compradorTelefone.trim()) {
      setError('Informe o telefone do comprador.')
      return
    }
    if (!cart.length) {
      setError('Adicione ao menos um produto.')
      return
    }
    setPixInput({
      kind: 'loja',
      linkToken: token,
      itens: cart.map((item) => ({
        produto_id: item.produto_id,
        quantidade: item.quantidade,
      })),
      compradorNome: compradorNome.trim(),
      compradorTelefone: compradorTelefone.trim(),
      valor: total,
      descricao: 'Compra na loja online',
    })
  }

  async function compraConfirmada() {
    setPixInput(null)
    setCart([])
    setSuccess(
      'Pagamento confirmado. Seu pedido foi recebido e aguarda a entrega.',
    )
    await load()
  }

  if (loading) {
    return (
      <div className="public-rifa-page">
        <div className="loading">Carregando loja…</div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="public-rifa-page">
        <section className="panel">
          <AlertMessage tone="error" title="Link inválido">
            {error ?? 'Esta loja não está disponível.'}
          </AlertMessage>
        </section>
      </div>
    )
  }

  return (
    <div className="public-rifa-page">
      <header className="public-rifa-header">
        <p className="muted">{info.empresa_nome}</p>
        <h1>Loja online</h1>
        <p>Escolha os produtos e pague com PIX.</p>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}
      {success ? (
        <AlertMessage tone="success" title="Pedido realizado">
          {success}
        </AlertMessage>
      ) : null}

      <div className="loja-online">
        <section className="panel loja-online-catalogo">
          <div className="toolbar">
            <input
              className="input"
              placeholder="Buscar produto…"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
            />
            <select
              className="select"
              value={grupo}
              onChange={(event) => setGrupo(event.target.value)}
              aria-label="Filtrar por grupo"
            >
              <option value="">Todos os grupos</option>
              {info.grupos.map((item) => (
                <option
                  key={item.grupoproduto_id}
                  value={item.grupoproduto_id}
                >
                  {item.nome}
                </option>
              ))}
            </select>
          </div>

          {produtos.length === 0 ? (
            <div className="empty">Nenhum produto disponível.</div>
          ) : (
            <div className="loja-online-grid">
              {produtos.map((produto) => {
                const indisponivel =
                  (produto.controla_estoque && produto.estoque_atual <= 0) ||
                  !(produto.valor_venda > 0)
                const noCarrinho = cart.find(
                  (item) => item.produto_id === produto.produto_id,
                )
                return (
                  <article
                    key={produto.produto_id}
                    className={`loja-online-card${indisponivel ? ' is-disabled' : ''}`}
                  >
                    {produto.imagem_url ? (
                      <img
                        className="loja-online-card-img"
                        src={produto.imagem_url}
                        alt={produto.nome}
                        loading="lazy"
                      />
                    ) : (
                      <div className="loja-online-card-img loja-online-card-img--empty">
                        Sem foto
                      </div>
                    )}
                    <div className="loja-online-card-body">
                      <strong>{produto.nome}</strong>
                      <span className="loja-online-card-meta">
                        {produto.grupo == null
                          ? 'Sem grupo'
                          : (grupoMap.get(produto.grupo) ?? '—')}
                      </span>
                      <span className="loja-online-card-price">
                        {formatMoney(produto.valor_venda)}
                      </span>
                      <span className="loja-online-card-stock">
                        {produto.controla_estoque
                          ? `Estoque: ${formatQty(produto.estoque_atual)}`
                          : 'Disponível'}
                        {noCarrinho
                          ? ` · no carrinho: ${formatQty(noCarrinho.quantidade)}`
                          : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={indisponivel}
                      onClick={() => adicionar(produto)}
                    >
                      {indisponivel ? 'Indisponível' : 'Adicionar'}
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
            cart.map((item) => (
              <div className="loja-public-cart-item" key={item.produto_id}>
                <div>
                  <strong>{item.nome}</strong>
                  <div className="muted">
                    {formatMoney(item.valor_venda)} por unidade
                  </div>
                </div>
                <QuantidadeStepper
                  value={item.quantidade}
                  max={
                    item.controla_estoque
                      ? Math.floor(item.estoque_atual)
                      : 999
                  }
                  onChange={(quantidade) =>
                    setQuantidade(item.produto_id, quantidade)
                  }
                />
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={() =>
                    setCart((atual) =>
                      atual.filter(
                        (produto) => produto.produto_id !== item.produto_id,
                      ),
                    )
                  }
                >
                  Remover
                </button>
              </div>
            ))
          )}

          <div className="field">
            <label htmlFor="loja_public_nome">Nome do comprador</label>
            <input
              id="loja_public_nome"
              className="input"
              value={compradorNome}
              onChange={(event) => setCompradorNome(event.target.value)}
              maxLength={200}
            />
          </div>
          <div className="field">
            <label htmlFor="loja_public_telefone">Telefone</label>
            <input
              id="loja_public_telefone"
              className="input"
              inputMode="tel"
              value={compradorTelefone}
              onChange={(event) => setCompradorTelefone(event.target.value)}
              maxLength={40}
            />
          </div>
          <div className="loja-online-total">
            <span>Total</span>
            <strong>{formatMoney(total)}</strong>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!cart.length}
            onClick={pagar}
          >
            Pagar com PIX
          </button>
        </aside>
      </div>

      <PixSicrediPublicCheckoutModal
        open={!!pixInput}
        title="Pagamento da loja"
        input={pixInput}
        paidMessage="Pagamento confirmado. Seu pedido foi recebido."
        onClose={() => setPixInput(null)}
        onPaid={() => void compraConfirmada()}
      />
    </div>
  )
}
