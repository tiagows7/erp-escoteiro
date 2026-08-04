import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { formatMoney } from '@/lib/despesas'
import { staffRamoScope } from '@/lib/roles'
import type { Projeto, Ramo } from '@/types/database'

type Secao = { secao_id: number; nome: string; ramo: number | null }

function escopoLabel(
  row: Projeto,
  ramoMap: Map<number, string>,
  secaoMap: Map<number, string>,
): string {
  if (row.ramo == null) return 'Grupo todo'
  const ramoNome = ramoMap.get(row.ramo) ?? `Ramo ${row.ramo}`
  if (row.secao == null) return ramoNome
  const secaoNome = secaoMap.get(row.secao) ?? `Seção ${row.secao}`
  return `${ramoNome} · ${secaoNome}`
}

export function ProjetosPage() {
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('projetos.write')
  const canFinanceiro = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])
  const flashTick = useFlashSuccess()

  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [rows, setRows] = useState<Projeto[]>([])
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
        .from('projetos')
        .select('projeto_id, empresa_id, ramo, secao, descricao, valor, created_at')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })

      if (ramoScoped != null) {
        query = query.or(`ramo.eq.${ramoScoped},ramo.is.null`)
      }

      const [ramosRes, secoesRes, listRes] = await Promise.all([
        supabase
          .from('ramos')
          .select('ramo_id, nome, idade_inicio, idade_fim')
          .order('ramo_id'),
        supabase
          .from('secao')
          .select('secao_id, nome, ramo')
          .eq('empresa_id', empresaId)
          .order('nome'),
        query,
      ])

      if (!mounted) return
      setRamos((ramosRes.data as Ramo[]) ?? [])
      setSecoes((secoesRes.data as Secao[]) ?? [])

      if (listRes.error) {
        setError(listRes.error.message)
        setRows([])
      } else {
        setError(null)
        setRows(
          ((listRes.data ?? []) as Projeto[]).map((row) => ({
            ...row,
            valor: Number(row.valor ?? 0),
          })),
        )
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
      const escopo = escopoLabel(row, ramoMap, secaoMap).toLowerCase()
      return (
        row.descricao.toLowerCase().includes(term) || escopo.includes(term)
      )
    })
  }, [rows, q, ramoMap, secaoMap])

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
          <h2>Projetos</h2>
          <p>
            Projetos do grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/projetos/novo"
          >
            <AddIcon />
            Novo projeto
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            placeholder="Buscar por descrição ou ramo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {error ? (
          <AlertMessage tone="error" title="Não foi possível carregar">
            {error}
          </AlertMessage>
        ) : null}

        {loading ? (
          <div className="loading">Carregando projetos…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhum projeto cadastrado.</div>
        ) : (
          <div className="projetos-grid">
            {filtered.map((row) => (
              <article key={row.projeto_id} className="projeto-card">
                <div className="projeto-card-head">
                  <h3>{row.descricao}</h3>
                  <p className="projeto-card-escopo">
                    {escopoLabel(row, ramoMap, secaoMap)}
                  </p>
                </div>
                <p className="projeto-card-valor">
                  {formatMoney(row.valor)}
                </p>
                <div className="projeto-card-actions">
                  <Link
                    className="btn btn-soft"
                    to={`/projetos/${row.projeto_id}`}
                  >
                    Abrir
                  </Link>
                  {canFinanceiro ? (
                    <>
                      <Link
                        className="btn btn-accent"
                        to={`/despesas/inclusao/novo?projeto_id=${row.projeto_id}`}
                      >
                        Lançar despesa
                      </Link>
                      <Link
                        className="btn btn-primary"
                        to={`/receitas/inclusao/novo?projeto_id=${row.projeto_id}`}
                      >
                        Lançar receita
                      </Link>
                    </>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
