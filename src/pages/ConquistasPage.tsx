import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AddIcon } from '@/components/AddIcon'
import { ConquistasPanel } from '@/components/ConquistasPanel'
import { useFlashSuccess } from '@/hooks/useFlashSuccess'
import { isAssociadoLogin } from '@/lib/roles'

export function ConquistasPage() {
  const { empresa, profile, hasPermission } = useAuth()
  const empresaId = empresa?.id
  /** Login por registro: só visualiza o painel. */
  const associadoLogin = isAssociadoLogin(profile)
  const canCadastrar =
    !associadoLogin && hasPermission('associados.write')
  const flashTick = useFlashSuccess()

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
        {canCadastrar ? (
          <Link className="btn btn-primary" to="/conquistas/novo">
            <AddIcon /> Cadastrar
          </Link>
        ) : null}
      </header>

      <ConquistasPanel
        empresaId={empresaId}
        alwaysOpen
        reloadToken={flashTick}
      />
    </>
  )
}
