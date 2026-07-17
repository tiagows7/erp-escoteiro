import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import {
  formatMoney,
  situacaoDespesaLabel,
  DESPESA_SITUACAO,
} from '@/lib/despesas'

type DespesaRow = {
  despesa_id: number
  despesa_finalidade: string | null
  despesa_numeronota: string | null
  despesa_emissao: string | null
  despesa_vencimento: string | null
  despesa_valor: number | null
  despesa_saldo: number | null
  despesa_situacao: number | null
  despesa_ramo: number | null
  despesa_fornecedor: number | null
  fornecedor_despesa: { fordespesa_nome: string | null } | null
}

type Lookup = { id: number; nome: string }

function formatDate(value: string | null) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function DespesasInclusaoPage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<DespesaRow[]>([])
  const [ramos, setRamos] = useState<Lookup[]>([])
  const [q, setQ] = useState('')
  const [filtroRamo, setFiltroRamo] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState<'abertos' | 'todos' | 'pagos'>(
    'abertos',
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void supabase
      .from('ramos')
      .select('ramo_id, nome')
      .order('ramo_id')
      .then(({ data }) =>
        setRamos(
          (data ?? []).map((r) => ({
            id: r.ramo_id as number,
            nome: r.nome as string,
          })),
        ),
      )
  }, [])

  useEffect(() => {
    if (!empresaId) {
      setRows([])
      setLoading(false)
      return
    }

    let mounted = true
    void (async () => {
      setLoading(true)
      let query = supabase
        .from('despesas')
        .select(
          'despesa_id, despesa_finalidade, despesa_numeronota, despesa_emissao, despesa_vencimento, despesa_valor, despesa_saldo, despesa_situacao, despesa_ramo, despesa_fornecedor, fornecedor_despesa(fordespesa_nome)',
        )
        .eq('empresa_id', empresaId)
        .order('despesa_vencimento', { ascending: false })
        .limit(500)

      if (filtroRamo) query = query.eq('despesa_ramo', Number(filtroRamo))
      if (filtroSituacao === 'abertos') {
        query = query.in('despesa_situacao', [
          DESPESA_SITUACAO.ABERTO,
          DESPESA_SITUACAO.PARCIAL,
        ])
      }
      if (filtroSituacao === 'pagos') {
        query = query.eq('despesa_situacao', DESPESA_SITUACAO.PAGO)
      }

      const { data, error: queryError } = await query
      if (!mounted) return

      if (queryError) {
        setError(queryError.message)
        setRows([])
      } else {
        setError(null)
        setRows((data as unknown as DespesaRow[]) ?? [])
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, filtroRamo, filtroSituacao, flashTick])

  const ramoMap = useMemo(
    () => new Map(ramos.map((r) => [r.id, r.nome])),
    [ramos],
  )

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(
      (r) =>
        (r.despesa_finalidade ?? '').toLowerCase().includes(term) ||
        (r.despesa_numeronota ?? '').toLowerCase().includes(term) ||
        (r.fornecedor_despesa?.fordespesa_nome ?? '')
          .toLowerCase()
          .includes(term),
    )
  }, [rows, q])

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
          <h2>Inclusão de Despesas</h2>
          <p>
            Lançamentos do grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/despesas/inclusao/novo"
          >
            <AddIcon />
            Nova despesa
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar filtros-estrutura">
          <input
            className="input"
            placeholder="Buscar por finalidade, nota ou fornecedor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="select"
            value={filtroRamo}
            onChange={(e) => setFiltroRamo(e.target.value)}
          >
            <option value="">Todos os ramos</option>
            {ramos.map((ramo) => (
              <option key={ramo.id} value={ramo.id}>
                {ramo.nome}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filtroSituacao}
            onChange={(e) =>
              setFiltroSituacao(
                e.target.value as 'abertos' | 'todos' | 'pagos',
              )
            }
          >
            <option value="abertos">Em aberto</option>
            <option value="pagos">Pagas</option>
            <option value="todos">Todas</option>
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
            : `${filtered.length} despesa(s) encontrada(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando despesas…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma despesa encontrada.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Vencimento</th>
                  <th>Fornecedor</th>
                  <th>Finalidade</th>
                  <th>Ramo</th>
                  <th>Valor</th>
                  <th>Saldo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.despesa_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/despesas/inclusao/${row.despesa_id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>{formatDate(row.despesa_vencimento)}</td>
                    <td>
                      {row.fornecedor_despesa?.fordespesa_nome || '—'}
                    </td>
                    <td>{row.despesa_finalidade || '—'}</td>
                    <td>
                      {(row.despesa_ramo && ramoMap.get(row.despesa_ramo)) ||
                        '—'}
                    </td>
                    <td>{formatMoney(row.despesa_valor)}</td>
                    <td>{formatMoney(row.despesa_saldo)}</td>
                    <td>{situacaoDespesaLabel(row.despesa_situacao)}</td>
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
