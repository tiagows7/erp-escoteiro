import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import {
  formatCompetencia,
  formatMoney,
  RECEITA_ORIGEM,
  situacaoTituloLabel,
  TITULO_SITUACAO,
} from '@/lib/receitas'
import {
  applyReceitaScope,
  resolveFinanceiroScope,
} from '@/lib/financeiroScope'

type ReceitaRow = {
  receita_id: number
  receita_descricao: string | null
  receita_origem: string | null
  receita_emissao: string | null
  receita_vencimento: string | null
  receita_competencia: string | null
  receita_valor: number | null
  receita_saldo: number | null
  receita_situacao: number | null
  receita_ramo: number | null
  associados: { nome: string | null } | null
  atividades: { descricao: string | null } | null
}

type Lookup = { id: number; nome: string }

function formatDate(value: string | null) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function origemLabel(origem: string | null) {
  if (origem === RECEITA_ORIGEM.MENSALIDADE) return 'Mensalidade'
  return 'Avulsa'
}

export function ReceitasInclusaoPage() {
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const scope = useMemo(() => resolveFinanceiroScope(profile), [profile])
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<ReceitaRow[]>([])
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
        .from('receitas')
        .select(
          'receita_id, receita_descricao, receita_origem, receita_emissao, receita_vencimento, receita_competencia, receita_valor, receita_saldo, receita_situacao, receita_ramo, associados(nome), atividades(descricao)',
        )
        .eq('empresa_id', empresaId)
        .order('receita_vencimento', { ascending: false })
        .limit(500)

      query = applyReceitaScope(query, scope)
      if (!scope && filtroRamo) {
        query = query.eq('receita_ramo', Number(filtroRamo))
      }
      if (filtroSituacao === 'abertos') {
        query = query.in('receita_situacao', [
          TITULO_SITUACAO.ABERTO,
          TITULO_SITUACAO.PARCIAL,
        ])
      }
      if (filtroSituacao === 'pagos') {
        query = query.eq('receita_situacao', TITULO_SITUACAO.PAGO)
      }

      const { data, error: queryError } = await query
      if (!mounted) return

      if (queryError) {
        setError(queryError.message)
        setRows([])
      } else {
        setError(null)
        setRows((data as unknown as ReceitaRow[]) ?? [])
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, filtroRamo, filtroSituacao, flashTick, scope])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter(
      (r) =>
        (r.receita_descricao ?? '').toLowerCase().includes(term) ||
        (r.atividades?.descricao ?? '').toLowerCase().includes(term) ||
        (r.associados?.nome ?? '').toLowerCase().includes(term),
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
          <h2>Inclusão de Receitas</h2>
          <p>
            Lançamentos do grupo <strong>{empresa?.nome}</strong>
            {scope ? ' — somente seu ramo/seção' : ''}
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/receitas/inclusao/novo"
          >
            <AddIcon />
            Nova receita
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar filtros-estrutura">
          <input
            className="input"
            placeholder="Buscar por descrição ou associado…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {!scope ? (
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
          ) : null}
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
            <option value="pagos">Recebidas</option>
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
            : `${filtered.length} receita(s) encontrada(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando receitas…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma receita encontrada.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Vencimento</th>
                  <th>Descrição</th>
                  <th>Atividade</th>
                  <th>Associado</th>
                  <th>Origem</th>
                  <th>Competência</th>
                  <th>Valor</th>
                  <th>Saldo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.receita_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/receitas/inclusao/${row.receita_id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>{formatDate(row.receita_vencimento)}</td>
                    <td>{row.receita_descricao || '—'}</td>
                    <td>{row.atividades?.descricao || '—'}</td>
                    <td>{row.associados?.nome || '—'}</td>
                    <td>{origemLabel(row.receita_origem)}</td>
                    <td>{formatCompetencia(row.receita_competencia)}</td>
                    <td>{formatMoney(row.receita_valor)}</td>
                    <td>{formatMoney(row.receita_saldo)}</td>
                    <td>{situacaoTituloLabel(row.receita_situacao)}</td>
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
