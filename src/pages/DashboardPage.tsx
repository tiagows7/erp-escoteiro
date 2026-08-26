import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { AniversarioIllustration } from '@/components/AniversarioIllustration'
import { AssociadoAtividadesPanel } from '@/components/AssociadoAtividadesPanel'
import { AssociadoMensalidadesPanel } from '@/components/AssociadoMensalidadesPanel'
import { RegistroProvisorioBadge } from '@/components/RegistroProvisorioBadge'
import { StaffAtividadesPanel } from '@/components/StaffAtividadesPanel'
import { StaffMensalidadesAbertasPanel } from '@/components/StaffMensalidadesAbertasPanel'
import { formatMoney } from '@/lib/despesas'
import { RECEITA_ORIGEM } from '@/lib/receitas'
import { mapRegistroProvisorio } from '@/lib/registroProvisorio'
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

function statusValidadeRegistro(isoDate: string | null | undefined): {
  label: string
  tone: 'ok' | 'warn' | 'danger' | 'empty'
} {
  if (!isoDate) return { label: 'Não informada', tone: 'empty' }
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return { label: 'Não informada', tone: 'empty' }

  const validade = new Date(y, m - 1, d)
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  validade.setHours(0, 0, 0, 0)

  const diffDays = Math.round(
    (validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
  )

  if (diffDays < 0) return { label: 'Vencida', tone: 'danger' }
  if (diffDays <= 30) return { label: 'A vencer', tone: 'warn' }
  return { label: 'Em dia', tone: 'ok' }
}

function idadeAnosMeses(isoDate: string | null | undefined): {
  anos: number
  meses: number
} | null {
  if (!isoDate) return null
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const nasc = new Date(y, m - 1, d)
  const hoje = new Date()
  let anos = hoje.getFullYear() - nasc.getFullYear()
  let meses = hoje.getMonth() - nasc.getMonth()
  if (hoje.getDate() < nasc.getDate()) meses -= 1
  if (meses < 0) {
    anos -= 1
    meses += 12
  }
  return { anos: Math.max(0, anos), meses: Math.max(0, meses) }
}

function categoriaEhBeneficiario(nome: string | null | undefined): boolean {
  return (nome ?? '').toUpperCase().includes('BENEFICI')
}

type MensalidadeTipoDetalhe = {
  id: number | null
  nome: string
  quantidade: number
  valorUnitario: number
  total: number
}

type BeneficiarioMensalidadeStats = {
  total: number
  pagantes: number
  isentos: number
  /** Soma do valor do tipo de mensalidade dos que pagam. */
  valorMensalidade: number
  porTipo: MensalidadeTipoDetalhe[]
  /** Totais gerados em receitas (origem mensalidade) por mês 0..11 do ano corrente. */
  geradoPorMes: number[]
}

const BENEF_MENSALIDADE_VAZIO: BeneficiarioMensalidadeStats = {
  total: 0,
  pagantes: 0,
  isentos: 0,
  valorMensalidade: 0,
  porTipo: [],
  geradoPorMes: Array.from({ length: 12 }, () => 0),
}

function parseValorMensalidade(raw: unknown): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0
  if (raw == null) return 0
  const s = String(raw).trim().replace(/\s/g, '')
  if (!s) return 0
  const n = s.includes(',')
    ? Number(s.replace(/\./g, '').replace(',', '.'))
    : Number(s)
  return Number.isFinite(n) ? n : 0
}

const BENEF_DONUT_COLORS = [
  '#247a3f',
  '#1d6f8c',
  '#5b4bb7',
  '#c45c26',
  '#2f7d62',
  '#8b5a2b',
  '#3d5a80',
  '#6a994e',
  '#b56576',
  '#4a6fa5',
]

const BENEF_DONUT_ISENTO_COLOR = '#c9a227'

type BenefDonutSlice = {
  key: string
  label: string
  value: number
  color: string
}

function buildBenefDonutSlices(
  porTipo: MensalidadeTipoDetalhe[],
  isentos: number,
): BenefDonutSlice[] {
  const slices: BenefDonutSlice[] = porTipo
    .filter((t) => t.quantidade > 0)
    .map((t, index) => ({
      key: t.id != null ? `t-${t.id}` : `sem-${t.nome}`,
      label: t.nome,
      value: t.quantidade,
      color: BENEF_DONUT_COLORS[index % BENEF_DONUT_COLORS.length],
    }))
  if (isentos > 0) {
    slices.push({
      key: 'isento',
      label: 'Isento',
      value: isentos,
      color: BENEF_DONUT_ISENTO_COLOR,
    })
  }
  return slices
}

function BeneficiariosDonut({
  porTipo,
  isentos,
}: {
  porTipo: MensalidadeTipoDetalhe[]
  isentos: number
}) {
  const slices = buildBenefDonutSlices(porTipo, isentos)
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  const size = 148
  const stroke = 20
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r

  let offset = c * 0.25
  const arcs = slices.map((slice) => {
    const len = total > 0 ? (slice.value / total) * c : 0
    const arc = { ...slice, len, offset }
    offset -= len
    return arc
  })

  return (
    <div className="benef-donut" aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="benef-donut-track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        {total > 0
          ? arcs.map((arc) => (
              <circle
                key={arc.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={arc.color}
                strokeWidth={stroke}
                strokeDasharray={`${arc.len} ${c - arc.len}`}
                strokeDashoffset={arc.offset}
                strokeLinecap="butt"
              />
            ))
          : null}
      </svg>
      <div className="benef-donut-center">
        <strong>{total}</strong>
        <span>beneficiários</span>
      </div>
    </div>
  )
}

