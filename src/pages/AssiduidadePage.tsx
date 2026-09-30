import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { categoriaEhBeneficiario } from '@/lib/categoriaAssociado'
import { staffRamoScope } from '@/lib/roles'

type Presenca = { compareceu: boolean | null }

type AssiduidadeRow = {
  assiduidade_id: number
  ramo: number
  data_atividade: string
  assiduidade_presenca: Presenca[] | null
}

type Jovem = {
  associado_id: number
  nome: string
  ramo: number | null
}

type PresencaJovem = {
  associado_id: number
  compareceu: boolean | null
  assiduidade: { ramo: number } | { ramo: number }[] | null
}

function um<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
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
  const [jovens, setJovens] = useState<Jovem[]>([])
  const [presencas, setPresencas] = useState<PresencaJovem[]>([])
  const [ramosLista, setRamosLista] = useState<{ ramo_id: number; nome: string }[]>([])
  const [ramos, setRamos] = useState<Map<number, string>>(new Map())
  const [ramoPainel, setRamoPainel] = useState(
    ramoScope != null ? String(ramoScope) : '',
  )
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
      const [listaRes, ramosRes, assocRes, catRes, presencaRes] =
        await Promise.all([
        supabase
          .from('assiduidade')
          .select(
            'assiduidade_id, ramo, data_atividade, assiduidade_presenca(compareceu)',
          )
          .eq('empresa_id', empresaId)
          .order('data_atividade', { ascending: false }),
        supabase.from('ramos').select('ramo_id, nome').order('ramo_id'),
        supabase
          .from('associados')
          .select('associado_id, nome, ramo, categoria, categoria2')
          .eq('empresa_id', empresaId)
          .or('ativo.is.null,ativo.eq.true')
          .order('nome'),
        supabase.from('categoria').select('categoria_id, nome'),
        supabase
          .from('assiduidade_presenca')
          .select('associado_id, compareceu, assiduidade!inner(ramo)')
          .eq('empresa_id', empresaId),
      ])

      if (!mounted) return
      const falha =
        listaRes.error ||
        ramosRes.error ||
        assocRes.error ||
        catRes.error ||
        presencaRes.error
      if (falha) {
        setError(falha.message)
        setRows([])
        setJovens([])
        setPresencas([])
      } else {
        setError(null)
        setRows((listaRes.data ?? []) as AssiduidadeRow[])
        const listaRamos = ramosRes.data ?? []
        setRamosLista(listaRamos)
        setRamos(new Map(listaRamos.map((row) => [row.ramo_id, row.nome])))
        const catMap = new Map(
          (catRes.data ?? []).map((row) => [row.categoria_id, row.nome as string]),
        )
        setJovens(
          (assocRes.data ?? []).flatMap((row) => {
            const jovem =
              categoriaEhBeneficiario(
                row.categoria != null ? catMap.get(row.categoria) : null,
              ) ||
              categoriaEhBeneficiario(
                row.categoria2 != null ? catMap.get(row.categoria2) : null,
              )
            if (!jovem) return []
            return [
              {
                associado_id: row.associado_id,
                nome: row.nome?.trim() || `Associado #${row.associado_id}`,
                ramo: row.ramo,
              },
            ]
          }),
        )
        setPresencas((presencaRes.data ?? []) as PresencaJovem[])
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, flashTick])

  const ranking = useMemo(() => {
    const ramoFiltro = ramoPainel ? Number(ramoPainel) : null
    const porPessoa = new Map<number, { chamadas: number; presentes: number }>()
    for (const item of presencas) {
      const chamada = um(item.assiduidade)
      if (ramoFiltro != null && chamada?.ramo !== ramoFiltro) continue
      const atual = porPessoa.get(item.associado_id) ?? {
        chamadas: 0,
        presentes: 0,
      }
      atual.chamadas += 1
      if (item.compareceu) atual.presentes += 1
      porPessoa.set(item.associado_id, atual)
    }

    return jovens
      .filter((jovem) => {
        if (ramoScope != null && jovem.ramo !== ramoScope) return false
        if (ramoFiltro != null && jovem.ramo !== ramoFiltro) return false
        return true
      })
      .map((jovem) => {
        const conta = porPessoa.get(jovem.associado_id) ?? {
          chamadas: 0,
          presentes: 0,
        }
        const percentual =
          conta.chamadas === 0
            ? 0
            : Math.round((conta.presentes / conta.chamadas) * 100)
        return { ...jovem, ...conta, percentual }
      })
      .sort(
        (a, b) =>
          b.percentual - a.percentual ||
          b.presentes - a.presentes ||
          a.nome.localeCompare(b.nome, 'pt-BR'),
      )
  }, [jovens, presencas, ramoPainel, ramoScope])

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
      return `${ramo} ${formatData(row.data_atividade)}`.toLowerCase().includes(term)
    })
  }, [visiveis, q, ramos])

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
        <div className="page-header" style={{ marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Assiduidade dos jovens</h3>
            <p className="field-hint">
              Do mais assíduo ao menos, pelas chamadas já registradas.
            </p>
          </div>
          <label className="portal-year-label">
            <span>Ramo</span>
            <select
              className="select"
              value={ramoPainel}
              disabled={ramoScope != null}
              onChange={(e) => setRamoPainel(e.target.value)}
            >
              {ramoScope == null ? (
                <option value="">Todos os ramos</option>
              ) : null}
              {ramosLista
                .filter((item) =>
                  ramoScope != null
                    ? item.ramo_id === ramoScope
                    : item.ramo_id >= 1 && item.ramo_id <= 4,
                )
                .map((item) => (
                  <option key={item.ramo_id} value={item.ramo_id}>
                    {item.nome}
                  </option>
                ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="loading">Carregando painel…</div>
        ) : ranking.length === 0 ? (
          <div className="empty">Nenhum jovem neste ramo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Jovem</th>
                  {ramoPainel ? null : <th>Ramo</th>}
                  <th>Presentes</th>
                  <th>Chamadas</th>
                  <th>Assiduidade</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((jovem, index) => (
                  <tr key={jovem.associado_id}>
                    <td>{index + 1}</td>
                    <td>{jovem.nome}</td>
                    {ramoPainel ? null : (
                      <td>
                        {jovem.ramo == null
                          ? '—'
                          : (ramos.get(jovem.ramo) ?? '—')}
                      </td>
                    )}
                    <td>{jovem.presentes}</td>
                    <td>{jovem.chamadas}</td>
                    <td>
                      <strong>{jovem.percentual}%</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            style={{ maxWidth: 360 }}
            placeholder="Buscar por ramo ou data…"
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
