import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatMoney } from '@/lib/despesas'
import type { Atividade } from '@/types/database'

type Pessoa = {
  associado_id: number
  nome: string
}

type AtividadeResumo = Atividade & {
  confirmados: Pessoa[]
  pagantes: Pessoa[]
  totalArrecadado: number
}

type PopupPessoa = Pessoa & {
  confirmado: boolean
  pago: boolean
}

type Props = {
  empresaId: number
  /** Quando informado, filtra atividades deste ramo. */
  codigoRamo: number | null
}

export function StaffAtividadesPanel({ empresaId, codigoRamo }: Props) {
  const [items, setItems] = useState<AtividadeResumo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [popupItem, setPopupItem] = useState<AtividadeResumo | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    let ativQuery = supabase
      .from('atividades')
      .select(
        'atividade_id, empresa_id, ramo, secao, patrulha_matilha, descricao, local, valor, created_at',
      )
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })

    if (codigoRamo != null && codigoRamo >= 1 && codigoRamo <= 5) {
      ativQuery = ativQuery.eq('ramo', codigoRamo)
    }

    const [ativRes, confRes, pagRes, assocRes] = await Promise.all([
      ativQuery,
      supabase
        .from('atividade_confirmacao')
        .select('atividade_id, associado_id')
        .eq('empresa_id', empresaId),
      supabase
        .from('atividade_pagamento')
        .select('atividade_id, associado_id, valor')
        .eq('empresa_id', empresaId),
      supabase
        .from('associados')
        .select('associado_id, nome')
        .eq('empresa_id', empresaId),
    ])

    if (ativRes.error || confRes.error || pagRes.error || assocRes.error) {
      setError(
        ativRes.error?.message ??
          confRes.error?.message ??
          pagRes.error?.message ??
          assocRes.error?.message ??
          'Erro ao carregar atividades',
      )
      setItems([])
      setLoading(false)
      return
    }

    const nomeById = new Map(
      ((assocRes.data ?? []) as { associado_id: number; nome: string }[]).map(
        (a) => [a.associado_id, a.nome],
      ),
    )

    type ConfRow = { atividade_id: number; associado_id: number }
    type PagRow = { atividade_id: number; associado_id: number; valor: number }

    const confByAtiv = new Map<number, Pessoa[]>()
    for (const row of (confRes.data ?? []) as ConfRow[]) {
      const list = confByAtiv.get(row.atividade_id) ?? []
      list.push({
        associado_id: row.associado_id,
        nome: nomeById.get(row.associado_id) ?? `Associado #${row.associado_id}`,
      })
      confByAtiv.set(row.atividade_id, list)
    }

    const pagByAtiv = new Map<number, { pessoas: Pessoa[]; total: number }>()
    for (const row of (pagRes.data ?? []) as PagRow[]) {
      const cur = pagByAtiv.get(row.atividade_id) ?? {
        pessoas: [],
        total: 0,
      }
      cur.pessoas.push({
        associado_id: row.associado_id,
        nome: nomeById.get(row.associado_id) ?? `Associado #${row.associado_id}`,
      })
      cur.total += Number(row.valor ?? 0)
      pagByAtiv.set(row.atividade_id, cur)
    }

    const atividades = (ativRes.data as Atividade[]) ?? []
    setItems(
      atividades.map((a) => {
        const pag = pagByAtiv.get(a.atividade_id)
        return {
          ...a,
          confirmados: confByAtiv.get(a.atividade_id) ?? [],
          pagantes: pag?.pessoas ?? [],
          totalArrecadado: pag?.total ?? 0,
        }
      }),
    )
    setLoading(false)
  }, [empresaId, codigoRamo])

  useEffect(() => {
    void load()
  }, [load])

  const popupPessoas = useMemo((): PopupPessoa[] => {
    if (!popupItem) return []
    const pagoIds = new Set(popupItem.pagantes.map((p) => p.associado_id))
    const map = new Map<number, PopupPessoa>()

    for (const p of popupItem.confirmados) {
      map.set(p.associado_id, {
        ...p,
        confirmado: true,
        pago: pagoIds.has(p.associado_id),
      })
    }
    for (const p of popupItem.pagantes) {
      const existing = map.get(p.associado_id)
      if (existing) {
        existing.pago = true
      } else {
        map.set(p.associado_id, {
          ...p,
          confirmado: false,
          pago: true,
        })
      }
    }

    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [popupItem])

  if (codigoRamo == null || codigoRamo < 1 || codigoRamo > 5) {
    return null
  }

  if (loading) {
    return (
      <section className="panel staff-atividades-panel">
        <div className="loading">Carregando atividades do ramo…</div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="panel staff-atividades-panel">
        <p className="muted">{error}</p>
      </section>
    )
  }

  if (items.length === 0) {
    return null
  }

  return (
    <section className="panel staff-atividades-panel">
      <div className="passagem-header">
        <div>
          <h3>Atividades do ramo</h3>
          <p className="muted">
            Confirmados, pagamentos e valor arrecadado.
          </p>
        </div>
        <span className="badge">{items.length} atividade(s)</span>
      </div>

      <div className="staff-atividades-list">
        {items.map((item) => (
          <article key={item.atividade_id} className="staff-atividade-card">
            <header className="staff-atividade-head">
              <div>
                <h4>{item.descricao}</h4>
                <p className="staff-atividade-meta">
                  {item.local ? `Local: ${item.local}` : 'Local não informado'}
                  {' · '}
                  Valor unitário: {formatMoney(item.valor)}
                </p>
              </div>
              <div className="staff-atividade-total">
                <span>Arrecadado</span>
                <strong>{formatMoney(item.totalArrecadado)}</strong>
              </div>
            </header>

            <div className="staff-atividade-actions">
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => setPopupItem(item)}
              >
                Confirmados e pagos ({item.confirmados.length}/
                {item.pagantes.length})
              </button>
            </div>
          </article>
        ))}
      </div>

      {popupItem ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={() => setPopupItem(null)}
        >
          <div
            className="passagem-dialog staff-atividade-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-atividade-popup-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="passagem-dialog-header">
              <div>
                <h3 id="staff-atividade-popup-title">{popupItem.descricao}</h3>
                <p className="muted">
                  {popupItem.confirmados.length} confirmado(s) ·{' '}
                  {popupItem.pagantes.length} pago(s) · Arrecadado{' '}
                  {formatMoney(popupItem.totalArrecadado)}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => setPopupItem(null)}
              >
                Fechar
              </button>
            </header>

            <div className="staff-atividade-legenda">
              <span className="staff-pessoa-chip is-confirmado">Confirmou</span>
              <span className="staff-pessoa-chip is-pago">Já pagou</span>
            </div>

            {popupPessoas.length === 0 ? (
              <div className="empty">Nenhum associado confirmou ou pagou ainda.</div>
            ) : (
              <ul className="staff-atividade-popup-list">
                {popupPessoas.map((p) => (
                  <li
                    key={p.associado_id}
                    className={[
                      'staff-pessoa-item',
                      p.confirmado ? 'is-confirmado' : '',
                      p.pago ? 'is-pago' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span className="staff-pessoa-nome">{p.nome}</span>
                    <span className="staff-pessoa-tags">
                      {p.confirmado ? (
                        <span className="staff-pessoa-chip is-confirmado">
                          Confirmou
                        </span>
                      ) : null}
                      {p.pago ? (
                        <span className="staff-pessoa-chip is-pago">Pagou</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </section>
  )
}
