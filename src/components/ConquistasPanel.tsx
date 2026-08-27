import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { RegistroProvisorioBadge } from '@/components/RegistroProvisorioBadge'
import {
  CONQUISTA_COLUNAS,
  CONQUISTA_TIPO_LABEL,
  type ConquistaTipo,
} from '@/lib/conquistas'
import { isAssociadoLogin } from '@/lib/roles'

type ConquistaPessoa = {
  conquista_id: number
  associado_id: number
  nome: string
  registro: number | null
  registro_provisorio: boolean
  secaoNome: string | null
  patrulhaNome: string | null
  data: string | null
}

type Props = {
  empresaId: number
  /** Na página dedicada, já mostra as colunas abertas. */
  alwaysOpen?: boolean
  /** Incrementar para recarregar após cadastro. */
  reloadToken?: number
}

function formatDate(value: string | null | undefined) {
  if (!value) return null
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function sortByDataDesc(a: ConquistaPessoa, b: ConquistaPessoa) {
  const da = a.data?.slice(0, 10) ?? ''
  const db = b.data?.slice(0, 10) ?? ''
  if (da && db) return db.localeCompare(da)
  if (da) return -1
  if (db) return 1
  return a.nome.localeCompare(b.nome, 'pt-BR')
}

export function ConquistasPanel({
  empresaId,
  alwaysOpen = false,
  reloadToken = 0,
}: Props) {
  const { hasPermission, profile } = useAuth()
  const associadoLogin = isAssociadoLogin(profile)
  const canOpenAssociado =
    !associadoLogin && hasPermission('associados.view')
  const canEdit =
    !associadoLogin && hasPermission('associados.write')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showLista, setShowLista] = useState(alwaysOpen)
  const [porColuna, setPorColuna] = useState<
    Record<string, ConquistaPessoa[]>
  >(() => Object.fromEntries(CONQUISTA_COLUNAS.map((c) => [c.id, []])))

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const [conqRes, secoesRes, patrRes] = await Promise.all([
      supabase
        .from('conquistas')
        .select(
          `
          conquista_id, associado_id, tipo, data_conquista, secao, patrulha_matilha,
          associados!inner (
            nome, registro, registro_provisorio, ativo
          )
        `,
        )
        .eq('empresa_id', empresaId)
        .eq('associados.ativo', true)
        .order('data_conquista', { ascending: false }),
      supabase
        .from('secao')
        .select('secao_id, nome')
        .eq('empresa_id', empresaId),
      supabase
        .from('secao_nome')
        .select('secaonome_id, nome')
        .eq('empresa_id', empresaId),
    ])

    if (conqRes.error) {
      setError(conqRes.error.message)
      setPorColuna(Object.fromEntries(CONQUISTA_COLUNAS.map((c) => [c.id, []])))
      setLoading(false)
      return
    }

    const secaoMap = new Map(
      (secoesRes.data ?? []).map((s) => [
        s.secao_id as number,
        (s.nome as string) ?? `Seção ${s.secao_id}`,
      ]),
    )
    const patrulhaMap = new Map(
      (patrRes.data ?? []).map((p) => [
        p.secaonome_id as number,
        (p.nome as string) ?? `Patrulha ${p.secaonome_id}`,
      ]),
    )

    const next: Record<string, ConquistaPessoa[]> = Object.fromEntries(
      CONQUISTA_COLUNAS.map((c) => [c.id, []]),
    )

    type Row = {
      conquista_id: number
      associado_id: number
      tipo: string
      data_conquista: string | null
      secao: number | null
      patrulha_matilha: number | null
      associados: {
        nome: string | null
        registro: number | null
        registro_provisorio: boolean | null
        ativo: boolean | null
      } | null
    }

    for (const row of (conqRes.data as unknown as Row[]) ?? []) {
      const col = CONQUISTA_COLUNAS.find((c) => c.tipo === row.tipo)
      if (!col) continue
      const assoc = row.associados
      const secaoId = row.secao
      const patrId = row.patrulha_matilha
      next[col.id].push({
        conquista_id: row.conquista_id,
        associado_id: row.associado_id,
        nome: assoc?.nome?.trim() || `Associado #${row.associado_id}`,
        registro: assoc?.registro ?? null,
        registro_provisorio: assoc?.registro_provisorio === true,
        secaoNome:
          secaoId != null
            ? (secaoMap.get(secaoId) ?? `Seção ${secaoId}`)
            : null,
        patrulhaNome:
          patrId != null
            ? (patrulhaMap.get(patrId) ?? null)
            : null,
        data: row.data_conquista,
      })
    }

    for (const col of CONQUISTA_COLUNAS) {
      next[col.id].sort(sortByDataDesc)
    }

    setPorColuna(next)
    setLoading(false)
  }, [empresaId])

  useEffect(() => {
    void load()
  }, [load, reloadToken])

  const total = useMemo(
    () =>
      CONQUISTA_COLUNAS.reduce(
        (acc, col) => acc + (porColuna[col.id]?.length ?? 0),
        0,
      ),
    [porColuna],
  )

  if (loading) {
    return (
      <section className="panel conquistas-panel">
        <div className="loading">Carregando conquistas…</div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="panel conquistas-panel">
        <p className="muted">{error}</p>
      </section>
    )
  }

  return (
    <section className="panel conquistas-panel">
      {!alwaysOpen ? (
        <>
          <div className="passagem-header">
            <div>
              <h3>Painel de conquistas</h3>
              <p className="muted">
                Conquistas máximas cadastradas no grupo.
              </p>
            </div>
          </div>

          <article className="associado-mensalidade-resumo">
            <div>
              <span>Conquistas</span>
              <strong>{total}</strong>
              <p className="muted">Cadastros ativos no grupo</p>
            </div>
            <div className="associado-mensalidade-resumo-actions">
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => setShowLista((prev) => !prev)}
              >
                {showLista ? 'Ocultar painel' : 'Ver painel'}
              </button>
            </div>
          </article>
        </>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>
          {total} conquista(s) cadastrada(s) · ordenado pela data (mais recente
          primeiro).
        </p>
      )}

      {showLista || alwaysOpen ? (
        <div className="conquistas-grid">
          {CONQUISTA_COLUNAS.map((col) => {
            const list = porColuna[col.id] ?? []
            return (
              <article
                key={col.id}
                className={`stat-card conquistas-coluna ${col.className}`}
              >
                <span>{col.titulo}</span>
                <strong>{list.length}</strong>
                <em className="stat-card-hint">
                  {CONQUISTA_TIPO_LABEL[col.tipo as ConquistaTipo]}
                </em>
                {list.length === 0 ? (
                  <p className="muted conquistas-empty">Nenhum associado</p>
                ) : (
                  <ul className="conquistas-lista">
                    {list.map((pessoa) => {
                      const dataLabel = formatDate(pessoa.data)
                      const local =
                        [pessoa.secaoNome, pessoa.patrulhaNome]
                          .filter(Boolean)
                          .join(' · ') || 'Sem seção'
                      return (
                        <li
                          key={`${col.id}-${pessoa.conquista_id}`}
                          className="conquista-pessoa-card"
                        >
                          <div className="conquistas-lista-item">
                            {canOpenAssociado ? (
                              <Link to={`/associados/${pessoa.associado_id}`}>
                                {pessoa.nome}
                              </Link>
                            ) : (
                              <span className="conquistas-lista-nome">
                                {pessoa.nome}
                              </span>
                            )}
                            {pessoa.registro != null ? (
                              <span className="muted">
                                {' '}
                                · {pessoa.registro}
                              </span>
                            ) : null}{' '}
                            <RegistroProvisorioBadge
                              provisorio={pessoa.registro_provisorio}
                            />
                          </div>
                          <span className="conquistas-lista-secao muted">
                            {local}
                          </span>
                          <span className="conquistas-lista-data muted">
                            {dataLabel ?? 'Sem data'}
                          </span>
                          {canEdit ? (
                            <Link
                              className="btn btn-soft"
                              style={{
                                marginTop: '0.35rem',
                                fontSize: '0.75rem',
                                padding: '0.2rem 0.45rem',
                              }}
                              to={`/conquistas/${pessoa.conquista_id}`}
                            >
                              Editar
                            </Link>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </article>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
