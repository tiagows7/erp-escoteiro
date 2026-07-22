import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { AniversarioIllustration } from '@/components/AniversarioIllustration'
import { AssociadoAtividadesPanel } from '@/components/AssociadoAtividadesPanel'
import { AssociadoMensalidadesPanel } from '@/components/AssociadoMensalidadesPanel'
import { StaffAtividadesPanel } from '@/components/StaffAtividadesPanel'
import { StaffMensalidadesAbertasPanel } from '@/components/StaffMensalidadesAbertasPanel'
import { isAssociadoLogin } from '@/lib/roles'
import type {
  DashboardAniversariante,
  DashboardDetalhePassagem,
  DashboardDetalheRamo,
  DashboardPassagemRamo,
  DashboardRamo,
} from '@/types/database'

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

function isBirthdayToday(isoDate: string | null | undefined): boolean {
  if (!isoDate) return false
  const [, m, d] = isoDate.slice(0, 10).split('-')
  if (!m || !d) return false
  const now = new Date()
  return (
    Number(m) === now.getMonth() + 1 && Number(d) === now.getDate()
  )
}

function primeiroNome(nome: string): string {
  const part = nome.trim().split(/\s+/)[0]
  if (!part) return nome
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
}

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
  const { empresa, profile, hasPermission } = useAuth()
  const toast = useToast()
  const empresaId = empresa?.id
  const associadoView = isAssociadoLogin(profile)
  const canOpenAssociado = hasPermission('associados.view')
  /** Login e-mail com ramo: dashboard só desse ramo. */
  const ramoFiltro = useMemo(() => {
    if (associadoView) return null
    const r = profile?.codigo_ramo
    return r != null && r >= 1 && r <= 5 ? r : null
  }, [associadoView, profile?.codigo_ramo])
  const [ramos, setRamos] = useState<DashboardRamo[]>([])
  const [passagens, setPassagens] = useState<DashboardPassagemRamo[]>([])
  const [aniversariantes, setAniversariantes] = useState<
    DashboardAniversariante[]
  >([])
  const [totalAtivos, setTotalAtivos] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensagemAniversario, setMensagemAniversario] = useState<string | null>(
    null,
  )

  const [detalheRamo, setDetalheRamo] = useState<DashboardPassagemRamo | null>(
    null,
  )
  const [detalheRows, setDetalheRows] = useState<DashboardDetalhePassagem[]>(
    [],
  )
  const [detalheLoading, setDetalheLoading] = useState(false)
  const [detalheError, setDetalheError] = useState<string | null>(null)

  const [listaRamo, setListaRamo] = useState<DashboardRamo | null>(null)
  const [listaRows, setListaRows] = useState<DashboardDetalheRamo[]>([])
  const [listaLoading, setListaLoading] = useState(false)
  const [listaError, setListaError] = useState<string | null>(null)
  const [aniversarioOpen, setAniversarioOpen] = useState(false)

  const mesAtual = MESES[new Date().getMonth()]
  const totalAniversariantes = aniversariantes.length
  const aniversariantesHoje = aniversariantes.filter((a) => a.eh_hoje).length

  useEffect(() => {
    let mounted = true

    async function load() {
      setLoading(true)

      if (associadoView) {
        const anivers = await supabase.rpc('dashboard_aniversariantes_mes')
        if (!mounted) return
        if (anivers.error) {
          setError(anivers.error.message)
          setAniversariantes([])
        } else {
          setError(null)
          setAniversariantes(
            (anivers.data as DashboardAniversariante[]) ?? [],
          )
        }
        setLoading(false)
        return
      }

      let totalQuery = supabase
        .from('associados')
        .select('associado_id', { count: 'exact', head: true })
        .eq('ativo', true)

      if (empresaId) {
        totalQuery = totalQuery.eq('empresa_id', empresaId)
      }
      if (ramoFiltro != null) {
        totalQuery = totalQuery.eq('ramo', ramoFiltro)
      }

      const [contagem, passagem, anivers, totalRes] = await Promise.all([
        supabase.rpc('dashboard_contagem_ramos'),
        supabase.rpc('dashboard_passagens_ramo'),
        supabase.rpc('dashboard_aniversariantes_mes'),
        totalQuery,
      ])

      if (!mounted) return

      if (contagem.error || passagem.error || anivers.error) {
        setError(
          contagem.error?.message ??
            passagem.error?.message ??
            anivers.error?.message ??
            'Erro',
        )
        setRamos([])
        setPassagens([])
        setAniversariantes([])
        setTotalAtivos(0)
      } else {
        const ramosAll = (contagem.data as DashboardRamo[]) ?? []
        const passagensAll = (passagem.data as DashboardPassagemRamo[]) ?? []
        setError(null)
        setRamos(
          ramoFiltro != null
            ? ramosAll.filter((r) => r.ramo_id === ramoFiltro)
            : ramosAll,
        )
        setPassagens(
          ramoFiltro != null
            ? passagensAll.filter((p) => p.ramo_id === ramoFiltro)
            : passagensAll,
        )
        setAniversariantes(
          (anivers.data as DashboardAniversariante[]) ?? [],
        )
        setTotalAtivos(totalRes.count ?? 0)
      }
      setLoading(false)
    }

    void load()
    return () => {
      mounted = false
    }
  }, [empresaId, associadoView, ramoFiltro])

  // Login por registro: verifica aniversário na tabela associados
  useEffect(() => {
    let mounted = true

    async function checkAniversario() {
      setMensagemAniversario(null)
      if (!associadoView || !profile?.registro || !empresaId) return

      const registroNum = Number(String(profile.registro).replace(/\D/g, ''))
      if (!Number.isFinite(registroNum) || registroNum <= 0) return

      const { data, error: queryError } = await supabase
        .from('associados')
        .select('nome, data_nascimento')
        .eq('empresa_id', empresaId)
        .eq('registro', registroNum)
        .maybeSingle()

      if (!mounted || queryError || !data) return
      if (!isBirthdayToday(data.data_nascimento)) return

      const nome = primeiroNome(data.nome || profile.nome || '')
      const msg = nome
        ? `Feliz aniversário, ${nome}!`
        : 'Feliz aniversário!'
      setMensagemAniversario(msg)

      const today = new Date().toISOString().slice(0, 10)
      const toastKey = `aniversario-saudacao:${profile.registro}:${today}`
      if (sessionStorage.getItem(toastKey) !== '1') {
        sessionStorage.setItem(toastKey, '1')
        toast.info(msg, 'Que seu dia seja especial. Parabéns!')
      }
    }

    void checkAniversario()
    return () => {
      mounted = false
    }
  }, [associadoView, profile?.registro, profile?.nome, empresaId, toast])

  async function abrirListaRamo(item: DashboardRamo) {
    setListaRamo(item)
    setListaLoading(true)
    setListaError(null)
    setListaRows([])

    const { data, error: rpcError } = await supabase.rpc(
      'dashboard_detalhe_ramo',
      { p_ramo: item.ramo_id },
    )

    if (rpcError) {
      setListaError(rpcError.message)
      setListaRows([])
    } else {
      setListaRows((data as DashboardDetalheRamo[]) ?? [])
    }
    setListaLoading(false)
  }

  function fecharListaRamo() {
    setListaRamo(null)
    setListaRows([])
    setListaError(null)
  }

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
            {associadoView
              ? `${empresa?.nome ?? 'Grupo'} — aniversariantes do mês`
              : `${empresa?.nome ?? 'Grupo'} — visão geral e passagens de ramo`}
          </p>
        </div>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Não foi possível carregar">
          {error}
        </AlertMessage>
      ) : null}

      {mensagemAniversario ? (
        <section className="aniversario-saudacao" aria-live="polite">
          <AniversarioIllustration className="aniversario-saudacao-img" />
          <div>
            <h3>{mensagemAniversario}</h3>
            <p>Que seu dia seja especial. Parabéns do grupo!</p>
          </div>
        </section>
      ) : null}

      {associadoView && empresaId && profile?.registro ? (
        <AssociadoMensalidadesPanel
          empresaId={empresaId}
          registro={profile.registro}
        />
      ) : null}

      {!associadoView ? (
      <section className="stats-grid">
        <article className="stat-card stat-card-total">
          <span>
            {ramoFiltro != null ? 'Total ativos do ramo' : 'Total ativos'}
          </span>
          <strong>{loading ? '—' : totalAtivos}</strong>
        </article>
        {ramos
          .filter((item) => item.ramo_id >= 1 && item.ramo_id <= 5)
          .map((item, index) => (
          <article
            key={item.ramo_id}
            className={`stat-card ${ramoCardClass(item.ramo_id, item.ramo_nome)}`}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <span>{item.ramo_nome}</span>
            <div className="stat-card-row">
              <strong>{loading ? '—' : item.total}</strong>
              <button
                type="button"
                className="btn btn-soft stat-card-ver"
                onClick={() => void abrirListaRamo(item)}
              >
                Ver
              </button>
            </div>
          </article>
        ))}
      </section>
      ) : null}

      {!associadoView && empresaId && ramoFiltro == null ? (
        <StaffMensalidadesAbertasPanel empresaId={empresaId} />
      ) : null}

      <section
        className={`dashboard-destaques${associadoView ? ' dashboard-destaques-solo' : ''}`}
      >
        <div className="panel passagem-panel aniversario-panel">
          <div className="passagem-header">
            <div>
              <h3>Aniversariantes</h3>
              <p className="muted">{mesAtual}</p>
            </div>
          </div>

          {loading ? (
            <div className="loading">Carregando…</div>
          ) : (
            <article className="aniversario-card">
              <AniversarioIllustration className="aniversario-card-img" />
              <div className="aniversario-card-body">
                <div className="aniversario-card-row">
                  <strong className="aniversario-card-count">
                    {totalAniversariantes}
                  </strong>
                  <button
                    type="button"
                    className="btn btn-soft"
                    disabled={totalAniversariantes === 0}
                    onClick={() => setAniversarioOpen(true)}
                  >
                    Ver
                  </button>
                </div>
                <p className="aniversario-card-meta">
                  {totalAniversariantes === 0
                    ? 'Nenhum neste mês'
                    : aniversariantesHoje > 0
                      ? `${aniversariantesHoje} hoje`
                      : 'neste mês'}
                </p>
              </div>
            </article>
          )}
        </div>

        {!associadoView ? (
          <div className="panel passagem-panel">
            <div className="passagem-header">
              <div>
                <h3>Passagens de ramo</h3>
                <p className="muted">Limite de idade (meia idade).</p>
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
                        Ver
                      </button>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        ) : null}
      </section>

      {associadoView && empresaId && profile?.registro ? (
        <AssociadoAtividadesPanel
          empresaId={empresaId}
          registro={profile.registro}
        />
      ) : null}

      {!associadoView && empresaId ? (
        <StaffAtividadesPanel
          empresaId={empresaId}
          codigoRamo={profile?.codigo_ramo ?? null}
        />
      ) : null}

      {aniversarioOpen ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={() => setAniversarioOpen(false)}
        >
          <div
            className="passagem-dialog aniversario-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="aniversario-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="passagem-dialog-header">
              <div>
                <h3 id="aniversario-title">
                  Aniversariantes de {mesAtual}{' '}
                  <span className="muted">({totalAniversariantes})</span>
                </h3>
                <p className="muted">
                  Associados ativos com aniversário neste mês
                </p>
              </div>
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => setAniversarioOpen(false)}
              >
                Fechar
              </button>
            </header>

            <div className="table-wrap">
              <table className="data-table aniversario-table">
                <thead>
                  <tr>
                    {canOpenAssociado ? <th></th> : null}
                    <th>Dia</th>
                    <th>Nome</th>
                    <th>Idade</th>
                    <th>Ramo</th>
                    <th>Seção</th>
                  </tr>
                </thead>
                <tbody>
                  {aniversariantes.map((row) => (
                    <tr
                      key={row.associado_id}
                      className={row.eh_hoje ? 'aniversario-hoje' : undefined}
                    >
                      {canOpenAssociado ? (
                        <td>
                          <Link
                            className="btn btn-soft"
                            to={`/associados/${row.associado_id}`}
                          >
                            Abrir
                          </Link>
                        </td>
                      ) : null}
                      <td>
                        <span className="aniversario-dia">
                          {String(row.dia).padStart(2, '0')}
                        </span>
                        {row.eh_hoje ? (
                          <span className="aniversario-hoje-badge">Hoje</span>
                        ) : null}
                      </td>
                      <td>{row.nome}</td>
                      <td>{row.idade} anos</td>
                      <td>{row.ramo_nome ?? '—'}</td>
                      <td>{row.secao_nome ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {listaRamo ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={fecharListaRamo}
        >
          <div
            className="passagem-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lista-ramo-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="passagem-dialog-header">
              <div>
                <h3 id="lista-ramo-title">
                  {listaRamo.ramo_nome}{' '}
                  <span className="muted">({listaRows.length})</span>
                </h3>
                <p className="muted">
                  {listaRamo.ramo_id === 5
                    ? 'Voluntários ativos do grupo'
                    : 'Beneficiários ativos deste ramo'}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-soft"
                onClick={fecharListaRamo}
              >
                Fechar
              </button>
            </header>

            {listaError ? (
              <AlertMessage tone="error" title="Não foi possível carregar">
                {listaError}
              </AlertMessage>
            ) : null}

            {listaLoading ? (
              <div className="loading">Carregando associados…</div>
            ) : listaRows.length === 0 ? (
              <div className="empty">Nenhum associado neste card.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Registro</th>
                      <th>Nome</th>
                      <th>Seção</th>
                      <th>Nascimento</th>
                      <th>Idade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaRows.map((row) => (
                      <tr key={row.associado_id}>
                        <td>
                          <Link
                            className="btn btn-soft"
                            to={`/associados/${row.associado_id}`}
                          >
                            Abrir
                          </Link>
                        </td>
                        <td>{row.registro ?? '—'}</td>
                        <td>{row.nome}</td>
                        <td>{row.secao_nome || '—'}</td>
                        <td>{formatDate(row.data_nascimento)}</td>
                        <td>
                          {row.data_nascimento
                            ? `${row.anos}a ${row.meses}m`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

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
