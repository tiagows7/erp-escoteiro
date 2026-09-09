import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertMessage } from '@/components/AlertMessage'
import { supabase } from '@/lib/supabase'

type Competicao = {
  competicao_id: number
  nome: string
  secao_id: number
}

type Participante = {
  participante_id: number
  secaonome_id: number
}

type Equipe = {
  secaonome_id: number
  nome: string
}

type Prova = {
  prova_id: number
  data_execucao: string | null
  created_at: string | null
}

type Pontuacao = {
  prova_id: number
  participante_id: number
  pontos: number
}

type ChartPoint = {
  data: string
  valor: number
}

type ChartSerie = {
  id: number
  nome: string
  cor: string
  pontos: ChartPoint[]
  total: number
}

const CORES = [
  '#247a3f',
  '#1d6f8c',
  '#c45c26',
  '#5b4bb7',
  '#b56576',
  '#8b5a2b',
  '#3d5a80',
  '#6a994e',
]

function formatDate(value: string) {
  const [ano, mes, dia] = value.slice(0, 10).split('-')
  return ano && mes && dia ? `${dia}/${mes}` : value
}

export function StaffCompeticoesChart({
  empresaId,
  codigoRamo,
  codigoSecao,
  registro,
  somenteVisualizacao = false,
}: {
  empresaId: number
  codigoRamo?: number | null
  codigoSecao?: number | null
  registro?: string | null
  somenteVisualizacao?: boolean
}) {
  const [competicoes, setCompeticoes] = useState<Competicao[]>([])
  const [competicaoId, setCompeticaoId] = useState<number | null>(null)
  const [participantes, setParticipantes] = useState<Participante[]>([])
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [provas, setProvas] = useState<Prova[]>([])
  const [pontuacoes, setPontuacoes] = useState<Pontuacao[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void (async () => {
      setLoading(true)
      let ramoFiltro = codigoRamo ?? null
      let secaoFiltro = codigoSecao ?? null

      if (registro) {
        const registroNumero = Number(String(registro).replace(/\D/g, ''))
        if (Number.isFinite(registroNumero) && registroNumero > 0) {
          const { data: associado, error: associadoError } = await supabase
            .from('associados')
            .select('ramo, secao')
            .eq('empresa_id', empresaId)
            .eq('registro', registroNumero)
            .maybeSingle()
          if (!mounted) return
          if (associadoError) {
            setError(associadoError.message)
            setCompeticoes([])
            setLoading(false)
            return
          }
          if (!associado) {
            setCompeticoes([])
            setCompeticaoId(null)
            setLoading(false)
            return
          }
          ramoFiltro = (associado?.ramo as number | null) ?? null
          secaoFiltro = (associado?.secao as number | null) ?? null
          if (ramoFiltro == null && secaoFiltro == null) {
            setCompeticoes([])
            setCompeticaoId(null)
            setLoading(false)
            return
          }
        } else {
          setCompeticoes([])
          setCompeticaoId(null)
          setLoading(false)
          return
        }
      }

      let secoesQuery = supabase
        .from('secao')
        .select('secao_id')
        .eq('empresa_id', empresaId)
      if (ramoFiltro != null && ramoFiltro > 0) {
        secoesQuery = secoesQuery.eq('ramo', ramoFiltro)
      }
      if (secaoFiltro != null && secaoFiltro > 0) {
        secoesQuery = secoesQuery.eq('secao_id', secaoFiltro)
      }
      const { data: secoes, error: secoesError } = await secoesQuery
      if (!mounted) return
      if (secoesError) {
        setError(secoesError.message)
        setCompeticoes([])
        setLoading(false)
        return
      }
      const secaoIds = (secoes ?? []).map((row) => row.secao_id as number)
      if (secaoIds.length === 0) {
        setCompeticoes([])
        setCompeticaoId(null)
        setLoading(false)
        return
      }
      const { data, error: competicoesError } = await supabase
        .from('competicoes')
        .select('competicao_id, nome, secao_id')
        .eq('empresa_id', empresaId)
        .is('encerrado_em', null)
        .in('secao_id', secaoIds)
        .order('created_at', { ascending: false })
      if (!mounted) return
      if (competicoesError) {
        setError(competicoesError.message)
        setCompeticoes([])
      } else {
        const list = (data as Competicao[]) ?? []
        setCompeticoes(list)
        setCompeticaoId((atual) =>
          atual && list.some((item) => item.competicao_id === atual)
            ? atual
            : (list[0]?.competicao_id ?? null),
        )
        setError(null)
      }
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [empresaId, codigoRamo, codigoSecao, registro])

  useEffect(() => {
    if (!competicaoId) {
      setParticipantes([])
      setEquipes([])
      setProvas([])
      setPontuacoes([])
      return
    }
    let mounted = true
    void (async () => {
      setLoading(true)
      const [participantesRes, provasRes] = await Promise.all([
        supabase
          .from('competicao_participante')
          .select('participante_id, secaonome_id')
          .eq('empresa_id', empresaId)
          .eq('competicao_id', competicaoId),
        supabase
          .from('competicao_prova')
          .select('prova_id, data_execucao, created_at')
          .eq('empresa_id', empresaId)
          .eq('competicao_id', competicaoId)
          .order('data_execucao')
          .order('ordem')
          .order('prova_id'),
      ])
      if (!mounted) return
      if (participantesRes.error || provasRes.error) {
        setError(
          participantesRes.error?.message ??
            provasRes.error?.message ??
            'Não foi possível carregar a competição.',
        )
        setLoading(false)
        return
      }
      const part = (participantesRes.data as Participante[]) ?? []
      const provasData = (provasRes.data as Prova[]) ?? []
      const equipeIds = part.map((item) => item.secaonome_id)
      const provaIds = provasData.map((item) => item.prova_id)
      const [equipesRes, pontosRes] = await Promise.all([
        equipeIds.length > 0
          ? supabase
              .from('secao_nome')
              .select('secaonome_id, nome')
              .eq('empresa_id', empresaId)
              .in('secaonome_id', equipeIds)
          : Promise.resolve({ data: [], error: null }),
        provaIds.length > 0
          ? supabase
              .from('competicao_pontuacao')
              .select('prova_id, participante_id, pontos')
              .eq('empresa_id', empresaId)
              .in('prova_id', provaIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (!mounted) return
      setParticipantes(part)
      setProvas(provasData)
      setEquipes((equipesRes.data as Equipe[]) ?? [])
      setPontuacoes((pontosRes.data as Pontuacao[]) ?? [])
      setError(equipesRes.error?.message ?? pontosRes.error?.message ?? null)
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [empresaId, competicaoId])

  const series = useMemo<ChartSerie[]>(() => {
    const datas = [
      ...new Set(
        provas
          .map((prova) => prova.data_execucao ?? prova.created_at?.slice(0, 10))
          .filter((data): data is string => !!data),
      ),
    ].sort()
    const equipeMap = new Map(
      equipes.map((equipe) => [equipe.secaonome_id, equipe.nome]),
    )
    const provaDataMap = new Map(
      provas.map((prova) => [
        prova.prova_id,
        prova.data_execucao ?? prova.created_at?.slice(0, 10) ?? '',
      ]),
    )
    const pontosPorParticipanteData = new Map<string, number>()
    for (const item of pontuacoes) {
      const data = provaDataMap.get(item.prova_id)
      if (!data) continue
      const key = `${item.participante_id}:${data}`
      pontosPorParticipanteData.set(
        key,
        (pontosPorParticipanteData.get(key) ?? 0) + Number(item.pontos ?? 0),
      )
    }
    return participantes.map((participante, index) => {
      let acumulado = 0
      const chartPoints = datas.map((data) => {
        acumulado +=
          pontosPorParticipanteData.get(
            `${participante.participante_id}:${data}`,
          ) ?? 0
        return { data, valor: acumulado }
      })
      return {
        id: participante.participante_id,
        nome:
          equipeMap.get(participante.secaonome_id) ??
          `Equipe ${participante.secaonome_id}`,
        cor: CORES[index % CORES.length],
        pontos: chartPoints,
        total: acumulado,
      }
    })
  }, [participantes, equipes, provas, pontuacoes])

  const datas = series[0]?.pontos.map((ponto) => ponto.data) ?? []
  const valores = series.flatMap((serie) =>
    serie.pontos.map((ponto) => ponto.valor),
  )
  const minValor = Math.min(0, ...valores)
  const maxValor = Math.max(0, ...valores)
  const faixaValor = Math.max(1, maxValor - minValor)
  const width = 900
  const height = 330
  const left = 58
  const right = 24
  const top = 20
  const bottom = 48
  const chartWidth = width - left - right
  const chartHeight = height - top - bottom
  const x = (index: number) =>
    left + (datas.length <= 1 ? chartWidth / 2 : (index / (datas.length - 1)) * chartWidth)
  const y = (valor: number) =>
    top + chartHeight - ((valor - minValor) / faixaValor) * chartHeight

  if (!loading && competicoes.length === 0) return null

  const selecionada = competicoes.find(
    (item) => item.competicao_id === competicaoId,
  )

  return (
    <section className="panel dashboard-competicao-panel">
      <div className="dashboard-competicao-head">
        <div>
          <h3>Competição em andamento</h3>
          <p className="muted">
            Evolução acumulada da pontuação ao longo das provas.
          </p>
        </div>
        {competicoes.length > 1 ? (
          <select
            className="select"
            value={competicaoId ?? ''}
            onChange={(event) => setCompeticaoId(Number(event.target.value))}
          >
            {competicoes.map((competicao) => (
              <option
                key={competicao.competicao_id}
                value={competicao.competicao_id}
              >
                {competicao.nome}
              </option>
            ))}
          </select>
        ) : selecionada ? (
          <strong>{selecionada.nome}</strong>
        ) : null}
      </div>

      {error ? (
        <AlertMessage tone="error" title="Não foi possível carregar o gráfico">
          {error}
        </AlertMessage>
      ) : loading ? (
        <div className="loading">Carregando pontuação…</div>
      ) : datas.length === 0 || series.length === 0 ? (
        <div className="empty">
          A competição ainda não possui provas pontuadas.
        </div>
      ) : (
        <>
          <div className="dashboard-competicao-chart-wrap">
            <svg
              className="dashboard-competicao-chart"
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`Evolução da competição ${selecionada?.nome ?? ''}`}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((fracao) => {
                const valor = minValor + faixaValor * fracao
                const posY = y(valor)
                return (
                  <g key={fracao}>
                    <line
                      x1={left}
                      x2={width - right}
                      y1={posY}
                      y2={posY}
                      className="dashboard-competicao-grid-line"
                    />
                    <text
                      x={left - 10}
                      y={posY + 4}
                      textAnchor="end"
                      className="dashboard-competicao-axis-text"
                    >
                      {valor.toLocaleString('pt-BR', {
                        maximumFractionDigits: 1,
                      })}
                    </text>
                  </g>
                )
              })}
              {datas.map((data, index) => (
                <text
                  key={data}
                  x={x(index)}
                  y={height - 16}
                  textAnchor="middle"
                  className="dashboard-competicao-axis-text"
                >
                  {formatDate(data)}
                </text>
              ))}
              {series.map((serie) => {
                const path = serie.pontos
                  .map(
                    (ponto, index) =>
                      `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(ponto.valor)}`,
                  )
                  .join(' ')
                return (
                  <g key={serie.id}>
                    <path
                      d={path}
                      fill="none"
                      stroke={serie.cor}
                      strokeWidth="4"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    {serie.pontos.map((ponto, index) => (
                      <circle
                        key={ponto.data}
                        cx={x(index)}
                        cy={y(ponto.valor)}
                        r="5"
                        fill={serie.cor}
                      >
                        <title>
                          {serie.nome}: {ponto.valor.toLocaleString('pt-BR')} em{' '}
                          {formatDate(ponto.data)}
                        </title>
                      </circle>
                    ))}
                  </g>
                )
              })}
            </svg>
          </div>
          <div className="dashboard-competicao-legenda">
            {[...series]
              .sort((a, b) => b.total - a.total)
              .map((serie) => (
                <span key={serie.id}>
                  <i style={{ background: serie.cor }} />
                  {serie.nome}: <strong>{serie.total.toLocaleString('pt-BR')}</strong>
                </span>
              ))}
          </div>
        </>
      )}

      {competicaoId && !somenteVisualizacao ? (
        <div className="form-actions">
          <Link className="btn btn-soft" to={`/competicoes/${competicaoId}`}>
            Abrir competição
          </Link>
        </div>
      ) : null}
    </section>
  )
}
