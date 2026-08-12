export type NumeroImpressoItem = {
  numero: number
  nome: string
}

type Props = {
  acaoNome: string
  empresaNome?: string | null
  dataSorteio?: string | null
  imagemUrl?: string | null
  numeros: NumeroImpressoItem[]
  className?: string
}

function formatDateBr(value: string | null | undefined) {
  if (!value) return null
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

export function AcaoNumerosImpressos({
  acaoNome,
  empresaNome,
  dataSorteio,
  imagemUrl,
  numeros,
  className,
}: Props) {
  if (numeros.length === 0) return null

  const dataLabel = formatDateBr(dataSorteio)

  return (
    <div className={`evento-convites-impressos ${className ?? ''}`.trim()}>
      <div className="evento-convites-impressos-actions no-print">
        <p className="muted" style={{ margin: 0 }}>
          Baixe ou imprima o comprovante com o(s) número(s) da ação entre
          amigos.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.print()}
        >
          {numeros.length === 1
            ? 'Baixar / imprimir número'
            : `Baixar / imprimir ${numeros.length} números`}
        </button>
      </div>

      <div className="evento-convites-print-sheet">
        {numeros.map((item) => (
          <article
            key={`${item.numero}-${item.nome}`}
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
              <h3 className="evento-convite-card-titulo">{acaoNome}</h3>
              {dataLabel ? (
                <p className="evento-convite-card-data">
                  Sorteio: {dataLabel}
                </p>
              ) : null}
              <div className="evento-convite-card-meta">
                <span className="evento-convite-card-label">Número</span>
                <strong className="evento-convite-card-numero">
                  {item.numero}
                </strong>
              </div>
              <p className="evento-convite-card-nome">{item.nome}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
