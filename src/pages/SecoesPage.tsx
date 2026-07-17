import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import type { Ramo } from '@/types/database'

type Secao = {
  secao_id: number
  empresa_id: number
  nome: string
  ramo: number | null
  secao_foto: string | null
}

export function SecoesPage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('estrutura.write')
  const empresaId = empresa?.id
  useFlashSuccess()

  const [ramos, setRamos] = useState<Ramo[]>([])
  const [rows, setRows] = useState<Secao[]>([])
  const [q, setQ] = useState('')
  const [filtroRamo, setFiltroRamo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const ramoMap = useMemo(
    () => new Map(ramos.map((r) => [r.ramo_id, r.nome])),
    [ramos],
  )

  useEffect(() => {
    if (!empresaId) {
      setRows([])
      setLoading(false)
      return
    }

    let mounted = true
    const handle = window.setTimeout(() => {
      void (async () => {
        setLoading(true)
        const [{ data: ramosData }, query] = await Promise.all([
          supabase
            .from('ramos')
            .select('ramo_id, nome, idade_inicio, idade_fim')
            .order('ramo_id'),
          (async () => {
            let qy = supabase
              .from('secao')
              .select('secao_id, empresa_id, nome, ramo, secao_foto')
              .eq('empresa_id', empresaId)
              .order('nome')
            if (filtroRamo) qy = qy.eq('ramo', Number(filtroRamo))
            return qy
          })(),
        ])

        if (!mounted) return
        setRamos((ramosData as Ramo[]) ?? [])
        if (query.error) {
          setError(query.error.message)
          setRows([])
        } else {
          setError(null)
          setRows((query.data as Secao[]) ?? [])
        }
        setLoading(false)
      })()
    }, 200)

    return () => {
      mounted = false
      window.clearTimeout(handle)
    }
  }, [empresaId, filtroRamo])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => {
      const ramoNome = (row.ramo && ramoMap.get(row.ramo)) || ''
      return (
        row.nome.toLowerCase().includes(term) ||
        ramoNome.toLowerCase().includes(term)
      )
    })
  }, [q, rows, ramoMap])

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
          <h2>Seções</h2>
          <p>
            Seções do grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <Link className="btn btn-primary btn-with-icon" to="/secoes/novo">
            <AddIcon />
            Nova seção
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar filtros-estrutura">
          <input
            className="input"
            placeholder="Buscar por nome ou ramo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="select"
            value={filtroRamo}
            onChange={(e) => setFiltroRamo(e.target.value)}
          >
            <option value="">Todos os ramos</option>
            {ramos.map((ramo) => (
              <option key={ramo.ramo_id} value={ramo.ramo_id}>
                {ramo.nome}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <AlertMessage tone="error" title="Não foi possível carregar">
            {error}
          </AlertMessage>
        ) : null}

        <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
          {loading ? 'Carregando…' : `${filtered.length} seção(ões) encontrada(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando seções…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma seção encontrada neste grupo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Ramo</th>
                  <th>Nome</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.secao_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/secoes/${row.secao_id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>{(row.ramo && ramoMap.get(row.ramo)) || '—'}</td>
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
