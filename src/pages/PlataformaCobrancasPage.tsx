import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { AddIcon } from '@/components/AddIcon'
import { PixEfiCheckoutModal } from '@/components/PixEfiCheckoutModal'
import {
  formatCompetencia,
  currentCompetenciaInput,
  competenciaToDate,
} from '@/lib/receitas'
import {
  formatMoney,
  plataformaSituacaoLabel,
  situacaoFromSaldo,
  TITULO_SITUACAO,
  type PlataformaCobranca,
} from '@/lib/plataforma'
import { getPixEfiConfigured } from '@/lib/pixEfi'

type FiltroSituacao = 'abertos' | 'pagos' | 'todos'

export function PlataformaCobrancasPage() {
  const { isSuperAdmin, hasPermission, session } = useAuth()
  const canWrite = isSuperAdmin && hasPermission('plataforma.write')
  const toast = useToast()

  const [rows, setRows] = useState<PlataformaCobranca[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [competencia, setCompetencia] = useState(currentCompetenciaInput())
  const [filtro, setFiltro] = useState<FiltroSituacao>('abertos')
  const [baixandoId, setBaixandoId] = useState<number | null>(null)
  const [efiConfigured, setEfiConfigured] = useState(false)
  const [pixOpen, setPixOpen] = useState(false)
  const [pixTarget, setPixTarget] = useState<PlataformaCobranca | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const compDate = competenciaToDate(competencia)

    let query = supabase
      .from('plataforma_cobranca')
      .select(
        'cobranca_id, empresa_id, plano_id, competencia, vencimento, descricao, valor, saldo, situacao, observacao, pago_em, empresa:empresa_id(id, nome, slug), plataforma_plano:plano_id(plano_id, nome)',
      )
      .order('competencia', { ascending: false })
      .order('cobranca_id', { ascending: false })
      .limit(500)

    if (compDate) {
      query = query.eq('competencia', compDate)
    }

    const [{ data, error: qError }, efi] = await Promise.all([
      query,
      getPixEfiConfigured().catch(() => ({ configured: false })),
    ])
    setEfiConfigured(efi.configured === true)
    if (qError) {
      setError(qError.message)
      setRows([])
    } else {
      setRows((data as unknown as PlataformaCobranca[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (!isSuperAdmin) return
    void load()
  }, [isSuperAdmin, competencia])

  const filtered = useMemo(() => {
    if (filtro === 'abertos') {
      return rows.filter(
        (r) =>
          r.situacao === TITULO_SITUACAO.ABERTO ||
          r.situacao === TITULO_SITUACAO.PARCIAL,
      )
    }
    if (filtro === 'pagos') {
      return rows.filter((r) => r.situacao === TITULO_SITUACAO.PAGO)
    }
    return rows
  }, [rows, filtro])

  const totalAberto = useMemo(
    () =>
      filtered
        .filter((r) => r.situacao !== TITULO_SITUACAO.PAGO)
        .reduce((s, r) => s + Number(r.saldo ?? 0), 0),
    [filtered],
  )

  async function marcarPago(row: PlataformaCobranca) {
    if (!canWrite || row.saldo <= 0) return
    const ok = await toast.confirm({
      title: 'Confirmar pagamento?',
      message: `Baixar ${formatMoney(row.saldo)} de "${row.empresa?.nome ?? 'grupo'}"?`,
      confirmLabel: 'Confirmar baixa',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return

    setBaixandoId(row.cobranca_id)
    setError(null)

    const valorPago = Number(row.saldo)
    const { error: pagError } = await supabase
      .from('plataforma_cobranca_pagamento')
      .insert({
        cobranca_id: row.cobranca_id,
        empresa_id: row.empresa_id,
        data_pagamento: new Date().toISOString().slice(0, 10),
        valor: valorPago,
        created_by: session?.user?.id ?? null,
      })

    if (pagError) {
      setBaixandoId(null)
      setError(pagError.message)
      return
    }

    const newSaldo = 0
    const { error: upError } = await supabase
      .from('plataforma_cobranca')
      .update({
        saldo: newSaldo,
        situacao: situacaoFromSaldo(row.valor, newSaldo),
        pago_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('cobranca_id', row.cobranca_id)

    setBaixandoId(null)
    if (upError) {
      setError(upError.message)
      return
    }

    toast.success('Pagamento registrado.')
    void load()
  }

  if (!isSuperAdmin) {
    return (
      <section className="panel">
        <p className="muted">Acesso restrito ao administrador da plataforma.</p>
      </section>
    )
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Cobranças da plataforma</h2>
          <p>Mensalidade dos grupos escoteiros cadastrados.</p>
        </div>
        <div className="page-header-actions actions-pair">
          <Link className="btn btn-soft" to="/plataforma/efi-pix">
            PIX Efí
          </Link>
          <Link className="btn btn-soft" to="/plataforma/planos">
            Planos
          </Link>
          {canWrite ? (
            <Link
              className="btn btn-primary btn-with-icon"
              to="/plataforma/gerar"
            >
              <AddIcon />
              Gerar cobranças
            </Link>
          ) : null}
        </div>
      </header>

      {!efiConfigured ? (
        <AlertMessage tone="info" title="PIX Efí">
          Configure as credenciais em{' '}
          <Link to="/plataforma/efi-pix">PIX Efí</Link> para gerar cobranças
          automaticamente.
        </AlertMessage>
      ) : null}

      <section className="panel">
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        <div className="form-grid form-grid-2" style={{ marginBottom: '1rem' }}>
          <div className="field">
            <label htmlFor="comp_filtro">Competência</label>
            <input
              id="comp_filtro"
              className="input"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="sit_filtro">Situação</label>
            <select
              id="sit_filtro"
              className="select"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as FiltroSituacao)}
            >
              <option value="abertos">Em aberto / parcial</option>
              <option value="pagos">Pagas</option>
              <option value="todos">Todas</option>
            </select>
          </div>
        </div>

        <p className="muted">
          Competência {formatCompetencia(competenciaToDate(competencia) ?? '')}{' '}
          · {filtered.length} registro(s)
          {filtro !== 'pagos' ? (
            <>
              {' '}
              · Saldo em aberto <strong>{formatMoney(totalAberto)}</strong>
            </>
          ) : null}
        </p>

        {loading ? (
          <div className="loading">Carregando cobranças…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">Nenhuma cobrança neste filtro.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Plano</th>
                  <th>Competência</th>
                  <th>Valor</th>
                  <th>Saldo</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.cobranca_id}>
                    <td>{row.empresa?.nome ?? `#${row.empresa_id}`}</td>
                    <td>{row.plataforma_plano?.nome ?? '—'}</td>
                    <td>{formatCompetencia(row.competencia)}</td>
                    <td>{formatMoney(row.valor)}</td>
                    <td>{formatMoney(row.saldo)}</td>
                    <td>{plataformaSituacaoLabel(row.situacao)}</td>
                    <td>
                      {canWrite &&
                      row.situacao !== TITULO_SITUACAO.PAGO &&
                      row.saldo > 0 ? (
                        <div className="actions-pair">
                          {efiConfigured ? (
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => {
                                setPixTarget(row)
                                setPixOpen(true)
                              }}
                            >
                              Gerar PIX
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-soft"
                            disabled={baixandoId === row.cobranca_id}
                            onClick={() => void marcarPago(row)}
                          >
                            {baixandoId === row.cobranca_id
                              ? 'Baixando…'
                              : 'Marcar pago'}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PixEfiCheckoutModal
        open={pixOpen}
        cobrancaId={pixTarget?.cobranca_id ?? null}
        titulo={`PIX — ${pixTarget?.empresa?.nome ?? 'grupo'}`}
        valor={Number(pixTarget?.saldo ?? 0)}
        onClose={() => {
          setPixOpen(false)
          setPixTarget(null)
        }}
        onPaid={() => {
          void load()
        }}
      />
    </>
  )
}
