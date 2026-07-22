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

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function matchesBusca(row: ReceitaRow, term: string): boolean {
  if (!term) return true
  return (
    (row.receita_descricao ?? '').toLowerCase().includes(term) ||
    (row.atividades?.descricao ?? '').toLowerCase().includes(term) ||
    (row.associados?.nome ?? '').toLowerCase().includes(term)
  )
}

function totalSaldo(rows: ReceitaRow[]): number {
  return rows.reduce((sum, r) => sum + Number(r.receita_saldo ?? 0), 0)
}

type TabelaProps = {
  rows: ReceitaRow[]
  canWrite: boolean
  emptyMessage: string
}

function ReceitasTabela({ rows, canWrite, emptyMessage }: TabelaProps) {
  if (rows.length === 0) {
    return <div className="empty">{emptyMessage}</div>
  }

  return (
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
          {rows.map((row) => (
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
  )
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

  const hoje = todayISO()

  const { aVencer, vencidas } = useMemo(() => {
    const term = q.trim().toLowerCase()
    const filtradas = rows.filter((r) => matchesBusca(r, term))
    const aVencerList: ReceitaRow[] = []
    const vencidasList: ReceitaRow[] = []

    for (const row of filtradas) {
      const venc = row.receita_vencimento?.slice(0, 10) ?? null
      if (venc && venc < hoje) {
        vencidasList.push(row)
      } else {
        aVencerList.push(row)
      }
    }

    return { aVencer: aVencerList, vencidas: vencidasList }
  }, [rows, q, hoje])

  const totalAVencer = totalSaldo(aVencer)
  const totalVencidas = totalSaldo(vencidas)

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
          <h2>Contas a receber</h2>
          <p>
            Baixa de receitas em aberto — <strong>{empresa?.nome}</strong>
            {scope ? ' — somente seu ramo/seção' : ''}
          </p>
        </div>
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

        {loading ? (
          <div className="loading">Carregando receitas…</div>
        ) : (
          <div className="receitas-receber-resumo-grid">
            <article className="associado-mensalidade-resumo">
              <div>
                <span>A vencer / no prazo</span>
                <strong>{aVencer.length}</strong>
                <p className="muted">Total {formatMoney(totalAVencer)}</p>
              </div>
            </article>
            <article className="associado-mensalidade-resumo is-vencidas">
              <div>
                <span>Vencidas</span>
                <strong>{vencidas.length}</strong>
                <p className="muted">Total {formatMoney(totalVencidas)}</p>
              </div>
            </article>
          </div>
        )}
      </section>

      {!loading && !error ? (
        <>
          <section className="panel">
            <div className="passagem-header">
              <div>
                <h3>Contas a receber</h3>
                <p className="muted">
                  Títulos em aberto com vencimento hoje ou futuro.
                </p>
              </div>
              <div className="badge">{formatMoney(totalAVencer)}</div>
            </div>
            <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
              {aVencer.length} receita(s) no prazo
            </p>
            <ReceitasTabela
              rows={aVencer}
              canWrite={canWrite}
              emptyMessage="Nenhuma conta a receber no prazo."
            />
          </section>

          <section className="panel">
            <div className="passagem-header">
              <div>
                <h3>Contas a receber vencidas</h3>
                <p className="muted">
                  Títulos em aberto com vencimento anterior a hoje.
                </p>
              </div>
              <div className="badge badge-danger">
                {formatMoney(totalVencidas)}
              </div>
            </div>
            <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
              {vencidas.length} receita(s) vencida(s)
            </p>
            <ReceitasTabela
              rows={vencidas}
              canWrite={canWrite}
              emptyMessage="Nenhuma conta a receber vencida."
            />
          </section>
        </>
      ) : null}
    </>
  )
}
