import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import {
  formDraftKey,
  usePersistedFormState,
} from '@/hooks/usePersistedFormState'
import {
  createUsuario,
  excluirUsuario,
  updateUsuarioSenha,
} from '@/lib/createUsuario'
import {
  associadoPortalMenuKeys,
  defaultMenuKeysForRole,
  menuAccessCatalogForForm,
  normalizeMenuKeys,
  pruneMenuKeysForRole,
} from '@/lib/menuAccess'
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
  registro: '',
  password: '',
  passwordConfirm: '',
  role: 'escotista' as AppRole,
  ativo: true,
  codigo_ramo: '',
  codigo_secao: '',
  menu_keys: defaultMenuKeysForRole('escotista') as string[],
}

function roleToTipo(role: AppRole): string {
  switch (role) {
    case 'super_admin':
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
  const { empresa, hasPermission, user, isSuperAdmin } = useAuth()
  const canWrite = hasPermission('usuarios.write')
  const empresaId = empresa?.id
  const toast = useToast()

  const draftKey = formDraftKey(empresaId, 'usuario', id)
  const [form, setForm, { hydrateFromServer, clearDraft, restored }] =
    usePersistedFormState(draftKey, emptyForm)
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
          'id, nome, email, username, registro, role, ativo, codigo_ramo, codigo_secao, menu_keys',
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

      const emailDb = (data.email ?? '').trim()
      const emailReal =
        emailDb.includes('@') && !emailDb.endsWith('@usuarios.local')
          ? emailDb
          : ''
      const role = normalizeRole(data.role as string)
      const savedMenus = normalizeMenuKeys(data.menu_keys)

      hydrateFromServer({
        nome: data.nome ?? '',
        email: emailReal,
        registro: data.registro ?? '',
        password: '',
        passwordConfirm: '',
        role,
        ativo: data.ativo !== false,
        codigo_ramo: data.codigo_ramo?.toString() ?? '',
        codigo_secao: data.codigo_secao?.toString() ?? '',
        menu_keys: pruneMenuKeysForRole(
          role,
          savedMenus ?? defaultMenuKeysForRole(role),
        ),
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
    const roleOk =
      GROUP_ROLES.includes(form.role) ||
      (!isNew && form.role === 'super_admin')
    if (!roleOk) {
      setError('Papel inválido.')
      return
    }

    const registroDigits = form.registro.replace(/\D/g, '')
    const isAssociado = !!registroDigits
    const menuKeysToSave =
      form.role === 'super_admin'
        ? null
        : isAssociado
          ? associadoPortalMenuKeys()
          : (() => {
              const pruned = pruneMenuKeysForRole(form.role, form.menu_keys)
              return pruned.length > 0 ? pruned : null
            })()
    if (
      form.role !== 'super_admin' &&
      !isAssociado &&
      (!menuKeysToSave || menuKeysToSave.length === 0)
    ) {
      setError('Marque pelo menos um menu de acesso para o usuário.')
      return
    }

    setSaving(true)
    setError(null)

    if (isNew) {
      const email = form.email.trim().toLowerCase()
      const registro = registroDigits
      if (!email && !registro) {
        setSaving(false)
        setError('Informe o e-mail ou o número de registro.')
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
        email: email || undefined,
        registro: registro || null,
        password: form.password,
        role: form.role,
        ativo: form.ativo,
        empresa_id: empresaId,
        codigo_ramo: form.codigo_ramo ? Number(form.codigo_ramo) : null,
        codigo_secao: form.codigo_secao ? Number(form.codigo_secao) : null,
        menu_keys: menuKeysToSave,
      })

      setSaving(false)
      if (!result.ok) {
        setError(result.error ?? 'Não foi possível criar o usuário.')
        return
      }

      clearDraft()
      navigate('/cadastros/usuarios', {
        state: { flashSuccess: 'Salvo com sucesso!' },
      })
      return
    }

    const pwd = form.password.trim()
    const pwd2 = form.passwordConfirm.trim()
    const wantsPasswordChange = pwd.length > 0 || pwd2.length > 0
    if (wantsPasswordChange) {
      if (pwd.length < 6) {
        setSaving(false)
        setError('A nova senha deve ter pelo menos 6 caracteres.')
        return
      }
      if (pwd !== pwd2) {
        setSaving(false)
        setError('A confirmação de senha não confere.')
        return
      }
    }

    const registro = registroDigits || null
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        nome: form.nome.trim(),
        registro,
        username: registro || form.email.trim().toLowerCase().split('@')[0] || null,
        role: form.role,
        tipo: roleToTipo(form.role),
        ativo: form.ativo,
        codigo_ramo: form.codigo_ramo ? Number(form.codigo_ramo) : null,
        codigo_secao: form.codigo_secao ? Number(form.codigo_secao) : null,
        menu_keys: menuKeysToSave,
      })
      .eq('id', id)
      .eq('empresa_id', empresaId)

    if (updateError) {
      setSaving(false)
      setError(updateError.message)
      return
    }

    if (wantsPasswordChange && id) {
      const pwdResult = await updateUsuarioSenha(id, pwd)
      if (!pwdResult.ok) {
        setSaving(false)
        setError(
          pwdResult.error ??
            'Perfil e menus salvos, mas não foi possível alterar a senha.',
        )
        return
      }
    }

    setSaving(false)
    clearDraft()
    navigate('/cadastros/usuarios', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onInativar() {
    if (!canWrite || !empresaId || isNew) return
    if (form.role === 'super_admin') {
      setError('O usuário super admin não pode ser inativado.')
      return
    }
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

  async function onExcluir() {
    if (!canWrite || !empresaId || isNew || !id) return
    if (form.role === 'super_admin') {
      setError('O usuário super admin não pode ser excluído.')
      return
    }
    if (user?.id === id) {
      setError('Você não pode excluir o próprio usuário.')
      return
    }

    const ok = await toast.confirm({
      title: 'Excluir usuário?',
      message: `Tem certeza que deseja excluir permanentemente "${form.nome}"? O login será removido e esta ação não pode ser desfeita.`,
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)
    const result = await excluirUsuario(id)
    setSaving(false)

    if (!result.ok) {
      setError(result.error ?? 'Não foi possível excluir o usuário.')
      return
    }

    clearDraft()
    navigate('/cadastros/usuarios', {
      state: { flashSuccess: 'Usuário excluído com sucesso!' },
    })
  }

  const menuGroups = useMemo(() => {
    // Catálogo completo: admin escolhe o que liberar (Projetos, tipos, fornecedores…).
    const catalog = menuAccessCatalogForForm()
    const map = new Map<string, typeof catalog>()
    for (const opt of catalog) {
      const list = map.get(opt.group) ?? []
      list.push(opt)
      map.set(opt.group, list)
    }
    return [...map.entries()]
  }, [])

  // Remove só chaves que não existem mais no catálogo (não corta pelo papel).
  useEffect(() => {
    if (form.role === 'super_admin') return
    setForm((prev) => {
      const pruned = pruneMenuKeysForRole(prev.role, prev.menu_keys)
      if (
        pruned.length === prev.menu_keys.length &&
        pruned.every((k, i) => k === prev.menu_keys[i])
      ) {
        return prev
      }
      return { ...prev, menu_keys: pruned }
    })
  }, [form.role, setForm])

  if (!empresaId) {
    return (
      <section className="panel">
        <p className="muted">
          {isSuperAdmin
            ? 'Cadastre um grupo e selecione-o em “Grupo em contexto” no menu lateral antes de criar usuários.'
            : 'Seu usuário precisa estar vinculado a um grupo escoteiro.'}
        </p>
        <Link className="btn btn-soft" to="/cadastros/usuarios">
          Voltar
        </Link>
      </section>
    )
  }

  if (loading) {
    return <div className="loading">Carregando usuário…</div>
  }

  const disabled = saving || !canWrite
  const isAssociadoForm = !!form.registro.trim()

  function toggleMenuKey(key: string) {
    setForm((prev) => {
      const has = prev.menu_keys.includes(key)
      return {
        ...prev,
        menu_keys: has
          ? prev.menu_keys.filter((k) => k !== key)
          : [...prev.menu_keys, key],
      }
    })
  }

  function setAllMenus(checked: boolean) {
    const keys = menuGroups.flatMap(([, opts]) => opts.map((o) => o.key))
    setForm((prev) => ({
      ...prev,
      menu_keys: checked ? keys : [],
    }))
  }

  return (
    <>
      <WaitingOverlay
        open={saving}
        title="Aguarde"
        message="Salvando no banco de dados. Isso pode levar alguns instantes…"
      />
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
        {restored ? (
          <AlertMessage tone="info" title="Rascunho restaurado">
            Continuamos de onde você parou nesta aba.
          </AlertMessage>
        ) : null}

        <div className="form-grid form-grid-2">
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

          <div className="field">
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
              required={isNew && !form.registro.trim()}
            />
            {!isNew ? (
              <span className="field-hint">
                O e-mail de login não pode ser alterado por esta tela.
              </span>
            ) : (
              <span className="field-hint">
                Opcional se informar o nº de registro.
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="registro">Nº de registro</label>
            <input
              id="registro"
              className="input"
              inputMode="numeric"
              autoComplete="off"
              value={form.registro}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  registro: e.target.value.replace(/\D/g, '').slice(0, 20),
                }))
              }
              disabled={disabled}
              required={isNew && !form.email.trim()}
              placeholder="Ex.: 12345"
            />
            <span className="field-hint">
              Pode ser usado no login no lugar do e-mail.
            </span>
          </div>

          <div className="field">
            <label htmlFor="password">{isNew ? 'Senha' : 'Nova senha'}</label>
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
                required={isNew}
                minLength={isNew ? 6 : undefined}
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
            <span className="field-hint">
              {isNew
                ? 'Use esta senha no login com o e-mail ou o nº de registro.'
                : 'Deixe em branco para manter a senha atual.'}
            </span>
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
              required={isNew}
              minLength={isNew ? 6 : undefined}
            />
            {!isNew ? (
              <span className="field-hint">
                Preencha só se for alterar a senha.
              </span>
            ) : null}
          </div>

          <div className="field">
            <label htmlFor="role">Papel</label>
            <select
              id="role"
              className="select"
              value={form.role}
              onChange={(e) => {
                const role = e.target.value as AppRole
                setForm((prev) => ({
                  ...prev,
                  role,
                  menu_keys: defaultMenuKeysForRole(role),
                }))
              }}
              disabled={disabled || form.role === 'super_admin'}
            >
              {form.role === 'super_admin' ? (
                <option value="super_admin">
                  {ROLE_LABELS.super_admin}
                </option>
              ) : null}
              {GROUP_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <span className="field-hint">
              {form.role === 'super_admin'
                ? 'Papel da plataforma — não pode ser alterado por este formulário.'
                : 'Define o nível padrão de permissões; os menus abaixo podem restringir o que aparece para o usuário.'}
            </span>
          </div>

          <div className="field">
            <label htmlFor="codigo_ramo">Ramo</label>
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
              <option value="">Grupo inteiro (vê todos os caixas)</option>
              {ramos
                .filter((ramo) => ramo.ramo_id >= 1 && ramo.ramo_id <= 4)
                .map((ramo) => (
                  <option key={ramo.ramo_id} value={ramo.ramo_id}>
                    {ramo.nome}
                  </option>
                ))}
            </select>
            <span className="field-hint">
              Com ramo, o portal mostra só o caixa do grupo e deste ramo.
            </span>
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

        <section className="usuario-menus-panel">
          <div className="usuario-menus-head">
            <div>
              <h3>Menus com acesso</h3>
              <p className="muted">
                {isAssociadoForm
                  ? 'Login por registro (associado) usa um menu fixo: Dashboard, Portal, Conquistas e Atividades.'
                  : 'Marque os menus que este usuário poderá ver. Use “Padrão do papel” para pré-marcar conforme o papel.'}
              </p>
            </div>
            {!isAssociadoForm ? (
              <div className="usuario-menus-actions">
                <button
                  type="button"
                  className="btn btn-soft"
                  disabled={disabled}
                  onClick={() => setAllMenus(true)}
                >
                  Marcar todos
                </button>
                <button
                  type="button"
                  className="btn btn-soft"
                  disabled={disabled}
                  onClick={() => setAllMenus(false)}
                >
                  Limpar
                </button>
                <button
                  type="button"
                  className="btn btn-soft"
                  disabled={disabled}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      menu_keys: defaultMenuKeysForRole(prev.role),
                    }))
                  }
                >
                  Padrão do papel
                </button>
              </div>
            ) : null}
          </div>

          {isAssociadoForm ? null : (
            <div className="usuario-menus-groups">
              {menuGroups.map(([group, opts]) => (
                <fieldset key={group} className="usuario-menus-group">
                  <legend>{group}</legend>
                  <div className="usuario-menus-checks">
                    {opts.map((opt) => (
                      <label key={opt.key}>
                        <input
                          type="checkbox"
                          checked={form.menu_keys.includes(opt.key)}
                          onChange={() => toggleMenuKey(opt.key)}
                          disabled={disabled}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          )}
        </section>

        <div className="form-actions">
          {canWrite ? (
            <>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {!isNew &&
              form.ativo !== false &&
              form.role !== 'super_admin' ? (
                <button
                  type="button"
                  className="btn btn-soft"
                  disabled={saving || user?.id === id}
                  onClick={() => void onInativar()}
                >
                  Inativar
                </button>
              ) : null}
              {!isNew && form.role !== 'super_admin' ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={saving || user?.id === id}
                  onClick={() => void onExcluir()}
                >
                  Excluir
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
