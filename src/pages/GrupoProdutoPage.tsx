import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'

type GrupoProduto = {
  grupoproduto_id: number
  empresa_id: number
  nome: string
}

export function GrupoProdutoPage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('estoque.write')
  const empresaId = empresa?.id
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<GrupoProduto[]>([])
  const [q, setQ] = useState('')
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
        .from('grupo_produto')
        .select('grupoproduto_id, empresa_id, nome')
        .eq('empresa_id', empresaId)
        .order('nome')

      if (!mounted) return
      if (queryError) {
        setError(queryError.message)
        setRows([])
      } else {
        setError(null)
        setRows((data as GrupoProduto[]) ?? [])
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, flashTick])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => row.nome.toLowerCase().includes(term))
  }, [q, rows])

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
          <h2>Grupo de produto</h2>
          <p>
            Categorias de produtos do estoque —{' '}
            <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/estoque/grupos-produtos/novo"
          >
            <AddIcon />
            Novo grupo
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            style={{ maxWidth: 360 }}
            placeholder="Buscar por descrição…"
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
            : `${filtered.length} grupo(s) encontrado(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando grupos de produto…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhum grupo de produto neste grupo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Descrição</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.grupoproduto_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/estoque/grupos-produtos/${row.grupoproduto_id}`}
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
