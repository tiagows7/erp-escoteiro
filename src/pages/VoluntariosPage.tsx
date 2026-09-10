import { useAuth } from '@/contexts/AuthContext'
import { VoluntariosPanel } from '@/components/VoluntariosPanel'

export function VoluntariosPage() {
  const { empresa } = useAuth()
  const empresaId = empresa?.id

  if (!empresaId) {
    return (
      <section className="panel">
        <p className="muted">
          Seu usuário precisa estar vinculado a um grupo escoteiro.
        </p>
      </section>
    )
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h2>Voluntários</h2>
          <p>
            Dirigentes e escotistas do grupo —{' '}
            <strong>{empresa?.nome}</strong>
          </p>
        </div>
      </header>

      <VoluntariosPanel empresaId={empresaId} />
    </>
  )
}
