import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'

type FamiliaRow = {
  familia_id: number
  nome: string
  ativo: boolean
  responsavel_associado_id: number | null
  qtd_membros: number
  membros_preview: string
  responsavel_nome: string | null
}

export function FamiliasPage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('associados.write')
  const empresaId = empresa?.id
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<FamiliaRow[]>([])
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
      const [{ data: familias, error: famError }, { data: membros }] =
        await Promise.all([
          supabase
            .from('familia')
            .select('familia_id, nome, ativo, responsavel_associado_id')
            .eq('empresa_id', empresaId)
            .order('nome'),
          supabase
            .from('associados')
            .select('associado_id, nome, familia_id')
            .eq('empresa_id', empresaId)
            .not('familia_id', 'is', null),
        ])

      if (!mounted) return
      if (famError) {
        setError(famError.message)
        setRows([])
        setLoading(false)
        return
      }

      const porFamilia = new Map<number, { id: number; nome: string }[]>()
      const nomeById = new Map<number, string>()
      for (const m of membros ?? []) {
        const fid = m.familia_id as number
        const nome = (m.nome as string) || `Associado #${m.associado_id}`
        nomeById.set(m.associado_id as number, nome)
        const lista = porFamilia.get(fid) ?? []
        lista.push({ id: m.associado_id as number, nome })
        porFamilia.set(fid, lista)
      }

      setError(null)
      setRows(
        ((familias ?? []) as Array<{
          familia_id: number
          nome: string
          ativo: boolean
          responsavel_associado_id: number | null
        }>).map((f) => {
          const lista = porFamilia.get(f.familia_id) ?? []
          return {
            familia_id: f.familia_id,
            nome: f.nome,
            ativo: f.ativo !== false,
            responsavel_associado_id: f.responsavel_associado_id,
            qtd_membros: lista.length,
            membros_preview: lista
              .map((m) => m.nome)
              .slice(0, 3)
              .join(', '),
            responsavel_nome:
              f.responsavel_associado_id != null
                ? (nomeById.get(f.responsavel_associado_id) ?? null)
                : null,
          }
        }),
      )
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
      (row) =>
        row.nome.toLowerCase().includes(term) ||
        (row.responsavel_nome ?? '').toLowerCase().includes(term) ||
        row.membros_preview.toLowerCase().includes(term),
    )
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
          <h2>Famílias</h2>
          <p>
            Agrupe associados do grupo <strong>{empresa?.nome}</strong> para
            gerar a mensalidade em um só título.
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/cadastros/familias/novo"
          >
            <AddIcon />
            Nova família
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            placeholder="Buscar família, responsável ou membro…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        {loading ? (
          <p className="muted">Carregando…</p>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma família cadastrada.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Família</th>
                  <th>Responsável</th>
                  <th>Membros</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.familia_id}>
                    <td>{row.nome}</td>
                    <td>{row.responsavel_nome || '—'}</td>
                    <td>
                      {row.qtd_membros === 0
                        ? '—'
                        : `${row.qtd_membros}${
                            row.membros_preview
                              ? ` · ${row.membros_preview}${
                                  row.qtd_membros > 3 ? '…' : ''
                                }`
                              : ''
                          }`}
                    </td>
                    <td>{row.ativo ? 'Ativa' : 'Inativa'}</td>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/cadastros/familias/${row.familia_id}`}
                      >
                        Abrir
                      </Link>
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
