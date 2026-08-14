import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  AUDITORIA_ACOES,
  AUDITORIA_TABELA_LABELS,
  acaoAuditoriaLabel,
  formatAuditoriaQuando,
  prettyJson,
  tabelaAuditoriaLabel,
} from '@/lib/auditoria'

type AuditoriaRow = {
  id: number
  ocorrido_em: string
  user_nome: string | null
  user_id: string | null
  acao: string
  tabela: string
  registro_id: string | null
  dados_antes: unknown
  dados_depois: unknown
}

function todayKey() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function daysAgoKey(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function AuditoriaPage() {
  const { empresa } = useAuth()
  const empresaId = empresa?.id

  const [rows, setRows] = useState<AuditoriaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dataDe, setDataDe] = useState(() => daysAgoKey(7))
  const [dataAte, setDataAte] = useState(todayKey)
  const [filtroAcao, setFiltroAcao] = useState('')
  const [filtroTabela, setFiltroTabela] = useState('')
  const [q, setQ] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

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
        .from('auditoria_log')
        .select(
          'id, ocorrido_em, user_nome, user_id, acao, tabela, registro_id, dados_antes, dados_depois',
        )
        .eq('empresa_id', empresaId)
        .gte('ocorrido_em', `${dataDe}T00:00:00`)
        .lte('ocorrido_em', `${dataAte}T23:59:59.999`)
        .order('ocorrido_em', { ascending: false })
        .limit(500)

      if (filtroAcao) query = query.eq('acao', filtroAcao)
      if (filtroTabela) query = query.eq('tabela', filtroTabela)

      const { data, error: queryError } = await query
      if (!mounted) return
      if (queryError) {
        setError(queryError.message)
        setRows([])
      } else {
        setError(null)
        setRows((data as AuditoriaRow[]) ?? [])
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, dataDe, dataAte, filtroAcao, filtroTabela])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((r) => {
      const tabela = tabelaAuditoriaLabel(r.tabela).toLowerCase()
      return (
        (r.user_nome ?? '').toLowerCase().includes(term) ||
        (r.registro_id ?? '').toLowerCase().includes(term) ||
        r.tabela.toLowerCase().includes(term) ||
        tabela.includes(term) ||
        acaoAuditoriaLabel(r.acao).toLowerCase().includes(term)
      )
    })
  }, [rows, q])

  const tabelasOpts = useMemo(
    () =>
      Object.entries(AUDITORIA_TABELA_LABELS).sort((a, b) =>
        a[1].localeCompare(b[1], 'pt-BR'),
      ),
    [],
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
          <h2>Auditoria</h2>
          <p>
            Histórico de inclusões, alterações e exclusões —{' '}
            <strong>{empresa?.nome}</strong>
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: '0.65rem' }}>
          <input
            className="input"
            type="date"
            value={dataDe}
            onChange={(e) => setDataDe(e.target.value)}
            aria-label="Data inicial"
          />
          <input
            className="input"
            type="date"
            value={dataAte}
            onChange={(e) => setDataAte(e.target.value)}
            aria-label="Data final"
          />
          <select
            className="select"
            value={filtroAcao}
            onChange={(e) => setFiltroAcao(e.target.value)}
            aria-label="Ação"
          >
            <option value="">Todas as ações</option>
            {AUDITORIA_ACOES.map((a) => (
              <option key={a} value={a}>
                {acaoAuditoriaLabel(a)}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filtroTabela}
            onChange={(e) => setFiltroTabela(e.target.value)}
            aria-label="Módulo"
          >
            <option value="">Todos os módulos</option>
            {tabelasOpts.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input
            className="input"
            style={{ maxWidth: 280 }}
            placeholder="Buscar usuário, id, módulo…"
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
            : `${filtered.length} registro(s) (máx. 500 no período)`}
        </p>

        {loading ? (
          <div className="loading">Carregando auditoria…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            Nenhum evento no período. Ações feitas a partir de agora passam a
            aparecer aqui.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Quando</th>
                  <th>Usuário</th>
                  <th>Ação</th>
                  <th>Módulo</th>
                  <th>Registro</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const open = expandedId === row.id
                  return (
                    <Fragment key={row.id}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="btn btn-soft"
                            onClick={() =>
                              setExpandedId(open ? null : row.id)
                            }
                          >
                            {open ? 'Ocultar' : 'Detalhe'}
                          </button>
                        </td>
                        <td>{formatAuditoriaQuando(row.ocorrido_em)}</td>
                        <td>{row.user_nome || 'Sistema / sem usuário'}</td>
                        <td>{acaoAuditoriaLabel(row.acao)}</td>
                        <td>{tabelaAuditoriaLabel(row.tabela)}</td>
                        <td>{row.registro_id ?? '—'}</td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={6}>
                            <div className="auditoria-detail">
                              <div>
                                <strong>Antes</strong>
                                <pre>{prettyJson(row.dados_antes)}</pre>
                              </div>
                              <div>
                                <strong>Depois</strong>
                                <pre>{prettyJson(row.dados_depois)}</pre>
                              </div>
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
