import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { formatMoney } from '@/lib/despesas'
import { formatQty } from '@/lib/estoque'

type PagamentoJoin = {
  tipopagto_id: number | null
  valor: number | null
  tipo_pagamento: { nome: string } | null
}

type VendaCaixa = {
  receita_id: number
  receita_descricao: string | null
  receita_observacao: string | null
  receita_valor: number | null
  receita_emissao: string | null
  created_at: string | null
  receita_pagamento: PagamentoJoin[] | PagamentoJoin | null
}

type ItemMov = {
  movimentoest_id: number
  movimentoest_quantidade: number | null
  movimentoest_unitario: number | null
  movimentoest_total: number | null
  movimentoest_obs: string | null
  produto: { nome: string | null } | null
}

function todayKey() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function formatHora(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function pagamentosOf(row: VendaCaixa): PagamentoJoin[] {
  const p = row.receita_pagamento
  if (!p) return []
  return Array.isArray(p) ? p : [p]
}

function tipoPagamentoLabel(row: VendaCaixa): string {
  const pags = pagamentosOf(row)
  const nomes = pags
    .map((p) => p.tipo_pagamento?.nome?.trim())
    .filter(Boolean) as string[]
  if (nomes.length === 0) return '—'
  return [...new Set(nomes)].join(', ')
}

export function LojaCaixaPage() {
  const { empresa } = useAuth()
  const empresaId = empresa?.id

  const [dataCaixa, setDataCaixa] = useState(todayKey)
  const [vendas, setVendas] = useState<VendaCaixa[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [itensMap, setItensMap] = useState<Record<number, ItemMov[]>>({})
  const [loadingItens, setLoadingItens] = useState<number | null>(null)

  useEffect(() => {
    if (!empresaId) {
      setVendas([])
      setLoading(false)
      return
    }

    let mounted = true
    void (async () => {
      setLoading(true)
      setExpandedId(null)
      const { data, error: queryError } = await supabase
        .from('receitas')
        .select(
          'receita_id, receita_descricao, receita_observacao, receita_valor, receita_emissao, created_at, receita_pagamento(tipopagto_id, valor, tipo_pagamento(nome))',
        )
        .eq('empresa_id', empresaId)
        .eq('receita_emissao', dataCaixa)
        .ilike('receita_descricao', 'Venda loja%')
        .order('created_at', { ascending: false })

      if (!mounted) return
      if (queryError) {
        setError(queryError.message)
        setVendas([])
      } else {
        setError(null)
        setVendas((data as VendaCaixa[]) ?? [])
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, dataCaixa])

  const totalDia = useMemo(
    () =>
      vendas.reduce((acc, v) => acc + Number(v.receita_valor ?? 0), 0),
    [vendas],
  )

  const porTipo = useMemo(() => {
    const map = new Map<string, number>()
    for (const v of vendas) {
      const pags = pagamentosOf(v)
      if (pags.length === 0) {
        map.set('Sem tipo', (map.get('Sem tipo') ?? 0) + Number(v.receita_valor ?? 0))
        continue
      }
      for (const p of pags) {
        const nome = p.tipo_pagamento?.nome?.trim() || 'Sem tipo'
        map.set(nome, (map.get(nome) ?? 0) + Number(p.valor ?? 0))
      }
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
  }, [vendas])

  async function toggleDetalhe(receitaId: number) {
    if (expandedId === receitaId) {
      setExpandedId(null)
      return
    }
    setExpandedId(receitaId)
    if (itensMap[receitaId] || !empresaId) return

    setLoadingItens(receitaId)
    const { data, error: movError } = await supabase
      .from('movimento_estoque')
      .select(
        'movimentoest_id, movimentoest_quantidade, movimentoest_unitario, movimentoest_total, movimentoest_obs, produto:movimentoest_produto(nome)',
      )
      .eq('empresa_id', empresaId)
      .eq('movimentoest_origem', 'loja')
      .ilike('movimentoest_obs', `%Receita #${receitaId}%`)
      .order('movimentoest_id')

    setLoadingItens(null)
    if (movError) {
      setError(movError.message)
      return
    }
    setItensMap((prev) => ({
      ...prev,
      [receitaId]: (data as ItemMov[]) ?? [],
    }))
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
          <h2>Caixa da loja</h2>
          <p>
            Vendas registradas no PDV — <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn btn-soft" to="/vendas/loja">
            Voltar ao PDV
          </Link>
          <Link className="btn btn-soft" to="/dashboard">
            Fechar loja
          </Link>
        </div>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}

      <section className="panel">
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: '0.65rem' }}>
          <div className="field" style={{ margin: 0, minWidth: 160 }}>
            <label htmlFor="caixa_data">Data</label>
            <input
              id="caixa_data"
              className="input"
              type="date"
              value={dataCaixa}
              onChange={(e) => setDataCaixa(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-soft"
            style={{ alignSelf: 'end' }}
            onClick={() => setDataCaixa(todayKey())}
          >
            Hoje
          </button>
        </div>

        <div className="loja-caixa-resumo">
          <div>
            <span className="muted">Data</span>
            <strong>{formatDate(dataCaixa)}</strong>
          </div>
          <div>
            <span className="muted">Vendas</span>
            <strong>{vendas.length}</strong>
          </div>
          <div>
            <span className="muted">Total do caixa</span>
            <strong className="loja-caixa-total">{formatMoney(totalDia)}</strong>
          </div>
        </div>

        {porTipo.length > 0 ? (
          <div className="loja-caixa-tipos">
            {porTipo.map(([nome, valor]) => (
              <div key={nome} className="loja-caixa-tipo">
                <span>{nome}</span>
                <strong>{formatMoney(valor)}</strong>
              </div>
            ))}
          </div>
        ) : null}

        <p className="field-hint" style={{ margin: '1rem 0 0.75rem' }}>
          {loading
            ? 'Carregando…'
            : vendas.length === 0
              ? 'Nenhuma venda neste dia.'
              : `${vendas.length} venda(s)`}
        </p>

        {loading ? (
          <div className="loading">Carregando vendas…</div>
        ) : vendas.length === 0 ? (
          <div className="empty">Não há vendas da loja nesta data.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Hora</th>
                  <th>Nº</th>
                  <th>Descrição</th>
                  <th>Pagamento</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((row) => {
                  const open = expandedId === row.receita_id
                  const itens = itensMap[row.receita_id] ?? []
                  return (
                    <Fragment key={row.receita_id}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="btn btn-soft"
                            onClick={() => void toggleDetalhe(row.receita_id)}
                          >
                            {open ? 'Ocultar' : 'Itens'}
                          </button>
                        </td>
                        <td>{formatHora(row.created_at)}</td>
                        <td>{row.receita_id}</td>
                        <td>{row.receita_descricao || '—'}</td>
                        <td>{tipoPagamentoLabel(row)}</td>
                        <td>{formatMoney(row.receita_valor)}</td>
                      </tr>
                      {open ? (
                        <tr>
                          <td colSpan={6}>
                            {loadingItens === row.receita_id ? (
                              <div className="loading">Carregando itens…</div>
                            ) : itens.length === 0 ? (
                              <p className="muted" style={{ margin: 0 }}>
                                Itens não encontrados no estoque para esta
                                venda.
                              </p>
                            ) : (
                              <table className="data loja-caixa-itens">
                                <thead>
                                  <tr>
                                    <th>Produto</th>
                                    <th>Qtd</th>
                                    <th>Unit.</th>
                                    <th>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {itens.map((item) => (
                                    <tr key={item.movimentoest_id}>
                                      <td>{item.produto?.nome || '—'}</td>
                                      <td>
                                        {formatQty(item.movimentoest_quantidade)}
                                      </td>
                                      <td>
                                        {formatMoney(item.movimentoest_unitario)}
                                      </td>
                                      <td>
                                        {formatMoney(item.movimentoest_total)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {row.receita_observacao ? (
                              <p
                                className="field-hint"
                                style={{ marginTop: '0.5rem' }}
                              >
                                Obs.: {row.receita_observacao}
                              </p>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
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
