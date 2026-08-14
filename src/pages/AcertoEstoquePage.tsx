import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import {
  ESTOQUE_OPERACAO_ACERTO,
  formatQty,
  operacaoAcertoLabel,
} from '@/lib/estoque'

type MovimentoRow = {
  movimentoest_id: number
  movimentoest_numero: number | null
  movimentoest_operacao: number | null
  movimentoest_emissao: string | null
  movimentoest_sinal: string | null
  movimentoest_produto: number | null
  movimentoest_quantidade: number | null
  produto?: { nome: string | null; grupo: number | null } | null
}

type GrupoOpt = { grupoproduto_id: number; nome: string }
type ProdutoOpt = {
  produto_id: number
  nome: string
  grupo: number | null
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function AcertoEstoquePage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('estoque.write')
  const empresaId = empresa?.id
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<MovimentoRow[]>([])
  const [grupos, setGrupos] = useState<GrupoOpt[]>([])
  const [produtos, setProdutos] = useState<ProdutoOpt[]>([])
  const [filtroOperacao, setFiltroOperacao] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('')
  const [filtroProduto, setFiltroProduto] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaId) {
      setGrupos([])
      setProdutos([])
      return
    }
    void Promise.all([
      supabase
        .from('grupo_produto')
        .select('grupoproduto_id, nome')
        .eq('empresa_id', empresaId)
        .order('nome'),
      supabase
        .from('produto')
        .select('produto_id, nome, grupo')
        .eq('empresa_id', empresaId)
        .eq('controla_estoque', true)
        .eq('ativo', true)
        .order('nome'),
    ]).then(([g, p]) => {
      setGrupos((g.data as GrupoOpt[]) ?? [])
      setProdutos((p.data as ProdutoOpt[]) ?? [])
    })
  }, [empresaId])

  useEffect(() => {
    if (!empresaId) {
      setRows([])
      setLoading(false)
      return
    }

    let mounted = true
    void (async () => {
      setLoading(true)
      let qy = supabase
        .from('movimento_estoque')
        .select(
          'movimentoest_id, movimentoest_numero, movimentoest_operacao, movimentoest_emissao, movimentoest_sinal, movimentoest_produto, movimentoest_quantidade, produto:movimentoest_produto(nome, grupo)',
        )
        .eq('empresa_id', empresaId)
        .eq('movimentoest_origem', 'acerto')
        .order('movimentoest_emissao', { ascending: false })
        .order('movimentoest_numero', { ascending: false })
        .limit(300)

      if (filtroOperacao) {
        qy = qy.eq('movimentoest_operacao', Number(filtroOperacao))
      }
      if (filtroProduto) {
        qy = qy.eq('movimentoest_produto', Number(filtroProduto))
      }

      const { data, error: loadError } = await qy
      if (!mounted) return
      if (loadError) {
        setError(loadError.message)
        setRows([])
      } else {
        setError(null)
        let list = (data as unknown as MovimentoRow[]) ?? []
        if (filtroGrupo) {
          const gid = Number(filtroGrupo)
          list = list.filter((row) => row.produto?.grupo === gid)
        }
        setRows(list)
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, flashTick, filtroOperacao, filtroProduto, filtroGrupo])

  const produtosDoFiltro = useMemo(() => {
    if (!filtroGrupo) return produtos
    const gid = Number(filtroGrupo)
    return produtos.filter((p) => p.grupo === gid)
  }, [produtos, filtroGrupo])

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
          <h2>Acerto de estoque</h2>
          <p>
            Movimentos de entrada, perdas e doação —{' '}
            <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/estoque/acerto/novo"
          >
            <AddIcon />
            Novo acerto
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar calendario-filtros">
          <select
            className="select"
            value={filtroOperacao}
            onChange={(e) => setFiltroOperacao(e.target.value)}
          >
            <option value="">Todas as operações</option>
            {ESTOQUE_OPERACAO_ACERTO.map((op) => (
              <option key={op.id} value={op.id}>
                {op.label}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filtroGrupo}
            onChange={(e) => {
              setFiltroGrupo(e.target.value)
              setFiltroProduto('')
            }}
          >
            <option value="">Todos os grupos</option>
            {grupos.map((g) => (
              <option key={g.grupoproduto_id} value={g.grupoproduto_id}>
                {g.nome}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filtroProduto}
            onChange={(e) => setFiltroProduto(e.target.value)}
          >
            <option value="">Todos os produtos</option>
            {produtosDoFiltro.map((p) => (
              <option key={p.produto_id} value={p.produto_id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <AlertMessage tone="error" title="Não foi possível carregar">
            {error}
          </AlertMessage>
        ) : null}

        <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
          {loading
            ? 'Carregando…'
            : `${rows.length} movimento(s) encontrado(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando acertos…</div>
        ) : rows.length === 0 ? (
          <div className="empty">Nenhum acerto de estoque lançado.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Data</th>
                  <th>Operação</th>
                  <th>Produto</th>
                  <th>Sinal</th>
                  <th>Qtde</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.movimentoest_id}>
                    <td>{row.movimentoest_numero ?? '—'}</td>
                    <td>{formatDate(row.movimentoest_emissao)}</td>
                    <td>{operacaoAcertoLabel(row.movimentoest_operacao)}</td>
                    <td>{row.produto?.nome ?? '—'}</td>
                    <td>{row.movimentoest_sinal ?? '—'}</td>
                    <td>{formatQty(row.movimentoest_quantidade)}</td>
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
