import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { PixEfiCheckoutModal } from '@/components/PixEfiCheckoutModal'
import {
  formatMoney,
  plataformaSituacaoLabel,
  TITULO_SITUACAO,
  type PlataformaCobranca,
} from '@/lib/plataforma'
import { formatCompetencia } from '@/lib/receitas'
import {
  PLATAFORMA_AVISO_DIAS,
  PLATAFORMA_GRACA_DIAS,
} from '@/lib/plataformaAcesso'
import { getPixEfiConfigured } from '@/lib/pixEfi'
import { supabase } from '@/lib/supabase'

export function MensalidadePlataformaGrupoPage() {
  const {
    empresa,
    isSuperAdmin,
    plataformaAcesso,
    refreshPlataformaAcesso,
    signOut,
  } = useAuth()
  const [rows, setRows] = useState<PlataformaCobranca[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [efiOk, setEfiOk] = useState(false)
  const [pixOpen, setPixOpen] = useState(false)
  const [pixTarget, setPixTarget] = useState<PlataformaCobranca | null>(null)

  async function load() {
    if (!empresa?.id) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: qErr } = await supabase
      .from('plataforma_cobranca')
      .select(
        'cobranca_id, empresa_id, plano_id, competencia, vencimento, descricao, valor, saldo, situacao, observacao, pago_em, plataforma_plano:plano_id(plano_id, nome)',
      )
      .eq('empresa_id', empresa.id)
      .order('competencia', { ascending: false })
      .limit(24)

    if (qErr) {
      setError(qErr.message)
      setRows([])
    } else {
      setRows((data as unknown as PlataformaCobranca[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
    void getPixEfiConfigured().then((r) => setEfiOk(r.configured))
  }, [empresa?.id])

  if (isSuperAdmin) {
    return (
      <section className="panel">
        <p className="muted">
          Super admin gerencia cobranças em{' '}
          <Link to="/plataforma/cobrancas">Mensalidade plataforma</Link>.
        </p>
      </section>
    )
  }

  const blocked = plataformaAcesso.nivel === 'bloqueado'
  const isento = empresa?.plataforma_isento === true
  const semPlano = empresa?.plataforma_plano_id == null

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Mensalidade da plataforma</h2>
          <p>
            Cobrança do uso do sistema ERP Escoteiro para o grupo
            {empresa?.nome ? ` ${empresa.nome}` : ''}.
          </p>
        </div>
      </header>

      {blocked ? (
        <AlertMessage tone="error" title="Acesso bloqueado">
          <p style={{ margin: 0 }}>
            {plataformaAcesso.mensagem ??
              'Quite a mensalidade para liberar o sistema.'}
          </p>
          <p className="muted" style={{ margin: '0.5rem 0 0' }}>
            Após o vencimento há {PLATAFORMA_GRACA_DIAS} dias de tolerância.
            Aviso começa {PLATAFORMA_AVISO_DIAS} dias antes do vencimento.
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: '0.75rem' }}
            onClick={() => void signOut()}
          >
            Sair
          </button>
        </AlertMessage>
      ) : null}

      {!blocked && plataformaAcesso.nivel === 'aviso' && plataformaAcesso.mensagem ? (
        <AlertMessage tone="info" title="Atenção">
          {plataformaAcesso.mensagem}
        </AlertMessage>
      ) : null}

      {isento ? (
        <AlertMessage tone="success" title="Isento">
          Este grupo está isento da mensalidade da plataforma.
        </AlertMessage>
      ) : null}

      {semPlano && !isento ? (
        <AlertMessage tone="info" title="Sem plano">
          Nenhum plano de mensalidade está vinculado a este grupo.
        </AlertMessage>
      ) : null}

      {empresa?.plataforma_dia_vencimento ? (
        <p className="muted">
          Dia de vencimento cadastrado: dia{' '}
          {empresa.plataforma_dia_vencimento} de cada mês.
        </p>
      ) : null}

      <section className="panel">
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}
        {loading ? (
          <p className="muted">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="muted">Nenhuma cobrança encontrada.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Competência</th>
                  <th>Vencimento</th>
                  <th>Plano</th>
                  <th>Valor</th>
                  <th>Saldo</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const podePagar =
                    row.situacao !== TITULO_SITUACAO.PAGO &&
                    Number(row.saldo) > 0
                  return (
                    <tr key={row.cobranca_id}>
                      <td>{formatCompetencia(row.competencia)}</td>
                      <td>
                        {row.vencimento
                          ? new Date(
                              `${row.vencimento.slice(0, 10)}T12:00:00`,
                            ).toLocaleDateString('pt-BR')
                          : '—'}
                      </td>
                      <td>{row.plataforma_plano?.nome ?? '—'}</td>
                      <td>{formatMoney(row.valor)}</td>
                      <td>{formatMoney(row.saldo)}</td>
                      <td>{plataformaSituacaoLabel(row.situacao)}</td>
                      <td>
                        {podePagar && efiOk ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                              setPixTarget(row)
                              setPixOpen(true)
                            }}
                          >
                            Pagar com PIX
                          </button>
                        ) : podePagar ? (
                          <span className="muted">
                            Aguarde baixa pelo administrador
                          </span>
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

      <PixEfiCheckoutModal
        open={pixOpen}
        cobrancaId={pixTarget?.cobranca_id ?? null}
        titulo={`PIX — ${pixTarget?.descricao ?? 'mensalidade'}`}
        valor={Number(pixTarget?.saldo ?? 0)}
        onClose={() => {
          setPixOpen(false)
          setPixTarget(null)
        }}
        onPaid={() => {
          void load()
          void refreshPlataformaAcesso()
        }}
      />
    </>
  )
}