function PrevisaoMensalidadeChart({
  valorMensal,
  geradoPorMes,
}: {
  valorMensal: number
  geradoPorMes: number[]
}) {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mesAtualIdx = agora.getMonth() // 0..11

  const meses = MESES.map((nome, index) => {
    const gerado = Number(geradoPorMes[index] ?? 0)
    const isProjetado = index > mesAtualIdx
    const valor = isProjetado ? valorMensal : gerado
    return {
      index,
      label: nome.slice(0, 3),
      nome,
      valor: Number(valor.toFixed(2)),
      isCurrent: index === mesAtualIdx,
      isGerado: index <= mesAtualIdx,
      isProjetado,
    }
  })

  const totalGerado = Number(
    meses
      .filter((m) => m.isGerado)
      .reduce((s, m) => s + m.valor, 0)
      .toFixed(2),
  )
  const totalProjetado = Number(
    meses
      .filter((m) => m.isProjetado)
      .reduce((s, m) => s + m.valor, 0)
      .toFixed(2),
  )
  const totalAno = Number((totalGerado + totalProjetado).toFixed(2))
  const maxValor = Math.max(...meses.map((m) => m.valor), 0)

  if (totalAno <= 0 && valorMensal <= 0) {
    return (
      <div className="dashboard-previsao-empty muted">
        Sem dados — gere mensalidades nas receitas ou cadastre o tipo/valor nos
        associados.
      </div>
    )
  }

  return (
    <div className="dashboard-previsao-chart">
      <div className="dashboard-previsao-total">
        <span>Previsão {ano}</span>
        <strong>{formatMoney(totalAno)}</strong>
      </div>
      <p className="dashboard-previsao-restante muted">
        Gerado até {MESES[mesAtualIdx]}: {formatMoney(totalGerado)}
        {totalProjetado > 0
          ? ` · Projetado: ${formatMoney(totalProjetado)}`
          : ''}
      </p>
      <div
        className="dashboard-previsao-meses"
        role="img"
        aria-label={`Mensalidades geradas até ${MESES[mesAtualIdx]} e projeção até dezembro de ${ano}`}
      >
        {meses.map((mes) => {
          const altura =
            maxValor > 0
              ? Math.max(mes.valor > 0 ? 8 : 2, (mes.valor / maxValor) * 100)
              : 2
          const tipoLabel = mes.isProjetado ? 'Projetado' : 'Gerado'
          const mostraValorNaBarra = altura >= 42
          return (
            <div
              key={mes.index}
              className={`dashboard-previsao-mes${mes.isCurrent ? ' is-current' : ''}${mes.isGerado && !mes.isCurrent ? ' is-gerado' : ''}${mes.isProjetado ? ' is-projetado' : ''}`}
            >
              <div className="dashboard-previsao-mes-bar-wrap">
                <div
                  className="dashboard-previsao-mes-bar"
                  style={{ height: `${altura}%` }}
                >
                  {mostraValorNaBarra ? (
                    <span className="dashboard-previsao-mes-bar-valor">
                      {formatMoney(mes.valor)}
                    </span>
                  ) : null}
                  <div className="dashboard-previsao-mes-popup" role="tooltip">
                    <strong>{mes.nome}</strong>
                    <span>{formatMoney(mes.valor)}</span>
                    <em>{tipoLabel}</em>
                  </div>
                </div>
              </div>
              <span className="dashboard-previsao-mes-label">{mes.label}</span>
            </div>
          )
        })}
      </div>
      <p className="dashboard-previsao-legenda muted">
        Até o mês atual: receitas geradas · depois: cadastro (
        {formatMoney(valorMensal)}/mês)
      </p>
    </div>
  )
}

/** Mesma regra do card Voluntários no SQL do dashboard. */
function associadoEhVoluntario(opts: {
  data_nascimento: string | null
  categoria_id: number | null
  categoria_nome: string | null
}): boolean {
  const idade = idadeAnosMeses(opts.data_nascimento)
  if (idade != null && idade.anos > 22) return true
  if (opts.categoria_id != null && !categoriaEhBeneficiario(opts.categoria_nome)) {
    return true
  }
  return false
}

/** Limites de passagem em meses totais (igual ao SQL do dashboard). */
const PASSAGEM_LIMITES: Record<number, { mesesIni: number; mesesFim: number }> =
  {
    1: { mesesIni: 0, mesesFim: 126 },
    2: { mesesIni: 126, mesesFim: 174 },
    3: { mesesIni: 174, mesesFim: 210 },
    4: { mesesIni: 210, mesesFim: 258 },
  }

