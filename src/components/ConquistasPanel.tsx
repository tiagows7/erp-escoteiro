import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

type ConquistaPessoa = {
  associado_id: number
  nome: string
  registro: number | null
  data: string | null
}

type Props = {
  empresaId: number
  /** Na página dedicada, já mostra as colunas abertas. */
  alwaysOpen?: boolean
}

const COLUNAS = [
  {
    id: 'lobinho',
    titulo: 'Lobinho',
    conquista: 'Cruzeiro do Sul',
    field: 'conquista_cruzeiro_do_sul' as const,
    dateField: 'conquista_cruzeiro_do_sul_data' as const,
    className: 'stat-card-lobinho',
  },
  {
    id: 'escoteiro',
    titulo: 'Escoteiro',
    conquista: 'Lis de Ouro',
    field: 'conquista_lis_de_ouro' as const,
    dateField: 'conquista_lis_de_ouro_data' as const,
    className: 'stat-card-escoteiro',
  },
  {
    id: 'senior',
    titulo: 'Sênior',
    conquista: 'Escoteiro da Pátria',
    field: 'conquista_escoteiro_patria' as const,
    dateField: 'conquista_escoteiro_patria_data' as const,
    className: 'stat-card-senior',
  },
  {
    id: 'pioneiro',
    titulo: 'Pioneiro',
    conquista: 'Insígnia de B.P.',
    field: 'conquista_insignia_bp' as const,
    dateField: 'conquista_insignia_bp_data' as const,
    className: 'stat-card-pioneiro',
  },
  {
    id: 'madeira',
    titulo: 'Insígnia da Madeira',
    conquista: 'Insígnia da Madeira',
    field: 'conquista_insignia_madeira' as const,
    dateField: 'conquista_insignia_madeira_data' as const,
    className: 'stat-card-diretoria',
  },
] as const

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

export function ConquistasPanel({ empresaId, alwaysOpen = false }: Props) {
  const { hasPermission } = useAuth()
  const canOpenAssociado = hasPermission('associados.view')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showLista, setShowLista] = useState(alwaysOpen)
  const [porColuna, setPorColuna] = useState<
    Record<string, ConquistaPessoa[]>
  >(() => Object.fromEntries(COLUNAS.map((c) => [c.id, []])))

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: queryError } = await supabase
      .from('associados')
      .select(
        `associado_id, nome, registro,
         conquista_cruzeiro_do_sul, conquista_lis_de_ouro,
         conquista_escoteiro_patria, conquista_insignia_bp,
         conquista_insignia_madeira,
         conquista_cruzeiro_do_sul_data, conquista_lis_de_ouro_data,
         conquista_escoteiro_patria_data, conquista_insignia_bp_data,
         conquista_insignia_madeira_data`,
      )
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .or(
        'conquista_cruzeiro_do_sul.eq.true,conquista_lis_de_ouro.eq.true,conquista_escoteiro_patria.eq.true,conquista_insignia_bp.eq.true,conquista_insignia_madeira.eq.true',
      )

    if (queryError) {
      setError(queryError.message)
      setPorColuna(Object.fromEntries(COLUNAS.map((c) => [c.id, []])))
      setLoading(false)
      return
    }

    const next: Record<string, ConquistaPessoa[]> = Object.fromEntries(
      COLUNAS.map((c) => [c.id, []]),
    )

    for (const row of data ?? []) {
      for (const col of COLUNAS) {
        if (row[col.field] !== true) continue
        next[col.id].push({
          associado_id: row.associado_id as number,
          nome: (row.nome as string) ?? `Associado #${row.associado_id}`,
          registro: (row.registro as number | null) ?? null,
          data: (row[col.dateField] as string | null) ?? null,
        })
      }
    }

    for (const col of COLUNAS) {
      next[col.id].sort(sortByDataDesc)
    }

    setPorColuna(next)
    setLoading(false)
  }, [empresaId])

  useEffect(() => {
    void load()
  }, [load])

  const total = useMemo(
    () => COLUNAS.reduce((acc, col) => acc + (porColuna[col.id]?.length ?? 0), 0),
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
                Conquistas máximas marcadas no cadastro dos associados.
              </p>
            </div>
          </div>

          <article className="associado-mensalidade-resumo">
            <div>
              <span>Conquistas</span>
              <strong>{total}</strong>
              <p className="muted">Marcações ativas no grupo</p>
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
          {total} marcação(ões) ativa(s) no grupo · ordenado pela data (mais
          recente primeiro).
        </p>
      )}

      {showLista || alwaysOpen ? (
        <div className="conquistas-grid">
          {COLUNAS.map((col) => {
            const list = porColuna[col.id] ?? []
            return (
              <article
                key={col.id}
                className={`stat-card conquistas-coluna ${col.className}`}
              >
                <span>{col.titulo}</span>
                <strong>{list.length}</strong>
                <em className="stat-card-hint">{col.conquista}</em>
                {list.length === 0 ? (
                  <p className="muted conquistas-empty">Nenhum associado</p>
                ) : (
                  <ul className="conquistas-lista">
                    {list.map((pessoa) => {
                      const dataLabel = formatDate(pessoa.data)
                      return (
                        <li key={`${col.id}-${pessoa.associado_id}`}>
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
                              <span className="muted"> · {pessoa.registro}</span>
                            ) : null}
                          </div>
                          <span className="conquistas-lista-data muted">
                            {dataLabel ?? 'Sem data'}
                          </span>
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
