import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'

type FornecedorRow = {
  fordespesa_id: number
  fordespesa_nome: string | null
  fordespesa_cnpj: string | null
  fordespesa_tipo: string | null
  fordespesa_despesa: string | null
  fordespesa_uf: string | null
  fordespesa_fone1: string | null
  fordespesa_email: string | null
}

function tipoLabel(tipo: string | null) {
  if (tipo === 'J') return 'Jurídica'
  if (tipo === 'F') return 'Física'
  return tipo || '—'
}

function naturezaLabel(natureza: string | null) {
  if (natureza === 'R') return 'Receita'
  if (natureza === 'D') return 'Despesa'
  return natureza || '—'
}

export function FornecedoresPage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<FornecedorRow[]>([])
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
        .from('fornecedor_despesa')
        .select(
          'fordespesa_id, fordespesa_nome, fordespesa_cnpj, fordespesa_tipo, fordespesa_despesa, fordespesa_uf, fordespesa_fone1, fordespesa_email',
        )
        .eq('empresa_id', empresaId)
        .order('fordespesa_nome')

      if (!mounted) return
      if (queryError) {
        setError(queryError.message)
        setRows([])
      } else {
        setError(null)
        setRows((data as FornecedorRow[]) ?? [])
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
    return rows.filter(
      (r) =>
        (r.fordespesa_nome ?? '').toLowerCase().includes(term) ||
        (r.fordespesa_cnpj ?? '').toLowerCase().includes(term) ||
        (r.fordespesa_uf ?? '').toLowerCase().includes(term) ||
        (r.fordespesa_email ?? '').toLowerCase().includes(term),
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
          <h2>Fornecedor / Contatos</h2>
          <p>
            Contatos de receita e despesa do grupo{' '}
            <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/cadastros/fornecedores/novo"
          >
            <AddIcon />
            Novo fornecedor
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            placeholder="Buscar por nome, CPF/CNPJ, UF ou e-mail…"
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
            : `${filtered.length} fornecedor(es) encontrado(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando fornecedores…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhum fornecedor cadastrado neste grupo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Nome</th>
                  <th>CPF/CNPJ</th>
                  <th>Tipo</th>
                  <th>Natureza</th>
                  <th>UF</th>
                  <th>Telefone</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.fordespesa_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/cadastros/fornecedores/${row.fordespesa_id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>{row.fordespesa_nome || '—'}</td>
                    <td>{row.fordespesa_cnpj || '—'}</td>
                    <td>{tipoLabel(row.fordespesa_tipo)}</td>
                    <td>{naturezaLabel(row.fordespesa_despesa)}</td>
                    <td>{row.fordespesa_uf || '—'}</td>
                    <td>{row.fordespesa_fone1 || '—'}</td>
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
