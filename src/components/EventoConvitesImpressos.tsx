export type ConviteImpressoItem = {
  numero: number
  nome: string
}

type Props = {
  eventoNome: string
  empresaNome?: string | null
  dataEvento?: string | null
  imagemUrl?: string | null
  convites: ConviteImpressoItem[]
  className?: string
}

function formatDateBr(value: string | null | undefined) {
  if (!value) return null
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function EventoConvitesImpressos({
  eventoNome,
  empresaNome,
  dataEvento,
  imagemUrl,
  convites,
  className,
}: Props) {
  if (convites.length === 0) return null

  const dataLabel = formatDateBr(dataEvento)

  return (
    <div className={`evento-convites-impressos ${className ?? ''}`.trim()}>
      <div className="evento-convites-impressos-actions no-print">
        <p className="muted" style={{ margin: 0 }}>
          Baixe ou imprima o(s) convite(s) para apresentar no dia do evento.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.print()}
        >
          {convites.length === 1
            ? 'Baixar / imprimir convite'
            : `Baixar / imprimir ${convites.length} convites`}
        </button>
      </div>

      <div className="evento-convites-print-sheet">
        {convites.map((c) => (
          <article
            key={`${c.numero}-${c.nome}`}
            className={`evento-convite-card${imagemUrl ? ' has-img' : ''}`}
          >
            {imagemUrl ? (
              <img
                className="evento-convite-card-img"
                src={imagemUrl}
                alt=""
              />
            ) : null}
            <div className="evento-convite-card-body">
              {empresaNome ? (
                <p className="evento-convite-card-empresa">{empresaNome}</p>
              ) : null}
              <h3 className="evento-convite-card-titulo">{eventoNome}</h3>
              {dataLabel ? (
                <p className="evento-convite-card-data">{dataLabel}</p>
              ) : null}
              <div className="evento-convite-card-meta">
                <span className="evento-convite-card-label">Convite nº</span>
                <strong className="evento-convite-card-numero">{c.numero}</strong>
              </div>
              <p className="evento-convite-card-nome">{c.nome}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
