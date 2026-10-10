import { formatMoney, formatPortalDate } from '@/lib/portal'

export type PortalSaldoMovimentoLinha = {
  local_id: number
  local_nome: string
  local_valor: number | null
  secao_nome: string | null
  ordem: number | null
  movimento_id: number | null
  data_movimento: string | null
  saldo_anterior: number | null
  valor_aplicado: number | null
  valor_resgatado: number | null
  valor_creditos: number | null
  valor_debitos: number | null
  saldo_final: number | null
}

type Movimento = {
  id: number
  data: string
  saldoAnterior: number
  aplicado: number
  resgatado: number
  creditos: number
  debitos: number
  saldoFinal: number
}

type LocalCard = {
  id: number
  nome: string
  secaoNome: string | null
  valor: number
  movimentos: Movimento[]
}

function agrupar(linhas: PortalSaldoMovimentoLinha[]): LocalCard[] {
  const mapa = new Map<number, LocalCard>()
  for (const linha of linhas) {
    let local = mapa.get(linha.local_id)
    if (!local) {
      local = {
        id: linha.local_id,
        nome: linha.local_nome,
        secaoNome: linha.secao_nome,
        valor: Number(linha.local_valor ?? 0),
        movimentos: [],
      }
      mapa.set(linha.local_id, local)
    }
    if (linha.movimento_id != null) {
      local.movimentos.push({
        id: linha.movimento_id,
        data: linha.data_movimento ?? '',
        saldoAnterior: Number(linha.saldo_anterior ?? 0),
        aplicado: Number(linha.valor_aplicado ?? 0),
        resgatado: Number(linha.valor_resgatado ?? 0),
        creditos: Number(linha.valor_creditos ?? 0),
        debitos: Number(linha.valor_debitos ?? 0),
        saldoFinal: Number(linha.saldo_final ?? 0),
      })
    }
  }
  return [...mapa.values()]
}

export function PortalSaldoLocaisPainel({
  linhas,
}: {
  linhas: PortalSaldoMovimentoLinha[]
}) {
  const locais = agrupar(linhas)
  if (locais.length === 0) return null

  return (
    <>
      {locais.map((local) => {
        const ultimo = local.movimentos[local.movimentos.length - 1]
        const saldo = ultimo ? ultimo.saldoFinal : local.valor
        return (
          <section key={local.id} className="panel portal-panel">
            <div className="passagem-header">
              <div>
                <h3>{local.nome}</h3>
                <p className="muted">
                  {local.secaoNome
                    ? `${local.secaoNome} · movimento do período`
                    : 'Movimento do período'}
                </p>
              </div>
              <div className={saldo < 0 ? 'badge badge-danger' : 'badge'}>
                {formatMoney(saldo)}
              </div>
            </div>
            {local.movimentos.length === 0 ? (
              <div className="empty">Nenhum movimento neste período.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Saldo anterior</th>
                      <th>Aplicado</th>
                      <th>Resgatado</th>
                      <th>Créditos</th>
                      <th>Débitos</th>
                      <th>Saldo final</th>
                    </tr>
                  </thead>
                  <tbody>
                    {local.movimentos.map((movimento) => (
                      <tr key={movimento.id}>
                        <td>{formatPortalDate(movimento.data)}</td>
                        <td>{formatMoney(movimento.saldoAnterior)}</td>
                        <td>{formatMoney(movimento.aplicado)}</td>
                        <td>{formatMoney(movimento.resgatado)}</td>
                        <td>{formatMoney(movimento.creditos)}</td>
                        <td>{formatMoney(movimento.debitos)}</td>
                        <td>{formatMoney(movimento.saldoFinal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}
