import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useAuth } from '@/contexts/AuthContext'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { supabase } from '@/lib/supabase'

type Competicao = {
  competicao_id: number
  nome: string
  secao_id: number
  data_inicio: string | null
  data_fim: string | null
  encerrado_em: string | null
}

type Secao = {
  secao_id: number
  nome: string
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const [ano, mes, dia] = value.slice(0, 10).split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : value
}

export function CompeticoesPage() {
  const { empresa, hasPermission } = useAuth()
  const empresaId = empresa?.id
  const canWrite = hasPermission('competicoes.write')
  const flashTick = useFlashSuccess()
  const [rows, setRows] = useState<Competicao[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaId) return
    let mounted = true
    void (async () => {
      setLoading(true)
      const [competicoesRes, secoesRes] = await Promise.all([
        supabase
          .from('competicoes')
          .select(
            'competicao_id, nome, secao_id, data_inicio, data_fim, encerrado_em',
          )
          .eq('empresa_id', empresaId)
          .order('created_at', { ascending: false }),
        supabase
          .from('secao')
          .select('secao_id, nome')
          .eq('empresa_id', empresaId)
          .order('nome'),
      ])
      if (!mounted) return
      setSecoes((secoesRes.data as Secao[]) ?? [])
      if (competicoesRes.error) {
        setRows([])
        setError(competicoesRes.error.message)
      } else {
        setRows((competicoesRes.data as Competicao[]) ?? [])
        setError(null)
      }
      setLoading(false)
    })()
    return () => {
      mounted = false
    }
  }, [empresaId, flashTick])

  const secaoMap = useMemo(
    () => new Map(secoes.map((secao) => [secao.secao_id, secao.nome])),
    [secoes],
  )

  const filtered = useMemo(() => {
    const term = q.trim().toLocaleLowerCase('pt-BR')
    if (!term) return rows
    return rows.filter((row) => {
      const secao = secaoMap.get(row.secao_id) ?? ''
      return `${row.nome} ${secao}`.toLocaleLowerCase('pt-BR').includes(term)
    })
  }, [q, rows, secaoMap])

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
          <h2>Competições</h2>
          <p>
            Competições entre matilhas e patrulhas de cada seção —{' '}
            <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/competicoes/novo"
          >
            <AddIcon />
            Nova competição
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            placeholder="Buscar por competição ou seção…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </div>

        {error ? (
          <AlertMessage tone="error" title="Não foi possível carregar">
            {error}
          </AlertMessage>
        ) : null}

        {loading ? (
          <div className="loading">Carregando competições…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma competição cadastrada.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Competição</th>
                  <th>Seção</th>
                  <th>Período</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.competicao_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/competicoes/${row.competicao_id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>
                      <strong>{row.nome}</strong>
                    </td>
                    <td>{secaoMap.get(row.secao_id) ?? '—'}</td>
                    <td>
                      {formatDate(row.data_inicio)}
                      {row.data_fim ? ` a ${formatDate(row.data_fim)}` : ''}
                    </td>
                    <td>
                      {row.encerrado_em ? (
                        <span className="badge badge-danger">Encerrada</span>
                      ) : (
                        <span className="badge">Em andamento</span>
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
