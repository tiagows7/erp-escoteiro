import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { isGrupoAdmin } from '@/lib/roles'

type Funcao = {
  funcao_id: number
  nome: string
}

export function FuncaoPage() {
  const { empresa, hasPermission, role } = useAuth()
  const canWrite = hasPermission('estrutura.write') && isGrupoAdmin(role)
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<Funcao[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    void (async () => {
      setLoading(true)
      const { data, error: queryError } = await supabase
        .from('funcao')
        .select('funcao_id, nome')
        .order('nome')

      if (!mounted) return
      if (queryError) {
        setError(queryError.message)
        setRows([])
      } else {
        setError(null)
        setRows((data as Funcao[]) ?? [])
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [flashTick])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => row.nome.toLowerCase().includes(term))
  }, [q, rows])

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Função</h2>
          <p>
            Funções usadas no cadastro de associados
            {empresa?.nome ? (
              <>
                {' '}
                — <strong>{empresa.nome}</strong>
              </>
            ) : null}
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/cadastros/funcao/novo"
          >
            <AddIcon />
            Nova função
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            style={{ maxWidth: 360 }}
            placeholder="Buscar por nome…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {error ? (
          <AlertMessage tone="error" title="Não foi possível carregar">
            {error}
          </AlertMessage>
        ) : null}

        <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
          {loading
            ? 'Carregando…'
            : `${filtered.length} função(ões) encontrada(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando funções…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma função cadastrada.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Nome</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.funcao_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/cadastros/funcao/${row.funcao_id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>{row.nome}</td>
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
