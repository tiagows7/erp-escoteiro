import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { formatMoney } from '@/lib/despesas'
import { staffRamoScope } from '@/lib/roles'

type AtividadeRef = {
  descricao: string
  data_atividade: string | null
  ramo: number | null
}

type EventoRef = {
  nome: string
  data_evento: string | null
  ramo: number | null
}

type OrcamentoRow = {
  orcamento_id: number
  atividade_id: number | null
  evento_id: number | null
  atividades: AtividadeRef | AtividadeRef[] | null
  venda_eventos: EventoRef | EventoRef[] | null
  orcamento_itens: ItemValor[] | null
}

type ItemValor = {
  quantidade: number | null
  valor_unitario: number | null
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
        .from('orcamentos')
        .select(
          'orcamento_id, atividade_id, evento_id, atividades(descricao, data_atividade, ramo), venda_eventos(nome, data_evento, ramo), orcamento_itens(quantidade, valor_unitario)',
        )
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })

      if (!mounted) return
      if (queryError) {
        setError(queryError.message)
        setRows([])
      } else {
        setError(null)
        setRows((data ?? []) as unknown as OrcamentoRow[])
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, flashTick])

  const visiveis = useMemo(() => {
    return rows.flatMap((row) => {
      const atividade = um(row.atividades)
      const evento = um(row.venda_eventos)
      const nome =
        row.atividade_id != null
          ? atividade?.descricao?.trim() || 'Sem nome'
          : evento?.nome?.trim() || 'Sem nome'
      const data =
        row.atividade_id != null
          ? atividade?.data_atividade
          : evento?.data_evento
      const ramo =
        row.atividade_id != null ? atividade?.ramo : evento?.ramo
      if (ramoScope != null && ramo != null && ramo !== ramoScope) {
        return []
      }
      const tipo = row.atividade_id != null ? 'Atividade' : 'Evento'
      return [
        {
          id: row.orcamento_id,
          tipo,
          nome,
          data: data ?? null,
          qtd: row.orcamento_itens?.length ?? 0,
          total: totalItens(row.orcamento_itens),
        },
      ]
    })
  }, [rows, ramoScope])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return visiveis
    return visiveis.filter((row) =>
      `${row.tipo} ${row.nome}`.toLowerCase().includes(term),
    )
  }, [visiveis, q])

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
            Itens necessários para realizar atividades e eventos do grupo{' '}
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
            placeholder="Buscar por atividade ou evento…"
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
                  <th>Tipo</th>
                  <th>Atividade / evento</th>
                  <th>Data</th>
                  <th>Itens</th>
                  <th>Total estimado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link
                        className="btn btn-soft"
                        to={`/financeiro/orcamentos/${row.id}`}
                      >
                        Abrir
                      </Link>
                    </td>
                    <td>{row.tipo}</td>
                    <td>{row.nome}</td>
                    <td>{formatData(row.data)}</td>
                    <td>{row.qtd}</td>
                    <td>{formatMoney(row.total)}</td>
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
