import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { formatMoney } from '@/lib/despesas'
import { formatQty } from '@/lib/estoque'

type ProdutoRow = {
  produto_id: number
  empresa_id: number
  nome: string
  grupo: number | null
  venda: boolean | null
  controla_estoque: boolean | null
  valor_venda: number | null
  estoque_atual: number | null
  ativo: boolean | null
}

type GrupoOpt = { grupoproduto_id: number; nome: string }

export function ProdutoPage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('estoque.write')
  const empresaId = empresa?.id
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<ProdutoRow[]>([])
  const [grupos, setGrupos] = useState<GrupoOpt[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const grupoMap = useMemo(
    () => new Map(grupos.map((g) => [g.grupoproduto_id, g.nome])),
    [grupos],
  )

  useEffect(() => {
    if (!empresaId) {
      setRows([])
      setGrupos([])
      setLoading(false)
      return
    }

    let mounted = true
    void (async () => {
      setLoading(true)
      const [prodRes, grupoRes] = await Promise.all([
        supabase
          .from('produto')
          .select(
            'produto_id, empresa_id, nome, grupo, venda, controla_estoque, valor_venda, estoque_atual, ativo',
          )
          .eq('empresa_id', empresaId)
          .order('nome'),
        supabase
          .from('grupo_produto')
          .select('grupoproduto_id, nome')
          .eq('empresa_id', empresaId)
          .order('nome'),
      ])

      if (!mounted) return
      if (prodRes.error) {
        setError(prodRes.error.message)
        setRows([])
      } else {
        setError(null)
        setRows((prodRes.data as ProdutoRow[]) ?? [])
      }
      setGrupos((grupoRes.data as GrupoOpt[]) ?? [])
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, flashTick])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => {
      const grupoNome =
        row.grupo != null ? grupoMap.get(row.grupo) ?? '' : ''
      return (
        row.nome.toLowerCase().includes(term) ||
        grupoNome.toLowerCase().includes(term)
      )
    })
  }, [q, rows, grupoMap])

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
          <h2>Produtos</h2>
          <p>
            Cadastro de produtos do estoque — <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/estoque/produtos/novo"
          >
            <AddIcon />
            Novo produto
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            style={{ maxWidth: 360 }}
            placeholder="Buscar por descrição ou grupo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {error ? (
          <AlertMessage tone="error" title="Não foi possível carregar">
            {error}
          </AlertMessage>
        ) : null}

        <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
          {loading
            ? 'Carregando…'
            : `${filtered.length} produto(s) encontrado(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando produtos…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhum produto neste grupo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Descrição</th>
                  <th>Grupo</th>
                  <th>Estoque atual</th>
                  <th>Ctrl. estoque</th>
                  <th>Venda</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.produto_id}>
                    <td>
                      <div className="page-header-actions" style={{ gap: '0.35rem' }}>
                        <Link
                          className="btn btn-soft"
                          to={`/estoque/produtos/${row.produto_id}`}
                        >
                          Abrir
                        </Link>
                        <Link
                          className="btn btn-soft"
                          to={`/estoque/produtos/${row.produto_id}/ficha`}
                        >
                          Ficha
                        </Link>
                      </div>
                    </td>
                    <td>{row.nome}</td>
                    <td>
                      {row.grupo != null
                        ? grupoMap.get(row.grupo) || `Grupo ${row.grupo}`
                        : '—'}
                    </td>
                    <td>
                      {row.controla_estoque === false
                        ? '—'
                        : formatQty(row.estoque_atual)}
                    </td>
                    <td>{row.controla_estoque === false ? 'Não' : 'Sim'}</td>
                    <td>{row.venda === false ? 'Não' : 'Sim'}</td>
                    <td>{formatMoney(row.valor_venda)}</td>
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
