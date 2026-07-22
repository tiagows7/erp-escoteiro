import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { formatMoney } from '@/lib/despesas'
import { isAssociadoLogin, staffRamoScope } from '@/lib/roles'
import {
  atividadeVisivelPara,
  filtroAtividadesRamoOuGrupo,
  type AssociadoAtividadeCtx,
} from '@/lib/atividadeVisibilidade'
import type { Atividade, Ramo } from '@/types/database'

type Secao = { secao_id: number; nome: string; ramo: number | null }
type Patrulha = { secaonome_id: number; nome: string }

export function AtividadesPage() {
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('atividades.write')
  const empresaId = empresa?.id
  const associadoLogin = isAssociadoLogin(profile)
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const flashTick = useFlashSuccess()

  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [patrulhas, setPatrulhas] = useState<Patrulha[]>([])
  const [rows, setRows] = useState<Atividade[]>([])
  const [q, setQ] = useState('')
  const [filtroRamo, setFiltroRamo] = useState('')
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
  const patrulhaMap = useMemo(
    () => new Map(patrulhas.map((p) => [p.secaonome_id, p.nome])),
    [patrulhas],
  )

  useEffect(() => {
    if (!empresaId) {
      setRows([])
      setLoading(false)
      return
    }

    let mounted = true
    const handle = window.setTimeout(() => {
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
            'atividade_id, empresa_id, ramo, secao, patrulha_matilha, descricao, local, valor, created_at',
          )
          .eq('empresa_id', empresaId)
          .order('created_at', { ascending: false })

        if (associadoLogin && assocCtx?.ramo != null) {
          query = query.or(filtroAtividadesRamoOuGrupo(assocCtx.ramo))
        } else if (ramoScoped != null) {
          query = query.or(filtroAtividadesRamoOuGrupo(ramoScoped))
        } else if (filtroRamo) {
          query = query.or(filtroAtividadesRamoOuGrupo(Number(filtroRamo)))
        }

        const [ramosRes, secoesRes, patrulhasRes, listRes] = await Promise.all([
          supabase
            .from('ramos')
            .select('ramo_id, nome, idade_inicio, idade_fim')
            .order('ramo_id'),
          supabase
            .from('secao')
            .select('secao_id, nome, ramo')
            .eq('empresa_id', empresaId)
            .order('nome'),
          supabase
            .from('secao_nome')
            .select('secaonome_id, nome')
            .eq('empresa_id', empresaId)
            .order('nome'),
          query,
        ])

        if (!mounted) return
        setRamos((ramosRes.data as Ramo[]) ?? [])
        setSecoes((secoesRes.data as Secao[]) ?? [])
        setPatrulhas((patrulhasRes.data as Patrulha[]) ?? [])
        if (listRes.error) {
          setError(listRes.error.message)
          setRows([])
        } else {
          let list = (listRes.data as Atividade[]) ?? []
          if (associadoLogin && assocCtx) {
            list = list.filter((a) => atividadeVisivelPara(a, assocCtx!))
          }
          setError(null)
          setRows(list)
        }
        setLoading(false)
      })()
    }, 200)

    return () => {
      mounted = false
      window.clearTimeout(handle)
    }
  }, [
    empresaId,
    filtroRamo,
    flashTick,
    ramoScoped,
    associadoLogin,
    profile?.registro,
  ])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => {
      const ramoNome = (row.ramo && ramoMap.get(row.ramo)) || ''
      const secaoNome = (row.secao && secaoMap.get(row.secao)) || ''
      const patrulhaNome =
        (row.patrulha_matilha && patrulhaMap.get(row.patrulha_matilha)) || ''
      return (
        row.descricao.toLowerCase().includes(term) ||
        (row.local ?? '').toLowerCase().includes(term) ||
        ramoNome.toLowerCase().includes(term) ||
        secaoNome.toLowerCase().includes(term) ||
        patrulhaNome.toLowerCase().includes(term)
      )
    })
  }, [q, rows, ramoMap, secaoMap, patrulhaMap])

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
          <h2>Atividades</h2>
          <p>
            {associadoLogin
              ? 'Atividades do seu ramo/seção — consulte as contas'
              : 'Programação por ramo, seção e patrulha/matilha'}
            {!associadoLogin && ramoScoped != null
              ? ' — seu ramo e atividades do grupo'
              : ''}
          </p>
        </div>
        {canWrite && !associadoLogin ? (
          <div className="page-header-actions">
            <Link className="btn btn-primary" to="/atividades/novo">
              <AddIcon /> Nova atividade
            </Link>
          </div>
        ) : null}
      </header>

      {error ? (
        <AlertMessage tone="error" title="Não foi possível carregar">
          {error}
        </AlertMessage>
      ) : null}

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            placeholder="Buscar por descrição, local, ramo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {ramoScoped == null && !associadoLogin ? (
            <select
              className="select"
              value={filtroRamo}
              onChange={(e) => setFiltroRamo(e.target.value)}
              aria-label="Filtrar por ramo"
            >
              <option value="">Todos os ramos</option>
              {ramos
                .filter((r) => r.ramo_id >= 1 && r.ramo_id <= 5)
                .map((r) => (
                  <option key={r.ramo_id} value={r.ramo_id}>
                    {r.nome}
                  </option>
                ))}
            </select>
          ) : null}
        </div>

        <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
          {loading
            ? 'Carregando…'
            : `${filtered.length} atividade(s) encontrada(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando atividades…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma atividade cadastrada.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Descrição</th>
                  <th>Ramo</th>
                  <th>Seção</th>
                  <th>Patrulha / Matilha</th>
                  <th>Local</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.atividade_id}>
                    <td>
                      <div className="atividades-row-actions">
                        {!associadoLogin ? (
                          <Link
                            className="btn btn-soft"
                            to={`/atividades/${row.atividade_id}`}
                          >
                            Abrir
                          </Link>
                        ) : null}
                        <Link
                          className="btn btn-primary"
                          to={`/atividades/${row.atividade_id}/contas`}
                        >
                          Contas
                        </Link>
                      </div>
                    </td>
                    <td>{row.descricao}</td>
                    <td>
                      {row.ramo == null && row.secao == null
                        ? 'Grupo todo'
                        : (row.ramo && ramoMap.get(row.ramo)) || '—'}
                    </td>
                    <td>{(row.secao && secaoMap.get(row.secao)) || '—'}</td>
                    <td>
                      {(row.patrulha_matilha &&
                        patrulhaMap.get(row.patrulha_matilha)) ||
                        '—'}
                    </td>
                    <td>{row.local || '—'}</td>
                    <td>{formatMoney(row.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