function idadeMesesTotais(isoDate: string | null | undefined): number | null {
  const idade = idadeAnosMeses(isoDate)
  if (!idade) return null
  return idade.anos * 12 + idade.meses
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

/** Com mais de uma seção, ordena por seção e depois por nome. */
function sortDetalhePorSecao(
  rows: DashboardDetalheRamo[],
): DashboardDetalheRamo[] {
  const secoes = new Set(
    rows
      .map((r) => (r.secao_nome ?? '').trim())
      .filter(Boolean),
  )
  return [...rows].sort((a, b) => {
    if (secoes.size > 1) {
      const sa = (a.secao_nome ?? '').trim() || '\uffff'
      const sb = (b.secao_nome ?? '').trim() || '\uffff'
      const bySecao = sa.localeCompare(sb, 'pt-BR')
      if (bySecao !== 0) return bySecao
    }
    return (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR')
  })
}

type ListaSecaoCard = {
  secao_id: number | null
  secao_nome: string
  total: number
}

function buildSecaoCards(rows: DashboardDetalheRamo[]): ListaSecaoCard[] {
  const map = new Map<string, ListaSecaoCard>()
  for (const row of rows) {
    const key = row.secao_id != null ? `s-${row.secao_id}` : 'none'
    const cur = map.get(key) ?? {
      secao_id: row.secao_id ?? null,
      secao_nome: row.secao_nome?.trim() || 'Sem seção',
      total: 0,
    }
    cur.total += 1
    map.set(key, cur)
  }
  return [...map.values()].sort((a, b) => {
    if (a.secao_id == null && b.secao_id != null) return 1
    if (a.secao_id != null && b.secao_id == null) return -1
    return a.secao_nome.localeCompare(b.secao_nome, 'pt-BR')
  })
}

export function DashboardPage() {
  const { empresa, profile, hasPermission } = useAuth()
  const toast = useToast()
  const empresaId = empresa?.id ?? profile?.empresa_id ?? undefined
  const associadoView = isAssociadoLogin(profile)
  const canOpenAssociado = hasPermission('associados.view')
  /** Login e-mail com ramo: dashboard só desse ramo. */
  const ramoFiltro = useMemo(() => {
    if (associadoView) return null
    const r = profile?.codigo_ramo
    return r != null && r >= 1 && r <= 5 ? r : null
  }, [associadoView, profile?.codigo_ramo])
  /** Com ramo + seção: filtra totais/passagens pelos dois. */
  const secaoFiltro = useMemo(() => {
    if (associadoView || ramoFiltro == null) return null
    const s = profile?.codigo_secao
    return s != null && s > 0 ? s : null
  }, [associadoView, ramoFiltro, profile?.codigo_secao])
  const [ramos, setRamos] = useState<DashboardRamo[]>([])
  const [passagens, setPassagens] = useState<DashboardPassagemRamo[]>([])
  const [aniversariantes, setAniversariantes] = useState<
    DashboardAniversariante[]
  >([])
  const [totalAtivos, setTotalAtivos] = useState(0)
  const [benefMensalidade, setBenefMensalidade] =
    useState<BeneficiarioMensalidadeStats>(BENEF_MENSALIDADE_VAZIO)
  const [tiposMensalidadeOpen, setTiposMensalidadeOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensagemAniversario, setMensagemAniversario] = useState<string | null>(
    null,
  )
  const [validadeRegistro, setValidadeRegistro] = useState<string | null>(null)

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
  const [listaAllRows, setListaAllRows] = useState<DashboardDetalheRamo[]>([])
  const [listaSecoes, setListaSecoes] = useState<ListaSecaoCard[] | null>(null)
  const [listaSecaoAtiva, setListaSecaoAtiva] = useState<ListaSecaoCard | null>(
    null,
  )
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
          const base =
            (anivers.data as DashboardAniversariante[]) ?? []
          const provMap = await mapRegistroProvisorio(
            base.map((a) => a.associado_id),
          )
          if (!mounted) return
          setAniversariantes(
            base.map((a) => ({
              ...a,
              registro_provisorio: provMap.get(a.associado_id) === true,
            })),
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
      if (secaoFiltro != null) {
        totalQuery = totalQuery.eq('secao', secaoFiltro)
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
        setBenefMensalidade(BENEF_MENSALIDADE_VAZIO)
      } else {
        const ramosAll = (contagem.data as DashboardRamo[]) ?? []
        const passagensAll = (passagem.data as DashboardPassagemRamo[]) ?? []
        setError(null)

        if (ramoFiltro != null && ramoFiltro >= 1 && ramoFiltro <= 4) {
          let assocQuery = supabase
            .from('associados')
            .select('associado_id, data_nascimento, categoria')
            .eq('empresa_id', empresaId!)
            .eq('ramo', ramoFiltro)
            .eq('ativo', true)
          if (secaoFiltro != null) {
            assocQuery = assocQuery.eq('secao', secaoFiltro)
          }

          const [{ data: assocRamo }, { data: categorias }] = await Promise.all([
            assocQuery,
            supabase.from('categoria').select('categoria_id, nome'),
          ])

          if (!mounted) return

          const catNomeById = new Map(
            ((categorias ?? []) as { categoria_id: number; nome: string }[]).map(
              (c) => [c.categoria_id, c.nome],
            ),
          )

          type AssocVol = {
            associado_id: number
            data_nascimento: string | null
            categoria: number | null
          }

          const assocList = (assocRamo as AssocVol[] | null) ?? []
          const beneficiariosCount = assocList.filter((a) => {
            const catNome =
              a.categoria != null
                ? (catNomeById.get(a.categoria) ?? null)
                : null
            return categoriaEhBeneficiario(catNome)
          }).length
          const voluntariosCount = assocList.filter((a) =>
            associadoEhVoluntario({
              data_nascimento: a.data_nascimento,
              categoria_id: a.categoria,
              categoria_nome:
                a.categoria != null
                  ? (catNomeById.get(a.categoria) ?? null)
                  : null,
            }),
          ).length

          const ramoCardBase = ramosAll.find((r) => r.ramo_id === ramoFiltro)
          const cards: DashboardRamo[] = []
          if (ramoCardBase) {
            cards.push({
              ...ramoCardBase,
              total:
                secaoFiltro != null
                  ? beneficiariosCount
                  : Number(ramoCardBase.total ?? beneficiariosCount),
            })
          }
          cards.push({
            ramo_id: 5,
            ramo_nome: 'VOLUNTÁRIOS',
            total: voluntariosCount,
          })
          setRamos(cards)

          // Passagens com seção: recalcula (saídas da seção; chegadas do ramo anterior).
          if (secaoFiltro != null) {
            const lim = PASSAGEM_LIMITES[ramoFiltro]
            const passagemBase = passagensAll.find(
              (p) => p.ramo_id === ramoFiltro,
            )
            if (lim && passagemBase) {
              const [saidaRes, chegadaRes] = await Promise.all([
                supabase
                  .from('associados')
                  .select('associado_id, data_nascimento, categoria')
                  .eq('empresa_id', empresaId!)
                  .eq('ramo', ramoFiltro)
                  .eq('secao', secaoFiltro)
                  .eq('ativo', true)
                  .not('data_nascimento', 'is', null),
                ramoFiltro > 1
                  ? supabase
                      .from('associados')
                      .select('associado_id, data_nascimento, categoria')
                      .eq('empresa_id', empresaId!)
                      .eq('ramo', ramoFiltro - 1)
                      .eq('ativo', true)
                      .not('data_nascimento', 'is', null)
                  : Promise.resolve({ data: [], error: null }),
              ])

              if (!mounted) return

              type AssocPass = {
                data_nascimento: string | null
                categoria: number | null
              }
              const isBenef = (a: AssocPass) =>
                categoriaEhBeneficiario(
                  a.categoria != null
                    ? (catNomeById.get(a.categoria) ?? null)
                    : null,
                )

              const saidas = ((saidaRes.data as AssocPass[] | null) ?? []).filter(
                (a) => {
                  const m = idadeMesesTotais(a.data_nascimento)
                  return isBenef(a) && m != null && m >= lim.mesesFim
                },
              ).length
              const chegadas = (
                (chegadaRes.data as AssocPass[] | null) ?? []
              ).filter((a) => {
                const m = idadeMesesTotais(a.data_nascimento)
                return isBenef(a) && m != null && m >= lim.mesesIni
              }).length

              setPassagens([
                {
                  ...passagemBase,
                  total_passagem: saidas + chegadas,
                },
              ])
            } else {
              setPassagens(
                passagensAll.filter((p) => p.ramo_id === ramoFiltro),
              )
            }
          } else {
            setPassagens(
              passagensAll.filter((p) => p.ramo_id === ramoFiltro),
            )
          }
        } else {
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
        }

        const aniversBase =
          (anivers.data as DashboardAniversariante[]) ?? []
        const aniversProv = await mapRegistroProvisorio(
          aniversBase.map((a) => a.associado_id),
        )
        if (!mounted) return
        setAniversariantes(
          aniversBase.map((a) => ({
            ...a,
            registro_provisorio: aniversProv.get(a.associado_id) === true,
          })),
        )
        setTotalAtivos(totalRes.count ?? 0)

        // Card de mensalidade dos beneficiários: só usuários do grupo (sem ramo).
        if (empresaId && ramoFiltro == null) {
          const [{ data: assocBenef, error: benefJoinError }, { data: catsBenef }] =
            await Promise.all([
              supabase
                .from('associados')
                .select(
                  `
              associado_id,
              categoria,
              isento,
              tipo_mensalidade,
              tipo_mensalidade_row:tipo_mensalidade!tipo_mensalidade (
                tipomensalidade_id,
                nome,
                valor
              )
            `,
                )
                .eq('empresa_id', empresaId)
                .eq('ativo', true),
              supabase.from('categoria').select('categoria_id, nome'),
            ])

          if (!mounted) return

          type AssocBenefRow = {
            categoria: number | null
            isento: boolean | null
            tipo_mensalidade: number | string | null
            tipo_mensalidade_row?: {
              tipomensalidade_id: number | string
              nome: string | null
              valor: number | string | null
            } | null
          }

          let rows: AssocBenefRow[] = (assocBenef as AssocBenefRow[] | null) ?? []
          const valorByTipo = new Map<number, number>()
          const nomeByTipo = new Map<number, string>()

          const aplicarTipos = (
            tipos: {
              tipomensalidade_id: number | string
              nome?: string | null
              valor: number | string | null
            }[],
          ) => {
            for (const t of tipos) {
              const id = Number(t.tipomensalidade_id)
              if (!Number.isFinite(id)) continue
              valorByTipo.set(id, parseValorMensalidade(t.valor))
              if (t.nome) nomeByTipo.set(id, String(t.nome))
            }
          }

          if (benefJoinError) {
            const [{ data: plainAssoc }, { data: tiposMensalidade }] =
              await Promise.all([
                supabase
                  .from('associados')
                  .select('associado_id, categoria, isento, tipo_mensalidade')
                  .eq('empresa_id', empresaId)
                  .eq('ativo', true),
                supabase
                  .from('tipo_mensalidade')
                  .select('tipomensalidade_id, nome, valor'),
              ])

            if (!mounted) return

            rows = (plainAssoc as AssocBenefRow[] | null) ?? []
            aplicarTipos(
              (tiposMensalidade ?? []) as {
                tipomensalidade_id: number | string
                nome?: string | null
                valor: number | string | null
              }[],
            )
          } else {
            for (const a of rows) {
              const row = a.tipo_mensalidade_row
              if (!row?.tipomensalidade_id) continue
              const id = Number(row.tipomensalidade_id)
              if (!Number.isFinite(id)) continue
              if (row.nome) nomeByTipo.set(id, String(row.nome))
              valorByTipo.set(id, parseValorMensalidade(row.valor))
            }

            const tipoIds = [
              ...new Set(
                rows
                  .map((a) =>
                    a.tipo_mensalidade != null && a.tipo_mensalidade !== ''
                      ? Number(a.tipo_mensalidade)
                      : NaN,
                  )
                  .filter((id) => Number.isFinite(id) && !valorByTipo.has(id)),
              ),
            ]
            if (tipoIds.length > 0) {
              const { data: tiposMensalidade } = await supabase
                .from('tipo_mensalidade')
                .select('tipomensalidade_id, nome, valor')
                .in('tipomensalidade_id', tipoIds)

              if (!mounted) return

              aplicarTipos(
                (tiposMensalidade ?? []) as {
                  tipomensalidade_id: number | string
                  nome?: string | null
                  valor: number | string | null
                }[],
              )
            }
          }

          const catMap = new Map(
            ((catsBenef ?? []) as { categoria_id: number; nome: string }[]).map(
              (c) => [Number(c.categoria_id), c.nome],
            ),
          )

          let pagantes = 0
          let isentos = 0
          let valorMensalidade = 0
          const porTipoMap = new Map<string, MensalidadeTipoDetalhe>()

          for (const a of rows) {
            const catNome =
              a.categoria != null
                ? (catMap.get(Number(a.categoria)) ?? null)
                : null
            if (!categoriaEhBeneficiario(catNome)) continue
            if (a.isento === true) {
              isentos += 1
              continue
            }
            pagantes += 1

            const tipoId =
              a.tipo_mensalidade_row?.tipomensalidade_id != null
                ? Number(a.tipo_mensalidade_row.tipomensalidade_id)
                : a.tipo_mensalidade != null && a.tipo_mensalidade !== ''
                  ? Number(a.tipo_mensalidade)
                  : null

            const valorUnit =
              tipoId != null && Number.isFinite(tipoId)
                ? (valorByTipo.get(tipoId) ??
                  parseValorMensalidade(a.tipo_mensalidade_row?.valor))
                : 0
            valorMensalidade += valorUnit

            const key =
              tipoId != null && Number.isFinite(tipoId)
                ? `t-${tipoId}`
                : 'sem-tipo'
            const atual = porTipoMap.get(key)
            if (atual) {
              atual.quantidade += 1
              atual.total = Number((atual.total + valorUnit).toFixed(2))
            } else {
              porTipoMap.set(key, {
                id: tipoId != null && Number.isFinite(tipoId) ? tipoId : null,
                nome:
                  tipoId != null && Number.isFinite(tipoId)
                    ? (nomeByTipo.get(tipoId) ??
                      a.tipo_mensalidade_row?.nome ??
                      `Tipo #${tipoId}`)
                    : 'Sem tipo de mensalidade',
                quantidade: 1,
                valorUnitario: valorUnit,
                total: Number(valorUnit.toFixed(2)),
              })
            }
          }

          const porTipo = [...porTipoMap.values()].sort((a, b) => {
            if (b.total !== a.total) return b.total - a.total
            return a.nome.localeCompare(b.nome, 'pt-BR')
          })

          const anoAtual = new Date().getFullYear()
          const { data: receitasMensalidade } = await supabase
            .from('receitas')
            .select('receita_valor, receita_competencia')
            .eq('empresa_id', empresaId)
            .eq('receita_origem', RECEITA_ORIGEM.MENSALIDADE)
            .gte('receita_competencia', `${anoAtual}-01-01`)
            .lte('receita_competencia', `${anoAtual}-12-31`)
            .limit(20000)
          if (!mounted) return

          const geradoPorMes = Array.from({ length: 12 }, () => 0)
          for (const r of (receitasMensalidade ?? []) as {
            receita_valor: number | string | null
            receita_competencia: string | null
          }[]) {
            const comp = r.receita_competencia?.slice(0, 10)
            if (!comp) continue
            const [y, m] = comp.split('-').map(Number)
            if (y !== anoAtual || !m || m < 1 || m > 12) continue
            geradoPorMes[m - 1] += parseValorMensalidade(r.receita_valor)
          }
          for (let i = 0; i < 12; i += 1) {
            geradoPorMes[i] = Number(geradoPorMes[i].toFixed(2))
          }

          setBenefMensalidade({
            total: pagantes + isentos,
            pagantes,
            isentos,
            valorMensalidade: Number(valorMensalidade.toFixed(2)),
            porTipo,
            geradoPorMes,
          })
        } else {
          setBenefMensalidade(BENEF_MENSALIDADE_VAZIO)
        }
      }
      setLoading(false)
    }

    void load()
    return () => {
      mounted = false
    }
  }, [empresaId, associadoView, ramoFiltro, secaoFiltro])

  // Login por registro: validade do registro + aniversário
  useEffect(() => {
    let mounted = true

    async function loadAssociadoTopo() {
      setMensagemAniversario(null)
      setValidadeRegistro(null)
      if (!associadoView || !profile?.registro || !empresaId) return

      const registroNum = Number(String(profile.registro).replace(/\D/g, ''))
      if (!Number.isFinite(registroNum) || registroNum <= 0) return

      const { data, error: queryError } = await supabase
        .from('associados')
        .select('nome, data_nascimento, validade_registro')
        .eq('empresa_id', empresaId)
        .eq('registro', registroNum)
        .maybeSingle()

      if (!mounted || queryError || !data) return

      setValidadeRegistro(
        data.validade_registro
          ? String(data.validade_registro).slice(0, 10)
          : null,
      )

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

    void loadAssociadoTopo()
    return () => {
      mounted = false
    }
  }, [associadoView, profile?.registro, profile?.nome, empresaId, toast])

  async function abrirListaRamo(item: DashboardRamo) {
    setListaRamo(item)
    setListaLoading(true)
    setListaError(null)
    setListaRows([])
    setListaAllRows([])
    setListaSecoes(null)
    setListaSecaoAtiva(null)

    function apresentarDetalhe(rows: DashboardDetalheRamo[]) {
      const sorted = sortDetalhePorSecao(rows)
      const cards = buildSecaoCards(sorted)
      // Já filtrado por seção do perfil, ou só uma seção → lista direta.
      if (secaoFiltro != null || cards.length <= 1) {
        setListaSecoes(null)
        setListaSecaoAtiva(null)
        setListaAllRows([])
        setListaRows(sorted)
      } else {
        setListaAllRows(sorted)
        setListaSecoes(cards)
        setListaSecaoAtiva(null)
        setListaRows([])
      }
      setListaLoading(false)
    }

    // Login com ramo 1-4: card Voluntários lista só voluntários daquele ramo/seção.
    if (item.ramo_id === 5 && ramoFiltro != null && ramoFiltro <= 4) {
      let assocQ = supabase
        .from('associados')
        .select(
          'associado_id, nome, registro, registro_provisorio, data_nascimento, categoria, secao',
        )
        .eq('empresa_id', empresaId!)
        .eq('ramo', ramoFiltro)
        .eq('ativo', true)
        .order('nome', { ascending: true })
      if (secaoFiltro != null) {
        assocQ = assocQ.eq('secao', secaoFiltro)
      }

      const [assocRes, catRes, secaoRes] = await Promise.all([
        assocQ,
        supabase.from('categoria').select('categoria_id, nome'),
        supabase
          .from('secao')
          .select('secao_id, nome')
          .eq('empresa_id', empresaId!),
      ])

      if (assocRes.error || catRes.error || secaoRes.error) {
        setListaError(
          assocRes.error?.message ??
            catRes.error?.message ??
            secaoRes.error?.message ??
            'Erro ao carregar voluntários',
        )
        setListaRows([])
        setListaLoading(false)
        return
      }

      const catNomeById = new Map(
        ((catRes.data ?? []) as { categoria_id: number; nome: string }[]).map(
          (c) => [c.categoria_id, c.nome],
        ),
      )
      const secaoNomeById = new Map(
        ((secaoRes.data ?? []) as { secao_id: number; nome: string }[]).map(
          (s) => [s.secao_id, s.nome],
        ),
      )

      type AssocRow = {
        associado_id: number
        nome: string
        registro: number | null
        registro_provisorio: boolean | null
        data_nascimento: string | null
        categoria: number | null
        secao: number | null
      }

      const rows = ((assocRes.data as AssocRow[] | null) ?? [])
        .filter((a) =>
          associadoEhVoluntario({
            data_nascimento: a.data_nascimento,
            categoria_id: a.categoria,
            categoria_nome:
              a.categoria != null ? (catNomeById.get(a.categoria) ?? null) : null,
          }),
        )
        .map((a): DashboardDetalheRamo => {
          const idade = idadeAnosMeses(a.data_nascimento)
          return {
            associado_id: a.associado_id,
            nome: a.nome,
            registro: a.registro,
            registro_provisorio: a.registro_provisorio === true,
            data_nascimento: a.data_nascimento,
            anos: idade?.anos ?? 0,
            meses: idade?.meses ?? 0,
            secao_id: a.secao,
            secao_nome:
              a.secao != null ? (secaoNomeById.get(a.secao) ?? null) : null,
          }
        })

      apresentarDetalhe(rows)
      return
    }

    // Beneficiários do ramo (+ seção, se houver no perfil).
    if (
      item.ramo_id >= 1 &&
      item.ramo_id <= 4 &&
      (secaoFiltro != null || (ramoFiltro != null && ramoFiltro === item.ramo_id))
    ) {
      let assocQ = supabase
        .from('associados')
        .select(
          'associado_id, nome, registro, registro_provisorio, data_nascimento, categoria, secao',
        )
        .eq('empresa_id', empresaId!)
        .eq('ramo', item.ramo_id)
        .eq('ativo', true)
        .order('nome', { ascending: true })
      if (secaoFiltro != null && ramoFiltro === item.ramo_id) {
        assocQ = assocQ.eq('secao', secaoFiltro)
      }

      const [assocRes, catRes, secaoRes] = await Promise.all([
        assocQ,
        supabase.from('categoria').select('categoria_id, nome'),
        supabase
          .from('secao')
          .select('secao_id, nome')
          .eq('empresa_id', empresaId!),
      ])

      if (assocRes.error || catRes.error || secaoRes.error) {
        setListaError(
          assocRes.error?.message ??
            catRes.error?.message ??
            secaoRes.error?.message ??
            'Erro ao carregar associados',
        )
        setListaRows([])
        setListaLoading(false)
        return
      }

      const catNomeById = new Map(
        ((catRes.data ?? []) as { categoria_id: number; nome: string }[]).map(
          (c) => [c.categoria_id, c.nome],
        ),
      )
      const secaoNomeById = new Map(
        ((secaoRes.data ?? []) as { secao_id: number; nome: string }[]).map(
          (s) => [s.secao_id, s.nome],
        ),
      )

      type AssocRow = {
        associado_id: number
        nome: string
        registro: number | null
        registro_provisorio: boolean | null
        data_nascimento: string | null
        categoria: number | null
        secao: number | null
      }

      const rows = ((assocRes.data as AssocRow[] | null) ?? [])
        .filter((a) =>
          categoriaEhBeneficiario(
            a.categoria != null
              ? (catNomeById.get(a.categoria) ?? null)
              : null,
          ),
        )
        .map((a): DashboardDetalheRamo => {
          const idade = idadeAnosMeses(a.data_nascimento)
          return {
            associado_id: a.associado_id,
            nome: a.nome,
            registro: a.registro,
            registro_provisorio: a.registro_provisorio === true,
            data_nascimento: a.data_nascimento,
            anos: idade?.anos ?? 0,
            meses: idade?.meses ?? 0,
            secao_id: a.secao,
            secao_nome:
              a.secao != null ? (secaoNomeById.get(a.secao) ?? null) : null,
          }
        })

      apresentarDetalhe(rows)
      return
    }

    const { data, error: rpcError } = await supabase.rpc(
      'dashboard_detalhe_ramo',
      { p_ramo: item.ramo_id },
    )

    if (rpcError) {
      setListaError(rpcError.message)
      setListaRows([])
      setListaLoading(false)
      return
    }

    const rpcRows = (data as DashboardDetalheRamo[]) ?? []
    const provMap = await mapRegistroProvisorio(
      rpcRows.map((r) => r.associado_id),
    )
    apresentarDetalhe(
      rpcRows.map((r) => ({
        ...r,
        registro_provisorio: provMap.get(r.associado_id) === true,
      })),
    )
  }

  function abrirListaSecao(card: ListaSecaoCard) {
    setListaSecaoAtiva(card)
    setListaRows(
      listaAllRows.filter((row) =>
        card.secao_id == null
          ? row.secao_id == null
          : row.secao_id === card.secao_id,
      ),
    )
  }

  function voltarListaSecoes() {
    setListaSecaoAtiva(null)
    setListaRows([])
  }

  function fecharListaRamo() {
    setListaRamo(null)
    setListaRows([])
    setListaAllRows([])
    setListaSecoes(null)
    setListaSecaoAtiva(null)
    setListaError(null)
  }

  async function abrirPassagem(item: DashboardPassagemRamo) {
    setDetalheRamo(item)
    setDetalheLoading(true)
    setDetalheError(null)
    setDetalheRows([])

    const lim = PASSAGEM_LIMITES[item.ramo_id]
    if (secaoFiltro != null && lim && item.ramo_id === ramoFiltro) {
      const [catRes, saidaRes, chegadaRes] = await Promise.all([
        supabase.from('categoria').select('categoria_id, nome'),
        supabase
          .from('associados')
          .select(
            'associado_id, nome, data_nascimento, categoria, registro_provisorio',
          )
          .eq('empresa_id', empresaId!)
          .eq('ramo', item.ramo_id)
          .eq('secao', secaoFiltro)
          .eq('ativo', true)
          .not('data_nascimento', 'is', null)
          .order('nome', { ascending: true }),
        item.ramo_id > 1
          ? supabase
              .from('associados')
              .select(
                'associado_id, nome, data_nascimento, categoria, registro_provisorio',
              )
              .eq('empresa_id', empresaId!)
              .eq('ramo', item.ramo_id - 1)
              .eq('ativo', true)
              .not('data_nascimento', 'is', null)
              .order('nome', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
      ])

      if (saidaRes.error || chegadaRes.error || catRes.error) {
        setDetalheError(
          saidaRes.error?.message ??
            chegadaRes.error?.message ??
            catRes.error?.message ??
            'Erro ao carregar passagens',
        )
        setDetalheRows([])
        setDetalheLoading(false)
        return
      }

      const catNomeById = new Map(
        ((catRes.data ?? []) as { categoria_id: number; nome: string }[]).map(
          (c) => [c.categoria_id, c.nome],
        ),
      )

      type AssocPass = {
        associado_id: number
        nome: string
        data_nascimento: string | null
        categoria: number | null
        registro_provisorio: boolean | null
      }

      const toRow = (
        a: AssocPass,
        tipo: 'chegada' | 'saida',
      ): DashboardDetalhePassagem | null => {
        if (
          !categoriaEhBeneficiario(
            a.categoria != null
              ? (catNomeById.get(a.categoria) ?? null)
              : null,
          )
        ) {
          return null
        }
        const mesesTotais = idadeMesesTotais(a.data_nascimento)
        if (mesesTotais == null) return null
        if (tipo === 'saida' && mesesTotais < lim.mesesFim) return null
        if (tipo === 'chegada' && mesesTotais < lim.mesesIni) return null
        const idade = idadeAnosMeses(a.data_nascimento)
        return {
          tipo,
          associado_id: a.associado_id,
          nome: a.nome,
          data_nascimento: a.data_nascimento,
          anos: idade?.anos ?? 0,
          meses: idade?.meses ?? 0,
          registro_provisorio: a.registro_provisorio === true,
        }
      }

      const rows: DashboardDetalhePassagem[] = []
      for (const a of (chegadaRes.data as AssocPass[] | null) ?? []) {
        const row = toRow(a, 'chegada')
        if (row) rows.push(row)
      }
      for (const a of (saidaRes.data as AssocPass[] | null) ?? []) {
        const row = toRow(a, 'saida')
        if (row) rows.push(row)
      }
      setDetalheRows(rows)
      setDetalheLoading(false)
      return
    }

    const { data, error: rpcError } = await supabase.rpc(
      'dashboard_detalhe_passagem',
      { p_ramo: item.ramo_id },
    )

    if (rpcError) {
      setDetalheError(rpcError.message)
      setDetalheRows([])
    } else {
      const rpcPass = (data as DashboardDetalhePassagem[]) ?? []
      const passProv = await mapRegistroProvisorio(
        rpcPass.map((r) => r.associado_id),
      )
      setDetalheRows(
        rpcPass.map((r) => ({
          ...r,
          registro_provisorio: passProv.get(r.associado_id) === true,
        })),
      )
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

  const validadeStatus = useMemo(
    () => statusValidadeRegistro(validadeRegistro),
    [validadeRegistro],
  )

  const benefDonutSlices = useMemo(
    () =>
      buildBenefDonutSlices(
        benefMensalidade.porTipo,
        benefMensalidade.isentos,
      ),
    [benefMensalidade.porTipo, benefMensalidade.isentos],
  )

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
        {associadoView ? (
          <section
            className={`associado-validade-registro is-${validadeStatus.tone}`}
            aria-live="polite"
          >
            <div>
              <span>Validade do registro</span>
              <strong>
                {validadeRegistro
                  ? formatDate(validadeRegistro)
                  : 'Não informada'}
              </strong>
            </div>
            <span className="associado-validade-badge">
              {validadeStatus.label}
            </span>
          </section>
        ) : null}
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
            {secaoFiltro != null
              ? 'Total ativos do ramo/seção'
              : ramoFiltro != null
                ? 'Total ativos do ramo'
                : 'Total ativos'}
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

      {!associadoView && ramoFiltro == null ? (
        <section className="panel dashboard-benef-panel">
          <div className="passagem-header">
            <div>
              <h3>Beneficiários — mensalidade</h3>
              <p className="muted">
                Ativos do grupo · tipos de mensalidade e isentos
              </p>
            </div>
            <span className="badge">
              {loading ? '…' : `${benefMensalidade.total} beneficiários`}
            </span>
          </div>

          {loading ? (
            <div className="loading">Carregando…</div>
          ) : benefMensalidade.total === 0 ? (
            <div className="empty">Nenhum beneficiário ativo neste filtro.</div>
          ) : (
            <div className="dashboard-benef-charts">
              <div className="dashboard-benef-chart">
                <BeneficiariosDonut
                  porTipo={benefMensalidade.porTipo}
                  isentos={benefMensalidade.isentos}
                />
                <ul className="dashboard-benef-legend">
                  {benefDonutSlices.map((slice) => {
                    const pct =
                      benefMensalidade.total > 0
                        ? Math.round(
                            (slice.value / benefMensalidade.total) * 100,
                          )
                        : 0
                    return (
                      <li key={slice.key}>
                        <span
                          className="dashboard-benef-swatch"
                          style={{ background: slice.color }}
                        />
                        <div>
                          <strong>{slice.label}</strong>
                          <p>
                            {slice.value} · {pct}%
                          </p>
                        </div>
                      </li>
                    )
                  })}
                  <li className="dashboard-benef-legend-total">
                    <div>
                      <button
                        type="button"
                        className="dashboard-benef-valor-btn"
                        onClick={() => setTiposMensalidadeOpen(true)}
                        disabled={benefMensalidade.pagantes === 0}
                      >
                        Total mensalidade:{' '}
                        {formatMoney(benefMensalidade.valorMensalidade)}
                        <span>
                          {benefMensalidade.pagantes} pagantes · Ver detalhe
                        </span>
                      </button>
                      {benefMensalidade.pagantes > 0 &&
                      benefMensalidade.valorMensalidade <= 0 ? (
                        <p className="dashboard-benef-valor-hint muted">
                          Confira se o associado tem tipo de mensalidade e se o
                          valor está preenchido em Cadastros → Tipo de
                          Mensalidade.
                        </p>
                      ) : null}
                    </div>
                  </li>
                </ul>
              </div>

              <div className="dashboard-previsao-panel">
                <h4>Previsão de mensalidades</h4>
                <p className="muted">
                  Até o mês atual: mensalidades geradas nas receitas. Depois:
                  projeção pelo valor do cadastro.
                </p>
                <PrevisaoMensalidadeChart
                  valorMensal={benefMensalidade.valorMensalidade}
                  geradoPorMes={benefMensalidade.geradoPorMes}
                />
              </div>
            </div>
          )}
        </section>
      ) : null}

      {!associadoView && empresaId ? (
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
          codigoSecao={profile?.codigo_secao ?? null}
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
                      <td>
                        {row.nome}{' '}
                        <RegistroProvisorioBadge
                          provisorio={row.registro_provisorio}
                        />
                      </td>
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

      {tiposMensalidadeOpen ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={() => setTiposMensalidadeOpen(false)}
        >
          <div
            className="passagem-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tipos-mensalidade-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="passagem-dialog-header">
              <div>
                <h3 id="tipos-mensalidade-title">Mensalidade por tipo</h3>
                <p className="muted">
                  Beneficiários que pagam · total{' '}
                  {formatMoney(benefMensalidade.valorMensalidade)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => setTiposMensalidadeOpen(false)}
              >
                Fechar
              </button>
            </header>

            {benefMensalidade.porTipo.length === 0 ? (
              <div className="empty">Nenhum tipo de mensalidade encontrado.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Jovens</th>
                      <th>Valor unitário</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {benefMensalidade.porTipo.map((item) => (
                      <tr key={item.id ?? `sem-${item.nome}`}>
                        <td>{item.nome}</td>
                        <td>{item.quantidade}</td>
                        <td>{formatMoney(item.valorUnitario)}</td>
                        <td>{formatMoney(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>
                        <strong>Total</strong>
                      </td>
                      <td>
                        <strong>{benefMensalidade.pagantes}</strong>
                      </td>
                      <td />
                      <td>
                        <strong>
                          {formatMoney(benefMensalidade.valorMensalidade)}
                        </strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
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
                  {listaRamo.ramo_nome}
                  {listaSecaoAtiva ? (
                    <>
                      {' · '}
                      {listaSecaoAtiva.secao_nome}{' '}
                      <span className="muted">({listaRows.length})</span>
                    </>
                  ) : listaSecoes && listaSecoes.length > 1 ? (
                    <>
                      {' '}
                      <span className="muted">
                        (
                        {listaAllRows.length ||
                          listaSecoes.reduce((s, c) => s + c.total, 0)}
                        )
                      </span>
                    </>
                  ) : (
                    <>
                      {' '}
                      <span className="muted">({listaRows.length})</span>
                    </>
                  )}
                </h3>
                <p className="muted">
                  {listaSecoes && !listaSecaoAtiva
                    ? 'Escolha a seção para ver os associados'
                    : listaRamo.ramo_id === 5
                      ? ramoFiltro != null && ramoFiltro <= 4
                        ? secaoFiltro != null || listaSecaoAtiva
                          ? 'Voluntários ativos deste ramo/seção'
                          : 'Voluntários ativos deste ramo'
                        : listaSecaoAtiva
                          ? 'Voluntários ativos desta seção'
                          : 'Voluntários ativos do grupo'
                      : secaoFiltro != null || listaSecaoAtiva
                        ? 'Beneficiários ativos deste ramo/seção'
                        : 'Beneficiários ativos deste ramo'}
                </p>
              </div>
              <div className="actions-pair">
                {listaSecoes && listaSecaoAtiva ? (
                  <button
                    type="button"
                    className="btn btn-soft"
                    onClick={voltarListaSecoes}
                  >
                    Voltar
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-soft"
                  onClick={fecharListaRamo}
                >
                  Fechar
                </button>
              </div>
            </header>

            {listaError ? (
              <AlertMessage tone="error" title="Não foi possível carregar">
                {listaError}
              </AlertMessage>
            ) : null}

            {listaLoading ? (
              <div className="loading">Carregando associados…</div>
            ) : listaSecoes && !listaSecaoAtiva ? (
              <div className="stats-grid dashboard-secao-cards">
                {listaSecoes.map((card, index) => (
                  <article
                    key={
                      card.secao_id != null ? `s-${card.secao_id}` : 's-none'
                    }
                    className={`stat-card ${ramoCardClass(listaRamo.ramo_id, listaRamo.ramo_nome)}`}
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <span>{card.secao_nome}</span>
                    <div className="stat-card-row">
                      <strong>{card.total}</strong>
                      <button
                        type="button"
                        className="btn btn-soft stat-card-ver"
                        onClick={() => abrirListaSecao(card)}
                      >
                        Ver
                      </button>
                    </div>
                  </article>
                ))}
              </div>
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
                      {!listaSecaoAtiva ? <th>Seção</th> : null}
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
                        <td>
                          {row.nome}{' '}
                          <RegistroProvisorioBadge
                            provisorio={row.registro_provisorio}
                          />
                        </td>
                        {!listaSecaoAtiva ? (
                          <td>{row.secao_nome || '—'}</td>
                        ) : null}
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
                              <td>
                                {row.nome}{' '}
                                <RegistroProvisorioBadge
                                  provisorio={row.registro_provisorio}
                                />
                              </td>
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
                              <td>
                                {row.nome}{' '}
                                <RegistroProvisorioBadge
                                  provisorio={row.registro_provisorio}
                                />
                              </td>
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
