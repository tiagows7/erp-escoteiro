import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  DESPESA_SITUACAO,
  formatMoney,
  situacaoDespesaLabel,
} from '@/lib/despesas'
import {
  applyDespesaScope,
  resolveFinanceiroScope,
} from '@/lib/financeiroScope'

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
  fornecedor_despesa: { fordespesa_nome: string | null } | null
  atividades: { descricao: string | null } | null
}

type Lookup = { id: number; nome: string }

function formatDate(value: string | null) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function firstDayOfMonth(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

function todayIso(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function valorPago(row: DespesaRow): number {
  const valor = Number(row.despesa_valor ?? 0)
  const saldo = Number(row.despesa_saldo ?? 0)
  return Math.max(0, valor - saldo)
}

export function DespesasRelatorioPage() {
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const scope = useMemo(() => resolveFinanceiroScope(profile), [profile])

  const [rows, setRows] = useState<DespesaRow[]>([])
  const [ramos, setRamos] = useState<Lookup[]>([])
  const [dataDe, setDataDe] = useState(firstDayOfMonth)
  const [dataAte, setDataAte] = useState(todayIso)
  const [filtroRamo, setFiltroRamo] = useState('')
  const [q, setQ] = useState('')
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
          'despesa_id, despesa_finalidade, despesa_numeronota, despesa_emissao, despesa_vencimento, despesa_valor, despesa_saldo, despesa_situacao, despesa_ramo, fornecedor_despesa(fordespesa_nome), atividades(descricao)',
        )
        .eq('empresa_id', empresaId)
        .order('despesa_emissao', { ascending: false })
        .limit(2000)

      query = applyDespesaScope(query, scope)
      if (!scope && filtroRamo) {
        query = query.eq('despesa_ramo', Number(filtroRamo))
      }
      if (dataDe) {
        query = query.gte('despesa_emissao', dataDe)
      }
      if (dataAte) {
        query = query.lte('despesa_emissao', dataAte)
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
  }, [empresaId, filtroRamo, dataDe, dataAte, scope])

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
        (r.atividades?.descricao ?? '').toLowerCase().includes(term) ||
        (r.fornecedor_despesa?.fordespesa_nome ?? '')
          .toLowerCase()
          .includes(term),
    )
  }, [rows, q])

  const abertos = useMemo(
    () =>
      filtered.filter(
        (r) =>
          r.despesa_situacao === DESPESA_SITUACAO.ABERTO ||
          r.despesa_situacao === DESPESA_SITUACAO.PARCIAL,
      ),
    [filtered],
  )

  const pagos = useMemo(
    () => filtered.filter((r) => r.despesa_situacao === DESPESA_SITUACAO.PAGO),
    [filtered],
  )

  const totais = useMemo(() => {
    let emitido = 0
    let pago = 0
    let aberto = 0
    for (const r of filtered) {
      emitido += Number(r.despesa_valor ?? 0)
      pago += valorPago(r)
      aberto += Number(r.despesa_saldo ?? 0)
    }
    return { emitido, pago, aberto }
  }, [filtered])

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
      <header className="page-header no-print">
        <div>
          <h2>Relatório de Despesas</h2>
          <p>
            Emitidas, pagas e em aberto —{' '}
            <strong>{empresa?.nome}</strong>
            {scope ? ' (somente seu ramo/seção)' : ''}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-soft"
          onClick={() => window.print()}
          disabled={loading || filtered.length === 0}
        >
          Imprimir
        </button>
      </header>

      <section className="panel no-print">
        <div className="toolbar filtros-estrutura">
          <label className="field" style={{ margin: 0 }}>
            <span className="field-hint">Emissão de</span>
            <input
              className="input"
              type="date"
              value={dataDe}
              onChange={(e) => setDataDe(e.target.value)}
            />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span className="field-hint">até</span>
            <input
              className="input"
              type="date"
              value={dataAte}
              onChange={(e) => setDataAte(e.target.value)}
            />
          </label>
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
          <input
            className="input"
            placeholder="Buscar por finalidade, nota ou fornecedor…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </section>

      {error ? (
        <AlertMessage tone="error" title="Não foi possível carregar">
          {error}
        </AlertMessage>
      ) : null}

      <section className="panel despesas-relatorio-print">
        <div className="despesas-relatorio-cabecalho print-only">
          <h2>Relatório de Despesas</h2>
          <p>
            {empresa?.nome}
            {dataDe || dataAte
              ? ` · Emissão ${formatDate(dataDe || null)} a ${formatDate(dataAte || null)}`
              : ''}
          </p>
        </div>

        {loading ? (
          <div className="loading">Carregando relatório…</div>
        ) : (
          <>
            <div className="despesas-relatorio-resumo-grid">
              <article className="despesas-relatorio-card despesas-relatorio-card-emitidas">
                <span className="despesas-relatorio-card-label">Emitidas</span>
                <strong className="despesas-relatorio-card-value">
                  {formatMoney(totais.emitido)}
                </strong>
                <span className="despesas-relatorio-card-meta">
                  {filtered.length} lançamento(s)
                </span>
              </article>
              <article className="despesas-relatorio-card despesas-relatorio-card-pago">
                <span className="despesas-relatorio-card-label">Já pago</span>
                <strong className="despesas-relatorio-card-value">
                  {formatMoney(totais.pago)}
                </strong>
                <span className="despesas-relatorio-card-meta">
                  {pagos.length} quitada(s)
                  {abertos.some((r) => valorPago(r) > 0)
                    ? ' · inclui parciais'
                    : ''}
                </span>
              </article>
              <article className="despesas-relatorio-card despesas-relatorio-card-aberto">
                <span className="despesas-relatorio-card-label">Em aberto</span>
                <strong className="despesas-relatorio-card-value">
                  {formatMoney(totais.aberto)}
                </strong>
                <span className="despesas-relatorio-card-meta">
                  {abertos.length} título(s)
                </span>
              </article>
            </div>

            <p className="field-hint" style={{ marginTop: '0.85rem' }}>
              {filtered.length === 0
                ? 'Nenhuma despesa no período.'
                : `${filtered.length} despesa(s) emitida(s) no período selecionado.`}
            </p>
          </>
        )}
      </section>

      {!loading && !error && filtered.length > 0 ? (
        <>
          <section className="panel despesas-relatorio-print">
            <div className="passagem-header">
              <div>
                <h3>Em aberto</h3>
                <p className="muted">
                  Títulos com saldo a pagar (abertos e parciais).
                </p>
              </div>
              <div className="badge badge-danger">
                {formatMoney(totais.aberto)}
              </div>
            </div>
            <DespesasRelatorioTabela
              rows={abertos}
              ramoMap={ramoMap}
              mode="aberto"
              canWrite={canWrite}
              emptyMessage="Nenhuma despesa em aberto no período."
            />
          </section>

          <section className="panel despesas-relatorio-print">
            <div className="passagem-header">
              <div>
                <h3>Já pagas</h3>
                <p className="muted">
                  Despesas quitadas no período de emissão.
                </p>
              </div>
              <div className="badge">
                {formatMoney(
                  pagos.reduce((s, r) => s + Number(r.despesa_valor ?? 0), 0),
                )}
              </div>
            </div>
            <DespesasRelatorioTabela
              rows={pagos}
              ramoMap={ramoMap}
              mode="pago"
              canWrite={canWrite}
              emptyMessage="Nenhuma despesa paga no período."
            />
          </section>
        </>
      ) : null}
    </>
  )
}

