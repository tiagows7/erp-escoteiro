import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'

type TipoMensalidade = {
  tipomensalidade_id: number
  empresa_id: number
  nome: string
  valor: number | null
}

function formatMoney(value: number | null) {
  const n = Number(value ?? 0)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function TipoMensalidadePage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<TipoMensalidade[]>([])
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
        .from('tipo_mensalidade')
        .select('tipomensalidade_id, empresa_id, nome, valor')
        .eq('empresa_id', empresaId)
        .order('nome')

      if (!mounted) return
      if (queryError) {
        setError(queryError.message)
        setRows([])
      } else {
        setError(null)
        setRows((data as TipoMensalidade[]) ?? [])
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
          <h2>Tipo de Mensalidade</h2>
          <p>
            Planos do grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/cadastros/tipo-mensalidade/novo"
          >
            <AddIcon />
            Novo tipo
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
            : `${filtered.length} tipo(s) encontrado(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando tipos de mensalidade…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhum tipo de mensalidade neste grupo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Nome</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.tipomensalidade_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/cadastros/tipo-mensalidade/${row.tipomensalidade_id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>{row.nome}</td>
                    <td>{formatMoney(row.valor)}</td>
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
