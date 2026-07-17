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
  nome: string
  ramo: number | null
}

type Patrulha = {
  secaonome_id: number
  empresa_id: number
  nome: string
  ramo: number | null
  secao: number | null
  secaonome_foto: string | null
}

export function PatrulhasPage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('estrutura.write')
  const empresaId = empresa?.id
  useFlashSuccess()

  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Secao[]>([])
  const [rows, setRows] = useState<Patrulha[]>([])
  const [q, setQ] = useState('')
  const [filtroRamo, setFiltroRamo] = useState('')
  const [filtroSecao, setFiltroSecao] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const ramoMap = useMemo(
    () => new Map(ramos.map((r) => [r.ramo_id, r.nome])),
    [ramos],
  )
  const secaoMap = useMemo(
    () => new Map(secoes.map((s) => [s.secao_id, s.nome])),
    [secoes],
  )

  const secoesFiltradas = useMemo(() => {
    if (!filtroRamo) return secoes
    return secoes.filter((s) => s.ramo === Number(filtroRamo))
  }, [secoes, filtroRamo])

  useEffect(() => {
    if (!empresaId) return
    void Promise.all([
      supabase
        .from('ramos')
        .select('ramo_id, nome, idade_inicio, idade_fim')
        .order('ramo_id'),
      supabase
        .from('secao')
        .select('secao_id, nome, ramo')
        .eq('empresa_id', empresaId)
        .order('nome'),
    ]).then(([r, s]) => {
      setRamos((r.data as Ramo[]) ?? [])
      setSecoes((s.data as Secao[]) ?? [])
    })
  }, [empresaId])

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
        let query = supabase
          .from('secao_nome')
          .select('secaonome_id, empresa_id, nome, ramo, secao, secaonome_foto')
          .eq('empresa_id', empresaId)
          .order('nome')

        if (filtroRamo) query = query.eq('ramo', Number(filtroRamo))
        if (filtroSecao) query = query.eq('secao', Number(filtroSecao))

        const { data, error: queryError } = await query
        if (!mounted) return

        if (queryError) {
          setError(queryError.message)
          setRows([])
        } else {
          setError(null)
          setRows((data as Patrulha[]) ?? [])
        }
        setLoading(false)
      })()
    }, 200)

    return () => {
      mounted = false
      window.clearTimeout(handle)
    }
  }, [empresaId, filtroRamo, filtroSecao])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => {
      const ramoNome = (row.ramo && ramoMap.get(row.ramo)) || ''
      const secaoNome = (row.secao && secaoMap.get(row.secao)) || ''
      return (
        row.nome.toLowerCase().includes(term) ||
        ramoNome.toLowerCase().includes(term) ||
        secaoNome.toLowerCase().includes(term)
      )
    })
  }, [q, rows, ramoMap, secaoMap])

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
          <h2>Patrulhas / Matilhas</h2>
          <p>
            Cadastro do grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canWrite ? (
          <Link className="btn btn-primary btn-with-icon" to="/patrulhas/novo">
            <AddIcon />
            Nova patrulha
          </Link>
        ) : null}
      </header>

      {secoes.length === 0 ? (
        <AlertMessage tone="info" title="Cadastre as seções primeiro">
          É preciso ter seções neste grupo antes de criar patrulhas/matilhas.
        </AlertMessage>
      ) : null}

      <section className="panel">
        <div className="toolbar filtros-estrutura">
          <input
            className="input"
            placeholder="Buscar por nome, ramo ou seção…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="select"
            value={filtroRamo}
            onChange={(e) => {
              setFiltroRamo(e.target.value)
              setFiltroSecao('')
            }}
          >
            <option value="">Todos os ramos</option>
            {ramos.map((ramo) => (
              <option key={ramo.ramo_id} value={ramo.ramo_id}>
                {ramo.nome}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={filtroSecao}
            onChange={(e) => setFiltroSecao(e.target.value)}
          >
            <option value="">Todas as seções</option>
            {secoesFiltradas.map((secao) => (
              <option key={secao.secao_id} value={secao.secao_id}>
                {secao.nome}
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
          {loading
            ? 'Carregando…'
            : `${filtered.length} patrulha(s)/matilha(s) encontrada(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            Nenhuma patrulha/matilha encontrada neste grupo.
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Ramo</th>
                  <th>Seção</th>
                  <th>Nome</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.secaonome_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/patrulhas/${row.secaonome_id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>{(row.ramo && ramoMap.get(row.ramo)) || '—'}</td>
                    <td>{(row.secao && secaoMap.get(row.secao)) || '—'}</td>
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
