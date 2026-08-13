import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { isAssociadoLogin, isGrupoAdmin, staffRamoScope } from '@/lib/roles'
import {
  filtroAtividadesRamoOuGrupo,
  type AssociadoAtividadeCtx,
} from '@/lib/atividadeVisibilidade'
import type { Atividade, Ramo } from '@/types/database'

type SecaoOpt = { secao_id: number; nome: string; ramo: number | null }

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function parseDateKey(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
}

function atividadeDataKey(a: Atividade): string | null {
  if (a.data_atividade) return a.data_atividade.slice(0, 10)
  if (a.created_at) return a.created_at.slice(0, 10)
  return null
}

export function CalendarioGrupoPage() {
  const { empresa, profile, isSuperAdmin } = useAuth()
  const empresaId = empresa?.id
  const associadoLogin = isAssociadoLogin(profile)
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const canChangeScope = isSuperAdmin || isGrupoAdmin(profile?.role)

  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [filtroRamo, setFiltroRamo] = useState(
    ramoScoped != null ? String(ramoScoped) : '',
  )
  const [filtroSecao, setFiltroSecao] = useState('')
  const [scopeReady, setScopeReady] = useState(false)
  const [selectedDay, setSelectedDay] = useState(toDateKey(today))

  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<SecaoOpt[]>([])
  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const ramoMap = useMemo(
    () => new Map(ramos.map((r) => [r.ramo_id, r.nome])),
    [ramos],
  )
  const secaoMap = useMemo(
    () => new Map(secoes.map((s) => [s.secao_id, s.nome])),
    [secoes],
  )

  const secoesDoFiltro = useMemo(() => {
    if (!filtroRamo) return secoes
    const r = Number(filtroRamo)
    return secoes.filter((s) => s.ramo === r)
  }, [secoes, filtroRamo])

  useEffect(() => {
    let mounted = true

    void (async () => {
      if (!empresaId || !profile) {
        if (mounted) setScopeReady(true)
        return
      }

      let ramo: number | null = profile.codigo_ramo ?? ramoScoped
      let secao: number | null = profile.codigo_secao ?? null

      if (associadoLogin && profile.registro) {
        const registroNum = Number(String(profile.registro).replace(/\D/g, ''))
        if (Number.isFinite(registroNum) && registroNum > 0) {
          const { data } = await supabase
            .from('associados')
            .select('ramo, secao')
            .eq('empresa_id', empresaId)
            .eq('registro', registroNum)
            .maybeSingle()
          if (data) {
            ramo = (data.ramo as number | null) ?? ramo
            secao = (data.secao as number | null) ?? secao
          }
        }
      }

      if (!mounted) return
      if (ramo != null) setFiltroRamo(String(ramo))
      if (secao != null) setFiltroSecao(String(secao))
      setScopeReady(true)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, profile, associadoLogin, ramoScoped])

  useEffect(() => {
    if (!empresaId) return
    void Promise.all([
      supabase
        .from('ramos')
        .select('ramo_id, nome, idade_inicio, idade_fim')
        .order('ramo_id'),
      supabase
        .from('secao')
        .select('secao_id, nome, ramo')
        .eq('empresa_id', empresaId)
        .order('nome'),
    ]).then(([r, s]) => {
      setRamos((r.data as Ramo[]) ?? [])
      setSecoes(
        ((s.data as SecaoOpt[]) ?? []).map((row) => ({
          secao_id: row.secao_id,
          nome: row.nome,
          ramo: row.ramo ?? null,
        })),
      )
    })
  }, [empresaId])

  useEffect(() => {
    if (!empresaId || !scopeReady) {
      if (!empresaId) {
        setAtividades([])
        setLoading(false)
      }
      return
    }

    let mounted = true
    const rangeStart = new Date(year, month, 1)
    const rangeEnd = new Date(year, month + 1, 0)
    const from = toDateKey(new Date(year, month, 1 - rangeStart.getDay()))
    const to = toDateKey(new Date(year, month + 1, 6 - rangeEnd.getDay()))

    void (async () => {
      setLoading(true)

      let assocCtx: AssociadoAtividadeCtx | null = null
      if (associadoLogin && profile?.registro) {
        const registroNum = Number(String(profile.registro).replace(/\D/g, ''))
        if (Number.isFinite(registroNum) && registroNum > 0) {
          const { data: assoc } = await supabase
            .from('associados')
            .select('ramo, secao, patrulha_matilha')
            .eq('empresa_id', empresaId)
            .eq('registro', registroNum)
            .maybeSingle()
          if (assoc) {
            assocCtx = {
              ramo: (assoc.ramo as number | null) ?? null,
              secao: (assoc.secao as number | null) ?? null,
              patrulha_matilha:
                (assoc.patrulha_matilha as number | null) ?? null,
            }
          }
        }
      }

      let query = supabase
        .from('atividades')
        .select(
          'atividade_id, empresa_id, ramo, secao, patrulha_matilha, descricao, local, valor, data_atividade, created_at',
        )
        .eq('empresa_id', empresaId)
        .order('data_atividade', { ascending: true })

      const ramoFiltro =
        filtroRamo !== ''
          ? Number(filtroRamo)
          : assocCtx?.ramo != null
            ? assocCtx.ramo
            : ramoScoped

      if (ramoFiltro != null) {
        query = query.or(filtroAtividadesRamoOuGrupo(ramoFiltro))
      }

      const { data, error: loadError } = await query
      if (!mounted) return

      if (loadError) {
        setError(loadError.message)
        setAtividades([])
      } else {
        setError(null)
        const secaoFiltro = filtroSecao !== '' ? Number(filtroSecao) : null
        const rows = ((data as Atividade[]) ?? []).filter((a) => {
          const key = atividadeDataKey(a)
          if (!key || key < from || key > to) return false
          if (
            secaoFiltro != null &&
            a.secao != null &&
            a.secao !== secaoFiltro
          ) {
            return false
          }
          return true
        })
        setAtividades(rows)
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [
    empresaId,
    year,
    month,
    filtroRamo,
    filtroSecao,
    scopeReady,
    associadoLogin,
    profile?.registro,
    ramoScoped,
  ])

  const cells = useMemo(() => {
    const first = new Date(year, month, 1)
    const start = new Date(year, month, 1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const key = toDateKey(d)
      return {
        key,
        date: d,
        inMonth: d.getMonth() === month,
        isToday: key === toDateKey(today),
        items: atividades.filter((a) => atividadeDataKey(a) === key),
      }
    })
  }, [year, month, atividades, today])

  const dayItems = useMemo(
    () => atividades.filter((a) => atividadeDataKey(a) === selectedDay),
    [atividades, selectedDay],
  )

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
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
          <h2>Calendário</h2>
          <p>
            Datas das atividades de <strong>{empresa?.nome}</strong> por ramo e
            seção
          </p>
        </div>
      </header>

      <section className="panel">
        {error ? (
          <AlertMessage tone="error" title="Erro">
            {error}
          </AlertMessage>
        ) : null}

        <div className="toolbar calendario-filtros">
          <select
            className="select"
            value={filtroRamo}
            disabled={!canChangeScope || ramoScoped != null}
            onChange={(e) => {
              setFiltroRamo(e.target.value)
              setFiltroSecao('')
            }}
          >
            <option value="">Todos os ramos (+ grupo)</option>
            {ramos.map((r) => (
              <option key={r.ramo_id} value={r.ramo_id}>
                {r.nome}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filtroSecao}
            disabled={!canChangeScope || !filtroRamo}
            onChange={(e) => setFiltroSecao(e.target.value)}
          >
            <option value="">
              {filtroRamo ? 'Todas as seções (+ ramo/grupo)' : 'Selecione um ramo'}
            </option>
            {secoesDoFiltro.map((s) => (
              <option key={s.secao_id} value={s.secao_id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="calendario-toolbar">
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => shiftMonth(-1)}
          >
            ←
          </button>
          <strong className="calendario-mes">{monthLabel(year, month)}</strong>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => shiftMonth(1)}
          >
            →
          </button>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              setYear(today.getFullYear())
              setMonth(today.getMonth())
              setSelectedDay(toDateKey(today))
            }}
          >
            Hoje
          </button>
        </div>

        {loading ? (
          <div className="loading">Carregando calendário…</div>
        ) : (
          <div className="calendario-layout">
            <div className="calendario-grid" role="grid" aria-label="Calendário">
              {WEEKDAYS.map((d) => (
                <div key={d} className="calendario-weekday">
                  {d}
                </div>
              ))}
              {cells.map((cell) => (
                <button
                  key={cell.key}
                  type="button"
                  className={`calendario-day${cell.inMonth ? '' : ' is-out'}${
                    cell.isToday ? ' is-today' : ''
                  }${cell.key === selectedDay ? ' is-selected' : ''}`}
                  onClick={() => setSelectedDay(cell.key)}
                >
                  <span className="calendario-day-num">{cell.date.getDate()}</span>
                  <span className="calendario-day-events">
                    {cell.items.slice(0, 3).map((a) => (
                      <span
                        key={a.atividade_id}
                        className="calendario-pill"
                        title={a.descricao}
                      >
                        {a.descricao}
                      </span>
                    ))}
                    {cell.items.length > 3 ? (
                      <span className="calendario-more">
                        +{cell.items.length - 3}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>

            <aside className="calendario-day-panel">
              <div className="calendario-day-panel-head">
                <div>
                  <h3>
                    {parseDateKey(selectedDay).toLocaleDateString('pt-BR', {
                      weekday: 'long',
                      day: '2-digit',
                      month: 'long',
                    })}
                  </h3>
                  <p className="muted">{dayItems.length} atividade(s)</p>
                </div>
              </div>

              {dayItems.length === 0 ? (
                <p className="muted">Nenhuma atividade nesta data.</p>
              ) : (
                <ul className="calendario-lista">
                  {dayItems.map((a) => (
                    <li key={a.atividade_id}>
                      <Link
                        className="calendario-lista-item"
                        to={
                          associadoLogin
                            ? `/atividades/${a.atividade_id}/contas`
                            : `/atividades/${a.atividade_id}`
                        }
                      >
                        <strong>{a.descricao}</strong>
                        <span>
                          {[
                            a.local,
                            a.ramo != null
                              ? ramoMap.get(a.ramo) || `Ramo ${a.ramo}`
                              : 'Grupo',
                            a.secao != null
                              ? secaoMap.get(a.secao) || `Seção ${a.secao}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        )}
      </section>
    </>
  )
}
