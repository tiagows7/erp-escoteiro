type Props = {
  title: string
  description: string
  /** Origem no Delphi, se conhecida */
  delphiUnit?: string
  /** Itens previstos neste módulo */
  planned?: string[]
}

export function PlaceholderPage({
  title,
  description,
  delphiUnit,
  planned = ['Listagem', 'Cadastro / edição', 'Filtros por grupo'],
}: Props) {
  return (
    <>
      <header className="page-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="badge badge-construction">Em construção</span>
      </header>

      <section className="panel placeholder-panel">
        <div className="placeholder-hero">
          <div className="placeholder-icon" aria-hidden="true" />
          <div>
            <h3>Módulo em construção</h3>
            <p className="muted">
              Esta tela já está no menu e na rota. Em breve será portada do
              sistema Delphi/D2Bridge.
            </p>
            {delphiUnit ? (
              <p className="field-hint">Referência Delphi: {delphiUnit}</p>
            ) : null}
          </div>
        </div>

        <div className="placeholder-planned">
          <p className="form-section-title">Previsto neste módulo</p>
          <ul>
            {planned.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}
