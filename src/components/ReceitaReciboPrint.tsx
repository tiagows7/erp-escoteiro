import { useEffect } from 'react'
import { formatMoney } from '@/lib/receitas'

export type ReceitaReciboData = {
  empresaNome: string
  empresaLogoUrl?: string | null
  receitaId: number
  descricao: string
  associadoNome?: string | null
  valor: number
  dataPagamento: string
  tipoPagamento?: string | null
  observacao?: string | null
  emitidoEm?: string
}

function formatDateBR(value: string | null | undefined) {
  if (!value) return '—'
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

function formatDateTimeBR(value: string | Date) {
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type Props = {
  data: ReceitaReciboData
  onClose: () => void
  autoPrint?: boolean
}

/** Recibo de pagamento para impressão / entrega ao pagador. */
export function ReceitaReciboPrint({
  data,
  onClose,
  autoPrint = true,
}: Props) {
  useEffect(() => {
    if (!autoPrint) return
    const t = window.setTimeout(() => window.print(), 350)
    return () => window.clearTimeout(t)
  }, [autoPrint])

  return (
    <section className="panel receita-recibo-impressao">
      <div className="receita-recibo-actions no-print">
        <div>
          <h3 style={{ margin: 0 }}>Recibo de pagamento</h3>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            Pronto para imprimir e entregar.
          </p>
        </div>
        <div className="actions-pair">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.print()}
          >
            Imprimir
          </button>
          <button type="button" className="btn btn-soft" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>

      <div className="receita-recibo-sheet">
        <header className="receita-recibo-cabecalho">
          {data.empresaLogoUrl ? (
            <img
              className="receita-recibo-logo"
              src={data.empresaLogoUrl}
              alt=""
            />
          ) : null}
          <div>
            <p className="receita-recibo-empresa">{data.empresaNome}</p>
            <h2 className="receita-recibo-titulo">Recibo de pagamento</h2>
            <p className="receita-recibo-numero">
              Receita nº {data.receitaId}
            </p>
          </div>
        </header>

        <p className="receita-recibo-texto">
          Recebemos de{' '}
          <strong>{data.associadoNome?.trim() || 'Pagador não informado'}</strong>{' '}
          a importância de <strong>{formatMoney(data.valor)}</strong>
          {data.tipoPagamento ? (
            <>
              {' '}
              via <strong>{data.tipoPagamento}</strong>
            </>
          ) : null}
          , referente a:
        </p>

        <p className="receita-recibo-descricao">{data.descricao}</p>

        <dl className="receita-recibo-meta">
          <div>
            <dt>Data do pagamento</dt>
            <dd>{formatDateBR(data.dataPagamento)}</dd>
          </div>
          <div>
            <dt>Valor</dt>
            <dd>{formatMoney(data.valor)}</dd>
          </div>
          {data.tipoPagamento ? (
            <div>
              <dt>Forma de pagamento</dt>
              <dd>{data.tipoPagamento}</dd>
            </div>
          ) : null}
          {data.observacao ? (
            <div>
              <dt>Observação</dt>
              <dd>{data.observacao}</dd>
            </div>
          ) : null}
        </dl>

        <footer className="receita-recibo-rodape">
          <p>
            Emitido em{' '}
            {formatDateTimeBR(data.emitidoEm ?? new Date().toISOString())}
          </p>
          <div className="receita-recibo-assinatura">
            <span>Assinatura / carimbo do grupo</span>
          </div>
        </footer>
      </div>
    </section>
  )
}
