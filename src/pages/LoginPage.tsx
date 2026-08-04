import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { AlertMessage } from '@/components/AlertMessage'
import { buildWhatsAppUrl } from '@/lib/whatsapp'

const CONTATO_WHATSAPP = '51984158948'
const CONTATO_WHATSAPP_URL =
  buildWhatsAppUrl({
    phone: CONTATO_WHATSAPP,
    text: 'Olá! Gostaria de saber mais sobre o ERP Escoteiro.',
  }) ?? `https://wa.me/55${CONTATO_WHATSAPP}`

const LOGIN_KEY = 'erp-escoteiro:last-login'

const SISTEMA_DESTAQUES = [
  {
    titulo: 'Associados e estrutura',
    texto: 'Cadastro, seções, ramos e visão clara do efetivo do grupo.',
  },
  {
    titulo: 'Financeiro e mensalidades',
    texto: 'Receitas, despesas, geração de mensalidades e acompanhamento.',
  },
  {
    titulo: 'Atividades e conquistas',
    texto: 'Confirmações, pagamentos e registro das conquistas máximas.',
  },
  {
    titulo: 'Portal da Transparência',
    texto: 'Publicação dos números do caixa para a comunidade do grupo.',
  },
] as const

function mapAuthError(message: string): string {
  const lower = message.toLowerCase()
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid_credentials') ||
    lower.includes('email not confirmed')
  ) {
    return 'E-mail/registro ou senha incorretos.'
  }
  if (
    lower.includes('registro não encontrado') ||
    lower.includes('registro nao encontrado')
  ) {
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

  if (loading) {
    return <div className="loading">Carregando sessão…</div>
  }

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
      <div className="login-atmosphere" aria-hidden="true">
        <div className="login-glow login-glow-a" />
        <div className="login-glow login-glow-b" />
        <div className="login-grid" />
      </div>

      <main className="login-shell">
        <div className="login-pair">
          <section className="login-intro">
            <div className="login-logo-wrap">
              <img
                className="login-logo"
                src="/logo-erp.png"
                alt="ERP Escoteiro"
                width={320}
                height={320}
              />
            </div>
            <div className="login-brand-copy">
              <p className="login-kicker">Sistema de gestão escoteira</p>
              <h1 className="login-brand-title">ERP Escoteiro</h1>
              <p className="login-intro-lead">
                Organize associados, finanças, atividades e a transparência do
                seu grupo em um só lugar.
              </p>
            </div>
          </section>

          <section className="login-access">
            <form
              className="login-card"
              onSubmit={(e) => void onSubmit(e)}
              aria-labelledby="login-form-title"
            >
              <div className="login-card-head">
                <h2 id="login-form-title">Entrar</h2>
                <p>
                  Use e-mail da equipe ou o número de registro do associado.
                </p>
              </div>

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
                    aria-label={
                      showPassword ? 'Ocultar senha' : 'Mostrar senha'
                    }
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
                  'Acessar o sistema'
                )}
              </button>
            </form>
          </section>
        </div>

        <ul className="login-features">
          {SISTEMA_DESTAQUES.map((item) => (
            <li key={item.titulo}>
              <strong>{item.titulo}</strong>
              <span>{item.texto}</span>
            </li>
          ))}
        </ul>

        <aside className="login-whatsapp">
          <p>Dúvidas ou interesse no sistema?</p>
          <a
            className="btn login-whatsapp-btn"
            href={CONTATO_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Falar no WhatsApp
          </a>
        </aside>
      </main>

      <footer className="login-footer">
        <p>ERP Escoteiro · Gestão digital para grupos escoteiros</p>
        <nav className="login-footer-links" aria-label="Documentos legais">
          <Link to="/termos-de-uso">Termos de Uso</Link>
          <span aria-hidden="true">·</span>
          <Link to="/politica-de-privacidade">Política de Privacidade</Link>
        </nav>
      </footer>
    </div>
  )
}
