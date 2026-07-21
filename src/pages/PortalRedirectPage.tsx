import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

/** Leva o usuário logado ao portal público do seu grupo. */
export function PortalRedirectPage() {
  const { empresa } = useAuth()
  const [searchParams] = useSearchParams()

  if (!empresa?.slug) {
    return (
      <section className="panel">
        <h2>Portal da Transparência</h2>
        <p className="muted">
          Seu grupo ainda não tem um slug público. Cadastre o slug em{' '}
          <strong>Grupos escoteiros</strong> para liberar o link.
        </p>
      </section>
    )
  }

  const caixa = searchParams.get('caixa')
  const qs =
    caixa != null && caixa !== ''
      ? `?caixa=${encodeURIComponent(caixa)}`
      : ''

  return <Navigate to={`/transparencia/${empresa.slug}${qs}`} replace />
}
