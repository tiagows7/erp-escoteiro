import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'

const LOGIN_KEY = 'erp-escoteiro:last-login'

function mapAuthError(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid_credentials') ||
    lower.includes('email not confirmed')
  ) {
    return 'E-mail/registro ou senha incorretos.'
  }
  if (lower.includes('registro não encontrado') || lower.includes('registro nao encontrado')) {
    return message
  }
  if (lower.includes('email rate limit') || lower.includes('too many requests')) {
    return 'Muitas tentativas. Aguarde um momento e tente de novo.'
  }
  if (lower.includes('network') || lower.includes('failed to fetch')) {
    return 'Não foi possível conectar. Verifique sua internet.'
  }
  if (lower.includes('invalid api key') || lower.includes('jwt')) {
    return 'Configuração do sistema inválida. Contate o administrador.'
  }
  return message || 'Não foi possível entrar. Tente novamente.'
}

export function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(LOGIN_KEY)
    if (saved) setLogin(saved)
  }, [])

  if (!loading && session) {
    return <Navigate to="/" replace />
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const trimmedLogin = login.trim()
    const result = await signIn(trimmedLogin, password)

    if (result.error) {
      setError(mapAuthError(result.error))
      setSubmitting(false)
      return
    }

    localStorage.setItem(LOGIN_KEY, trimmedLogin)
    setSubmitting(false)
  }

  return (
    <div className="login-page">
      <div className="login-sky" aria-hidden="true">
        <span className="login-star login-star-a" />
        <span className="login-star login-star-b" />
        <span className="login-star login-star-c" />
        <span className="login-star login-star-d" />
      </div>

      <div className="login-stage">
        <div className="login-row">
          <div className="login-brand">
            <img
              className="login-logo"
              src="/logo-erp.png"
              alt="ERP Escoteiro"
              width={260}
              height={260}
            />
          </div>

          <form className="login-card" onSubmit={(e) => void onSubmit(e)}>
            <p className="login-lead">Acesse o painel do seu grupo</p>

            {error ? (
              <AlertMessage tone="error" title="Não foi possível entrar">
                {error}
              </AlertMessage>
            ) : null}

            <div className="field">
              <label htmlFor="login">E-mail ou nº de registro</label>
              <input
                id="login"
                className="input"
                type="text"
                autoComplete="username"
                inputMode="email"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                disabled={submitting}
                required
                placeholder="ex.: 12345 ou nome@email.com"
              />
            </div>

            <div className="field">
              <label htmlFor="password">Senha</label>
              <div className="password-field">
                <input
                  id="password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  required
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={submitting}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <button
              className="btn btn-primary login-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <span className="btn-loading">
                  <span className="spinner" aria-hidden="true" />
                  Entrando…
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
        </div>

        <div className="login-tagline-wrap">
          <p className="login-tagline">
            ERP Escoteiro — Organizando o seu grupo
          </p>
        </div>
      </div>

      <p className="login-footer">ERP Escoteiro · Grupo Escoteiro</p>
    </div>
  )
}
