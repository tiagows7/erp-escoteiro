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
    texto: 'Cadastro, seções, ramos, calendário e visão clara do efetivo.',
  },
  {
    titulo: 'Financeiro e mensalidades',
    texto: 'Receitas, despesas, geração de mensalidades e PIX Sicredi.',
  },
  {
    titulo: 'Estoque e produtos',
    texto: 'Cadastro, saldo atual, acertos e ficha com histórico de movimentos.',
  },
  {
    titulo: 'Loja do grupo (PDV)',
    texto: 'Venda rápida com baixa de estoque, caixa do dia e PIX na hora.',
  },
  {
    titulo: 'Eventos e campanhas',
    texto: 'Convites, ação entre amigos, InfinitePay/PIX e caixa vinculado.',
  },
  {
    titulo: 'Transparência e auditoria',
    texto: 'Portal público do grupo e trilha de alterações para controle interno.',
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

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.04 3C9.4 3 4 8.3 4 14.82c0 2.08.56 4.1 1.62 5.9L4 29l8.5-2.22a12.2 12.2 0 0 0 3.54.52h.01c6.64 0 12.04-5.3 12.04-11.82C28.09 8.3 22.68 3 16.04 3zm0 21.52h-.01a10.1 10.1 0 0 1-5.15-1.41l-.37-.22-5.04 1.32 1.35-4.9-.24-.39a10.2 10.2 0 0 1-1.58-5.45c0-5.62 4.67-10.2 10.41-10.2 5.74 0 10.4 4.58 10.4 10.2-.01 5.63-4.67 10.05-10.77 10.05zm5.72-7.64c-.31-.16-1.85-.91-2.14-1.01-.29-.11-.5-.16-.71.16-.21.31-.81 1.01-.99 1.22-.18.21-.37.23-.68.08-.31-.16-1.32-.48-2.51-1.54-.93-.82-1.55-1.83-1.73-2.14-.18-.31-.02-.48.14-.63.14-.14.31-.37.47-.55.16-.18.21-.31.31-.52.11-.21.05-.39-.03-.55-.08-.16-.71-1.7-.97-2.33-.26-.62-.52-.53-.71-.54h-.61c-.21 0-.55.08-.84.39-.29.31-1.1 1.07-1.1 2.61s1.13 3.03 1.28 3.24c.16.21 2.22 3.39 5.38 4.75.75.32 1.34.52 1.8.66.76.24 1.44.2 1.99.12.61-.09 1.85-.75 2.11-1.48.26-.72.26-1.34.18-1.48-.08-.13-.29-.21-.61-.37z"
      />
    </svg>
  )
}

export function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
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

      <header className="login-topbar">
        <h1 className="login-topbar-brand">ERP Escoteiro</h1>
        {!showLogin ? (
          <button
            type="button"
            className="btn btn-primary login-topbar-enter"
            onClick={() => setShowLogin(true)}
          >
            Entrar
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-soft login-topbar-enter"
            onClick={() => setShowLogin(false)}
          >
            Fechar
          </button>
        )}
      </header>

      <main className="login-shell">
        <div className={`login-pair${showLogin ? '' : ' login-pair-solo'}`}>
          <section className="login-intro">
            <div className="login-logo-wrap">
              <img
                className="login-logo"
                src="/logo-erp.png"
                alt="ERP Escoteiro"
                width={512}
                height={512}
              />
            </div>
            <div className="login-brand-copy">
              <h2 className="login-brand-title">
                O Escotismo evolui. A gestão também.
              </h2>
              <p className="login-intro-lead">
                Gestão simples, completa e transparente para quem faz o
                Escotismo acontecer.
              </p>
              <p className="login-intro-tagline">
                <strong>Organize. Controle. Transparência.</strong>
              </p>
              <p className="login-intro-lead">
                O ERP Escoteiro reúne tudo o que seu Grupo precisa para uma
                gestão <strong>simples, eficiente e profissional</strong>.
              </p>
              <p className="login-intro-tagline">
                <strong>
                  Mais gestão. Menos burocracia. Mais tempo para o Escotismo.
                </strong>
              </p>
            </div>
          </section>

          {showLogin ? (
            <section className="login-access" aria-label="Acesso ao sistema">
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
          ) : null}
        </div>

        <ul className="login-features">
          {SISTEMA_DESTAQUES.map((item) => (
            <li key={item.titulo}>
              <strong>{item.titulo}</strong>
              <span>{item.texto}</span>
            </li>
          ))}
        </ul>
      </main>

      <footer className="login-footer">
        <p>ERP Escoteiro · Gestão digital para grupos escoteiros</p>
        <nav className="login-footer-links" aria-label="Documentos legais">
          <Link to="/termos-de-uso">Termos de Uso</Link>
          <span aria-hidden="true">·</span>
          <Link to="/politica-de-privacidade">Política de Privacidade</Link>
        </nav>
      </footer>

      <a
        className="login-whatsapp-fab"
        href={CONTATO_WHATSAPP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar no WhatsApp"
        title="Falar no WhatsApp"
      >
        <WhatsAppIcon />
      </a>
    </div>
  )
}
