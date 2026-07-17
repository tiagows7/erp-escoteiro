import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import type {
  DashboardDetalhePassagem,
  DashboardPassagemRamo,
  DashboardRamo,
} from '@/types/database'

function ramoCardClass(ramoId: number, ramoNome: string): string {
  const byId: Record<number, string> = {
    1: 'stat-card-lobinho',
    2: 'stat-card-escoteiro',
    3: 'stat-card-senior',
    4: 'stat-card-pioneiro',
    5: 'stat-card-diretoria',
  }
  if (byId[ramoId]) return byId[ramoId]

  const nome = ramoNome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

  if (nome.includes('LOBINHO')) return 'stat-card-lobinho'
  if (nome.includes('ESCOTEIRO')) return 'stat-card-escoteiro'
  if (nome.includes('SENIOR')) return 'stat-card-senior'
  if (nome.includes('PIONEIRO')) return 'stat-card-pioneiro'
  if (nome.includes('DIRETORIA') || nome.includes('VOLUNTAR')) {
    return 'stat-card-diretoria'
  }
  return ''
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function passagemLimiteLabel(ramoId: number): string {
  switch (ramoId) {
    case 1:
      return 'Saída: 10 anos e 6 meses'
    case 2:
      return 'Chegada: 10 anos e 6 meses\nSaída: 14 anos e 6 meses'
    case 3:
      return 'Chegada: 14 anos e 6 meses\nSaída: 17 anos e 6 meses'
    case 4:
      return 'Chegada: 17 anos e 6 meses\nSaída: 21 anos e 6 meses'
    default:
      return ''
  }
}

export function DashboardPage() {
  const { empresa } = useAuth()
  const empresaId = empresa?.id
  const [ramos, setRamos] = useState<DashboardRamo[]>([])
  const [passagens, setPassagens] = useState<DashboardPassagemRamo[]>([])
  const [totalAtivos, setTotalAtivos] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [detalheRamo, setDetalheRamo] = useState<DashboardPassagemRamo | null>(
    null,
  )
  const [detalheRows, setDetalheRows] = useState<DashboardDetalhePassagem[]>(
    [],
  )
  const [detalheLoading, setDetalheLoading] = useState(false)
  const [detalheError, setDetalheError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function load() {
      setLoading(true)
      const totalQuery = supabase
        .from('associados')
        .select('associado_id', { count: 'exact', head: true })
        .eq('ativo', true)

      if (empresaId) {
        totalQuery.eq('empresa_id', empresaId)
      }

      const [contagem, passagem, totalRes] = await Promise.all([
        supabase.rpc('dashboard_contagem_ramos'),
        supabase.rpc('dashboard_passagens_ramo'),
        totalQuery,
      ])

      if (!mounted) return

      if (contagem.error || passagem.error) {
        setError(contagem.error?.message ?? passagem.error?.message ?? 'Erro')
        setRamos([])
        setPassagens([])
        setTotalAtivos(0)
      } else {
        setError(null)
        setRamos((contagem.data as DashboardRamo[]) ?? [])
        setPassagens((passagem.data as DashboardPassagemRamo[]) ?? [])
        setTotalAtivos(totalRes.count ?? 0)
      }
      setLoading(false)
    }

    void load()
    return () => {
      mounted = false
    }
  }, [empresaId])

  async function abrirPassagem(item: DashboardPassagemRamo) {
    setDetalheRamo(item)
    setDetalheLoading(true)
    setDetalheError(null)
    setDetalheRows([])

    const { data, error: rpcError } = await supabase.rpc(
      'dashboard_detalhe_passagem',
      { p_ramo: item.ramo_id },
    )

    if (rpcError) {
      setDetalheError(rpcError.message)
      setDetalheRows([])
    } else {
      setDetalheRows((data as DashboardDetalhePassagem[]) ?? [])
    }
    setDetalheLoading(false)
  }

  function fecharPassagem() {
    setDetalheRamo(null)
    setDetalheRows([])
    setDetalheError(null)
  }

  const totalPassagens = passagens.reduce(
    (sum, item) => sum + Number(item.total_passagem ?? 0),
    0,
  )

  const chegadas = detalheRows.filter((r) => r.tipo === 'chegada')
  const saidas = detalheRows.filter((r) => r.tipo === 'saida')

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Dashboard</h2>
          <p>
            {empresa?.nome ?? 'Grupo'} — visão geral e passagens de ramo
          </p>
        </div>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Não foi possível carregar">
          {error}
        </AlertMessage>
      ) : null}

      <section className="stats-grid">
        <article className="stat-card stat-card-total">
          <span>Total ativos</span>
          <strong>{loading ? '—' : totalAtivos}</strong>
        </article>
        {ramos.map((item, index) => (
          <article
            key={item.ramo_id}
            className={`stat-card ${ramoCardClass(item.ramo_id, item.ramo_nome)}`}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <span>{item.ramo_nome}</span>
            <strong>{loading ? '—' : item.total}</strong>
          </article>
        ))}
      </section>

      <section className="panel passagem-panel">
        <div className="passagem-header">
          <div>
            <h3>Passagens de ramo</h3>
            <p className="muted">
              Jovens que ultrapassaram o limite de idade do ramo (com meia
              idade).
            </p>
          </div>
          <span className="badge">
            {loading ? '…' : `${totalPassagens} em passagem`}
          </span>
        </div>

        {loading ? (
          <div className="loading">Carregando passagens…</div>
        ) : passagens.length === 0 ? (
          <div className="empty">Nenhum ramo de jovens configurado.</div>
        ) : (
          <div className="passagem-grid">
            {passagens.map((item, index) => {
              const count = Number(item.total_passagem ?? 0)
              return (
                <article
                  key={item.ramo_id}
                  className={`stat-card passagem-card ${ramoCardClass(item.ramo_id, item.ramo_nome)}`}
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <div className="passagem-card-top">
                    <span>{item.ramo_nome}</span>
                    <strong>{count}</strong>
                  </div>
                  <p className="passagem-meta">
                    {passagemLimiteLabel(item.ramo_id)}
                  </p>
                  <button
                    type="button"
                    className="btn btn-soft"
                    disabled={count === 0}
                    onClick={() => void abrirPassagem(item)}
                  >
                    Ver jovens
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </section>

      {detalheRamo ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={fecharPassagem}
        >
          <div
            className="passagem-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="passagem-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="passagem-dialog-header">
              <div>
                <h3 id="passagem-title">
                  Jovens em passagem — {detalheRamo.ramo_nome}
                </h3>
                <p className="muted">
                  Chegadas do ramo anterior e saídas deste ramo
                </p>
              </div>
              <button
                type="button"
                className="btn btn-soft"
                onClick={fecharPassagem}
              >
                Fechar
              </button>
            </header>

            {detalheError ? (
              <AlertMessage tone="error" title="Não foi possível carregar">
                {detalheError}
              </AlertMessage>
            ) : null}

            {detalheLoading ? (
              <div className="loading">Carregando lista…</div>
            ) : (
              <div className="passagem-cols">
                <section>
                  <h4>
                    Chegando{' '}
                    <span className="muted">({chegadas.length})</span>
                  </h4>
                  {chegadas.length === 0 ? (
                    <div className="empty">Nenhum jovem chegando.</div>
                  ) : (
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Nome</th>
                            <th>Nascimento</th>
                            <th>Idade</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {chegadas.map((row) => (
                            <tr key={`c-${row.associado_id}`}>
                              <td>{row.nome}</td>
                              <td>{formatDate(row.data_nascimento)}</td>
                              <td>
                                {row.anos}a {row.meses}m
                              </td>
                              <td>
                                <Link
                                  className="btn btn-soft"
                                  to={`/associados/${row.associado_id}`}
                                >
                                  Abrir
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section>
                  <h4>
                    Saindo <span className="muted">({saidas.length})</span>
                  </h4>
                  {saidas.length === 0 ? (
                    <div className="empty">Nenhum jovem saindo.</div>
                  ) : (
                    <div className="table-wrap">
                      <table className="data">
                        <thead>
                          <tr>
                            <th>Nome</th>
                            <th>Nascimento</th>
                            <th>Idade</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {saidas.map((row) => (
                            <tr key={`s-${row.associado_id}`}>
                              <td>{row.nome}</td>
                              <td>{formatDate(row.data_nascimento)}</td>
                              <td>
                                {row.anos}a {row.meses}m
                              </td>
                              <td>
                                <Link
                                  className="btn btn-soft"
                                  to={`/associados/${row.associado_id}`}
                                >
                                  Abrir
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
