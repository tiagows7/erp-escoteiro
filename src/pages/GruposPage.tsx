import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import type { Empresa } from '@/types/database'

export function GruposPage() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('grupos.write')
  const flashTick = useFlashSuccess()

  const [grupos, setGrupos] = useState<Empresa[]>([])
  const [q, setQ] = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'ativos' | 'inativos'>(
    'todos',
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void (async () => {
      setLoading(true)
      const { data, error: queryError } = await supabase
        .from('empresa')
        .select('id, nome, cnpj, email, slug, telefone, logo_url, ativo')
        .order('nome')

      if (!mounted) return
      if (queryError) {
        setError(queryError.message)
        setGrupos([])
      } else {
        setError(null)
        setGrupos((data as Empresa[]) ?? [])
      }
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [flashTick])

  const filtered = useMemo(() => {
    let list = grupos
    if (filtroAtivo === 'ativos') list = list.filter((g) => g.ativo !== false)
    if (filtroAtivo === 'inativos') list = list.filter((g) => g.ativo === false)

    const term = q.trim().toLowerCase()
    if (!term) return list
    return list.filter(
      (g) =>
        g.nome.toLowerCase().includes(term) ||
        (g.slug ?? '').toLowerCase().includes(term) ||
        (g.email ?? '').toLowerCase().includes(term) ||
        (g.telefone ?? '').toLowerCase().includes(term),
    )
  }, [grupos, q, filtroAtivo])

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Grupos escoteiros</h2>
          <p>Cadastro de grupos e administradores (somente super admin)</p>
        </div>
        {canWrite ? (
          <Link className="btn btn-primary btn-with-icon" to="/grupos/novo">
            <AddIcon />
            Novo grupo
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar filtros-estrutura">
          <input
            className="input"
            placeholder="Buscar por nome, slug ou contato…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="select"
            value={filtroAtivo}
            onChange={(e) =>
              setFiltroAtivo(e.target.value as 'todos' | 'ativos' | 'inativos')
            }
          >
            <option value="todos">Todos</option>
            <option value="ativos">Somente ativos</option>
            <option value="inativos">Somente inativos</option>
          </select>
        </div>

        {error ? (
          <AlertMessage tone="error" title="Não foi possível carregar">
            {error}
          </AlertMessage>
        ) : null}

        <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
          {loading
            ? 'Carregando…'
            : `${filtered.length} grupo(s) encontrado(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando grupos…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhum grupo encontrado.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>ID</th>
                  <th>Nome</th>
                  <th>Slug</th>
                  <th>Contato</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((grupo) => (
                  <tr key={grupo.id}>
                    <td>
                      <Link className="btn btn-soft" to={`/grupos/${grupo.id}`}>
                        Abrir
                      </Link>
                    </td>
                    <td>{grupo.id}</td>
                    <td>
                      {grupo.logo_url ? (
                        <img
                          className="grupo-logo-thumb"
                          src={grupo.logo_url}
                          alt=""
                        />
                      ) : null}
                      {grupo.nome}
                    </td>
                    <td>
                      <code>{grupo.slug ?? '—'}</code>
                    </td>
                    <td>{grupo.email || grupo.telefone || '—'}</td>
                    <td>
                      {grupo.ativo === false ? (
                        <span className="badge">Inativo</span>
                      ) : (
                        <span className="badge">Ativo</span>
                      )}
                    </td>
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
