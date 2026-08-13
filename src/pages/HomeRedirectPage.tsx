import { Navigate } from 'react-router-dom'

/** Entrada do app: sempre abre o Dashboard. */
export function HomeRedirectPage() {
  return <Navigate to="/dashboard" replace />
}
