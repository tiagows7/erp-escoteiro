import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { formatMoney } from '@/lib/despesas'
import {
  checkPixSicrediStatus,
  conciliarPixSicredi,
  type ConciliacaoPixItem,
} from '@/lib/pixSicredi'

type ContaPix = {
  id: number
  descricao: string | null
  banco_nome: string | null
  agencia: string | null
  conta: string | null
}

type FiltroSituacao = 'todas' | 'conciliado' | 'pendente' | 'sem_cobranca'

function firstDayOfMonth(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

function todayIso(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function contaLabel(conta: ContaPix): string {
  const nome = conta.descricao?.trim() || conta.banco_nome?.trim() || 'Conta'
  const numero = [conta.agencia, conta.conta].filter(Boolean).join(' / ')
  return numero ? `${nome} · ${numero}` : nome
}

function formatHorario(value: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

function situacaoLabel(situacao: ConciliacaoPixItem['situacao']): string {
  if (situacao === 'conciliado') return 'Conciliado'
  if (situacao === 'pendente') return 'Sem baixa'
  return 'Sem cobrança'
}

export function ConciliacaoBancariaPage() {
  const { empresa, hasPermission } = useAuth()
  const canWrite = hasPermission('financeiro.write')
  const empresaId = empresa?.id

  const [contas, setContas] = useState<ContaPix[]>([])
  const [contaId, setContaId] = useState('')
  const [dataDe, setDataDe] = useState(firstDayOfMonth)
  const [dataAte, setDataAte] = useState(todayIso)
  const [filtro, setFiltro] = useState<FiltroSituacao>('todas')
  const [itens, setItens] = useState<ConciliacaoPixItem[]>([])
  const [avisos, setAvisos] = useState<string[]>([])
  const [consultou, setConsultou] = useState(false)
  const [loadingContas, setLoadingContas] = useState(true)
  const [loading, setLoading] = useState(false)
  const [baixandoId, setBaixandoId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaId) {
      setContas([])
      setLoadingContas(false)
      return
    }
    let mounted = true
    void supabase
      .from('empresa_conta_bancaria')
      .select('id, descricao, banco_nome, agencia, conta')
      .eq('empresa_id', empresaId)
      .eq('api_pix_ativo', true)
      .order('id')
      .then(({ data, error: queryError }) => {
        if (!mounted) return
        if (queryError) setError(queryError.message)
        else setContas((data ?? []) as ContaPix[])
        setLoadingContas(false)
      })
    return () => {
      mounted = false
    }
  }, [empresaId])

  const visiveis = useMemo(
    () => (filtro === 'todas' ? itens : itens.filter((item) => item.situacao === filtro)),
    [itens, filtro],
  )

  const totais = useMemo(() => {
    let valor = 0
    let conciliado = 0
    let pendente = 0
    let semCobranca = 0
    for (const item of itens) {
      valor += Number(item.valor ?? 0)
      if (item.situacao === 'conciliado') conciliado += 1
      else if (item.situacao === 'pendente') pendente += 1
      else semCobranca += 1
    }
    return { valor, conciliado, pendente, semCobranca }
  }, [itens])

  async function consultar() {
    if (!empresaId) return
    setLoading(true)
    setError(null)
    const result = await conciliarPixSicredi({
      empresaId,
      inicio: dataDe,
      fim: dataAte,
      contaId: contaId ? Number(contaId) : null,
    })
    setLoading(false)
    setConsultou(true)
    if (!result.ok) {
      setItens([])
      setAvisos([])
      setError(result.error)
      return
    }
    setAvisos(result.avisos)
    setItens(result.itens)
  }

  async function baixar(item: ConciliacaoPixItem) {
    if (!item.cobranca_id || !canWrite) return
    setBaixandoId(item.cobranca_id)
    setError(null)
    const result = await checkPixSicrediStatus(item.cobranca_id)
    setBaixandoId(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    if (!result.baixado) {
      setError('O banco ainda não confirmou a liquidação desta cobrança.')
      return
    }
    setItens((prev) =>
      prev.map((row) =>
        row.cobranca_id === item.cobranca_id
          ? { ...row, situacao: 'conciliado', baixado_em: new Date().toISOString() }
          : row,
      ),
    )
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
          <h2>Conciliação bancária</h2>
          <p>
            PIX recebidos no Sicredi comparados com as cobranças do sistema —{' '}
            <strong>{empresa?.nome}</strong>
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="toolbar filtros-estrutura">
          <label className="field" style={{ margin: 0 }}>
            <span className="field-hint">Conta</span>
            <select
              className="select"
              value={contaId}
              disabled={loadingContas || loading}
              onChange={(e) => setContaId(e.target.value)}
            >
              <option value="">Todas com PIX</option>
              {contas.map((conta) => (
                <option key={conta.id} value={conta.id}>
                  {contaLabel(conta)}
                </option>
              ))}
            </select>
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span className="field-hint">De</span>
            <input
              className="input"
              type="date"
              value={dataDe}
              disabled={loading}
              onChange={(e) => setDataDe(e.target.value)}
            />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span className="field-hint">até</span>
            <input
              className="input"
              type="date"
              value={dataAte}
              disabled={loading}
              onChange={(e) => setDataAte(e.target.value)}
            />
          </label>
          <label className="field" style={{ margin: 0 }}>
            <span className="field-hint">Situação</span>
            <select
              className="select"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as FiltroSituacao)}
            >
              <option value="todas">Todas</option>
              <option value="conciliado">Conciliadas</option>
              <option value="pendente">Sem baixa</option>
              <option value="sem_cobranca">Sem cobrança</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || loadingContas}
            onClick={() => void consultar()}
          >
            {loading ? 'Consultando…' : 'Consultar banco'}
          </button>
        </div>
        <p className="field-hint" style={{ marginTop: '0.65rem' }}>
          O período máximo é de 31 dias. TED, boleto e tarifa entram quando a
          cooperativa liberar a API de extrato da conta corrente.
        </p>
      </section>

      {error ? (
        <AlertMessage tone="error" title="Não foi possível conciliar">
          {error}
        </AlertMessage>
      ) : null}

      {avisos.map((aviso) => (
        <AlertMessage key={aviso} tone="info" title="Conta">
          {aviso}
        </AlertMessage>
      ))}

      {consultou && !loading ? (
        <section className="panel">
          <div className="despesas-relatorio-resumo-grid">
            <article className="despesas-relatorio-card despesas-relatorio-card-emitidas">
              <span className="despesas-relatorio-card-label">No banco</span>
              <strong className="despesas-relatorio-card-value">
                {formatMoney(totais.valor)}
              </strong>
              <span className="despesas-relatorio-card-meta">
                {itens.length} PIX
              </span>
            </article>
            <article className="despesas-relatorio-card despesas-relatorio-card-pago">
              <span className="despesas-relatorio-card-label">Conciliados</span>
              <strong className="despesas-relatorio-card-value">
                {totais.conciliado}
              </strong>
              <span className="despesas-relatorio-card-meta">já baixados</span>
            </article>
            <article className="despesas-relatorio-card despesas-relatorio-card-aberto">
              <span className="despesas-relatorio-card-label">Pendências</span>
              <strong className="despesas-relatorio-card-value">
                {totais.pendente + totais.semCobranca}
              </strong>
              <span className="despesas-relatorio-card-meta">
                {totais.pendente} sem baixa · {totais.semCobranca} sem cobrança
              </span>
            </article>
          </div>

          {visiveis.length === 0 ? (
            <div className="empty" style={{ marginTop: '1rem' }}>
              Nenhum PIX neste filtro.
            </div>
          ) : (
            <div className="table-wrap" style={{ marginTop: '1rem' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Pagamento</th>
                    <th>Conta</th>
                    <th>Pagador</th>
                    <th>Identificador</th>
                    <th>Valor</th>
                    <th>Situação</th>
                    <th className="no-print"></th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((item) => (
                    <tr key={`${item.end_to_end_id}-${item.txid}-${item.horario}`}>
                      <td>{formatHorario(item.horario)}</td>
                      <td>{item.conta_nome}</td>
                      <td>
                        {item.nome_pagador || '—'}
                        {item.info_pagador ? (
                          <div className="muted">{item.info_pagador}</div>
                        ) : null}
                      </td>
                      <td>{item.txid || item.end_to_end_id || '—'}</td>
                      <td>{formatMoney(item.valor)}</td>
                      <td>
                        <span
                          className={
                            item.situacao === 'conciliado'
                              ? 'badge'
                              : 'badge badge-danger'
                          }
                        >
                          {situacaoLabel(item.situacao)}
                        </span>
                        {item.cobranca_descricao ? (
                          <div className="muted">{item.cobranca_descricao}</div>
                        ) : null}
                      </td>
                      <td className="no-print">
                        {item.situacao === 'pendente' &&
                        item.cobranca_id &&
                        canWrite ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={baixandoId === item.cobranca_id}
                            onClick={() => void baixar(item)}
                          >
                            {baixandoId === item.cobranca_id
                              ? 'Baixando…'
                              : 'Baixar'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  )
}
