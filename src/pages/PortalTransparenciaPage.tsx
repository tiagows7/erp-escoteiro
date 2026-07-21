import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  currentPortalYear,
  formatMoney,
  formatPortalDate,
  origemReceitaLabel,
  portalCaixasVisiveis,
  portalYearOptions,
  situacaoTituloLabel,
  type PortalCaixaId,
  type PortalDespesa,
  type PortalGrupo,
  type PortalReceita,
  type PortalResumo,
} from '@/lib/portal'

type Tab = 'despesas' | 'receitas'

export function PortalTransparenciaPage() {
  const { slug = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { profile, session } = useAuth()
  const [grupo, setGrupo] = useState<PortalGrupo | null>(null)
  const [resumo, setResumo] = useState<PortalResumo | null>(null)
  const [despesas, setDespesas] = useState<PortalDespesa[]>([])
  const [receitas, setReceitas] = useState<PortalReceita[]>([])
  const [ano, setAno] = useState(currentPortalYear())
  const [caixa, setCaixa] = useState<PortalCaixaId>(() => {
    const raw = Number(searchParams.get('caixa'))
    if (raw === 0 || (raw >= 1 && raw <= 4)) return raw as PortalCaixaId
    return 0
  })
  const [tab, setTab] = useState<Tab>('despesas')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const years = useMemo(() => portalYearOptions(6), [])
  const caixas = useMemo(
    () => portalCaixasVisiveis(profile?.codigo_ramo),
    [profile?.codigo_ramo],
  )

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

      const [resumoRes, despRes, recRes] = await Promise.all([
        supabase.rpc('portal_resumo', {
          p_slug: cleanSlug,
          p_ano: ano,
          p_caixa: caixa,
        }),
        supabase.rpc('portal_despesas', {
          p_slug: cleanSlug,
          p_ano: ano,
          p_caixa: caixa,
        }),
        supabase.rpc('portal_receitas', {
          p_slug: cleanSlug,
          p_ano: ano,
          p_caixa: caixa,
        }),
      ])

      if (!mounted) return

      if (resumoRes.error || despRes.error || recRes.error) {
        setError(
          resumoRes.error?.message ||
            despRes.error?.message ||
            recRes.error?.message ||
            'Falha ao carregar dados.',
        )
        setResumo(null)
        setDespesas([])
        setReceitas([])
      } else {
        const resumoRow = (
          Array.isArray(resumoRes.data) ? resumoRes.data[0] : resumoRes.data
        ) as PortalResumo | null
        setResumo(resumoRow)
        setDespesas((despRes.data as PortalDespesa[]) ?? [])
        setReceitas((recRes.data as PortalReceita[]) ?? [])
      }

      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [slug, ano, caixa])

  const caixaLabel =
    caixas.find((c) => c.id === caixa)?.label ?? 'Caixa do grupo'

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
            <p className="field-hint portal-hint">
              {profile?.codigo_ramo != null &&
              profile.codigo_ramo >= 1 &&
              profile.codigo_ramo <= 4
                ? 'Você vê o caixa geral e o caixa do seu ramo.'
                : 'Caixas: grupo geral e ramos (Lobinho, Escoteiro, Sênior, Pioneiro).'}
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

          {loading ? (
            <div className="loading">Carregando portal…</div>
          ) : grupo && resumo ? (
            <>
              <p className="portal-caixa-atual">
                Caixa: <strong>{caixaLabel}</strong>
              </p>
              <div className="portal-stats">
                <article className="portal-stat portal-stat-receita">
                  <span>Receitas lançadas</span>
                  <strong>{formatMoney(resumo.total_receitas)}</strong>
                  <small>
                    Recebido: {formatMoney(resumo.receitas_recebidas)}
                  </small>
                </article>
                <article className="portal-stat portal-stat-despesa">
                  <span>Despesas lançadas</span>
                  <strong>{formatMoney(resumo.total_despesas)}</strong>
                  <small>Pago: {formatMoney(resumo.despesas_pagas)}</small>
                </article>
                <article className="portal-stat portal-stat-saldo">
                  <span>Resultado (lançado)</span>
                  <strong
                    className={
                      Number(resumo.saldo_lancado) < 0 ? 'is-neg' : 'is-pos'
                    }
                  >
                    {formatMoney(resumo.saldo_lancado)}
                  </strong>
                  <small>
                    Realizado: {formatMoney(resumo.saldo_realizado)}
                  </small>
                </article>
              </div>
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
                <div className="empty">Nenhuma despesa neste caixa/ano.</div>
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Emissão</th>
                        <th>Finalidade</th>
                        <th>Fornecedor</th>
                        <th>Ramo</th>
                        <th>Valor</th>
                        <th>Saldo</th>
                        <th>Situação</th>
                        <th>Documento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {despesas.map((row) => (
                        <tr key={row.despesa_id}>
                          <td>{formatPortalDate(row.despesa_emissao)}</td>
                          <td>{row.despesa_finalidade || '—'}</td>
                          <td>{row.fornecedor_nome || '—'}</td>
                          <td>{row.ramo_nome || 'Grupo'}</td>
                          <td>{formatMoney(row.despesa_valor)}</td>
                          <td>{formatMoney(row.despesa_saldo)}</td>
                          <td>
                            {situacaoTituloLabel(row.despesa_situacao)}
                          </td>
                          <td>
                            {row.despesa_documento ? (
                              <a
                                className="btn btn-soft"
                                href={row.despesa_documento}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Abrir
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : receitas.length === 0 ? (
              <div className="empty">Nenhuma receita neste caixa/ano.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Emissão</th>
                      <th>Competência</th>
                      <th>Descrição</th>
                      <th>Origem</th>
                      <th>Valor</th>
                      <th>Saldo</th>
                      <th>Situação</th>
                      <th>Documento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receitas.map((row) => (
                      <tr key={row.receita_id}>
                        <td>{formatPortalDate(row.receita_emissao)}</td>
                        <td>{formatPortalDate(row.receita_competencia)}</td>
                        <td>{row.receita_descricao || '—'}</td>
                        <td>{origemReceitaLabel(row.receita_origem)}</td>
                        <td>{formatMoney(row.receita_valor)}</td>
                        <td>{formatMoney(row.receita_saldo)}</td>
                        <td>
                          {situacaoTituloLabel(row.receita_situacao)}
                        </td>
                        <td>
                          {row.receita_documento ? (
                            <a
                              className="btn btn-soft"
                              href={row.receita_documento}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Abrir
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
