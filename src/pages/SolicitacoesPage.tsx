import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useAuth } from '@/contexts/AuthContext'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { useVoluntarioNaoBeneficiario } from '@/hooks/useVoluntarioNaoBeneficiario'
import { supabase } from '@/lib/supabase'

type Solicitacao = {
  solicitacao_id: number
  ramo_id: number
  secao_id: number
  texto: string
  data_solicitacao: string
  resolvida: boolean
  data_resolvida: string | null
  user_nome: string | null
}

type Lookup = { id: number; nome: string }

function formatDate(value: string | null) {
  if (!value) return '—'
  const [ano, mes, dia] = value.slice(0, 10).split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : value
}

export function SolicitacoesPage() {
  const { empresa, hasPermission } = useAuth()
  const empresaId = empresa?.id
  const canWrite = hasPermission('solicitacoes.write')
  const { loading: volLoading, allowed } = useVoluntarioNaoBeneficiario()
  const flashTick = useFlashSuccess()
  const [rows, setRows] = useState<Solicitacao[]>([])
  const [ramos, setRamos] = useState<Lookup[]>([])
  const [secoes, setSecoes] = useState<Lookup[]>([])
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<'todas' | 'abertas' | 'resolvidas'>(
    'abertas',
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaId || !allowed) return
    let mounted = true
    void (async () => {
      setLoading(true)
      const [solRes, ramoRes, secaoRes] = await Promise.all([
        supabase
          .from('solicitacoes')
          .select(
            'solicitacao_id, ramo_id, secao_id, texto, data_solicitacao, resolvida, data_resolvida, user_nome',
          )
          .eq('empresa_id', empresaId)
          .order('data_solicitacao', { ascending: false })
          .order('solicitacao_id', { ascending: false }),
        supabase.from('ramos').select('ramo_id, nome').order('ramo_id'),
        supabase
          .from('secao')
          .select('secao_id, nome')
          .eq('empresa_id', empresaId)
          .order('nome'),
      ])
      if (!mounted) return
      setRamos(
        ((ramoRes.data ?? []) as { ramo_id: number; nome: string }[]).map(
          (r) => ({ id: r.ramo_id, nome: r.nome }),
        ),
      )
      setSecoes(
        ((secaoRes.data ?? []) as { secao_id: number; nome: string }[]).map(
          (s) => ({ id: s.secao_id, nome: s.nome }),
        ),
      )
      if (solRes.error) {
        setRows([])
        setError(solRes.error.message)
      } else {
        setRows((solRes.data as Solicitacao[]) ?? [])
        setError(null)
      }
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [empresaId, allowed, flashTick])

  const ramoMap = useMemo(
    () => new Map(ramos.map((r) => [r.id, r.nome])),
    [ramos],
  )
  const secaoMap = useMemo(
    () => new Map(secoes.map((s) => [s.id, s.nome])),
    [secoes],
  )

  const filtered = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('pt-BR')
    return rows.filter((row) => {
      if (filtro === 'abertas' && row.resolvida) return false
      if (filtro === 'resolvidas' && !row.resolvida) return false
      if (!term) return true
      const ramo = ramoMap.get(row.ramo_id) ?? ''
      const secao = secaoMap.get(row.secao_id) ?? ''
      return `${row.texto} ${ramo} ${secao} ${row.user_nome ?? ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(term)
    })
  }, [q, rows, filtro, ramoMap, secaoMap])

  if (volLoading) {
    return <div className="loading">Carregando…</div>
  }
  if (!allowed) {
    return <Navigate to="/dashboard" replace />
  }

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
          <h2>Solicitações</h2>
          <p>
            Pedidos internos por ramo e seção —{' '}
            <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/solicitacoes/novo"
          >
            <AddIcon />
            Nova solicitação
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Buscar por texto, ramo ou seção…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <select
            className="select"
            value={filtro}
            onChange={(event) =>
              setFiltro(event.target.value as typeof filtro)
            }
            aria-label="Filtrar por situação"
          >
            <option value="abertas">Abertas</option>
            <option value="resolvidas">Resolvidas</option>
            <option value="todas">Todas</option>
          </select>
        </div>

        {error ? (
          <AlertMessage tone="error" title="Não foi possível carregar">
            {error}
          </AlertMessage>
        ) : null}

        {loading ? (
          <div className="loading">Carregando solicitações…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma solicitação encontrada.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Data</th>
                  <th>Ramo</th>
                  <th>Seção</th>
                  <th>Solicitação</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.solicitacao_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/solicitacoes/${row.solicitacao_id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>{formatDate(row.data_solicitacao)}</td>
                    <td>{ramoMap.get(row.ramo_id) ?? '—'}</td>
                    <td>{secaoMap.get(row.secao_id) ?? '—'}</td>
                    <td>
                      <span title={row.texto}>
                        {row.texto.length > 80
                          ? `${row.texto.slice(0, 80)}…`
                          : row.texto}
                      </span>
                    </td>
                    <td>
                      {row.resolvida ? (
                        <span className="badge">
                          Resolvida
                          {row.data_resolvida
                            ? ` · ${formatDate(row.data_resolvida)}`
                            : ''}
                        </span>
                      ) : (
                        <span className="badge badge-warning">Aberta</span>
                      )}
                    </td>
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
