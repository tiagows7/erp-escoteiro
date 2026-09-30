import { Fragment, useState } from 'react'
import { DocumentosLinks } from '@/components/DocumentosLinks'
import {
  formatMoney,
  formatPortalDate,
  origemReceitaLabel,
  situacaoTituloLabel,
  type PortalPlanoLinha,
  type PortalPlanoTitulo,
} from '@/lib/portal'
import { supabase } from '@/lib/supabase'

function contaLabel(codigo: string | null, nome: string | null) {
  if (codigo && nome) return `${codigo} — ${nome}`
  return nome || 'Sem conta'
}

function soma(rows: PortalPlanoLinha[]) {
  return rows.reduce((total, row) => total + Number(row.total ?? 0), 0)
}

function chave(lado: 'receita' | 'despesa', planoContaId: number | null) {
  return `${lado}:${planoContaId ?? 'sem'}`
}

type Detalhe = {
  loading: boolean
  error: string | null
  rows: PortalPlanoTitulo[]
}

export function PortalPlanoContasPainel({
  linhas,
  slug,
  ano,
  mes,
  caixa,
  secaoId,
  showRamoCol,
}: {
  linhas: PortalPlanoLinha[]
  slug: string
  ano: number
  mes: number | null
  caixa: number
  secaoId: number | null
  showRamoCol: boolean
}) {
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const [detalhes, setDetalhes] = useState<Record<string, Detalhe>>({})

  const receitas = linhas.filter((row) => row.lado === 'receita')
  const despesas = linhas.filter((row) => row.lado === 'despesa')
  const totalReceitas = soma(receitas)
  const totalDespesas = soma(despesas)

  const despesasPorConta: {
    key: string
    label: string
    planoContaId: number | null
    rows: PortalPlanoLinha[]
  }[] = []
  for (const row of despesas) {
    const label = contaLabel(row.plano_codigo, row.plano_nome)
    const atual = despesasPorConta[despesasPorConta.length - 1]
    if (atual && atual.label === label && atual.planoContaId === row.plano_conta_id) {
      atual.rows.push(row)
    } else {
      despesasPorConta.push({
        key: chave('despesa', row.plano_conta_id),
        label,
        planoContaId: row.plano_conta_id,
        rows: [row],
      })
    }
  }

  async function alternar(
    lado: 'receita' | 'despesa',
    planoContaId: number | null,
  ) {
    const key = chave(lado, planoContaId)
    if (abertos[key]) {
      setAbertos((prev) => ({ ...prev, [key]: false }))
      return
    }
    setAbertos((prev) => ({ ...prev, [key]: true }))
    if (detalhes[key] && !detalhes[key].error) return

    setDetalhes((prev) => ({
      ...prev,
      [key]: { loading: true, error: null, rows: [] },
    }))
    const { data, error } = await supabase.rpc('portal_plano_titulos', {
      p_slug: slug,
      p_ano: ano,
      p_caixa: caixa,
      p_secao: secaoId,
      p_mes: mes,
      p_lado: lado,
      p_plano_conta_id: planoContaId,
    })
    setDetalhes((prev) => ({
      ...prev,
      [key]: error
        ? { loading: false, error: error.message, rows: [] }
        : {
            loading: false,
            error: null,
            rows: (data as PortalPlanoTitulo[]) ?? [],
          },
    }))
  }

  function botaoAbrir(
    lado: 'receita' | 'despesa',
    planoContaId: number | null,
  ) {
    const key = chave(lado, planoContaId)
    const aberto = !!abertos[key]
    return (
      <button
        type="button"
        className="btn btn-soft portal-plano-abrir"
        onClick={() => void alternar(lado, planoContaId)}
      >
        {aberto ? 'Fechar' : 'Abrir'}
      </button>
    )
  }

  function detalhe(lado: 'receita' | 'despesa', planoContaId: number | null) {
    const key = chave(lado, planoContaId)
    if (!abertos[key]) return null
    const info = detalhes[key]
    return (
      <tr>
        <td className="portal-plano-detalhe" colSpan={lado === 'receita' ? 4 : 5}>
          {info?.loading ? (
            <p className="field-hint">Carregando títulos…</p>
          ) : info?.error ? (
            <p className="field-hint">{info.error}</p>
          ) : !info || info.rows.length === 0 ? (
            <p className="field-hint">Nenhum título nesta conta.</p>
          ) : lado === 'receita' ? (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Emissão</th>
                    <th>Competência</th>
                    <th>Descrição</th>
                    <th>Origem</th>
                    {showRamoCol ? <th>Ramo</th> : null}
                    <th>Valor</th>
                    <th>Saldo</th>
                    <th>Situação</th>
                    <th>Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {info.rows.map((row) => (
                    <tr key={row.lancamento_id}>
                      <td>{formatPortalDate(row.emissao)}</td>
                      <td>{formatPortalDate(row.competencia)}</td>
                      <td>{row.descricao || '—'}</td>
                      <td>{origemReceitaLabel(row.origem)}</td>
                      {showRamoCol ? <td>{row.ramo_nome || 'Grupo'}</td> : null}
                      <td>{formatMoney(row.valor)}</td>
                      <td>{formatMoney(row.saldo)}</td>
                      <td>{situacaoTituloLabel(row.situacao)}</td>
                      <td>
                        <DocumentosLinks value={row.documento} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Emissão</th>
                    <th>Finalidade</th>
                    <th>Fornecedor</th>
                    {showRamoCol ? <th>Ramo</th> : null}
                    <th>Valor</th>
                    <th>Saldo</th>
                    <th>Situação</th>
                    <th>Documento</th>
                  </tr>
                </thead>
                <tbody>
                  {info.rows.map((row) => (
                    <tr key={row.lancamento_id}>
                      <td>{formatPortalDate(row.emissao)}</td>
                      <td>{row.descricao || '—'}</td>
                      <td>{row.fornecedor_nome || '—'}</td>
                      {showRamoCol ? <td>{row.ramo_nome || 'Grupo'}</td> : null}
                      <td>{formatMoney(row.valor)}</td>
                      <td>{formatMoney(row.saldo)}</td>
                      <td>{situacaoTituloLabel(row.situacao)}</td>
                      <td>
                        <DocumentosLinks value={row.documento} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="portal-secao-groups">
      <section className="portal-secao-group">
        <h3>Receitas por plano de contas</h3>
        {receitas.length === 0 ? (
          <div className="empty">Nenhuma receita recebida neste caixa/período.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Plano de contas</th>
                  <th>Títulos</th>
                  <th>Recebido</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {receitas.map((row) => (
                  <Fragment key={chave('receita', row.plano_conta_id)}>
                    <tr>
                      <td>{contaLabel(row.plano_codigo, row.plano_nome)}</td>
                      <td>{row.qtd}</td>
                      <td>{formatMoney(row.total)}</td>
                      <td>{botaoAbrir('receita', row.plano_conta_id)}</td>
                    </tr>
                    {detalhe('receita', row.plano_conta_id)}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    <strong>Total das receitas</strong>
                  </td>
                  <td>
                    <strong>
                      {receitas.reduce((n, row) => n + Number(row.qtd ?? 0), 0)}
                    </strong>
                  </td>
                  <td>
                    <strong>{formatMoney(totalReceitas)}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="portal-secao-group">
        <h3>Despesas por plano de contas</h3>
        <p className="field-hint">
          Cada linha soma o que foi pago para o fornecedor informado naquela
          conta.
        </p>
        {despesasPorConta.length === 0 ? (
          <div className="empty">Nenhuma despesa paga neste caixa/período.</div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Plano de contas</th>
                  <th>Fornecedor</th>
                  <th>Títulos</th>
                  <th>Pago</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {despesasPorConta.map((grupo) => (
                  <Fragment key={grupo.key}>
                    {grupo.rows.map((row, index) => (
                      <tr key={`${grupo.key}|${row.fornecedor_nome}|${index}`}>
                        <td>{index === 0 ? grupo.label : ''}</td>
                        <td>{row.fornecedor_nome || 'Sem fornecedor'}</td>
                        <td>{row.qtd}</td>
                        <td>{formatMoney(row.total)}</td>
                        <td>
                          {index === 0
                            ? botaoAbrir('despesa', grupo.planoContaId)
                            : null}
                        </td>
                      </tr>
                    ))}
                    <tr className="portal-plano-subtotal">
                      <td colSpan={2}>
                        <strong>Total {grupo.label}</strong>
                      </td>
                      <td>
                        <strong>
                          {grupo.rows.reduce(
                            (n, row) => n + Number(row.qtd ?? 0),
                            0,
                          )}
                        </strong>
                      </td>
                      <td>
                        <strong>{formatMoney(soma(grupo.rows))}</strong>
                      </td>
                      <td />
                    </tr>
                    {detalhe('despesa', grupo.planoContaId)}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>
                    <strong>Total das despesas</strong>
                  </td>
                  <td>
                    <strong>
                      {despesas.reduce((n, row) => n + Number(row.qtd ?? 0), 0)}
                    </strong>
                  </td>
                  <td>
                    <strong>{formatMoney(totalDespesas)}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
