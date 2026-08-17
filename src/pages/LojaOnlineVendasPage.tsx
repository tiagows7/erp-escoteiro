import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { formatMoney } from '@/lib/despesas'
import { formatQty } from '@/lib/estoque'
import { marcarPedidoLojaEntregue } from '@/lib/lojaVenda'

type PedidoItem = {
  item_id: number
  nome: string
  quantidade: number
  unitario: number
  total: number
}

type PedidoRow = {
  pedido_id: number
  total: number
  comprador_nome: string | null
  comprador_telefone: string | null
  observacao: string | null
  entregue_em: string | null
  created_at: string
  loja_pedido_item: PedidoItem[] | null
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function LojaOnlineVendasPage() {
  const { empresa, hasPermission } = useAuth()
  const empresaId = empresa?.id
  const canMark = hasPermission('vendas.write')
  const toast = useToast()

  const [pedidos, setPedidos] = useState<PedidoRow[]>([])
  const [filtro, setFiltro] = useState<'todos' | 'pendentes' | 'entregues'>(
    'pendentes',
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const load = useCallback(async () => {
    if (!empresaId) {
      setPedidos([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    let query = supabase
      .from('loja_pedido')
      .select(
        `pedido_id, total, comprador_nome, comprador_telefone, observacao,
         entregue_em, created_at,
         loja_pedido_item(item_id, nome, quantidade, unitario, total)`,
      )
      .eq('empresa_id', empresaId)
      .eq('canal', 'online')
      .order('created_at', { ascending: false })
      .limit(200)

    if (filtro === 'pendentes') query = query.is('entregue_em', null)
    if (filtro === 'entregues') query = query.not('entregue_em', 'is', null)

    const { data, error: loadError } = await query
    if (loadError) {
      setError(loadError.message)
      setPedidos([])
    } else {
      setPedidos((data as PedidoRow[]) ?? [])
    }
    setLoading(false)
  }, [empresaId, filtro])

  useEffect(() => {
    void load()
  }, [load])

  const resumo = useMemo(() => {
    const pendentes = pedidos.filter((p) => !p.entregue_em).length
    const total = pedidos.reduce((acc, p) => acc + Number(p.total ?? 0), 0)
    return { qtde: pedidos.length, pendentes, total }
  }, [pedidos])

  async function onMarcar(pedidoId: number, entregue: boolean) {
    if (!canMark) return
    setBusyId(pedidoId)
    const result = await marcarPedidoLojaEntregue(pedidoId, entregue)
    setBusyId(null)
    if (!result.ok) {
      toast.error('Atenção', result.mensagem)
      return
    }
    toast.success(entregue ? 'Marcado como entregue' : 'Entrega desmarcada')
    await load()
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
          <h2>Vendas da loja online</h2>
          <p>
            Pedidos pagos — <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn btn-soft" to="/vendas/loja-online">
            Catálogo
          </Link>
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

      <section className="panel">
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: '0.65rem' }}>
          <select
            className="select"
            value={filtro}
            onChange={(e) =>
              setFiltro(e.target.value as 'todos' | 'pendentes' | 'entregues')
            }
            aria-label="Filtrar pedidos"
          >
            <option value="pendentes">Pendentes de entrega</option>
            <option value="entregues">Entregues</option>
            <option value="todos">Todos</option>
          </select>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => void load()}
            disabled={loading}
          >
            Atualizar
          </button>
        </div>

        <p className="muted" style={{ marginTop: '0.75rem' }}>
          {resumo.qtde} pedido(s) · {resumo.pendentes} pendente(s) · total{' '}
          {formatMoney(resumo.total)}
        </p>

        {loading ? (
          <div className="loading">Carregando vendas…</div>
        ) : pedidos.length === 0 ? (
          <div className="empty">Nenhum pedido neste filtro.</div>
        ) : (
          <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Data</th>
                  <th>Comprador</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => {
                  const itens = Array.isArray(p.loja_pedido_item)
                    ? p.loja_pedido_item
                    : []
                  const open = expandedId === p.pedido_id
                  return (
                    <Fragment key={p.pedido_id}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() =>
                              setExpandedId(open ? null : p.pedido_id)
                            }
                          >
                            #{p.pedido_id} {open ? '▾' : '▸'}
                          </button>
                        </td>
                        <td>{formatDateTime(p.created_at)}</td>
                        <td>
                          <div>{p.comprador_nome || '—'}</div>
                          {p.comprador_telefone ? (
                            <span className="muted">{p.comprador_telefone}</span>
                          ) : null}
                        </td>
                        <td>{formatMoney(p.total)}</td>
                        <td>
                          {p.entregue_em ? (
                            <span className="badge">
                              Entregue {formatDateTime(p.entregue_em)}
                            </span>
                          ) : (
                            <span className="badge badge-danger">Pendente</span>
                          )}
                        </td>
                        <td>
                          {canMark ? (
                            p.entregue_em ? (
                              <button
                                type="button"
                                className="btn btn-soft"
                                disabled={busyId === p.pedido_id}
                                onClick={() => void onMarcar(p.pedido_id, false)}
                              >
                                Desmarcar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-primary"
                                disabled={busyId === p.pedido_id}
                                onClick={() => void onMarcar(p.pedido_id, true)}
                              >
                                {busyId === p.pedido_id
                                  ? 'Salvando…'
                                  : 'Marcar entregue'}
                              </button>
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={6}>
                            <div className="loja-online-pedido-detalhe">
                              {p.observacao ? (
                                <p className="muted">Obs.: {p.observacao}</p>
                              ) : null}
                              {itens.length === 0 ? (
                                <p className="muted">Sem itens.</p>
                              ) : (
                                <table className="data">
                                  <thead>
                                    <tr>
                                      <th>Produto</th>
                                      <th>Qtd</th>
                                      <th>Unit.</th>
                                      <th>Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {itens.map((i) => (
                                      <tr key={i.item_id}>
                                        <td>{i.nome}</td>
                                        <td>{formatQty(i.quantidade)}</td>
                                        <td>{formatMoney(i.unitario)}</td>
                                        <td>{formatMoney(i.total)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
