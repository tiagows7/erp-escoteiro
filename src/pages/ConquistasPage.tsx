import { useAuth } from '@/contexts/AuthContext'
import { ConquistasPanel } from '@/components/ConquistasPanel'

export function ConquistasPage() {
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
          <h2>Conquistas</h2>
          <p>
            Conquistas máximas dos associados —{' '}
            <strong>{empresa?.nome}</strong>
          </p>
        </div>
      </header>

      <ConquistasPanel empresaId={empresaId} alwaysOpen />
    </>
  )
}
