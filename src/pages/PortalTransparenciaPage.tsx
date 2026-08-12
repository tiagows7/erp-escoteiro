import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  currentPortalYear,
  formatMoney,
  formatPortalDate,
  groupBySecao,
  origemReceitaLabel,
  PORTAL_MESES,
  portalCaixasVisiveis,
  portalPeriodoLabel,
  portalYearOptions,
  situacaoTituloLabel,
  type PortalCaixaId,
  type PortalDespesa,
  type PortalGrupo,
  type PortalReceita,
  type PortalResumo,
  type PortalSaldoLocal,
  type PortalSecao,
} from '@/lib/portal'
import { documentLabel, parseDocumentUrls } from '@/lib/documentUrls'

type Tab = 'despesas' | 'receitas'

export function PortalTransparenciaPage() {
  const { slug = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { profile, session } = useAuth()
  const [grupo, setGrupo] = useState<PortalGrupo | null>(null)
  const [resumo, setResumo] = useState<PortalResumo | null>(null)
  const [despesas, setDespesas] = useState<PortalDespesa[]>([])
  const [receitas, setReceitas] = useState<PortalReceita[]>([])
  const [secoes, setSecoes] = useState<PortalSecao[]>([])
  const [saldoLocais, setSaldoLocais] = useState<PortalSaldoLocal[]>([])
  const [ano, setAno] = useState(currentPortalYear())
  const [mes, setMes] = useState<number | null>(() => new Date().getMonth() + 1)
  const [caixa, setCaixa] = useState<PortalCaixaId>(() => {
    const raw = Number(searchParams.get('caixa'))
    if (raw === 0 || (raw >= 1 && raw <= 4)) return raw as PortalCaixaId
    return 0
  })
  const [secaoId, setSecaoId] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('despesas')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const years = useMemo(() => portalYearOptions(6), [])
  const periodoLabel = portalPeriodoLabel(ano, mes)
  const caixas = useMemo(
    () => portalCaixasVisiveis(profile?.codigo_ramo),
    [profile?.codigo_ramo],
  )
  const mostrarSecoes = caixa >= 1 && caixa <= 4 && secoes.length > 1
  const agruparPorSecao = mostrarSecoes && secaoId == null

  useEffect(() => {
    const raw = Number(searchParams.get('caixa'))
    if (raw === 0 || (raw >= 1 && raw <= 4)) {
      setCaixa(raw as PortalCaixaId)
    }
  }, [searchParams])

  useEffect(() => {
    if (!caixas.some((c) => c.id === caixa)) {
      setCaixa(caixas[0]?.id ?? 0)
    }
  }, [caixas, caixa])

  useEffect(() => {
    setSecaoId(null)
  }, [caixa])

  useEffect(() => {
    if (secaoId != null && !secoes.some((s) => s.secao_id === secaoId)) {
      setSecaoId(null)
    }
  }, [secoes, secaoId])

  useEffect(() => {
    const cleanSlug = slug.trim().toLowerCase()
    if (!cleanSlug) {
      setError('Link do portal inválido.')
      setLoading(false)
      return
    }

    let mounted = true
    void (async () => {
      setLoading(true)
      setError(null)

      const { data: info, error: infoError } = await supabase.rpc(
        'portal_grupo_info',
        { p_slug: cleanSlug },
      )

      if (!mounted) return

      if (infoError) {
        setError(infoError.message)
        setGrupo(null)
        setLoading(false)
        return
      }

      const row = (Array.isArray(info) ? info[0] : info) as PortalGrupo | undefined
      if (!row?.id) {
        setError(
          'Portal não encontrado. Verifique o link ou se o grupo liberou a transparência.',
        )
        setGrupo(null)
        setLoading(false)
        return
      }

      setGrupo(row)

      const secoesPromise =
        caixa >= 1 && caixa <= 4
          ? supabase.rpc('portal_secoes_caixa', {
              p_slug: cleanSlug,
              p_caixa: caixa,
            })
          : Promise.resolve({ data: [], error: null })

      const [resumoRes, despRes, recRes, secoesRes, locaisRes] =
        await Promise.all([
        supabase.rpc('portal_resumo', {
          p_slug: cleanSlug,
          p_ano: ano,
          p_caixa: caixa,
          p_secao: secaoId,
          p_mes: mes,
        }),
        supabase.rpc('portal_despesas', {
          p_slug: cleanSlug,
          p_ano: ano,
          p_caixa: caixa,
          p_secao: secaoId,
          p_mes: mes,
        }),
        supabase.rpc('portal_receitas', {
          p_slug: cleanSlug,
          p_ano: ano,
          p_caixa: caixa,
          p_secao: secaoId,
          p_mes: mes,
        }),
        secoesPromise,
        supabase.rpc('portal_saldo_locais', {
          p_slug: cleanSlug,
          p_caixa: caixa,
          p_secao: secaoId,
        }),
      ])

      if (!mounted) return

      if (
        resumoRes.error ||
        despRes.error ||
        recRes.error ||
        secoesRes.error
      ) {
        setError(
          resumoRes.error?.message ||
            despRes.error?.message ||
            recRes.error?.message ||
            secoesRes.error?.message ||
            'Falha ao carregar dados.',
        )
        setResumo(null)
        setDespesas([])
        setReceitas([])
        setSecoes([])
        setSaldoLocais([])
      } else {
        const resumoRow = (
          Array.isArray(resumoRes.data) ? resumoRes.data[0] : resumoRes.data
        ) as PortalResumo | null
        setResumo(resumoRow)
        setDespesas((despRes.data as PortalDespesa[]) ?? [])
        setReceitas((recRes.data as PortalReceita[]) ?? [])
        setSecoes((secoesRes.data as PortalSecao[]) ?? [])
        if (locaisRes.error) {
          console.warn('Locais do saldo:', locaisRes.error.message)
          setSaldoLocais([])
        } else {
          setSaldoLocais((locaisRes.data as PortalSaldoLocal[]) ?? [])
        }
      }

      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [slug, ano, mes, caixa, secaoId])

  const caixaLabel =
    caixas.find((c) => c.id === caixa)?.label ?? 'Caixa do grupo'
  const secaoLabel =
    secaoId == null
      ? 'Todas as seções'
      : (secoes.find((s) => s.secao_id === secaoId)?.secao_nome ?? 'Seção')

  const despesasGrupos = useMemo(
    () => (agruparPorSecao ? groupBySecao(despesas) : null),
    [agruparPorSecao, despesas],
  )
  const receitasGrupos = useMemo(
    () => (agruparPorSecao ? groupBySecao(receitas) : null),
    [agruparPorSecao, receitas],
  )

  function renderDespesasTable(rows: PortalDespesa[], showSecaoCol: boolean) {
    return (
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Emissão</th>
              <th>Finalidade</th>
              <th>Fornecedor</th>
              <th>Ramo</th>
              {showSecaoCol ? <th>Seção</th> : null}
              <th>Valor</th>
              <th>Saldo</th>
              <th>Situação</th>
              <th>Documento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.despesa_id}>
                <td>{formatPortalDate(row.despesa_emissao)}</td>
                <td>{row.despesa_finalidade || '—'}</td>
                <td>{row.fornecedor_nome || '—'}</td>
                <td>{row.ramo_nome || 'Grupo'}</td>
                {showSecaoCol ? <td>{row.secao_nome || '—'}</td> : null}
                <td>{formatMoney(row.despesa_valor)}</td>
                <td>{formatMoney(row.despesa_saldo)}</td>
                <td>{situacaoTituloLabel(row.despesa_situacao)}</td>
                <td>
                  {(() => {
                    const docs = parseDocumentUrls(row.despesa_documento)
                    if (docs.length === 0) return '—'
                    return (
                      <div className="portal-doc-links">
                        {docs.map((url, index) => (
                          <a
                            key={url}
                            className="btn btn-soft"
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {docs.length === 1
                              ? 'Abrir'
                              : documentLabel(url, index)}
                          </a>
                        ))}
                      </div>
                    )
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  function renderReceitasTable(rows: PortalReceita[], showSecaoCol: boolean) {
    return (
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Emissão</th>
              <th>Competência</th>
              <th>Descrição</th>
              <th>Origem</th>
              {showSecaoCol ? <th>Seção</th> : null}
              <th>Valor</th>
              <th>Saldo</th>
              <th>Situação</th>
              <th>Documento</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.receita_id}>
                <td>{formatPortalDate(row.receita_emissao)}</td>
                <td>{formatPortalDate(row.receita_competencia)}</td>
                <td>{row.receita_descricao || '—'}</td>
                <td>{origemReceitaLabel(row.receita_origem)}</td>
                {showSecaoCol ? <td>{row.secao_nome || '—'}</td> : null}
                <td>{formatMoney(row.receita_valor)}</td>
                <td>{formatMoney(row.receita_saldo)}</td>
                <td>{situacaoTituloLabel(row.receita_situacao)}</td>
                <td>
                  {(() => {
                    const docs = parseDocumentUrls(row.receita_documento)
                    if (docs.length === 0) return '—'
                    return (
                      <div className="portal-doc-links">
                        {docs.map((url, index) => (
                          <a
                            key={url}
                            className="btn btn-soft"
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {docs.length === 1
                              ? 'Abrir'
                              : documentLabel(url, index)}
                          </a>
                        ))}
                      </div>
                    )
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="portal-page">
      <div className="portal-sky" aria-hidden="true" />

      <header className="portal-top">
        <div className="portal-brand">
          <img
            src={grupo?.logo_url || '/logo-erp.png'}
            alt=""
            width={64}
            height={64}
          />
          <div>
            <p className="portal-eyebrow">Portal da Transparência</p>
            <h1>{grupo?.nome || 'Carregando…'}</h1>
            {grupo?.telefone || grupo?.email ? (
              <p className="portal-contact">
                {[grupo.telefone, grupo.email].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>
        </div>
        <Link className="btn btn-soft" to="/login">
          {session ? 'Área restrita' : 'Entrar'}
        </Link>
      </header>

      <main className="portal-main">
        {error ? (
          <AlertMessage tone="error" title="Portal indisponível">
            {error}
          </AlertMessage>
        ) : null}

        <section className="panel portal-panel">
          <div className="toolbar filtros-estrutura">
            <label className="portal-year-label">
              <span>Ano</span>
              <select
                className="select"
                value={ano}
                onChange={(e) => setAno(Number(e.target.value))}
                disabled={loading || !grupo}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="portal-year-label">
              <span>Mês</span>
              <select
                className="select"
                value={mes == null ? '' : String(mes)}
                onChange={(e) => {
                  const raw = e.target.value
                  setMes(raw === '' ? null : Number(raw))
                }}
                disabled={loading || !grupo}
              >
                <option value="">Ano todo</option>
                {PORTAL_MESES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="field-hint portal-hint">
              Demonstrativo do período com saldo anterior, receitas, despesas e
              saldo final.
              {profile?.codigo_ramo != null &&
              profile.codigo_ramo >= 1 &&
              profile.codigo_ramo <= 4
                ? ' Você vê o caixa geral e o caixa do seu ramo.'
                : ' Caixas: grupo geral e ramos.'}
              {mostrarSecoes
                ? ' Também é possível filtrar por seção.'
                : ''}
            </p>
          </div>

          <div className="tabs portal-caixa-tabs" role="tablist">
            {caixas.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                className={`tab${caixa === item.id ? ' active' : ''}`}
                aria-selected={caixa === item.id}
                onClick={() => setCaixa(item.id)}
                disabled={!grupo}
              >
                {item.label}
              </button>
            ))}
          </div>

          {mostrarSecoes ? (
            <div
              className="tabs portal-secao-tabs"
              role="tablist"
              aria-label="Seções do ramo"
            >
              <button
                type="button"
                role="tab"
                className={`tab${secaoId == null ? ' active' : ''}`}
                aria-selected={secaoId == null}
                onClick={() => setSecaoId(null)}
              >
                Todas as seções
              </button>
              {secoes.map((s) => (
                <button
                  key={s.secao_id}
                  type="button"
                  role="tab"
                  className={`tab${secaoId === s.secao_id ? ' active' : ''}`}
                  aria-selected={secaoId === s.secao_id}
                  onClick={() => setSecaoId(s.secao_id)}
                >
                  {s.secao_nome}
                </button>
              ))}
            </div>
          ) : null}

          {loading ? (
            <div className="loading">Carregando portal…</div>
          ) : grupo && resumo ? (
            <>
              <p className="portal-caixa-atual">
                Demonstrativo: <strong>{periodoLabel}</strong>
                {' · '}
                Caixa: <strong>{caixaLabel}</strong>
                {mostrarSecoes ? (
                  <>
                    {' '}
                    · Seção: <strong>{secaoLabel}</strong>
                  </>
                ) : null}
              </p>
              <div className="stats-grid portal-stats-grid portal-stats-grid-compact">
                <article className="stat-card">
                  <span>Saldo anterior</span>
                  <strong
                    className={
                      Number(resumo.saldo_anterior ?? 0) < 0
                        ? 'is-neg'
                        : undefined
                    }
                  >
                    {formatMoney(resumo.saldo_anterior ?? 0)}
                  </strong>
                  <em className="stat-card-hint">
                    Antes de {periodoLabel.toLowerCase()}
                  </em>
                </article>
                <article className="stat-card">
                  <span>Receitas</span>
                  <strong>{formatMoney(resumo.total_receitas)}</strong>
                  <em className="stat-card-hint">
                    Recebido: {formatMoney(resumo.receitas_recebidas)}
                  </em>
                </article>
                <article className="stat-card">
                  <span>Despesas</span>
                  <strong>{formatMoney(resumo.total_despesas)}</strong>
                  <em className="stat-card-hint">
                    Pago: {formatMoney(resumo.despesas_pagas)}
                  </em>
                </article>
                <article className="stat-card stat-card-total">
                  <span>Saldo final</span>
                  <strong
                    className={
                      Number(resumo.saldo_final ?? resumo.saldo_lancado) < 0
                        ? 'is-neg'
                        : undefined
                    }
                  >
                    {formatMoney(resumo.saldo_final ?? resumo.saldo_lancado)}
                  </strong>
                  <em className="stat-card-hint">
                    Realizado:{' '}
                    {formatMoney(
                      Number(resumo.saldo_anterior ?? 0) +
                        Number(resumo.saldo_realizado ?? 0),
                    )}
                  </em>
                </article>
              </div>

              {saldoLocais.length > 0 ? (
                <div className="portal-locais">
                  <p className="portal-locais-title">Onde está o valor</p>
                  <div className="stats-grid portal-stats-grid portal-stats-grid-compact">
                    {saldoLocais.map((local) => (
                      <article key={local.id} className="stat-card">
                        <span>{local.nome}</span>
                        <strong>{formatMoney(local.valor)}</strong>
                        {local.secao_nome ? (
                          <em className="stat-card-hint">{local.secao_nome}</em>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        {!loading && grupo ? (
          <section className="panel portal-panel">
            <div className="tabs" role="tablist">
              <button
                type="button"
                role="tab"
                className={`tab${tab === 'despesas' ? ' active' : ''}`}
                aria-selected={tab === 'despesas'}
                onClick={() => setTab('despesas')}
              >
                Despesas ({despesas.length})
              </button>
              <button
                type="button"
                role="tab"
                className={`tab${tab === 'receitas' ? ' active' : ''}`}
                aria-selected={tab === 'receitas'}
                onClick={() => setTab('receitas')}
              >
                Receitas ({receitas.length})
              </button>
            </div>

            {tab === 'despesas' ? (
              despesas.length === 0 ? (
                <div className="empty">
                  Nenhuma despesa neste caixa/período.
                </div>
              ) : despesasGrupos ? (
                <div className="portal-secao-groups">
                  {despesasGrupos.map((grupoSecao) => (
                    <section
                      key={grupoSecao.key}
                      className="portal-secao-group"
                    >
                      <h3>
                        {grupoSecao.secao_nome}{' '}
                        <span className="muted">
                          ({grupoSecao.items.length})
                        </span>
                      </h3>
                      {renderDespesasTable(grupoSecao.items, false)}
                    </section>
                  ))}
                </div>
              ) : (
                renderDespesasTable(despesas, false)
              )
            ) : receitas.length === 0 ? (
              <div className="empty">
                Nenhuma receita neste caixa/período.
              </div>
            ) : receitasGrupos ? (
              <div className="portal-secao-groups">
                {receitasGrupos.map((grupoSecao) => (
                  <section key={grupoSecao.key} className="portal-secao-group">
                    <h3>
                      {grupoSecao.secao_nome}{' '}
                      <span className="muted">
                        ({grupoSecao.items.length})
                      </span>
                    </h3>
                    {renderReceitasTable(grupoSecao.items, false)}
                  </section>
                ))}
              </div>
            ) : (
              renderReceitasTable(receitas, false)
            )}
          </section>
        ) : null}
      </main>

      <footer className="portal-foot">
        Dados publicados pelo grupo · ERP Escoteiro
      </footer>
    </div>
  )
}
