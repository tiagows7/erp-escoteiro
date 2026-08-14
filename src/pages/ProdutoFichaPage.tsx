import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { formatMoney } from '@/lib/despesas'
import {
  formatQty,
  operacaoEstoqueLabel,
} from '@/lib/estoque'

type ProdutoInfo = {
  produto_id: number
  nome: string
  grupo: number | null
  estoque_atual: number | null
  controla_estoque: boolean | null
  valor_venda: number | null
}

type MovimentoRow = {
  movimentoest_id: number
  movimentoest_numero: number | null
  movimentoest_operacao: number | null
  movimentoest_emissao: string | null
  movimentoest_sinal: string | null
  movimentoest_quantidade: number | null
  movimentoest_unitario: number | null
  movimentoest_total: number | null
  movimentoest_origem: string | null
  movimentoest_obs: string | null
}

type LinhaFicha = MovimentoRow & {
  entrada: number
  saida: number
  saldo: number
}

type GrupoOpt = { grupoproduto_id: number; nome: string }

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function origemLabel(origem: string | null | undefined) {
  if (origem === 'acerto') return 'Acerto'
  if (origem === 'loja') return 'Loja'
  return origem?.trim() || '—'
}

export function ProdutoFichaPage() {
  const { id } = useParams()
  const { empresa } = useAuth()
  const empresaId = empresa?.id
  const produtoId = Number(id)

  const [produto, setProduto] = useState<ProdutoInfo | null>(null)
  const [grupos, setGrupos] = useState<GrupoOpt[]>([])
  const [movimentos, setMovimentos] = useState<MovimentoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaId || !Number.isFinite(produtoId) || produtoId <= 0) {
      setLoading(false)
      setError('Produto inválido.')
      return
    }

    let mounted = true
    void (async () => {
      setLoading(true)
      const [prodRes, movRes, grupoRes] = await Promise.all([
        supabase
          .from('produto')
          .select(
            'produto_id, nome, grupo, estoque_atual, controla_estoque, valor_venda',
          )
          .eq('empresa_id', empresaId)
          .eq('produto_id', produtoId)
          .maybeSingle(),
        supabase
          .from('movimento_estoque')
          .select(
            'movimentoest_id, movimentoest_numero, movimentoest_operacao, movimentoest_emissao, movimentoest_sinal, movimentoest_quantidade, movimentoest_unitario, movimentoest_total, movimentoest_origem, movimentoest_obs',
          )
          .eq('empresa_id', empresaId)
          .eq('movimentoest_produto', produtoId)
          .order('movimentoest_emissao', { ascending: true })
          .order('movimentoest_numero', { ascending: true })
          .order('movimentoest_id', { ascending: true }),
        supabase
          .from('grupo_produto')
          .select('grupoproduto_id, nome')
          .eq('empresa_id', empresaId)
          .order('nome'),
      ])

      if (!mounted) return

      if (prodRes.error) {
        setError(prodRes.error.message)
        setProduto(null)
        setMovimentos([])
      } else if (!prodRes.data) {
        setError('Produto não encontrado.')
        setProduto(null)
        setMovimentos([])
      } else {
        setError(movRes.error?.message ?? null)
        setProduto(prodRes.data as ProdutoInfo)
        setMovimentos(
          movRes.error ? [] : ((movRes.data as MovimentoRow[]) ?? []),
        )
      }
      setGrupos((grupoRes.data as GrupoOpt[]) ?? [])
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, produtoId])

  const linhas = useMemo((): LinhaFicha[] => {
    let saldo = 0
    return movimentos.map((m) => {
      const qtd = Number(m.movimentoest_quantidade ?? 0)
      const sinal = String(m.movimentoest_sinal ?? '+')
      const entrada = sinal === '-' ? 0 : qtd
      const saida = sinal === '-' ? qtd : 0
      saldo += entrada - saida
      return { ...m, entrada, saida, saldo }
    })
  }, [movimentos])

  const grupoNome = useMemo(() => {
    if (produto?.grupo == null) return '—'
    return (
      grupos.find((g) => g.grupoproduto_id === produto.grupo)?.nome ??
      `Grupo ${produto.grupo}`
    )
  }, [produto, grupos])

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
          <h2>Ficha de estoque</h2>
          <p>
            Movimentos do produto por data, com saldo após cada operação.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn btn-soft" to="/estoque/produtos">
            Voltar
          </Link>
          {produto ? (
            <Link
              className="btn btn-soft"
              to={`/estoque/produtos/${produto.produto_id}`}
            >
              Cadastro
            </Link>
          ) : null}
        </div>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}

      {loading ? (
        <div className="loading">Carregando ficha…</div>
      ) : produto ? (
        <>
          <section className="panel">
            <div className="stats-grid" style={{ marginBottom: 0 }}>
              <div>
                <span className="muted">Produto</span>
                <strong style={{ display: 'block' }}>{produto.nome}</strong>
              </div>
              <div>
                <span className="muted">Grupo</span>
                <strong style={{ display: 'block' }}>{grupoNome}</strong>
              </div>
              <div>
                <span className="muted">Valor venda</span>
                <strong style={{ display: 'block' }}>
                  {formatMoney(produto.valor_venda)}
                </strong>
              </div>
              <div>
                <span className="muted">Estoque atual</span>
                <strong style={{ display: 'block' }}>
                  {produto.controla_estoque === false
                    ? '—'
                    : formatQty(produto.estoque_atual)}
                </strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
              {linhas.length === 0
                ? 'Nenhum movimento registrado.'
                : `${linhas.length} movimento(s)`}
            </p>

            {linhas.length === 0 ? (
              <div className="empty">
                Ainda não há acertos nem vendas deste produto.
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Nº</th>
                      <th>Operação</th>
                      <th>Origem</th>
                      <th>Entrada</th>
                      <th>Saída</th>
                      <th>Saldo</th>
                      <th>Obs.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((row) => (
                      <tr key={row.movimentoest_id}>
                        <td>{formatDate(row.movimentoest_emissao)}</td>
                        <td>{row.movimentoest_numero ?? '—'}</td>
                        <td>
                          {operacaoEstoqueLabel(row.movimentoest_operacao)}
                        </td>
                        <td>{origemLabel(row.movimentoest_origem)}</td>
                        <td>
                          {row.entrada > 0 ? formatQty(row.entrada) : '—'}
                        </td>
                        <td>
                          {row.saida > 0 ? formatQty(row.saida) : '—'}
                        </td>
                        <td>
                          <strong>{formatQty(row.saldo)}</strong>
                        </td>
                        <td>{row.movimentoest_obs?.trim() || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  )
}
