import { Link } from 'react-router-dom'

type Props = {
  title: string
  updatedAt: string
  children: React.ReactNode
}

export function LegalDocumentLayout({ title, updatedAt, children }: Props) {
  return (
    <div className="legal-page">
      <div className="legal-atmosphere" aria-hidden="true" />
      <main className="legal-shell">
        <header className="legal-header">
          <Link className="legal-back" to="/login">
            ← Voltar ao login
          </Link>
          <h1>{title}</h1>
          <p className="muted">Última atualização: {updatedAt}</p>
        </header>
        <article className="legal-content">{children}</article>
        <nav className="legal-foot-nav" aria-label="Documentos legais">
          <Link to="/termos-de-uso">Termos de Uso</Link>
          <Link to="/politica-de-privacidade">Política de Privacidade</Link>
        </nav>
      </main>
    </div>
  )
}
