import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { filtroAtividadesRamoOuGrupo } from '@/lib/atividadeVisibilidade'
import { formatMoney } from '@/lib/despesas'
import { isEncerrado } from '@/lib/encerrado'
import { isAssociadoLogin, staffRamoScope } from '@/lib/roles'
import type { AcaoEntreAmigos, Ramo } from '@/types/database'

type Secao = { secao_id: number; nome: string; ramo: number | null }
type Patrulha = { secaonome_id: number; nome: string }

type AcaoRow = AcaoEntreAmigos & {
  faixa_ini?: number | null
  faixa_fim?: number | null
}

export function AcaoEntreAmigosPage() {
  const { empresa, profile, hasPermission } = useAuth()
  const associadoLogin = isAssociadoLogin(profile)
  const canWrite = !associadoLogin && hasPermission('vendas.write')
  const empresaId = empresa?.id
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const flashTick = useFlashSuccess()

  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [patrulhas, setPatrulhas] = useState<Patrulha[]>([])
  const [rows, setRows] = useState<AcaoRow[]>([])
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

      let associadoId: number | null = null
      if (associadoLogin && profile?.registro) {
        const registroNum = Number(String(profile.registro).replace(/\D/g, ''))
        if (Number.isFinite(registroNum) && registroNum > 0) {
          const { data: assoc } = await supabase
            .from('associados')
            .select('associado_id')
            .eq('empresa_id', empresaId)
            .eq('registro', registroNum)
            .maybeSingle()
          associadoId = (assoc?.associado_id as number | null) ?? null
        }
      }

      if (associadoLogin) {
        if (associadoId == null) {
          if (!mounted) return
          setError(null)
          setRows([])
          setLoading(false)
          return
        }

        const { data: faixas, error: faixaError } = await supabase
          .from('acao_entre_amigos_faixa')
          .select('acao_id, numero_inicial, numero_final')
          .eq('empresa_id', empresaId)
          .eq('associado_id', associadoId)

        if (!mounted) return
        if (faixaError) {
          setError(faixaError.message)
          setRows([])
          setLoading(false)
          return
        }

        const acaoIds = (faixas ?? []).map((f) => f.acao_id as number)
        if (acaoIds.length === 0) {
          setError(null)
          setRows([])
          setLoading(false)
          return
        }

        const faixaByAcao = new Map(
          (faixas ?? []).map((f) => [
            f.acao_id as number,
            {
              ini: f.numero_inicial as number,
              fim: f.numero_final as number,
            },
          ]),
        )

        const { data, error: listError } = await supabase
          .from('acao_entre_amigos')
          .select(
            'acao_id, empresa_id, ramo, secao, patrulha_matilha, nome, numero_inicial, numero_final, valor_numero, data_sorteio, encerrado_em, created_at',
          )
          .eq('empresa_id', empresaId)
          .in('acao_id', acaoIds)
          .order('created_at', { ascending: false })

        if (!mounted) return
        if (listError) {
          setError(listError.message)
          setRows([])
        } else {
          setError(null)
          setRows(
            ((data ?? []) as AcaoEntreAmigos[]).map((row) => {
              const f = faixaByAcao.get(row.acao_id)
              return {
                ...row,
                faixa_ini: f?.ini ?? null,
                faixa_fim: f?.fim ?? null,
              }
            }),
          )
        }
        setLoading(false)
        return
      }

      let query = supabase
        .from('acao_entre_amigos')
        .select(
          'acao_id, empresa_id, ramo, secao, patrulha_matilha, nome, numero_inicial, numero_final, valor_numero, data_sorteio, encerrado_em, created_at',
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
  }, [empresaId, ramoScoped, flashTick, associadoLogin, profile?.registro])

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
            {associadoLogin
              ? 'Suas rifas — selecione para vender os números'
              : `Rifas do grupo `}
            {!associadoLogin ? <strong>{empresa?.nome}</strong> : null}
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
          <div className="empty">
            {associadoLogin
              ? 'Nenhuma ação com numeração atribuída a você.'
              : 'Nenhuma ação entre amigos cadastrada.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Nome</th>
                  {!associadoLogin ? (
                    <>
                      <th>Ramo</th>
                      <th>Seção</th>
                      <th>Patrulha / Matilha</th>
                      <th>Números</th>
                    </>
                  ) : (
                    <th>Sua faixa</th>
                  )}
                  <th>Valor</th>
                  <th>Sorteio</th>
                  {!associadoLogin ? <th>Qtde</th> : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const qtde = row.numero_final - row.numero_inicial + 1
                  const encerrado = isEncerrado(row.encerrado_em)
                  const openTo = associadoLogin
                    ? `/vendas/acao-entre-amigos/${row.acao_id}/vender`
                    : `/vendas/acao-entre-amigos/${row.acao_id}`
                  const sorteio = row.data_sorteio
                    ? (() => {
                        const [y, m, d] = String(row.data_sorteio)
                          .slice(0, 10)
                          .split('-')
                        return y && m && d ? `${d}/${m}/${y}` : row.data_sorteio
                      })()
                    : '—'
                  return (
                    <tr key={row.acao_id}>
                      <td>
                        <div className="atividades-row-actions">
                          <Link className="btn btn-soft" to={openTo}>
                            {associadoLogin
                              ? encerrado
                                ? 'Ver'
                                : 'Vender'
                              : encerrado
                                ? 'Ver'
                                : 'Abrir'}
                          </Link>
                          {!associadoLogin ? (
                            <Link
                              className="btn btn-primary"
                              to={`/vendas/acao-entre-amigos/${row.acao_id}/vender`}
                            >
                              {encerrado ? 'Vendas' : 'Jovens / vendas'}
                            </Link>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {row.nome}{' '}
                        {encerrado ? (
                          <span className="badge badge-danger">Encerrado</span>
                        ) : null}
                      </td>
                      {!associadoLogin ? (
                        <>
                          <td>
                            {row.ramo == null && row.secao == null
                              ? 'Grupo todo'
                              : (row.ramo && ramoMap.get(row.ramo)) || '—'}
                          </td>
                          <td>
                            {(row.secao && secaoMap.get(row.secao)) || '—'}
                          </td>
                          <td>
                            {(row.patrulha_matilha &&
                              patrulhaMap.get(row.patrulha_matilha)) ||
                              '—'}
                          </td>
                          <td>
                            {row.numero_inicial} – {row.numero_final}
                          </td>
                        </>
                      ) : (
                        <td>
                          {row.faixa_ini != null && row.faixa_fim != null
                            ? `${row.faixa_ini} – ${row.faixa_fim}`
                            : '—'}
                        </td>
                      )}
                      <td>{formatMoney(Number(row.valor_numero ?? 0))}</td>
                      <td>{sorteio}</td>
                      {!associadoLogin ? <td>{qtde}</td> : null}
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
