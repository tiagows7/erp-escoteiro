import { useEffect, useState } from 'react'
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
  const { empresa, hasPermission, isSuperAdmin } = useAuth()
  const canWrite = hasPermission('usuarios.write')
  const empresaId = empresa?.id
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<UsuarioRow[]>([])
  const [q, setQ] = useState('')
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'ativos' | 'inativos'>(
    'ativos',
  )
  const [loading, setLoading] = useState(false)
  const [consultaTick, setConsultaTick] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaId) {
      setRows([])
      setLoading(false)
      return
    }
    if (consultaTick <= 0) {
      setRows([])
      setLoading(false)
      setError(null)
      return
    }

    let mounted = true
    void (async () => {
      setLoading(true)
      let query = supabase
        .from('profiles')
        .select('id, nome, email, username, registro, role, ativo')
        .eq('empresa_id', empresaId)
        .order('nome')
        .limit(500)

      if (filtroAtivo === 'ativos') query = query.eq('ativo', true)
      if (filtroAtivo === 'inativos') query = query.eq('ativo', false)

      const { data, error: queryError } = await query
      if (!mounted) return
      if (queryError) {
        setError(queryError.message)
        setRows([])
      } else {
        const term = q.trim().toLowerCase()
        let list = (data as UsuarioRow[]) ?? []
        if (term) {
          list = list.filter((r) => {
            const papel = String(ROLE_LABELS[r.role] ?? r.role ?? '').toLowerCase()
            return (
              (r.nome ?? '').toLowerCase().includes(term) ||
              (r.email ?? '').toLowerCase().includes(term) ||
              (r.username ?? '').toLowerCase().includes(term) ||
              (r.registro ?? '').includes(term) ||
              papel.includes(term)
            )
          })
        }
        setError(null)
        setRows(list)
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
    // Critérios lidos no clique; flashTick recarrega após salvar se já consultou.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- consultaTick
  }, [empresaId, consultaTick, flashTick])

  if (!empresaId) {
    return (
      <section className="panel">
        <p className="muted">
          {isSuperAdmin
            ? 'Cadastre um grupo em Grupos escoteiros e selecione-o em “Grupo em contexto” no menu lateral para gerenciar usuários.'
            : 'Seu usuário precisa estar vinculado a um grupo escoteiro.'}
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                setConsultaTick((n) => n + 1)
              }
            }}
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
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={() => setConsultaTick((n) => n + 1)}
          >
            Consultar
          </button>
        </div>

        {error ? (
          <AlertMessage tone="error" title="Não foi possível carregar">
            {error}
          </AlertMessage>
        ) : null}

        <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
          {loading
            ? 'Carregando…'
            : consultaTick <= 0
              ? 'Informe os filtros e clique em Consultar.'
              : `${rows.length} usuário(s) encontrado(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando usuários…</div>
        ) : consultaTick <= 0 ? (
          <div className="empty">
            A lista não é carregada ao abrir a tela. Informe os filtros e clique
            em Consultar.
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">
            Nenhum usuário encontrado com esses critérios.
          </div>
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
                {rows.map((row) => (
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
                      {row.email?.includes('@') &&
                      !row.email.endsWith('@usuarios.local')
                        ? row.email
                        : '—'}
                    </td>
                    <td>{ROLE_LABELS[row.role] ?? row.role ?? '—'}</td>
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
