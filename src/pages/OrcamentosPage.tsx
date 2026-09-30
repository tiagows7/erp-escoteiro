import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { formatMoney } from '@/lib/despesas'
import { staffRamoScope } from '@/lib/roles'

type ItemValor = {
  quantidade: number | null
  valor_unitario: number | null
}

type OrcamentoRow = {
  orcamento_id: number
  nome: string
  ramo: number | null
  secao: number | null
  patrulha_matilha: number | null
  orcamento_itens: ItemValor[] | null
}

function totalItens(itens: ItemValor[] | null) {
  return (itens ?? []).reduce(
    (sum, item) =>
      sum + Number(item.quantidade ?? 0) * Number(item.valor_unitario ?? 0),
    0,
  )
}

export function OrcamentosPage() {
  const { empresa, profile, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id
  const ramoScope = useMemo(() => staffRamoScope(profile), [profile])
  const flashTick = useFlashSuccess()

  const [rows, setRows] = useState<OrcamentoRow[]>([])
  const [ramos, setRamos] = useState<Map<number, string>>(new Map())
  const [secoes, setSecoes] = useState<Map<number, string>>(new Map())
  const [patrulhas, setPatrulhas] = useState<Map<number, string>>(new Map())
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
      const [listaRes, ramosRes, secoesRes, patrulhasRes] = await Promise.all([
        supabase
          .from('orcamentos')
          .select(
            'orcamento_id, nome, ramo, secao, patrulha_matilha, orcamento_itens(quantidade, valor_unitario)',
          )
          .eq('empresa_id', empresaId)
          .order('nome', { ascending: true }),
        supabase.from('ramos').select('ramo_id, nome').order('ramo_id'),
        supabase
          .from('secao')
          .select('secao_id, nome')
          .eq('empresa_id', empresaId),
        supabase
          .from('secao_nome')
          .select('secaonome_id, nome')
          .eq('empresa_id', empresaId),
      ])

      if (!mounted) return
      const falha =
        listaRes.error || ramosRes.error || secoesRes.error || patrulhasRes.error
      if (falha) {
        setError(falha.message)
        setRows([])
      } else {
        setError(null)
        setRows((listaRes.data ?? []) as OrcamentoRow[])
        setRamos(new Map((ramosRes.data ?? []).map((row) => [row.ramo_id, row.nome])))
        setSecoes(
          new Map((secoesRes.data ?? []).map((row) => [row.secao_id, row.nome])),
        )
        setPatrulhas(
          new Map(
            (patrulhasRes.data ?? []).map((row) => [row.secaonome_id, row.nome]),
          ),
        )
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, flashTick])

  const visiveis = useMemo(() => {
    return rows.filter((row) => {
      if (ramoScope == null) return true
      return row.ramo == null || row.ramo === ramoScope
    })
  }, [rows, ramoScope])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return visiveis
    return visiveis.filter((row) => {
      const ramo = row.ramo == null ? 'grupo' : (ramos.get(row.ramo) ?? '')
      const secao = row.secao == null ? '' : (secoes.get(row.secao) ?? '')
      const unidade =
        row.patrulha_matilha == null
          ? ''
          : (patrulhas.get(row.patrulha_matilha) ?? '')
      return `${row.nome} ${ramo} ${secao} ${unidade}`.toLowerCase().includes(term)
    })
  }, [visiveis, q, ramos, secoes, patrulhas])

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
          <h2>Orçamento</h2>
          <p>
            Itens necessários para realizar a atividade orçada do grupo{' '}
            <strong>{empresa?.nome}</strong>.
          </p>
        </div>
        {canWrite ? (
          <Link
            className="btn btn-primary btn-with-icon"
            to="/financeiro/orcamentos/novo"
          >
            <AddIcon />
            Novo orçamento
          </Link>
        ) : null}
      </header>

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            style={{ maxWidth: 360 }}
            placeholder="Buscar por nome, ramo ou seção…"
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
            : `${filtered.length} orçamento(s) encontrado(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando orçamentos…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhum orçamento cadastrado neste grupo.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Nome da atividade</th>
                  <th>Ramo</th>
                  <th>Seção</th>
                  <th>Patrulha / matilha</th>
                  <th>Itens</th>
                  <th>Total estimado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.orcamento_id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/financeiro/orcamentos/${row.orcamento_id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>{row.nome}</td>
                    <td>
                      {row.ramo == null ? 'Grupo todo' : (ramos.get(row.ramo) ?? '—')}
                    </td>
                    <td>{row.secao == null ? '—' : (secoes.get(row.secao) ?? '—')}</td>
                    <td>
                      {row.patrulha_matilha == null
                        ? '—'
                        : (patrulhas.get(row.patrulha_matilha) ?? '—')}
                    </td>
                    <td>{row.orcamento_itens?.length ?? 0}</td>
                    <td>{formatMoney(totalItens(row.orcamento_itens))}</td>
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
