import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { AddIcon } from '@/components/AddIcon'
import { isAssociadoLogin, staffRamoScope } from '@/lib/roles'
import type { CalendarioGrupoEvento, Ramo } from '@/types/database'

type SecaoOpt = { secao_id: number; nome: string; ramo: number | null }

type EventoForm = {
  id: number | null
  titulo: string
  descricao: string
  local: string
  ramo: string
  secao: string
  data_inicio: string
}

type MesAgenda = {
  year: number
  month: number
  label: string
  dias: string[]
  celulas: Map<string, CalendarioGrupoEvento[]>
}

type ColunaRamo = {
  key: string
  ramoId: number | null
  nome: string
  tone: 'lobinho' | 'escoteiro' | 'senior' | 'pioneiro' | 'grupo' | 'outro'
}

const emptyForm = (data = ''): EventoForm => ({
  id: null,
  titulo: '',
  descricao: '',
  local: '',
  ramo: '',
  secao: '',
  data_inicio: data,
})

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

function dayLabelCurto(dayKey: string) {
  const d = parseDateKey(dayKey)
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'short' })
  const dia = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  return { semana, dia }
}

function ramoKeyOf(ev: CalendarioGrupoEvento) {
  return ev.ramo != null ? `r:${ev.ramo}` : 'grupo'
}

function normalizeRamoNome(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

function isDiretoriaRamo(nome: string, ramoId: number | null) {
  if (ramoId === 5) return true
  return normalizeRamoNome(nome).includes('DIRETORIA')
}

function ramoColTone(
  nome: string,
  ramoId: number | null,
): ColunaRamo['tone'] {
  if (ramoId == null) return 'grupo'
  const n = normalizeRamoNome(nome)
  if (n.includes('LOBINHO')) return 'lobinho'
  if (n.includes('ESCOTEIRO')) return 'escoteiro'
  if (n.includes('SENIOR')) return 'senior'
  if (n.includes('PIONEIRO')) return 'pioneiro'
  return 'outro'
}

function buildMesAgenda(
  eventos: CalendarioGrupoEvento[],
  year: number,
  month: number,
): MesAgenda {
  const monthStart = toDateKey(new Date(year, month, 1))
  const monthEnd = toDateKey(new Date(year, month + 1, 0))
  const byCell = new Map<string, CalendarioGrupoEvento[]>()
  const days = new Set<string>()

  for (const ev of eventos) {
    const start = ev.data_inicio < monthStart ? monthStart : ev.data_inicio
    const endRaw = ev.data_fim || ev.data_inicio
    const end = endRaw > monthEnd ? monthEnd : endRaw
    if (start > monthEnd || end < monthStart) continue

    const colKey = ramoKeyOf(ev)
    let cursor = parseDateKey(start)
    const last = parseDateKey(end)
    while (cursor <= last) {
      const dayKey = toDateKey(cursor)
      if (dayKey >= monthStart && dayKey <= monthEnd) {
        days.add(dayKey)
        const cellKey = `${dayKey}|${colKey}`
        const list = byCell.get(cellKey) ?? []
        if (!list.some((item) => item.id === ev.id)) list.push(ev)
        byCell.set(cellKey, list)
      }
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 1,
      )
    }
  }

  for (const [key, list] of byCell) {
    byCell.set(
      key,
      list.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR')),
    )
  }

  return {
    year,
    month,
    label: monthLabel(year, month),
    dias: [...days].sort((a, b) => a.localeCompare(b)),
    celulas: byCell,
  }
}

