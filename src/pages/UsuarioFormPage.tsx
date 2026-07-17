import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { createUsuario } from '@/lib/createUsuario'
import {
  ROLE_LABELS,
  type AppRole,
  normalizeRole,
} from '@/lib/roles'
import type { Ramo } from '@/types/database'

const GROUP_ROLES: AppRole[] = [
  'admin',
  'tesoureiro',
  'chefe',
  'escotista',
  'leitura',
]

type Lookup = { id: number; nome: string; ramo: number | null }

const emptyForm = {
  nome: '',
  email: '',
  password: '',
  passwordConfirm: '',
  role: 'escotista' as AppRole,
  ativo: true,
  codigo_ramo: '',
  codigo_secao: '',
}

function roleToTipo(role: AppRole): string {
  switch (role) {
    case 'admin':
      return 'A'
    case 'tesoureiro':
      return 'T'
    case 'chefe':
      return 'C'
    case 'escotista':
      return 'E'
    case 'leitura':
      return 'L'
    default:
      return 'E'
  }
}

export function UsuarioFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { empresa, hasPermission, user } = useAuth()
  const canWrite = hasPermission('usuarios.write')
  const empresaId = empresa?.id
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<Lookup[]>([])
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)

  useEffect(() => {
    if (!empresaId) return
    void Promise.all([
      supabase
        .from('ramos')
        .select('ramo_id, nome, idade_inicio, idade_fim')
        .order('ramo_id'),
      supabase
        .from('secao')
        .select('secao_id, nome, ramo')
        .eq('empresa_id', empresaId)
        .order('nome'),
    ]).then(([r, s]) => {
      setRamos((r.data as Ramo[]) ?? [])
      setSecoes(
        (s.data ?? []).map((row) => ({
          id: row.secao_id as number,
          nome: row.nome as string,
          ramo: (row.ramo as number | null) ?? null,
        })),
      )
    })
  }, [empresaId])

  useEffect(() => {
    if (isNew || !empresaId) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('profiles')
        .select(
          'id, nome, email, username, role, ativo, codigo_ramo, codigo_secao',
        )
        .eq('id', id)
        .eq('empresa_id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Usuário não encontrado neste grupo')
        setLoading(false)
        return
      }

      setForm({
        nome: data.nome ?? '',
        email: data.email || data.username || '',
        password: '',
        passwordConfirm: '',
        role: normalizeRole(data.role as string),
        ativo: data.ativo !== false,
        codigo_ramo: data.codigo_ramo?.toString() ?? '',
        codigo_secao: data.codigo_secao?.toString() ?? '',
      })
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew, empresaId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Sem permissão para alterar usuários.')
      return
    }
    if (!empresaId) {
      setError('Grupo escoteiro não carregado.')
      return
    }
    if (!form.nome.trim()) {
      setError('Informe o nome.')
      return
    }
    if (!GROUP_ROLES.includes(form.role)) {
      setError('Papel inválido.')
      return
    }

    setSaving(true)
    setError(null)

    if (isNew) {
      const email = form.email.trim().toLowerCase()
      if (!email) {
        setSaving(false)
        setError('Informe o e-mail de acesso.')
        return
      }
      if (form.password.length < 6) {
        setSaving(false)
        setError('A senha deve ter pelo menos 6 caracteres.')
        return
      }
      if (form.password !== form.passwordConfirm) {
        setSaving(false)
        setError('A confirmação de senha não confere.')
        return
      }

      const result = await createUsuario({
        nome: form.nome.trim(),
        email,
        password: form.password,
        role: form.role,
        ativo: form.ativo,
        codigo_ramo: form.codigo_ramo ? Number(form.codigo_ramo) : null,
        codigo_secao: form.codigo_secao ? Number(form.codigo_secao) : null,
      })

      setSaving(false)
      if (!result.ok) {
        setError(result.error ?? 'Não foi possível criar o usuário.')
        return
      }

      navigate('/cadastros/usuarios', {
        state: { flashSuccess: 'Salvo com sucesso!' },
      })
      return
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        nome: form.nome.trim(),
        email: form.email.trim().toLowerCase() || null,
        role: form.role,
        tipo: roleToTipo(form.role),
        ativo: form.ativo,
        codigo_ramo: form.codigo_ramo ? Number(form.codigo_ramo) : null,
        codigo_secao: form.codigo_secao ? Number(form.codigo_secao) : null,
      })
      .eq('id', id)
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    navigate('/cadastros/usuarios', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onInativar() {
    if (!canWrite || !empresaId || isNew) return
    if (user?.id === id) {
      setError('Você não pode inativar o próprio usuário.')
      return
    }

    const ok = await toast.confirm({
      title: 'Inativar usuário?',
      message: `Tem certeza que deseja inativar "${form.nome}"?`,
      confirmLabel: 'Sim, inativar',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ ativo: false })
      .eq('id', id)
      .eq('empresa_id', empresaId)

    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }

    navigate('/cadastros/usuarios', {
      state: { flashSuccess: 'Usuário inativado com sucesso!' },
    })
  }

  if (!empresaId) {
    return (
      <section className="panel">
        <p className="muted">
          Seu usuário precisa estar vinculado a um grupo escoteiro.
        </p>
      </section>
    )
  }

  if (loading) {
    return <div className="loading">Carregando usuário…</div>
  }

  const disabled = saving || !canWrite

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Novo usuário' : 'Editar usuário'}</h2>
          <p>
            Grupo <strong>{empresa?.nome}</strong>
          </p>
        </div>
        <Link className="btn btn-soft" to="/cadastros/usuarios">
          Voltar
        </Link>
      </header>

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        <div className="form-grid">
          <div className="field field-span-2">
            <label htmlFor="nome">Nome</label>
            <input
              id="nome"
              className="input"
              value={form.nome}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, nome: e.target.value }))
              }
              disabled={disabled}
              required
            />
          </div>

          <div className="field field-span-2">
            <label htmlFor="email">E-mail de acesso</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, email: e.target.value }))
              }
              disabled={disabled || !isNew}
              required={isNew}
            />
            {!isNew ? (
              <span className="field-hint">
                O e-mail de login não pode ser alterado por esta tela.
              </span>
            ) : null}
          </div>

          {isNew ? (
            <>
              <div className="field">
                <label htmlFor="password">Senha</label>
                <div className="password-field">
                  <input
                    id="password"
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        password: e.target.value,
                      }))
                    }
                    disabled={disabled}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={disabled}
                  >
                    {showPassword ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>
              <div className="field">
                <label htmlFor="passwordConfirm">Confirmar senha</label>
                <input
                  id="passwordConfirm"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.passwordConfirm}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      passwordConfirm: e.target.value,
                    }))
                  }
                  disabled={disabled}
                  required
                  minLength={6}
                />
              </div>
            </>
          ) : null}

          <div className="field">
            <label htmlFor="role">Papel</label>
            <select
              id="role"
              className="select"
              value={form.role}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  role: e.target.value as AppRole,
                }))
              }
              disabled={disabled}
            >
              {GROUP_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="codigo_ramo">Ramo (opcional)</label>
            <select
              id="codigo_ramo"
              className="select"
              value={form.codigo_ramo}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  codigo_ramo: e.target.value,
                  codigo_secao: '',
                }))
              }
              disabled={disabled}
            >
              <option value="">Todos / nenhum</option>
              {ramos.map((ramo) => (
                <option key={ramo.ramo_id} value={ramo.ramo_id}>
                  {ramo.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="codigo_secao">Seção (opcional)</label>
            <select
              id="codigo_secao"
              className="select"
              value={form.codigo_secao}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  codigo_secao: e.target.value,
                }))
              }
              disabled={disabled}
            >
              <option value="">Todas / nenhuma</option>
              {secoes
                .filter(
                  (s) =>
                    !form.codigo_ramo ||
                    s.ramo === Number(form.codigo_ramo),
                )
                .map((secao) => (
                  <option key={secao.id} value={secao.id}>
                    {secao.nome}
                  </option>
                ))}
            </select>
          </div>

          <div className="field field-checks">
            <label>
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, ativo: e.target.checked }))
                }
                disabled={disabled}
              />
              Usuário ativo
            </label>
          </div>
        </div>

        <div className="form-actions">
          {canWrite ? (
            <>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {!isNew && form.ativo !== false ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={saving}
                  onClick={() => void onInativar()}
                >
                  Inativar
                </button>
              ) : null}
            </>
          ) : (
            <p className="muted">Modo leitura — sem permissão para salvar.</p>
          )}
          <Link className="btn btn-soft" to="/cadastros/usuarios">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