function DespesasRelatorioTabela({
  rows,
  ramoMap,
  mode,
  canWrite,
  emptyMessage,
}: {
  rows: DespesaRow[]
  ramoMap: Map<number, string>
  mode: 'aberto' | 'pago'
  canWrite: boolean
  emptyMessage: string
}) {
  if (rows.length === 0) {
    return <div className="empty">{emptyMessage}</div>
  }

  return (
    <>
      <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
        {rows.length} despesa(s)
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th className="no-print"></th>
              <th>Emissão</th>
              <th>Vencimento</th>
              <th>Fornecedor</th>
              <th>Finalidade</th>
              <th>Ramo</th>
              <th>Valor</th>
              {mode === 'aberto' ? (
                <>
                  <th>Pago</th>
                  <th>Saldo</th>
                </>
              ) : null}
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.despesa_id}>
                <td className="no-print">
                  <div className="table-actions">
                    <Link
                      className="btn btn-soft"
                      to={`/despesas/inclusao/${row.despesa_id}`}
                    >
                      Abrir
                    </Link>
                    {mode === 'aberto' &&
                    canWrite &&
                    Number(row.despesa_saldo ?? 0) > 0 ? (
                      <Link
                        className="btn btn-primary"
                        to={`/despesas/pagamento/${row.despesa_id}`}
                        title="Registrar pagamento"
                      >
                        Pagar
                      </Link>
                    ) : null}
                  </div>
                </td>
                <td>{formatDate(row.despesa_emissao)}</td>
                <td>{formatDate(row.despesa_vencimento)}</td>
                <td>{row.fornecedor_despesa?.fordespesa_nome || '—'}</td>
                <td>{row.despesa_finalidade || '—'}</td>
                <td>
                  {(row.despesa_ramo && ramoMap.get(row.despesa_ramo)) || '—'}
                </td>
                <td>{formatMoney(row.despesa_valor)}</td>
                {mode === 'aberto' ? (
                  <>
                    <td>{formatMoney(valorPago(row))}</td>
                    <td>{formatMoney(row.despesa_saldo)}</td>
                  </>
                ) : null}
                <td>{situacaoDespesaLabel(row.despesa_situacao)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