export function CalendarioGrupoPage() {
  const { empresa, profile } = useAuth()
  const toast = useToast()
  /** Login por e-mail (equipe): pode informar eventos. Associado só visualiza. */
  const canWrite = !isAssociadoLogin(profile)
  const empresaId = empresa?.id
  const ramoScoped = staffRamoScope(profile)

  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [todosMeses, setTodosMeses] = useState(false)
  const [filtroRamo, setFiltroRamo] = useState(
    ramoScoped != null ? String(ramoScoped) : '',
  )
  const [filtroSecao, setFiltroSecao] = useState('')

  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<SecaoOpt[]>([])
  const [eventos, setEventos] = useState<CalendarioGrupoEvento[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<EventoForm>(emptyForm(toDateKey(today)))
  const overlayMouseDownRef = useRef(false)

  function onOverlayMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    overlayMouseDownRef.current = e.target === e.currentTarget
  }

  function onOverlayClick(e: ReactMouseEvent<HTMLDivElement>) {
    if (
      overlayMouseDownRef.current &&
      e.target === e.currentTarget &&
      !saving
    ) {
      setFormOpen(false)
    }
    overlayMouseDownRef.current = false
  }

  const secaoMap = useMemo(
    () => new Map(secoes.map((s) => [s.secao_id, s.nome])),
    [secoes],
  )

  const secoesDoFiltro = useMemo(() => {
    if (!filtroRamo) return secoes
    const r = Number(filtroRamo)
    return secoes.filter((s) => s.ramo === r)
  }, [secoes, filtroRamo])

  const secoesDoForm = useMemo(() => {
    if (!form.ramo) return []
    const r = Number(form.ramo)
    return secoes.filter((s) => s.ramo === r)
  }, [secoes, form.ramo])

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
    if (!empresaId) {
      setEventos([])
      setLoading(false)
      return
    }

    let mounted = true
    const from = todosMeses
      ? toDateKey(new Date(year, 0, 1))
      : toDateKey(new Date(year, month, 1))
    const to = todosMeses
      ? toDateKey(new Date(year, 11, 31))
      : toDateKey(new Date(year, month + 1, 0))

    void (async () => {
      setLoading(true)
      let qy = supabase
        .from('calendario_grupo')
        .select(
          'id, empresa_id, ramo, secao, titulo, descricao, local, data_inicio, data_fim, hora_inicio, hora_fim, created_at, updated_at',
        )
        .eq('empresa_id', empresaId)
        .lte('data_inicio', to)
        .or(`data_fim.is.null,data_fim.gte.${from}`)

      if (filtroRamo) {
        qy = qy.or(`ramo.is.null,ramo.eq.${Number(filtroRamo)}`)
      } else if (ramoScoped != null) {
        qy = qy.or(`ramo.is.null,ramo.eq.${ramoScoped}`)
      }
      if (filtroSecao) {
        qy = qy.or(`secao.is.null,secao.eq.${Number(filtroSecao)}`)
      }

      const { data, error: loadError } = await qy.order('data_inicio')
      if (!mounted) return
      if (loadError) {
        setError(loadError.message)
        setEventos([])
      } else {
        setError(null)
        setEventos((data as CalendarioGrupoEvento[]) ?? [])
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, year, month, todosMeses, filtroRamo, filtroSecao, ramoScoped])

  const colunasRamos = useMemo((): ColunaRamo[] => {
    const cols: ColunaRamo[] = []
    const scopedId =
      filtroRamo !== ''
        ? Number(filtroRamo)
        : ramoScoped != null
          ? ramoScoped
          : null

    for (const r of ramos) {
      if (isDiretoriaRamo(r.nome, r.ramo_id)) continue
      if (scopedId != null && r.ramo_id !== scopedId) continue
      cols.push({
        key: `r:${r.ramo_id}`,
        ramoId: r.ramo_id,
        nome: r.nome,
        tone: ramoColTone(r.nome, r.ramo_id),
      })
    }

    // Sempre mostra GRUPO (exceto quando o filtro força um ramo específico).
    if (scopedId == null) {
      cols.push({
        key: 'grupo',
        ramoId: null,
        nome: 'GRUPO',
        tone: 'grupo',
      })
    }

    return cols
  }, [ramos, filtroRamo, ramoScoped])

  const mesesAgenda = useMemo((): MesAgenda[] => {
    if (todosMeses) {
      return Array.from({ length: 12 }, (_, m) =>
        buildMesAgenda(eventos, year, m),
      )
    }
    return [buildMesAgenda(eventos, year, month)]
  }, [eventos, year, month, todosMeses])

  function shiftPeriod(delta: number) {
    if (todosMeses) {
      setYear((y) => y + delta)
      return
    }
    const d = new Date(year, month + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth())
  }

  function openNew(dayKey = toDateKey(today)) {
    setForm({
      ...emptyForm(dayKey),
      ramo: filtroRamo || (ramoScoped != null ? String(ramoScoped) : ''),
      secao: filtroSecao,
    })
    setFormOpen(true)
    setError(null)
  }

  function openEdit(ev: CalendarioGrupoEvento) {
    setForm({
      id: ev.id,
      titulo: ev.titulo,
      descricao: ev.descricao ?? '',
      local: ev.local ?? '',
      ramo: ev.ramo != null ? String(ev.ramo) : '',
      secao: ev.secao != null ? String(ev.secao) : '',
      data_inicio: ev.data_inicio,
    })
    setFormOpen(true)
    setError(null)
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    if (!empresaId || !canWrite) return
    if (!form.titulo.trim()) {
      setError('Informe o título do evento.')
      return
    }
    if (!form.data_inicio) {
      setError('Informe a data.')
      return
    }

    setSaving(true)
    setError(null)
    const payload = {
      empresa_id: empresaId,
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      local: form.local.trim() || null,
      ramo: form.ramo ? Number(form.ramo) : null,
      secao: form.secao ? Number(form.secao) : null,
      data_inicio: form.data_inicio,
      data_fim: null,
      hora_inicio: null,
      hora_fim: null,
      updated_at: new Date().toISOString(),
    }

    const result = form.id
      ? await supabase
          .from('calendario_grupo')
          .update(payload)
          .eq('id', form.id)
          .eq('empresa_id', empresaId)
          .select(
            'id, empresa_id, ramo, secao, titulo, descricao, local, data_inicio, data_fim, hora_inicio, hora_fim, created_at, updated_at',
          )
          .maybeSingle()
      : await supabase
          .from('calendario_grupo')
          .insert(payload)
          .select(
            'id, empresa_id, ramo, secao, titulo, descricao, local, data_inicio, data_fim, hora_inicio, hora_fim, created_at, updated_at',
          )
          .maybeSingle()

    setSaving(false)
    if (result.error || !result.data) {
      setError(result.error?.message ?? 'Não foi possível salvar o evento.')
      return
    }

    const saved = result.data as CalendarioGrupoEvento
    setEventos((prev) => {
      const others = prev.filter((e) => e.id !== saved.id)
      return [...others, saved]
    })
    setFormOpen(false)
    toast.success(form.id ? 'Evento atualizado.' : 'Evento cadastrado.')
  }

  async function onDelete() {
    if (!empresaId || !canWrite || !form.id) return
    const ok = await toast.confirm({
      title: 'Excluir evento?',
      message: `Excluir permanentemente "${form.titulo}"?`,
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    const { error: delError } = await supabase
      .from('calendario_grupo')
      .delete()
      .eq('id', form.id)
      .eq('empresa_id', empresaId)
    setSaving(false)
    if (delError) {
      setError(delError.message)
      return
    }
    setEventos((prev) => prev.filter((e) => e.id !== form.id))
    setFormOpen(false)
    toast.success('Evento excluído.')
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
            Atividades informadas de <strong>{empresa?.nome}</strong> por data e
            ramo
          </p>
        </div>
        {canWrite ? (
          <button
            type="button"
            className="btn btn-primary btn-with-icon"
            onClick={() => openNew()}
          >
            <AddIcon />
            Novo
          </button>
        ) : null}
      </header>

      <section className="panel">
        {error && !formOpen ? (
          <AlertMessage tone="error" title="Erro">
            {error}
          </AlertMessage>
        ) : null}

        <div className="toolbar calendario-filtros">
          <select
            className="select"
            value={filtroRamo}
            disabled={ramoScoped != null}
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
            disabled={!filtroRamo}
            onChange={(e) => setFiltroSecao(e.target.value)}
          >
            <option value="">
              {filtroRamo
                ? 'Todas as seções (+ ramo/grupo)'
                : 'Selecione um ramo'}
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
            onClick={() => shiftPeriod(-1)}
          >
            ←
          </button>
          <strong className="calendario-mes">
            {todosMeses ? String(year) : monthLabel(year, month)}
          </strong>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => shiftPeriod(1)}
          >
            →
          </button>
          {!todosMeses ? (
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                setYear(today.getFullYear())
                setMonth(today.getMonth())
              }}
            >
              Este mês
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => setYear(today.getFullYear())}
            >
              Este ano
            </button>
          )}
          <button
            type="button"
            className={`btn btn-soft${todosMeses ? ' is-active' : ''}`}
            onClick={() => setTodosMeses((v) => !v)}
          >
            {todosMeses ? 'Ver um mês' : 'Todos os meses'}
          </button>
        </div>

        {loading ? (
          <div className="loading">Carregando calendário…</div>
        ) : (
          <div className="calendario-meses-stack">
            {mesesAgenda.map((mes) => (
              <section key={`${mes.year}-${mes.month}`} className="calendario-mes-bloco">
                {todosMeses ? (
                  <h3 className="calendario-mes-bloco-titulo">{mes.label}</h3>
                ) : null}
                {mes.dias.length === 0 ? (
                  <p className="muted">
                    Nenhuma atividade informada neste mês.
                  </p>
                ) : (
                  <div className="calendario-matriz-wrap">
                    <table className="calendario-matriz">
                      <thead>
                        <tr>
                          <th className="calendario-matriz-data-col">Data</th>
                          {colunasRamos.map((col) => (
                            <th
                              key={col.key}
                              className={`calendario-matriz-col calendario-matriz-col--${col.tone}`}
                            >
                              {col.nome}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {mes.dias.map((dayKey) => {
                          const { semana, dia } = dayLabelCurto(dayKey)
                          return (
                            <tr key={dayKey}>
                              <th
                                scope="row"
                                className="calendario-matriz-data-col"
                              >
                                <span className="calendario-matriz-dia">
                                  {dia}
                                </span>
                                <span className="calendario-matriz-semana">
                                  {semana}
                                </span>
                              </th>
                              {colunasRamos.map((col) => {
                                const list =
                                  mes.celulas.get(`${dayKey}|${col.key}`) ?? []
                                return (
                                  <td
                                    key={`${dayKey}|${col.key}`}
                                    className={`calendario-matriz-col calendario-matriz-col--${col.tone}`}
                                  >
                                    {list.length === 0 ? (
                                      <span className="calendario-matriz-vazio">
                                        —
                                      </span>
                                    ) : (
                                      <ul className="calendario-matriz-lista">
                                        {list.map((ev) => (
                                          <li key={ev.id}>
                                            <button
                                              type="button"
                                              className="calendario-matriz-item"
                                              onClick={() =>
                                                canWrite
                                                  ? openEdit(ev)
                                                  : undefined
                                              }
                                              disabled={!canWrite}
                                              title={ev.descricao || ev.titulo}
                                            >
                                              <strong>{ev.titulo}</strong>
                                              <span>
                                                {[
                                                  ev.secao != null
                                                    ? secaoMap.get(ev.secao) ||
                                                      `Seção ${ev.secao}`
                                                    : null,
                                                  ev.local,
                                                ]
                                                  .filter(Boolean)
                                                  .join(' · ')}
                                              </span>
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </section>

      {formOpen ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onMouseDown={onOverlayMouseDown}
          onClick={onOverlayClick}
        >
          <div
            className="passagem-dialog calendario-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendario-form-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <header className="passagem-dialog-header">
              <div>
                <h3 id="calendario-form-title">
                  {form.id ? 'Editar no calendário' : 'Informar no calendário'}
                </h3>
                <p className="muted">
                  Sem ramo = grupo inteiro. Com ramo e sem seção = ramo inteiro.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => setFormOpen(false)}
                disabled={saving}
              >
                Fechar
              </button>
            </header>

            <form onSubmit={(e) => void onSave(e)}>
              {error ? (
                <AlertMessage tone="error" title="Não foi possível salvar">
                  {error}
                </AlertMessage>
              ) : null}

              <div className="form-grid-2">
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="cal-titulo">Título</label>
                  <input
                    id="cal-titulo"
                    className="input"
                    value={form.titulo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, titulo: e.target.value }))
                    }
                    required
                    disabled={saving}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cal-ramo">Ramo</label>
                  <select
                    id="cal-ramo"
                    className="select"
                    value={form.ramo}
                    disabled={saving || ramoScoped != null}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        ramo: e.target.value,
                        secao: '',
                      }))
                    }
                  >
                    <option value="">Grupo (todos)</option>
                    {ramos.map((r) => (
                      <option key={r.ramo_id} value={r.ramo_id}>
                        {r.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cal-secao">Seção</label>
                  <select
                    id="cal-secao"
                    className="select"
                    value={form.secao}
                    disabled={saving || !form.ramo}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, secao: e.target.value }))
                    }
                  >
                    <option value="">
                      {form.ramo ? 'Ramo inteiro' : 'Selecione um ramo'}
                    </option>
                    {secoesDoForm.map((s) => (
                      <option key={s.secao_id} value={s.secao_id}>
                        {s.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cal-inicio">Data</label>
                  <input
                    id="cal-inicio"
                    className="input"
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        data_inicio: e.target.value,
                      }))
                    }
                    required
                    disabled={saving}
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="cal-local">Local</label>
                  <input
                    id="cal-local"
                    className="input"
                    value={form.local}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, local: e.target.value }))
                    }
                    disabled={saving}
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label htmlFor="cal-desc">Descrição</label>
                  <textarea
                    id="cal-desc"
                    className="input"
                    rows={3}
                    value={form.descricao}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, descricao: e.target.value }))
                    }
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="form-actions">
                {form.id ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={saving}
                    onClick={() => void onDelete()}
                  >
                    Excluir
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-soft"
                  disabled={saving}
                  onClick={() => setFormOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
