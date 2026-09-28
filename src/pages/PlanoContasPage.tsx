import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'

type PlanoConta = {
  plano_conta_id: number
  codigo: string
  nome: string
  natureza: string
  ativo: boolean
}

function naturezaLabel(value: string) {
  return value === 'receita' ? 'Receita' : 'Despesa'
}

export function PlanoContasPage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<PlanoConta[]>([])
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
        .from('plano_contas')
        .select('plano_conta_id, codigo, nome, natureza, ativo')
        .eq('empresa_id', empresaId)
        .order('codigo', { ascending: true })

      if (!mounted) return
      if (queryError) {
        setError(queryError.message)
        setRows([])
      } else {
        setError(null)
        setRows((data ?? []) as PlanoConta[])
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
    return rows.filter((row) =>
      `${row.codigo} ${row.nome} ${naturezaLabel(row.natureza)}`
        .toLowerCase()
        .includes(term),
    )
  }, [rows, q])

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
          <h2>Plano de contas</h2>
          <p>
            Contas do grupo <strong>{empresa?.nome}</strong> para classificar
            fornecedores e contatos. O Portal da Transparência vai agrupar os
            lançamentos por aqui.
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/cadastros/plano-contas/novo"
          >
            <AddIcon />
            Nova conta
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            style={{ maxWidth: 360 }}
            placeholder="Buscar por código ou nome…"
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
          {loading ? 'Carregando…' : `${filtered.length} conta(s) encontrada(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando plano de contas…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma conta cadastrada neste grupo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Código</th>
                  <th>Nome</th>
                  <th>Natureza</th>
                  <th>Ativa</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.plano_conta_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/cadastros/plano-contas/${row.plano_conta_id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>{row.codigo}</td>
                    <td>{row.nome}</td>
                    <td>{naturezaLabel(row.natureza)}</td>
                    <td>{row.ativo ? 'Sim' : 'Não'}</td>
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
