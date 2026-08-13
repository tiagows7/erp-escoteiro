import { useAuth } from '@/contexts/AuthContext'

export function LojaPage() {
  const { empresa } = useAuth()

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Loja</h2>
          <p>
            Produtos e vendas da loja do grupo
            {empresa?.nome ? (
              <>
                {' '}
                — <strong>{empresa.nome}</strong>
              </>
            ) : null}
          </p>
        </div>
        <span className="badge badge-construction">Em construção</span>
      </header>

      <section className="panel">
        <p className="muted">
          Em breve você poderá cadastrar produtos, estoque e vendas da loja
          por aqui.
        </p>
      </section>
    </>
  )
}
