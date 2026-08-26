import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { RegistroProvisorioBadge } from '@/components/RegistroProvisorioBadge'
import {
  formatCompetencia,
  formatMoney,
  isTituloEmAtraso,
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
  associados: { nome: string | null; registro_provisorio?: boolean | null } | null
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

function valorRecebido(row: ReceitaRow): number {
  const valor = Number(row.receita_valor ?? 0)
  const saldo = Number(row.receita_saldo ?? 0)
  return Math.max(0, valor - saldo)
}

function origemLabel(origem: string | null): string {
  return origem === RECEITA_ORIGEM.MENSALIDADE ? 'Mensalidade' : 'Avulsa'
}

export function ReceitasRecebimentoPage() {
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const scope = useMemo(() => resolveFinanceiroScope(profile), [profile])

  const [rows, setRows] = useState<ReceitaRow[]>([])
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
        .from('receitas')
        .select(
          'receita_id, receita_descricao, receita_origem, receita_emissao, receita_vencimento, receita_competencia, receita_valor, receita_saldo, receita_situacao, receita_ramo, associados(nome, registro_provisorio), atividades(descricao)',
        )
        .eq('empresa_id', empresaId)
        .order('receita_emissao', { ascending: false })
        .limit(2000)

      query = applyReceitaScope(query, scope)
      if (!scope && filtroRamo) {
        query = query.eq('receita_ramo', Number(filtroRamo))
      }
      if (dataDe) {
        query = query.gte('receita_emissao', dataDe)
      }
      if (dataAte) {
        query = query.lte('receita_emissao', dataAte)
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
        (r.receita_descricao ?? '').toLowerCase().includes(term) ||
        (r.atividades?.descricao ?? '').toLowerCase().includes(term) ||
        (r.associados?.nome ?? '').toLowerCase().includes(term),
    )
  }, [rows, q])

  const abertos = useMemo(
    () =>
      filtered.filter(
        (r) =>
          r.receita_situacao === TITULO_SITUACAO.ABERTO ||
          r.receita_situacao === TITULO_SITUACAO.PARCIAL,
      ),
    [filtered],
  )

  const pagos = useMemo(
    () => filtered.filter((r) => r.receita_situacao === TITULO_SITUACAO.PAGO),
    [filtered],
  )

  const totais = useMemo(() => {
    let emitido = 0
    let recebido = 0
    let aberto = 0
    for (const r of filtered) {
      emitido += Number(r.receita_valor ?? 0)
      recebido += valorRecebido(r)
      aberto += Number(r.receita_saldo ?? 0)
    }
    return { emitido, recebido, aberto }
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
          <h2>Relatório de Receitas</h2>
          <p>
            Emitidas, recebidas e em aberto —{' '}
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
            placeholder="Buscar por descrição ou associado…"
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
          <h2>Relatório de Receitas</h2>
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
                <span className="despesas-relatorio-card-label">Já recebido</span>
                <strong className="despesas-relatorio-card-value">
                  {formatMoney(totais.recebido)}
                </strong>
                <span className="despesas-relatorio-card-meta">
                  {pagos.length} quitada(s)
                  {abertos.some((r) => valorRecebido(r) > 0)
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
                ? 'Nenhuma receita no período.'
                : `${filtered.length} receita(s) emitida(s) no período selecionado.`}
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
                  Títulos com saldo a receber (abertos e parciais).
                </p>
              </div>
              <div className="badge badge-danger">
                {formatMoney(totais.aberto)}
              </div>
            </div>
            <ReceitasRelatorioTabela
              rows={abertos}
              ramoMap={ramoMap}
              mode="aberto"
              canWrite={canWrite}
              emptyMessage="Nenhuma receita em aberto no período."
            />
          </section>

          <section className="panel despesas-relatorio-print">
            <div className="passagem-header">
              <div>
                <h3>Já recebidas</h3>
                <p className="muted">
                  Receitas quitadas no período de emissão.
                </p>
              </div>
              <div className="badge">
                {formatMoney(
                  pagos.reduce((s, r) => s + Number(r.receita_valor ?? 0), 0),
                )}
              </div>
            </div>
            <ReceitasRelatorioTabela
              rows={pagos}
              ramoMap={ramoMap}
              mode="pago"
              canWrite={canWrite}
              emptyMessage="Nenhuma receita recebida no período."
            />
          </section>
        </>
      ) : null}
    </>
  )
}

function ReceitasRelatorioTabela({
  rows,
  ramoMap,
  mode,
  canWrite,
  emptyMessage,
}: {
  rows: ReceitaRow[]
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
        {rows.length} receita(s)
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th className="no-print"></th>
              <th>Emissão</th>
              <th>Vencimento</th>
              <th>Descrição</th>
              <th>Associado</th>
              <th>Origem</th>
              <th>Competência</th>
              <th>Ramo</th>
              <th>Valor</th>
              {mode === 'aberto' ? (
                <>
                  <th>Recebido</th>
                  <th>Saldo</th>
                </>
              ) : null}
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.receita_id}>
                <td className="no-print">
                  {mode === 'aberto' && canWrite ? (
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
                <td>{formatDate(row.receita_emissao)}</td>
                <td>{formatDate(row.receita_vencimento)}</td>
                <td>{row.receita_descricao || '—'}</td>
                <td>
                  {row.associados?.nome || '—'}{' '}
                  <RegistroProvisorioBadge
                    provisorio={row.associados?.registro_provisorio}
                  />
                </td>
                <td>{origemLabel(row.receita_origem)}</td>
                <td>{formatCompetencia(row.receita_competencia)}</td>
                <td>
                  {(row.receita_ramo && ramoMap.get(row.receita_ramo)) || '—'}
                </td>
                <td>{formatMoney(row.receita_valor)}</td>
                {mode === 'aberto' ? (
                  <>
                    <td>{formatMoney(valorRecebido(row))}</td>
                    <td>{formatMoney(row.receita_saldo)}</td>
                  </>
                ) : null}
                <td>
                  {situacaoTituloLabel(row.receita_situacao)}
                  {isTituloEmAtraso(row) ? (
                    <>
                      {' '}
                      <span className="badge badge-danger">Em atraso</span>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
