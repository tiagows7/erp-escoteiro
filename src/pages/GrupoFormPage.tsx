import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  createGrupoComAdmin,
  mapEmpresaError,
  slugJaExiste,
} from '@/lib/createGrupo'
import { uploadGrupoLogo } from '@/lib/uploadGrupoLogo'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

const emptyForm = {
  nome: '',
  slug: '',
  cnpj: '',
  email: '',
  telefone: '',
  ativo: true,
  portal_transparencia: true,
  logo_url: '' as string | null,
  adminNome: '',
  adminEmail: '',
  adminPassword: '',
  adminPasswordConfirm: '',
}

export function GrupoFormPage() {
  const { id } = useParams()
  const isNew = !id || id === 'novo'
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canWrite = hasPermission('grupos.write')
  const toast = useToast()

  const [form, setForm] = useState(emptyForm)
  const [slugManual, setSlugManual] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isNew) return
    let mounted = true

    void (async () => {
      const { data, error: loadError } = await supabase
        .from('empresa')
        .select(
          'id, nome, cnpj, email, slug, telefone, logo_url, ativo, portal_transparencia',
        )
        .eq('id', Number(id))
        .maybeSingle()

      if (!mounted) return
      if (loadError || !data) {
        setError(loadError?.message ?? 'Grupo não encontrado')
        setLoading(false)
        return
      }

      setForm({
        ...emptyForm,
        nome: data.nome ?? '',
        slug: data.slug ?? '',
        cnpj: data.cnpj ?? '',
        email: data.email ?? '',
        telefone: data.telefone ?? '',
        ativo: data.ativo !== false,
        portal_transparencia: data.portal_transparencia !== false,
        logo_url: data.logo_url,
      })
      setSlugManual(true)
      setLogoPreview(data.logo_url)
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [id, isNew])

  function updateNome(nome: string) {
    setForm((prev) => ({
      ...prev,
      nome,
      slug: slugManual ? prev.slug : slugify(nome),
    }))
  }

  function onLogoFileChange(file: File | null) {
    if (logoPreview && logoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(logoPreview)
    }
    setLogoFile(file)
    setLogoPreview(file ? URL.createObjectURL(file) : form.logo_url)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canWrite) {
      setError('Apenas super admin pode alterar grupos.')
      return
    }

    const nome = form.nome.trim()
    if (!nome) {
      setError('Informe o nome do grupo escoteiro.')
      return
    }

    const slug = (form.slug.trim() || slugify(nome)).slice(0, 60)
    if (!slug) {
      setError('Informe um identificador (slug) válido.')
      return
    }

    setSaving(true)
    setError(null)

    if (await slugJaExiste(slug, isNew ? undefined : Number(id))) {
      setSaving(false)
      setError(
        `Já existe um grupo com o identificador "${slug}". Escolha outro slug.`,
      )
      return
    }

    if (isNew) {
      const adminNome = form.adminNome.trim()
      const adminEmail = form.adminEmail.trim().toLowerCase()
      if (!adminNome || !adminEmail) {
        setSaving(false)
        setError('Informe nome e e-mail do usuário administrador do grupo.')
        return
      }
      if (form.adminPassword.length < 6) {
        setSaving(false)
        setError('A senha do admin deve ter pelo menos 6 caracteres.')
        return
      }
      if (form.adminPassword !== form.adminPasswordConfirm) {
        setSaving(false)
        setError('A confirmação de senha não confere.')
        return
      }

      const result = await createGrupoComAdmin({
        grupo: {
          nome,
          slug,
          cnpj: form.cnpj,
          email: form.email,
          telefone: form.telefone,
          ativo: form.ativo,
          portal_transparencia: form.portal_transparencia,
        },
        admin: {
          nome: adminNome,
          email: adminEmail,
          password: form.adminPassword,
        },
      })

      if (!result.ok || !result.empresa?.id) {
        setSaving(false)
        setError(result.error ?? 'Não foi possível criar o grupo.')
        return
      }

      let logoMsg = ''
      if (logoFile) {
        const logoOk = await uploadGrupoLogo(result.empresa.id, logoFile)
        logoMsg =
          'error' in logoOk
            ? ' Grupo criado, mas o logo não pôde ser enviado.'
            : ''
      }

      setSaving(false)
      navigate('/grupos', {
        state: {
          flashSuccess: `Salvo com sucesso! Admin: ${result.admin?.email}.${logoMsg}`,
        },
      })
      return
    }

    const { error: updateError } = await supabase
      .from('empresa')
      .update({
        nome: nome.toUpperCase(),
        slug,
        cnpj: form.cnpj.replace(/\D/g, '') || null,
        email: form.email.trim() || null,
        telefone: form.telefone.trim() || null,
        ativo: form.ativo,
        portal_transparencia: form.portal_transparencia,
      })
      .eq('id', Number(id))

    if (updateError) {
      setSaving(false)
      setError(mapEmpresaError(updateError.message, slug))
      return
    }

    if (logoFile) {
      const logoOk = await uploadGrupoLogo(Number(id), logoFile)
      if ('error' in logoOk) {
        setSaving(false)
        setError(`Grupo atualizado, mas o logo falhou: ${logoOk.error}`)
        return
      }
    }

    setSaving(false)
    navigate('/grupos', {
      state: { flashSuccess: 'Salvo com sucesso!' },
    })
  }

  async function onDelete() {
    if (!canWrite || isNew) return
    const ok = await toast.confirm({
      title: 'Excluir grupo?',
      message:
        `Tem certeza que deseja excluir "${form.nome}"?\n\n` +
        'Se houver usuários ou associados vinculados, o grupo será apenas inativado.',
      confirmLabel: 'Sim, excluir',
      cancelLabel: 'Não',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)

    const [{ count: perfis }, { count: associados }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', Number(id)),
      supabase
        .from('associados')
        .select('associado_id', { count: 'exact', head: true })
        .eq('empresa_id', Number(id)),
    ])

    const temVinculos = (perfis ?? 0) > 0 || (associados ?? 0) > 0

    if (temVinculos) {
      const { error: updateError } = await supabase
        .from('empresa')
        .update({ ativo: false })
        .eq('id', Number(id))

      setSaving(false)
      if (updateError) {
        setError(updateError.message)
        return
      }

      navigate('/grupos', {
        state: {
          flashSuccess: `Grupo inativado (há ${perfis ?? 0} usuário(s) e ${associados ?? 0} associado(s) vinculados).`,
        },
      })
      return
    }

    const { error: deleteError } = await supabase
      .from('empresa')
      .delete()
      .eq('id', Number(id))

    setSaving(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }

    navigate('/grupos', {
      state: { flashSuccess: 'Grupo excluído com sucesso!' },
    })
  }

  async function onReativar() {
    if (!canWrite || isNew) return
    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('empresa')
      .update({ ativo: true })
      .eq('id', Number(id))
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    navigate('/grupos', {
      state: { flashSuccess: 'Grupo reativado com sucesso!' },
    })
  }

  if (loading) {
    return <div className="loading">Carregando grupo…</div>
  }

  const disabled = saving || !canWrite

  return (
    <>
      <header className="page-header">
        <div>
          <h2>{isNew ? 'Novo grupo escoteiro' : 'Editar grupo escoteiro'}</h2>
          <p>Somente super admin</p>
        </div>
        <Link className="btn btn-soft" to="/grupos">
          Voltar
        </Link>
      </header>

      <form className="panel" onSubmit={(e) => void onSubmit(e)}>
        {error ? (
          <AlertMessage tone="error" title="Atenção">
            {error}
          </AlertMessage>
        ) : null}

        <p className="form-section-title">Dados do grupo</p>

        <div className="form-grid">
          <div className="field field-span-2">
            <label htmlFor="grupo-nome">Nome do grupo</label>
            <input
              id="grupo-nome"
              className="input"
              placeholder="Ex.: Grupo Escoteiro Guajará Mirim - 18"
              value={form.nome}
              onChange={(e) => updateNome(e.target.value)}
              disabled={disabled}
              required
            />
          </div>

          <div className="field field-span-2">
            <label htmlFor="grupo-slug">Identificador (slug)</label>
            <input
              id="grupo-slug"
              className="input"
              placeholder="ge-guajara-18"
              value={form.slug}
              onChange={(e) => {
                setSlugManual(true)
                setForm((prev) => ({
                  ...prev,
                  slug: slugify(e.target.value),
                }))
              }}
              disabled={disabled}
              required
            />
            <span className="field-hint">
              Usado internamente para identificar o grupo. Sem acentos ou
              espaços.
            </span>
          </div>

          <div className="field">
            <label htmlFor="grupo-cnpj">CNPJ</label>
            <input
              id="grupo-cnpj"
              className="input"
              value={form.cnpj}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, cnpj: e.target.value }))
              }
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label htmlFor="grupo-telefone">Telefone</label>
            <input
              id="grupo-telefone"
              className="input"
              value={form.telefone}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, telefone: e.target.value }))
              }
              disabled={disabled}
            />
          </div>
          <div className="field field-span-2">
            <label htmlFor="grupo-email">E-mail do grupo</label>
            <input
              id="grupo-email"
              className="input"
              type="email"
              value={form.email}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, email: e.target.value }))
              }
              disabled={disabled}
            />
          </div>
        </div>

        <label
          style={{
            display: 'inline-flex',
            gap: '0.5rem',
            alignItems: 'center',
            margin: '0.75rem 0 1rem',
          }}
        >
          <input
            type="checkbox"
            checked={form.ativo}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, ativo: e.target.checked }))
            }
            disabled={disabled}
          />
          Grupo ativo
        </label>

        <label
          style={{
            display: 'inline-flex',
            gap: '0.5rem',
            alignItems: 'center',
            margin: '0 0 1rem',
          }}
        >
          <input
            type="checkbox"
            checked={form.portal_transparencia}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                portal_transparencia: e.target.checked,
              }))
            }
            disabled={disabled}
          />
          Portal da transparência público
        </label>
        {!isNew && form.slug && form.portal_transparencia ? (
          <p className="field-hint" style={{ marginTop: '-0.5rem' }}>
            Link público:{' '}
            <a
              href={`/transparencia/${form.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              /transparencia/{form.slug}
            </a>
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="grupo-logo">Logo do grupo</label>
          <div className="logo-upload-field">
            {logoPreview ? (
              <img
                className="logo-preview"
                src={logoPreview}
                alt="Pré-visualização do logo"
              />
            ) : (
              <div className="logo-preview-placeholder">Sem logo</div>
            )}
            <div>
              <input
                ref={logoInputRef}
                id="grupo-logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={disabled}
                onChange={(e) =>
                  onLogoFileChange(e.target.files?.[0] ?? null)
                }
              />
              <span className="field-hint">
                PNG, JPG, WEBP ou GIF · máx. 2 MB. Aparece no menu após o login.
              </span>
              {logoFile ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ marginTop: '0.4rem' }}
                  onClick={() => {
                    onLogoFileChange(null)
                    if (logoInputRef.current) logoInputRef.current.value = ''
                  }}
                  disabled={disabled}
                >
                  Remover seleção
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {isNew ? (
          <>
            <p className="form-section-title">Usuário administrador do grupo</p>
            <p className="field-hint" style={{ marginBottom: '0.85rem' }}>
              Esse login acessará apenas os dados deste grupo, com papel{' '}
              <strong>admin</strong>.
            </p>

            <div className="form-grid">
              <div className="field field-span-2">
                <label htmlFor="admin-nome">Nome do administrador</label>
                <input
                  id="admin-nome"
                  className="input"
                  value={form.adminNome}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, adminNome: e.target.value }))
                  }
                  disabled={disabled}
                  required
                />
              </div>
              <div className="field field-span-2">
                <label htmlFor="admin-email">E-mail de acesso</label>
                <input
                  id="admin-email"
                  className="input"
                  type="email"
                  autoComplete="off"
                  value={form.adminEmail}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      adminEmail: e.target.value,
                    }))
                  }
                  disabled={disabled}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="admin-password">Senha</label>
                <div className="password-field">
                  <input
                    id="admin-password"
                    className="input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={form.adminPassword}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        adminPassword: e.target.value,
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
                <label htmlFor="admin-password-confirm">Confirmar senha</label>
                <input
                  id="admin-password-confirm"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={form.adminPasswordConfirm}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      adminPasswordConfirm: e.target.value,
                    }))
                  }
                  disabled={disabled}
                  required
                  minLength={6}
                />
              </div>
            </div>
          </>
        ) : null}

        <div className="form-actions">
          {canWrite ? (
            <>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving
                  ? isNew
                    ? 'Criando…'
                    : 'Salvando…'
                  : 'Salvar'}
              </button>
              {!isNew && form.ativo === false ? (
                <button
                  type="button"
                  className="btn btn-soft"
                  disabled={saving}
                  onClick={() => void onReativar()}
                >
                  Reativar
                </button>
              ) : null}
              {!isNew ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={saving}
                  onClick={() => void onDelete()}
                >
                  Excluir
                </button>
              ) : null}
            </>
          ) : (
            <p className="muted">Modo leitura — sem permissão para salvar.</p>
          )}
          <Link className="btn btn-soft" to="/grupos">
            Cancelar
          </Link>
        </div>
      </form>
    </>
  )
}
