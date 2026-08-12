import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { AlertMessage } from '@/components/AlertMessage'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { formatMoney } from '@/lib/despesas'
import { useToast } from '@/contexts/ToastContext'
import { isEncerrado } from '@/lib/encerrado'
import { totalConvitesEvento } from '@/lib/vendaEventos'
import { linkPublicoVendaEvento } from '@/lib/vendaEventosPublic'
import { isAssociadoLogin } from '@/lib/roles'
import type { VendaEvento } from '@/types/database'

type EventoRow = VendaEvento & {
  vendidos: number
  disponiveis: number
}

function formatDateBr(value: string | null | undefined) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function VendaEventosPage() {
  const { empresa, profile, hasPermission } = useAuth()
  const associadoLogin = isAssociadoLogin(profile)
  const canWrite = !associadoLogin && hasPermission('vendas.write')
  const empresaId = empresa?.id
  const flashTick = useFlashSuccess()
  const toast = useToast()

  const [rows, setRows] = useState<EventoRow[]>([])
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
      const [eventosRes, convitesRes] = await Promise.all([
        supabase
          .from('venda_eventos')
          .select(
            'evento_id, empresa_id, nome, numero_inicial, numero_final, valor_convite, data_evento, imagem_url, link_token, encerrado_em, created_at',
          )
          .eq('empresa_id', empresaId)
          .order('nome'),
        supabase
          .from('venda_evento_convite')
          .select('evento_id')
          .eq('empresa_id', empresaId),
      ])

      if (!mounted) return
      if (eventosRes.error) {
        setError(eventosRes.error.message)
        setRows([])
        setLoading(false)
        return
      }

      const vendidosMap = new Map<number, number>()
      for (const row of convitesRes.data ?? []) {
        const id = Number(row.evento_id)
        vendidosMap.set(id, (vendidosMap.get(id) ?? 0) + 1)
      }

      setRows(
        ((eventosRes.data ?? []) as VendaEvento[]).map((e) => {
          const total = totalConvitesEvento(e.numero_inicial, e.numero_final)
          const vendidos = vendidosMap.get(e.evento_id) ?? 0
          return {
            ...e,
            vendidos,
            disponiveis: Math.max(0, total - vendidos),
          }
        }),
      )
      setError(null)
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, flashTick])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((r) => r.nome.toLowerCase().includes(term))
  }, [rows, q])

  async function copiarLink(token: string | null | undefined) {
    if (!token) {
      toast.error('Atenção', 'Link ainda não disponível para este evento.')
      return
    }
    const url = linkPublicoVendaEvento(token)
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado!', 'Envie para compra fora do app.')
    } catch {
      window.prompt('Copie o link:', url)
    }
  }

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
          <h2>{associadoLogin ? 'Comprar convites' : 'Eventos'}</h2>
          <p>
            {associadoLogin
              ? 'Escolha o evento e compre a quantidade de convites desejada'
              : 'Venda de convites numerados para conferência no dia'}
          </p>
        </div>
        <div className="page-header-actions actions-pair">
          {canWrite ? (
            <Link className="btn btn-primary" to="/vendas/eventos/novo">
              <AddIcon /> Novo evento
            </Link>
          ) : null}
        </div>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}

      <section className="panel">
        <div className="toolbar">
          <input
            className="input"
            placeholder="Buscar evento…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="loading">Carregando eventos…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhum evento cadastrado.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Data</th>
                  <th>Convites</th>
                  <th>Vendidos</th>
                  <th>Disponíveis</th>
                  <th>Valor (base)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const encerrado = isEncerrado(row.encerrado_em)
                  return (
                  <tr key={row.evento_id}>
                    <td>
                      <strong>{row.nome}</strong>{' '}
                      {encerrado ? (
                        <span className="badge badge-danger">Encerrado</span>
                      ) : null}
                      <div className="muted">
                        nº {row.numero_inicial}–{row.numero_final}
                      </div>
                    </td>
                    <td>{formatDateBr(row.data_evento)}</td>
                    <td>
                      {totalConvitesEvento(
                        row.numero_inicial,
                        row.numero_final,
                      )}
                    </td>
                    <td>
                      <strong>{row.vendidos}</strong>
                    </td>
                    <td>{row.disponiveis}</td>
                    <td>{formatMoney(Number(row.valor_convite ?? 0))}</td>
                    <td className="actions-pair">
                      <Link
                        className={`btn ${encerrado ? 'btn-soft' : 'btn-primary'}`}
                        to={`/vendas/eventos/${row.evento_id}/vender`}
                      >
                        {encerrado
                          ? 'Lista'
                          : associadoLogin
                            ? 'Comprar'
                            : 'Vender'}
                      </Link>
                      {!encerrado ? (
                        <button
                          type="button"
                          className="btn btn-soft"
                          onClick={() => void copiarLink(row.link_token)}
                        >
                          Link
                        </button>
                      ) : null}
                      {canWrite ? (
                        <Link
                          className="btn btn-soft"
                          to={`/vendas/eventos/${row.evento_id}`}
                        >
                          {encerrado ? 'Ver' : 'Editar'}
                        </Link>
                      ) : null}
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
