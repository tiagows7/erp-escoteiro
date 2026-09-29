import { Fragment } from 'react'
import { formatMoney, type PortalPlanoLinha } from '@/lib/portal'

function contaLabel(codigo: string | null, nome: string | null) {
  if (codigo && nome) return `${codigo} — ${nome}`
  return nome || 'Sem conta'
}

function soma(rows: PortalPlanoLinha[]) {
  return rows.reduce((total, row) => total + Number(row.total ?? 0), 0)
}

export function PortalPlanoContasPainel({
  linhas,
}: {
  linhas: PortalPlanoLinha[]
}) {
  const receitas = linhas.filter((row) => row.lado === 'receita')
  const despesas = linhas.filter((row) => row.lado === 'despesa')
  const totalReceitas = soma(receitas)
  const totalDespesas = soma(despesas)

  const despesasPorConta: {
    key: string
    label: string
    rows: PortalPlanoLinha[]
  }[] = []
  for (const row of despesas) {
    const label = contaLabel(row.plano_codigo, row.plano_nome)
    const atual = despesasPorConta[despesasPorConta.length - 1]
    if (atual && atual.label === label) {
      atual.rows.push(row)
    } else {
      despesasPorConta.push({
        key: `${row.plano_codigo ?? ''}|${label}`,
        label,
        rows: [row],
      })
    }
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
                </tr>
              </thead>
              <tbody>
                {receitas.map((row) => (
                  <tr key={`${row.plano_codigo ?? 'sem'}|${row.plano_nome}`}>
                    <td>{contaLabel(row.plano_codigo, row.plano_nome)}</td>
                    <td>{row.qtd}</td>
                    <td>{formatMoney(row.total)}</td>
                  </tr>
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
                    </tr>
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
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
