import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
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
  receita_vencimento: string | null
  receita_competencia: string | null
  receita_valor: number | null
  receita_saldo: number | null
  receita_situacao: number | null
  associados: { nome: string | null } | null
  atividades: { descricao: string | null } | null
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function ReceitasRecebimentoPage() {
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const scope = useMemo(() => resolveFinanceiroScope(profile), [profile])
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<ReceitaRow[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
          'receita_id, receita_descricao, receita_origem, receita_vencimento, receita_competencia, receita_valor, receita_saldo, receita_situacao, associados(nome), atividades(descricao)',
        )
        .eq('empresa_id', empresaId)
        .in('receita_situacao', [
          TITULO_SITUACAO.ABERTO,
          TITULO_SITUACAO.PARCIAL,
        ])
        .gt('receita_saldo', 0)
        .order('receita_vencimento')
        .limit(500)

      query = applyReceitaScope(query, scope)

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
  }, [empresaId, flashTick, scope])

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

  const totalSaldo = filtered.reduce(
    (sum, r) => sum + Number(r.receita_saldo ?? 0),
    0,
  )

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
          <h2>Recebimento</h2>
          <p>
            Baixa de receitas em aberto — <strong>{empresa?.nome}</strong>
            {scope ? ' — somente seu ramo/seção' : ''}
          </p>
        </div>
        <div className="badge">{formatMoney(totalSaldo)} em aberto</div>
      </header>

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            placeholder="Buscar por descrição ou associado…"
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
            : `${filtered.length} receita(s) em aberto`}
        </p>

        {loading ? (
          <div className="loading">Carregando receitas…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma receita em aberto.</div>
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
                  <th>Saldo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.receita_id}>
                    <td>
                      {canWrite ? (
                        <Link
                          className="btn btn-primary"
                          to={`/receitas/recebimento/${row.receita_id}`}
                        >
                          Receber
                        </Link>
                      ) : (
                        <Link
                          className="btn btn-soft"
                          to={`/receitas/inclusao/${row.receita_id}`}
                        >
                          Abrir
                        </Link>
                      )}
                    </td>
                    <td>{formatDate(row.receita_vencimento)}</td>
                    <td>{row.receita_descricao || '—'}</td>
                    <td>{row.atividades?.descricao || '—'}</td>
                    <td>{row.associados?.nome || '—'}</td>
                    <td>
                      {row.receita_origem === RECEITA_ORIGEM.MENSALIDADE
                        ? 'Mensalidade'
                        : 'Avulsa'}
                    </td>
                    <td>{formatCompetencia(row.receita_competencia)}</td>
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
