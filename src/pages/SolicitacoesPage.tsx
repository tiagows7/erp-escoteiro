import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { useGestorSolicitacoes } from '@/hooks/useGestorSolicitacoes'
import { isAssociadoLogin } from '@/lib/roles'
import { supabase } from '@/lib/supabase'
import {
  isSolicitacaoSituacao,
  solicitacaoSituacaoLabel,
  type SolicitacaoSituacao,
} from '@/lib/solicitacaoSituacao'

type Solicitacao = {
  solicitacao_id: number
  ramo_id: number
  secao_id: number
  texto: string
  data_solicitacao: string
  situacao: string | null
  resolvida: boolean
  data_resolvida: string | null
  user_nome: string | null
}

type Lookup = { id: number; nome: string }
type Filtro = 'em_andamento' | 'realizada' | 'nao_realizada' | 'todas'

function todayIso() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const [ano, mes, dia] = value.slice(0, 10).split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : value
}

function situacaoDe(row: Solicitacao): SolicitacaoSituacao {
  if (isSolicitacaoSituacao(row.situacao)) return row.situacao
  return row.resolvida ? 'realizada' : 'em_andamento'
}

function badgeClass(situacao: SolicitacaoSituacao) {
  if (situacao === 'realizada') return 'badge'
  if (situacao === 'nao_realizada') return 'badge badge-danger'
  return 'badge badge-warning'
}

export function SolicitacoesPage() {
  const { empresa, profile, user } = useAuth()
  const toast = useToast()
  const empresaId = empresa?.id
  const associadoLogin = isAssociadoLogin(profile)
  const { loading: gestorLoading, gestor } = useGestorSolicitacoes()
  const verMinhas = associadoLogin && !gestor
  const flashTick = useFlashSuccess()
  const [rows, setRows] = useState<Solicitacao[]>([])
  const [ramos, setRamos] = useState<Lookup[]>([])
  const [secoes, setSecoes] = useState<Lookup[]>([])
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('em_andamento')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<number | null>(null)

  useEffect(() => {
    if (!gestorLoading && verMinhas) setFiltro('todas')
  }, [gestorLoading, verMinhas])

  useEffect(() => {
    if (gestorLoading || !empresaId || (!gestor && !verMinhas)) return
    let mounted = true
    void (async () => {
      setLoading(true)
      let solicitacoes = supabase
        .from('solicitacoes')
        .select(
          'solicitacao_id, ramo_id, secao_id, texto, data_solicitacao, situacao, resolvida, data_resolvida, user_nome',
        )
        .eq('empresa_id', empresaId)
        .order('data_solicitacao', { ascending: false })
        .order('solicitacao_id', { ascending: false })
      if (verMinhas && user?.id) {
        solicitacoes = solicitacoes.eq('user_id', user.id)
      }
      const [solRes, ramoRes, secaoRes] = await Promise.all([
        solicitacoes,
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
  }, [empresaId, gestor, gestorLoading, verMinhas, user?.id, flashTick])

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
      const situacao = situacaoDe(row)
      if (filtro !== 'todas' && situacao !== filtro) return false
      if (!term) return true
      const ramo = ramoMap.get(row.ramo_id) ?? ''
      const secao = secaoMap.get(row.secao_id) ?? ''
      return `${row.texto} ${ramo} ${secao} ${row.user_nome ?? ''}`
        .toLocaleLowerCase('pt-BR')
        .includes(term)
    })
  }, [q, rows, filtro, ramoMap, secaoMap])

  async function marcar(row: Solicitacao, situacao: SolicitacaoSituacao) {
    if (!empresaId || situacaoDe(row) === situacao) return
    setSavingId(row.solicitacao_id)
    setError(null)
    const { error: upError } = await supabase
      .from('solicitacoes')
      .update({
        situacao,
        resolvida: situacao === 'realizada',
        data_resolvida: situacao === 'em_andamento' ? null : todayIso(),
      })
      .eq('solicitacao_id', row.solicitacao_id)
      .eq('empresa_id', empresaId)
    setSavingId(null)
    if (upError) {
      setError(upError.message)
      return
    }
    setRows((prev) =>
      prev.map((item) =>
        item.solicitacao_id === row.solicitacao_id
          ? {
              ...item,
              situacao,
              resolvida: situacao === 'realizada',
              data_resolvida: situacao === 'em_andamento' ? null : todayIso(),
            }
          : item,
      ),
    )
    toast.success('Situação atualizada', solicitacaoSituacaoLabel(situacao))
  }

  if (gestorLoading) {
    return <div className="loading">Carregando…</div>
  }
  if (!gestor && !verMinhas) {
    return <Navigate to="/solicitacoes/novo" replace />
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
          <h2>{verMinhas ? 'Minhas solicitações' : 'Solicitações'}</h2>
          <p>
            {verMinhas
              ? 'Pedidos que você abriu e a situação de cada um'
              : 'Pedidos do grupo'}{' '}
            — <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link className="btn btn-primary btn-with-icon" to="/solicitacoes/novo">
          <AddIcon />
          Nova solicitação
        </Link>
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
            onChange={(event) => setFiltro(event.target.value as Filtro)}
            aria-label="Filtrar por situação"
          >
            <option value="em_andamento">Em andamento</option>
            <option value="realizada">Realizadas</option>
            <option value="nao_realizada">Não realizadas</option>
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
          <div className="empty">
            {verMinhas
              ? 'Você ainda não abriu solicitações.'
              : 'Nenhuma solicitação encontrada.'}
          </div>
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
                  {verMinhas ? null : <th>Quem pediu</th>}
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const situacao = situacaoDe(row)
                  return (
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
                      {verMinhas ? null : (
                        <td>{row.user_nome?.trim() || '—'}</td>
                      )}
                      <td>
                        {gestor ? (
                          <select
                            className="select"
                            aria-label="Situação da solicitação"
                            value={situacao}
                            disabled={savingId === row.solicitacao_id}
                            onChange={(event) =>
                              void marcar(
                                row,
                                event.target.value as SolicitacaoSituacao,
                              )
                            }
                          >
                            <option value="em_andamento">Em andamento</option>
                            <option value="realizada">Realizada</option>
                            <option value="nao_realizada">Não realizada</option>
                          </select>
                        ) : null}
                        <div style={{ marginTop: gestor ? '0.35rem' : 0 }}>
                          <span className={badgeClass(situacao)}>
                            {solicitacaoSituacaoLabel(situacao)}
                            {situacao !== 'em_andamento' && row.data_resolvida
                              ? ` · ${formatDate(row.data_resolvida)}`
                              : ''}
                          </span>
                        </div>
                      </td>
                    </tr>
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
