import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { ROLE_LABELS, type AppRole } from '@/lib/roles'

type UsuarioRow = {
  id: string
  nome: string
  email: string | null
  username: string | null
  registro: string | null
  role: AppRole
  ativo: boolean | null
}

export function UsuariosPage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('usuarios.write')
  const empresaId = empresa?.id
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<UsuarioRow[]>([])
  const [q, setQ] = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'ativos' | 'inativos'>(
    'ativos',
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaId) {
      setRows([])
      setLoading(false)
      return
    }

    let mounted = true
    void (async () => {
      setLoading(true)
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('id, nome, email, username, registro, role, ativo')
        .eq('empresa_id', empresaId)
        .order('nome')

      if (!mounted) return
      if (queryError) {
        setError(queryError.message)
        setRows([])
      } else {
        setError(null)
        setRows((data as UsuarioRow[]) ?? [])
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, flashTick])

  const filtered = useMemo(() => {
    let list = rows
    if (filtroAtivo === 'ativos') list = list.filter((r) => r.ativo !== false)
    if (filtroAtivo === 'inativos') list = list.filter((r) => r.ativo === false)

    const term = q.trim().toLowerCase()
    if (!term) return list
    return list.filter(
      (r) =>
        r.nome.toLowerCase().includes(term) ||
        (r.email ?? '').toLowerCase().includes(term) ||
        (r.username ?? '').toLowerCase().includes(term) ||
        (r.registro ?? '').includes(term) ||
        (ROLE_LABELS[r.role] ?? r.role).toLowerCase().includes(term),
    )
  }, [rows, q, filtroAtivo])

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
          <h2>Usuários</h2>
          <p>
            Acessos do grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/cadastros/usuarios/novo"
          >
            <AddIcon />
            Novo usuário
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar filtros-estrutura">
          <input
            className="input"
            placeholder="Buscar por nome, e-mail ou papel…"
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
            <option value="ativos">Somente ativos</option>
            <option value="inativos">Somente inativos</option>
            <option value="todos">Todos</option>
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
            : `${filtered.length} usuário(s) encontrado(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando usuários…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhum usuário encontrado neste grupo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Nome</th>
                  <th>Registro</th>
                  <th>E-mail</th>
                  <th>Papel</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/cadastros/usuarios/${row.id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>{row.nome}</td>
                    <td>{row.registro || '—'}</td>
                    <td>
                      {row.email?.endsWith('@usuarios.local')
                        ? '—'
                        : row.email || row.username || '—'}
                    </td>
                    <td>{ROLE_LABELS[row.role] ?? row.role}</td>
                    <td>
                      {row.ativo === false ? (
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
