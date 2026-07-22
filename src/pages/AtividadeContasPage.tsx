import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { formatMoney, situacaoDespesaLabel } from '@/lib/despesas'
import { situacaoTituloLabel } from '@/lib/receitas'
import { isAssociadoLogin, staffRamoScope } from '@/lib/roles'
import {
  atividadeVisivelPara,
  type AssociadoAtividadeCtx,
} from '@/lib/atividadeVisibilidade'
import type { Atividade } from '@/types/database'

type ReceitaRow = {
  receita_id: number
  receita_descricao: string | null
  receita_emissao: string | null
  receita_vencimento: string | null
  receita_valor: number | null
  receita_saldo: number | null
  receita_situacao: number | null
  associados: { nome: string | null } | null
}

type DespesaRow = {
  despesa_id: number
  despesa_finalidade: string | null
  despesa_emissao: string | null
  despesa_vencimento: string | null
  despesa_valor: number | null
  despesa_saldo: number | null
  despesa_situacao: number | null
  fornecedor_despesa: { fordespesa_nome: string | null } | null
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function AtividadeContasPage() {
  const { id } = useParams()
  const atividadeId = Number(id)
  const { empresa, profile } = useAuth()
  const empresaId = empresa?.id
  const associadoLogin = isAssociadoLogin(profile)
  const ramoScoped = useMemo(() => staffRamoScope(profile), [profile])

  const [atividade, setAtividade] = useState<Atividade | null>(null)
  const [receitas, setReceitas] = useState<ReceitaRow[]>([])
  const [despesas, setDespesas] = useState<DespesaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!empresaId || !Number.isFinite(atividadeId) || atividadeId <= 0) {
      setLoading(false)
      setError('Atividade inválida.')
      return
    }

    let mounted = true
    void (async () => {
      setLoading(true)

      let assocCtx: AssociadoAtividadeCtx | null = null
      if (associadoLogin && profile?.registro) {
        const registroNum = Number(String(profile.registro).replace(/\D/g, ''))
        if (Number.isFinite(registroNum) && registroNum > 0) {
          const { data: assoc } = await supabase
            .from('associados')
            .select('ramo, secao, patrulha_matilha')
            .eq('empresa_id', empresaId)
            .eq('registro', registroNum)
            .maybeSingle()
          if (assoc) {
            assocCtx = {
              ramo: (assoc.ramo as number | null) ?? null,
              secao: (assoc.secao as number | null) ?? null,
              patrulha_matilha:
                (assoc.patrulha_matilha as number | null) ?? null,
            }
          }
        }
      }

      const [a, r, d] = await Promise.all([
        supabase
          .from('atividades')
          .select(
            'atividade_id, empresa_id, ramo, secao, patrulha_matilha, descricao, local, valor, created_at',
          )
          .eq('atividade_id', atividadeId)
          .eq('empresa_id', empresaId)
          .maybeSingle(),
        supabase
          .from('receitas')
          .select(
            'receita_id, receita_descricao, receita_emissao, receita_vencimento, receita_valor, receita_saldo, receita_situacao, associados(nome)',
          )
          .eq('empresa_id', empresaId)
          .eq('atividade_id', atividadeId)
          .order('receita_vencimento', { ascending: true }),
        supabase
          .from('despesas')
          .select(
            'despesa_id, despesa_finalidade, despesa_emissao, despesa_vencimento, despesa_valor, despesa_saldo, despesa_situacao, fornecedor_despesa(fordespesa_nome)',
          )
          .eq('empresa_id', empresaId)
          .eq('atividade_id', atividadeId)
          .order('despesa_vencimento', { ascending: true }),
      ])

      if (!mounted) return

      if (a.error || !a.data) {
        setError(a.error?.message ?? 'Atividade não encontrada.')
        setAtividade(null)
        setReceitas([])
        setDespesas([])
        setLoading(false)
        return
      }

      const ativ = a.data as Atividade
      if (
        ramoScoped != null &&
        ativ.ramo != null &&
        ativ.ramo !== ramoScoped
      ) {
        setError('Esta atividade não pertence ao seu ramo.')
        setAtividade(null)
        setReceitas([])
        setDespesas([])
        setLoading(false)
        return
      }

      if (associadoLogin) {
        if (!assocCtx || !atividadeVisivelPara(ativ, assocCtx)) {
          setError('Esta atividade não está disponível para o seu registro.')
          setAtividade(null)
          setReceitas([])
          setDespesas([])
          setLoading(false)
          return
        }
      }

      if (r.error || d.error) {
        setError(r.error?.message ?? d.error?.message ?? 'Falha ao carregar contas.')
        setLoading(false)
        return
      }

      setAtividade(ativ)
      setReceitas((r.data as unknown as ReceitaRow[]) ?? [])
      setDespesas((d.data as unknown as DespesaRow[]) ?? [])
      setError(null)
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, atividadeId, ramoScoped, associadoLogin, profile?.registro])

  const totais = useMemo(() => {
    const totalReceitas = receitas.reduce(
      (s, row) => s + Number(row.receita_valor ?? 0),
      0,
    )
    const totalDespesas = despesas.reduce(
      (s, row) => s + Number(row.despesa_valor ?? 0),
      0,
    )
    const recebido = receitas.reduce(
      (s, row) =>
        s +
        Math.max(
          0,
          Number(row.receita_valor ?? 0) - Number(row.receita_saldo ?? 0),
        ),
      0,
    )
    const pago = despesas.reduce(
      (s, row) =>
        s +
        Math.max(
          0,
          Number(row.despesa_valor ?? 0) - Number(row.despesa_saldo ?? 0),
        ),
      0,
    )
    const saldoTitulos = totalReceitas - totalDespesas
    const saldoCaixa = recebido - pago
    return {
      totalReceitas,
      totalDespesas,
      recebido,
      pago,
      saldoTitulos,
      saldoCaixa,
    }
  }, [receitas, despesas])

  if (!empresaId) {
    return (
      <section className="panel">
        <p className="muted">
          Seu usuário precisa estar vinculado a um grupo escoteiro.
        </p>
      </section>
    )
  }

  if (loading) {
    return <div className="loading">Carregando contas da atividade…</div>
  }

  if (!atividade) {
    return (
      <section className="panel">
        <AlertMessage tone="error" title="Atenção">
          {error ?? 'Atividade não encontrada'}
        </AlertMessage>
        <Link className="btn btn-soft" to="/atividades">
          Voltar
        </Link>
      </section>
    )
  }

  const saldoLabel =
    totais.saldoTitulos > 0.005
      ? 'Sobrou'
      : totais.saldoTitulos < -0.005
        ? 'Não sobrou (faltou)'
        : 'Zerado'

  const saldoTone =
    totais.saldoTitulos > 0.005
      ? 'ok'
      : totais.saldoTitulos < -0.005
        ? 'deficit'
        : 'zero'

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Contas da atividade</h2>
          <p>
            {atividade.descricao}
            {atividade.local ? ` · ${atividade.local}` : ''} —{' '}
            <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <div className="page-header-actions actions-pair">
          {!associadoLogin ? (
            <Link
              className="btn btn-soft"
              to={`/atividades/${atividade.atividade_id}`}
            >
              Editar
            </Link>
          ) : null}
          <Link className="btn btn-soft" to="/atividades">
            Voltar
          </Link>
        </div>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Atenção">
          {error}
        </AlertMessage>
      ) : null}

      <section className="panel atividade-contas-resumo">
        <div className="atividade-contas-grid">
          <div>
            <span className="muted">Receitas (títulos)</span>
            <strong>{formatMoney(totais.totalReceitas)}</strong>
          </div>
          <div>
            <span className="muted">Despesas (títulos)</span>
            <strong>{formatMoney(totais.totalDespesas)}</strong>
          </div>
          <div>
            <span className="muted">Recebido</span>
            <strong>{formatMoney(totais.recebido)}</strong>
          </div>
          <div>
            <span className="muted">Pago</span>
            <strong>{formatMoney(totais.pago)}</strong>
          </div>
        </div>
        <div className={`atividade-contas-saldo atividade-contas-saldo--${saldoTone}`}>
          <div>
            <span className="muted">Saldo final (receitas − despesas)</span>
            <strong>{formatMoney(totais.saldoTitulos)}</strong>
          </div>
          <p>{saldoLabel}</p>
          <p className="field-hint" style={{ margin: 0 }}>
            Caixa (recebido − pago): {formatMoney(totais.saldoCaixa)}
          </p>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Receitas</h3>
        {receitas.length === 0 ? (
          <div className="empty">Nenhuma receita vinculada a esta atividade.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Descrição</th>
                  <th>Associado</th>
                  <th>Valor</th>
                  <th>Saldo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {receitas.map((row) => (
                  <tr key={row.receita_id}>
                    <td>{formatDate(row.receita_vencimento)}</td>
                    <td>
                      {associadoLogin ? (
                        row.receita_descricao || '—'
                      ) : (
                        <Link to={`/receitas/inclusao/${row.receita_id}`}>
                          {row.receita_descricao || '—'}
                        </Link>
                      )}
                    </td>
                    <td>{row.associados?.nome || '—'}</td>
                    <td>{formatMoney(row.receita_valor)}</td>
                    <td>{formatMoney(row.receita_saldo)}</td>
                    <td>{situacaoTituloLabel(row.receita_situacao)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    <strong>Total</strong>
                  </td>
                  <td>
                    <strong>{formatMoney(totais.totalReceitas)}</strong>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h3 style={{ marginTop: 0 }}>Despesas</h3>
        {despesas.length === 0 ? (
          <div className="empty">Nenhuma despesa vinculada a esta atividade.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Finalidade</th>
                  <th>Fornecedor</th>
                  <th>Valor</th>
                  <th>Saldo</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {despesas.map((row) => (
                  <tr key={row.despesa_id}>
                    <td>{formatDate(row.despesa_vencimento)}</td>
                    <td>
                      {associadoLogin ? (
                        row.despesa_finalidade || '—'
                      ) : (
                        <Link to={`/despesas/inclusao/${row.despesa_id}`}>
                          {row.despesa_finalidade || '—'}
                        </Link>
                      )}
                    </td>
                    <td>{row.fornecedor_despesa?.fordespesa_nome || '—'}</td>
                    <td>{formatMoney(row.despesa_valor)}</td>
                    <td>{formatMoney(row.despesa_saldo)}</td>
                    <td>{situacaoDespesaLabel(row.despesa_situacao)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>
                    <strong>Total</strong>
                  </td>
                  <td>
                    <strong>{formatMoney(totais.totalDespesas)}</strong>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
