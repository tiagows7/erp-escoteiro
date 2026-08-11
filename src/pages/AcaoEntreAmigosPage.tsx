import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { filtroAtividadesRamoOuGrupo } from '@/lib/atividadeVisibilidade'
import { staffRamoScope } from '@/lib/roles'
import type { AcaoEntreAmigos, Ramo } from '@/types/database'

type Secao = { secao_id: number; nome: string; ramo: number | null }
type Patrulha = { secaonome_id: number; nome: string }

export function AcaoEntreAmigosPage() {
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('vendas.write')
  const empresaId = empresa?.id
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const flashTick = useFlashSuccess()

  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [patrulhas, setPatrulhas] = useState<Patrulha[]>([])
  const [rows, setRows] = useState<AcaoEntreAmigos[]>([])
  const [q, setQ] = useState('')
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
    void (async () => {
      setLoading(true)

      let query = supabase
        .from('acao_entre_amigos')
        .select(
          'acao_id, empresa_id, ramo, secao, patrulha_matilha, nome, numero_inicial, numero_final, created_at',
        )
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })

      if (ramoScoped != null) {
        query = query.or(filtroAtividadesRamoOuGrupo(ramoScoped))
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
        setError(null)
        setRows((listRes.data as AcaoEntreAmigos[]) ?? [])
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, ramoScoped, flashTick])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => {
      const ramoNome = (row.ramo && ramoMap.get(row.ramo)) || ''
      const secaoNome = (row.secao && secaoMap.get(row.secao)) || ''
      const patrulhaNome =
        (row.patrulha_matilha && patrulhaMap.get(row.patrulha_matilha)) || ''
      return (
        row.nome.toLowerCase().includes(term) ||
        ramoNome.toLowerCase().includes(term) ||
        secaoNome.toLowerCase().includes(term) ||
        patrulhaNome.toLowerCase().includes(term) ||
        String(row.numero_inicial).includes(term) ||
        String(row.numero_final).includes(term)
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
          <h2>Ação entre amigos</h2>
          <p>
            Rifas do grupo <strong>{empresa?.nome}</strong>
            {ramoScoped != null ? ' — seu ramo e ações do grupo' : ''}
          </p>
        </div>
        {canWrite ? (
          <div className="page-header-actions">
            <Link
              className="btn btn-primary btn-with-icon"
              to="/vendas/acao-entre-amigos/novo"
            >
              <AddIcon />
              Nova ação
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
            placeholder="Buscar por nome, ramo, seção, números…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
          {loading
            ? 'Carregando…'
            : `${filtered.length} ação(ões) encontrada(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando ações…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma ação entre amigos cadastrada.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Nome</th>
                  <th>Ramo</th>
                  <th>Seção</th>
                  <th>Patrulha / Matilha</th>
                  <th>Números</th>
                  <th>Qtde</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const qtde = row.numero_final - row.numero_inicial + 1
                  return (
                    <tr key={row.acao_id}>
                      <td>
                        <Link
                          className="btn btn-soft"
                          to={`/vendas/acao-entre-amigos/${row.acao_id}`}
                        >
                          Abrir
                        </Link>
                      </td>
                      <td>{row.nome}</td>
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
                      <td>
                        {row.numero_inicial} – {row.numero_final}
                      </td>
                      <td>{qtde}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
