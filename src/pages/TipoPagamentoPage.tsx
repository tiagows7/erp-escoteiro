import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'

type TipoPagamento = {
  tipopagto_id: number
  empresa_id: number
  nome: string
  quita: boolean | null
}

export function TipoPagamentoPage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<TipoPagamento[]>([])
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
        .from('tipo_pagamento')
        .select('tipopagto_id, empresa_id, nome, quita')
        .eq('empresa_id', empresaId)
        .order('nome')

      if (!mounted) return
      if (queryError) {
        setError(queryError.message)
        setRows([])
      } else {
        setError(null)
        setRows((data as TipoPagamento[]) ?? [])
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
          <h2>Tipo de Pagamento</h2>
          <p>
            Formas de pagamento do grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/cadastros/tipo-pagamento/novo"
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
          <div className="loading">Carregando tipos de pagamento…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhum tipo de pagamento neste grupo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Nome</th>
                  <th>Quita</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.tipopagto_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/cadastros/tipo-pagamento/${row.tipopagto_id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>{row.nome}</td>
                    <td>{row.quita ? 'Sim' : 'Não'}</td>
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
