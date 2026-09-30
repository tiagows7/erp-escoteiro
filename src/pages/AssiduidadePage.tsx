import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { staffRamoScope } from '@/lib/roles'

type Presenca = { compareceu: boolean | null }

type AssiduidadeRow = {
  assiduidade_id: number
  ramo: number
  data_atividade: string
  atividade_id: number
  assiduidade_presenca: Presenca[] | null
}

function formatData(value: string | null | undefined) {
  if (!value) return '—'
  const [ano, mes, dia] = value.slice(0, 10).split('-')
  if (!ano || !mes || !dia) return value
  return `${dia}/${mes}/${ano}`
}

export function AssiduidadePage() {
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('atividades.write')
  const empresaId = empresa?.id
  const ramoScope = useMemo(() => staffRamoScope(profile), [profile])
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<AssiduidadeRow[]>([])
  const [ramos, setRamos] = useState<Map<number, string>>(new Map())
  const [atividades, setAtividades] = useState<Map<number, string>>(new Map())
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
      const [listaRes, ramosRes, atividadesRes] = await Promise.all([
        supabase
          .from('assiduidade')
          .select(
            'assiduidade_id, ramo, data_atividade, atividade_id, assiduidade_presenca(compareceu)',
          )
          .eq('empresa_id', empresaId)
          .order('data_atividade', { ascending: false }),
        supabase.from('ramos').select('ramo_id, nome').order('ramo_id'),
        supabase
          .from('atividades')
          .select('atividade_id, descricao')
          .eq('empresa_id', empresaId),
      ])

      if (!mounted) return
      const falha = listaRes.error || ramosRes.error || atividadesRes.error
      if (falha) {
        setError(falha.message)
        setRows([])
      } else {
        setError(null)
        setRows((listaRes.data ?? []) as AssiduidadeRow[])
        setRamos(
          new Map((ramosRes.data ?? []).map((row) => [row.ramo_id, row.nome])),
        )
        setAtividades(
          new Map(
            (atividadesRes.data ?? []).map((row) => [
              row.atividade_id,
              row.descricao,
            ]),
          ),
        )
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, flashTick])

  const visiveis = useMemo(
    () =>
      rows.filter(
        (row) => ramoScope == null || row.ramo === ramoScope,
      ),
    [rows, ramoScope],
  )

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return visiveis
    return visiveis.filter((row) => {
      const ramo = ramos.get(row.ramo) ?? ''
      const atividade = atividades.get(row.atividade_id) ?? ''
      return `${ramo} ${atividade} ${formatData(row.data_atividade)}`
        .toLowerCase()
        .includes(term)
    })
  }, [visiveis, q, ramos, atividades])

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
          <h2>Assiduidade</h2>
          <p>
            Presença de jovens e voluntários nas atividades do grupo{' '}
            <strong>{empresa?.nome}</strong>.
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/assiduidade/novo"
          >
            <AddIcon />
            Nova chamada
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            style={{ maxWidth: 360 }}
            placeholder="Buscar por ramo ou atividade…"
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
            : `${filtered.length} chamada(s) encontrada(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando assiduidade…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma chamada cadastrada neste grupo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Data</th>
                  <th>Atividade</th>
                  <th>Ramo</th>
                  <th>Compareceram</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const presencas = row.assiduidade_presenca ?? []
                  const presentes = presencas.filter((item) => item.compareceu).length
                  return (
                    <tr key={row.assiduidade_id}>
                      <td>
                        <Link
                          className="btn btn-soft"
                          to={`/assiduidade/${row.assiduidade_id}`}
                        >
                          Abrir
                        </Link>
                      </td>
                      <td>{formatData(row.data_atividade)}</td>
                      <td>{atividades.get(row.atividade_id) ?? '—'}</td>
                      <td>{ramos.get(row.ramo) ?? '—'}</td>
                      <td>
                        {presentes} de {presencas.length}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
