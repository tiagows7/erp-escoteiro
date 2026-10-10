import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import {
  currentPortalYear,
  formatMoney,
  parsePortalCaixaId,
  PORTAL_CAIXA_GERAL,
  PORTAL_MESES,
  portalCaixasVisiveis,
  portalPeriodoLabel,
  portalYearOptions,
  type PortalCaixaId,
  type PortalGrupo,
  type PortalPlanoLinha,
  type PortalResumo,
  type PortalSecao,
} from '@/lib/portal'
import { PortalPlanoContasPainel } from '@/components/PortalPlanoContasPainel'
import {
  PortalSaldoLocaisPainel,
  type PortalSaldoMovimentoLinha,
} from '@/components/PortalSaldoLocaisPainel'

export function PortalTransparenciaPage() {
  const { slug = '' } = useParams()
  const [searchParams] = useSearchParams()
  const { profile, session } = useAuth()
  const [grupo, setGrupo] = useState<PortalGrupo | null>(null)
  const [resumo, setResumo] = useState<PortalResumo | null>(null)
  const [planoLinhas, setPlanoLinhas] = useState<PortalPlanoLinha[]>([])
  const [secoes, setSecoes] = useState<PortalSecao[]>([])
  const [saldoMovimentos, setSaldoMovimentos] = useState<
    PortalSaldoMovimentoLinha[]
  >([])
  const [ano, setAno] = useState(currentPortalYear())
  const [mes, setMes] = useState<number | null>(() => new Date().getMonth() + 1)
  const [caixa, setCaixa] = useState<PortalCaixaId>(() => {
    return parsePortalCaixaId(searchParams.get('caixa')) ?? PORTAL_CAIXA_GERAL
  })
  const [secaoId, setSecaoId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const years = useMemo(() => portalYearOptions(6), [])
  const periodoLabel = portalPeriodoLabel(ano, mes)
  const caixas = useMemo(
    () => portalCaixasVisiveis(profile?.codigo_ramo),
    [profile?.codigo_ramo],
  )
  const mostrarSecoes = caixa >= 1 && caixa <= 4 && secoes.length > 1
  const showRamoCol = caixa === PORTAL_CAIXA_GERAL

  useEffect(() => {
    const parsed = parsePortalCaixaId(searchParams.get('caixa'))
    if (parsed != null) setCaixa(parsed)
  }, [searchParams])

  useEffect(() => {
    if (!caixas.some((c) => c.id === caixa)) {
      setCaixa(caixas[0]?.id ?? PORTAL_CAIXA_GERAL)
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

      const [resumoRes, planoRes, secoesRes, locaisRes] = await Promise.all([
        supabase.rpc('portal_resumo', {
          p_slug: cleanSlug,
          p_ano: ano,
          p_caixa: caixa,
          p_secao: secaoId,
          p_mes: mes,
        }),
        supabase.rpc('portal_plano_contas', {
          p_slug: cleanSlug,
          p_ano: ano,
          p_caixa: caixa,
          p_secao: secaoId,
          p_mes: mes,
        }),
        secoesPromise,
        supabase.rpc('portal_saldo_movimentos', {
          p_slug: cleanSlug,
          p_ano: ano,
          p_caixa: caixa,
          p_secao: secaoId,
          p_mes: mes,
        }),
      ])

      if (!mounted) return

      if (resumoRes.error || planoRes.error || secoesRes.error) {
        setError(
          resumoRes.error?.message ||
            planoRes.error?.message ||
            secoesRes.error?.message ||
            'Falha ao carregar dados.',
        )
        setResumo(null)
        setPlanoLinhas([])
        setSecoes([])
        setSaldoMovimentos([])
      } else {
        const resumoRow = (
          Array.isArray(resumoRes.data) ? resumoRes.data[0] : resumoRes.data
        ) as PortalResumo | null
        setResumo(resumoRow)
        setPlanoLinhas((planoRes.data as PortalPlanoLinha[]) ?? [])
        setSecoes((secoesRes.data as PortalSecao[]) ?? [])
        if (locaisRes.error) {
          console.warn('Locais do saldo:', locaisRes.error.message)
          setSaldoMovimentos([])
        } else {
          setSaldoMovimentos(
            (locaisRes.data as PortalSaldoMovimentoLinha[]) ?? [],
          )
        }
      }

      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [slug, ano, mes, caixa, secaoId])

  const caixaLabel =
    caixas.find((c) => c.id === caixa)?.label ?? 'Geral'
  const secaoLabel =
    secaoId == null
      ? 'Todas as seções'
      : (secoes.find((s) => s.secao_id === secaoId)?.secao_nome ?? 'Seção')

  const movimentoLocais = useMemo(() => {
    let receita = 0
    let despesa = 0
    for (const linha of saldoMovimentos) {
      if (linha.movimento_id == null) continue
      receita +=
        Number(linha.valor_resgatado ?? 0) + Number(linha.valor_creditos ?? 0)
      despesa +=
        Number(linha.valor_aplicado ?? 0) + Number(linha.valor_debitos ?? 0)
    }
    return {
      receita: Math.round(receita * 100) / 100,
      despesa: Math.round(despesa * 100) / 100,
    }
  }, [saldoMovimentos])

  const receitasCard = resumo
    ? Math.round(
        (Number(resumo.receitas_recebidas ?? resumo.total_receitas ?? 0) +
          movimentoLocais.receita) *
          100,
      ) / 100
    : 0
  const despesasCard = resumo
    ? Math.round(
        (Number(resumo.despesas_pagas ?? resumo.total_despesas ?? 0) +
          movimentoLocais.despesa) *
          100,
      ) / 100
    : 0
  const saldoFinalCard = resumo
    ? Math.round(
        (Number(resumo.saldo_anterior ?? 0) + receitasCard - despesasCard) *
          100,
      ) / 100
    : 0

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
              Demonstrativo em regime de caixa: só valores já recebidos e pagos,
              com saldo anterior/final e mensalidades em atraso.
              {profile?.codigo_ramo != null &&
              profile.codigo_ramo >= 1 &&
              profile.codigo_ramo <= 4
                ? ' Você vê o caixa do grupo e o caixa do seu ramo.'
                : ' Aba Geral reúne todos os caixas; demais abas mostram cada caixa.'}
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

              <div className="stats-grid portal-stats-grid portal-stats-grid-compact portal-demo-row">
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
                    Caixa antes de {periodoLabel.toLowerCase()}
                  </em>
                </article>
                <article className="stat-card">
                  <span>Receitas</span>
                  <strong>{formatMoney(receitasCard)}</strong>
                  <em className="stat-card-hint">
                    {movimentoLocais.receita !== 0
                      ? 'Recebidos, resgates e créditos'
                      : 'Somente valores recebidos'}
                  </em>
                </article>
                <article className="stat-card">
                  <span>Despesas</span>
                  <strong>{formatMoney(despesasCard)}</strong>
                  <em className="stat-card-hint">
                    {movimentoLocais.despesa !== 0
                      ? 'Pagos, aplicados e débitos'
                      : 'Somente valores pagos'}
                  </em>
                </article>
                <article className="stat-card stat-card-total">
                  <span>Saldo final</span>
                  <strong className={saldoFinalCard < 0 ? 'is-neg' : undefined}>
                    {formatMoney(saldoFinalCard)}
                  </strong>
                  <em className="stat-card-hint">
                    Anterior + recebido − pago
                  </em>
                </article>
                <article className="stat-card">
                  <span>Mensalidades em atraso</span>
                  <strong
                    className={
                      Number(resumo.mensalidades_atraso ?? 0) > 0
                        ? 'is-neg'
                        : undefined
                    }
                  >
                    {formatMoney(resumo.mensalidades_atraso ?? 0)}
                  </strong>
                  <em className="stat-card-hint">
                    Saldo vencido em aberto (hoje)
                  </em>
                </article>
              </div>
            </>
          ) : null}
        </section>

        {!loading && grupo ? (
          <section className="panel portal-panel">
            <PortalPlanoContasPainel
              key={`${ano}|${mes ?? ''}|${caixa}|${secaoId ?? ''}`}
              linhas={planoLinhas}
              slug={slug.trim().toLowerCase()}
              ano={ano}
              mes={mes}
              caixa={caixa}
              secaoId={secaoId}
              showRamoCol={showRamoCol}
            />
          </section>
        ) : null}

        {!loading && grupo ? (
          <PortalSaldoLocaisPainel linhas={saldoMovimentos} />
        ) : null}
      </main>

      <footer className="portal-foot">
        Dados publicados pelo grupo · ERP Escoteiro
      </footer>
    </div>
  )
}
