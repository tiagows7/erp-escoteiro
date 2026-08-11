import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
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
import { ContaBancariaModal } from '@/components/ContaBancariaModal'
import {
  SaldoLocalModal,
  type SaldoLocalRow,
} from '@/components/SaldoLocalModal'
import { AddIcon } from '@/components/AddIcon'
import {
  CONTA_BANCARIA_SELECT,
  contaBancariaFromRow,
  type ContaBancariaRow,
} from '@/lib/contaBancariaFields'
import { PORTAL_CAIXAS } from '@/lib/portal'
import { formatMoney } from '@/lib/despesas'
import { loadCidades, loadEstados } from '@/lib/brasilLocalidades'
import type { Ramo } from '@/types/database'

type SecaoOpt = {
  secao_id: number
  nome: string
  ramo: number | null
}

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
  estado: '',
  cidade: '',
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
  const { hasPermission, empresa, isSuperAdmin } = useAuth()
  const canManagePlatform = isSuperAdmin || hasPermission('grupos.write')
  const canEditOwn =
    hasPermission('grupos.view') &&
    !isNew &&
    empresa?.id != null &&
    Number(id) === empresa.id
  const canWrite = canManagePlatform || canEditOwn
  const toast = useToast()
  const backTo = canManagePlatform ? '/grupos' : '/'

  const [form, setForm] = useState(emptyForm)
  const [ramos, setRamos] = useState<Ramo[]>([])
  const [secoes, setSecoes] = useState<SecaoOpt[]>([])
  const [contasBancarias, setContasBancarias] = useState<ContaBancariaRow[]>([])
  const [contasListaOpen, setContasListaOpen] = useState(false)
  const [contaModalOpen, setContaModalOpen] = useState(false)
  const [contaEditando, setContaEditando] = useState<ContaBancariaRow | null>(
    null,
  )
  const [contaBusyId, setContaBusyId] = useState<number | null>(null)
  const [saldoLocais, setSaldoLocais] = useState<SaldoLocalRow[]>([])
  const [saldoListaOpen, setSaldoListaOpen] = useState(false)
  const [saldoModalOpen, setSaldoModalOpen] = useState(false)
  const [saldoEditando, setSaldoEditando] = useState<SaldoLocalRow | null>(null)
  const [saldoBusyId, setSaldoBusyId] = useState<number | null>(null)
  const [estados, setEstados] = useState<{ codigo: string; nome: string }[]>(
    [],
  )
  const [cidades, setCidades] = useState<{ id: number; nome: string }[]>([])
  const [slugManual, setSlugManual] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void supabase
      .from('ramos')
      .select('ramo_id, nome, idade_inicio, idade_fim')
      .order('ramo_id')
      .then(({ data }) => {
        const list = ((data as Ramo[]) ?? []).filter(
          (r) => r.ramo_id >= 1 && r.ramo_id <= 5,
        )
        setRamos(list)
      })

    void loadEstados(supabase).then((list) => setEstados(list))
  }, [])

  useEffect(() => {
    if (!form.estado) {
      setCidades([])
      return
    }
    let mounted = true
    void loadCidades(supabase, form.estado).then((list) => {
      if (mounted) setCidades(list)
    })
    return () => {
      mounted = false
    }
  }, [form.estado])

  useEffect(() => {
    if (isNew) return
    let mounted = true

    void (async () => {
      const [empresaRes, secoesRes, contasRes, locaisRes] = await Promise.all([
        supabase
          .from('empresa')
          .select(
            'id, nome, cnpj, email, slug, telefone, estado, cidade, logo_url, ativo, portal_transparencia',
          )
          .eq('id', Number(id))
          .maybeSingle(),
        supabase
          .from('secao')
          .select('secao_id, nome, ramo')
          .eq('empresa_id', Number(id))
          .order('nome', { ascending: true }),
        supabase
          .from('empresa_conta_bancaria')
          .select(CONTA_BANCARIA_SELECT)
          .eq('empresa_id', Number(id))
          .order('id', { ascending: true }),
        supabase
          .from('empresa_saldo_local')
          .select(
            'id, empresa_id, caixa_id, secao_id, nome, valor, ordem, ativo',
          )
          .eq('empresa_id', Number(id))
          .order('ordem', { ascending: true })
          .order('nome', { ascending: true }),
      ])

      if (!mounted) return
      if (empresaRes.error || !empresaRes.data) {
        setError(empresaRes.error?.message ?? 'Grupo não encontrado')
        setLoading(false)
        return
      }

      const data = empresaRes.data
      setForm({
        ...emptyForm,
        nome: data.nome ?? '',
        slug: data.slug ?? '',
        cnpj: data.cnpj ?? '',
        email: data.email ?? '',
        telefone: data.telefone ?? '',
        estado: (data.estado as string | null) ?? '',
        cidade:
          data.cidade != null && data.cidade !== ''
            ? String(data.cidade)
            : '',
        ativo: data.ativo !== false,
        portal_transparencia: data.portal_transparencia !== false,
        logo_url: data.logo_url,
      })
      setLogoPreview(data.logo_url)
      setSlugManual(true)

      const secoesList = (secoesRes.data as SecaoOpt[] | null) ?? []
      setSecoes(secoesList)

      if (contasRes.error) {
        console.warn('Contas bancárias:', contasRes.error.message)
      }
      setContasBancarias(
        ((contasRes.data ?? []) as ContaBancariaRow[]).map((row) => ({
          id: Number(row.id),
          empresa_id: Number(row.empresa_id),
          ramo_id: row.ramo_id != null ? Number(row.ramo_id) : null,
          secao_id: row.secao_id != null ? Number(row.secao_id) : null,
          ...contaBancariaFromRow(row),
        })),
      )

      if (locaisRes.error) {
        console.warn('Locais do saldo:', locaisRes.error.message)
      }
      setSaldoLocais((locaisRes.data as SaldoLocalRow[] | null) ?? [])

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
      setError('Você não tem permissão para alterar este grupo.')
      return
    }

    if (isNew && !canManagePlatform) {
      setError('Apenas super admin pode criar grupos.')
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
          estado: form.estado,
          cidade: form.cidade,
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

    const empresaId = Number(id)
    const { error: updateError } = await supabase
      .from('empresa')
      .update({
        nome: nome.toUpperCase(),
        slug,
        cnpj: form.cnpj.replace(/\D/g, '') || null,
        email: form.email.trim() || null,
        telefone: form.telefone.trim() || null,
        estado: form.estado.trim().toUpperCase() || null,
        cidade: form.cidade.trim() ? Number(form.cidade) : null,
        ativo: form.ativo,
        portal_transparencia: form.portal_transparencia,
      })
      .eq('id', empresaId)

    if (updateError) {
      setSaving(false)
      setError(mapEmpresaError(updateError.message, slug))
      return
    }

    if (logoFile) {
      const logoOk = await uploadGrupoLogo(empresaId, logoFile)
      if ('error' in logoOk) {
        setSaving(false)
        setError(`Grupo atualizado, mas o logo falhou: ${logoOk.error}`)
        return
      }
    }

    setSaving(false)
    if (canManagePlatform) {
      navigate('/grupos', {
        state: { flashSuccess: 'Salvo com sucesso!' },
      })
    } else {
      toast.success('Grupo atualizado com sucesso!')
    }
  }

  async function onDelete() {
    if (!canManagePlatform || isNew) return
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
    if (!canManagePlatform || isNew) return
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

  const ramoMap = useMemo(
    () => new Map(ramos.map((r) => [r.ramo_id, r.nome])),
    [ramos],
  )
  const secaoMap = useMemo(
    () => new Map(secoes.map((s) => [s.secao_id, s.nome])),
    [secoes],
  )

  async function excluirContaBancaria(contaId: number) {
    if (!canWrite) return
    const ok = await toast.confirm({
      title: 'Excluir conta bancária',
      message: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    setContaBusyId(contaId)
    const { error: delError } = await supabase
      .from('empresa_conta_bancaria')
      .delete()
      .eq('id', contaId)
    setContaBusyId(null)
    if (delError) {
      setError(delError.message)
      return
    }
    setContasBancarias((prev) => prev.filter((c) => c.id !== contaId))
    toast.success('Conta bancária excluída.')
  }

  async function excluirSaldoLocal(localId: number) {
    if (!canWrite) return
    const ok = await toast.confirm({
      title: 'Excluir local do saldo',
      message: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      danger: true,
    })
    if (!ok) return
    setSaldoBusyId(localId)
    const { error: delError } = await supabase
      .from('empresa_saldo_local')
      .delete()
      .eq('id', localId)
    setSaldoBusyId(null)
    if (delError) {
      setError(delError.message)
      return
    }
    setSaldoLocais((prev) => prev.filter((l) => l.id !== localId))
    toast.success('Local do saldo excluído.')
  }

  if (!canManagePlatform && isNew) {
    return <Navigate to="/grupos/meu" replace />
  }

  if (
    !canManagePlatform &&
    !isNew &&
    empresa?.id != null &&
    Number(id) !== empresa.id
  ) {
    return <Navigate to={`/grupos/${empresa.id}`} replace />
  }

  if (loading) {
    return <div className="loading">Carregando grupo…</div>
  }

  const disabled = saving || !canWrite

  return (
    <>
      <header className="page-header">
        <div>
          <h2>
            {isNew
              ? 'Novo grupo escoteiro'
              : canManagePlatform
                ? 'Editar grupo escoteiro'
                : 'Meu grupo escoteiro'}
          </h2>
          <p>
            {canManagePlatform
              ? 'Cadastro da plataforma (super admin)'
              : 'Dados e contas bancárias do seu grupo'}
          </p>
        </div>
        <div className="page-header-actions actions-pair">
          {!isNew && canWrite ? (
            <>
              <button
                type="button"
                className="btn btn-primary btn-with-icon"
                disabled={saving}
                onClick={() => setContasListaOpen(true)}
              >
                <AddIcon />
                Cadastrar banco
              </button>
              <button
                type="button"
                className="btn btn-soft btn-with-icon"
                disabled={saving}
                onClick={() => setSaldoListaOpen(true)}
              >
                <AddIcon />
                Locais do saldo
              </button>
            </>
          ) : null}
          <Link className="btn btn-soft" to={backTo}>
            Voltar
          </Link>
        </div>
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
          <div className="field field-span-2 grupo-campo-localidade">
            <label htmlFor="grupo-estado">Estado</label>
            <select
              id="grupo-estado"
              className="select"
              value={form.estado}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  estado: e.target.value,
                  cidade: '',
                }))
              }
              disabled={disabled}
            >
              <option value="">
                {estados.length === 0 ? 'Carregando estados…' : 'Selecione'}
              </option>
              {estados.map((uf) => (
                <option key={uf.codigo} value={uf.codigo}>
                  {uf.codigo} — {uf.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="field field-span-2 grupo-campo-localidade">
            <label htmlFor="grupo-cidade">Cidade</label>
            <select
              id="grupo-cidade"
              className="select"
              value={form.cidade}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, cidade: e.target.value }))
              }
              disabled={disabled || !form.estado}
            >
              <option value="">
                {!form.estado
                  ? 'Selecione o estado'
                  : cidades.length === 0
                    ? 'Carregando cidades…'
                    : 'Selecione'}
              </option>
              {cidades.map((cidade) => (
                <option key={cidade.id} value={cidade.id}>
                  {cidade.nome}
                </option>
              ))}
            </select>
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
              {canManagePlatform && !isNew && form.ativo === false ? (
                <button
                  type="button"
                  className="btn btn-soft"
                  disabled={saving}
                  onClick={() => void onReativar()}
                >
                  Reativar
                </button>
              ) : null}
              {canManagePlatform && !isNew ? (
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
          <Link className="btn btn-soft" to={backTo}>
            Cancelar
          </Link>
        </div>
      </form>

      {contasListaOpen && !isNew ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={() => setContasListaOpen(false)}
        >
          <div
            className="passagem-dialog conta-bancaria-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contas-lista-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="passagem-dialog-header">
              <div>
                <h3 id="contas-lista-title">Contas bancárias</h3>
                <p className="muted">
                  Cadastre várias contas do grupo, do mesmo ramo ou seção.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => setContasListaOpen(false)}
              >
                Fechar
              </button>
            </header>

            <div className="toolbar" style={{ marginBottom: '0.85rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-with-icon"
                disabled={disabled}
                onClick={() => {
                  setContaEditando(null)
                  setContaModalOpen(true)
                }}
              >
                <AddIcon />
                Nova conta
              </button>
            </div>

            {contasBancarias.length === 0 ? (
              <div className="empty">Nenhuma conta bancária cadastrada.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Descrição</th>
                      <th>Banco</th>
                      <th>Agência</th>
                      <th>Conta</th>
                      <th>InfinitePay</th>
                      <th>Ramo / seção</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {contasBancarias.map((conta) => (
                      <tr key={conta.id}>
                        <td>{conta.descricao || '—'}</td>
                        <td>{conta.banco_nome || '—'}</td>
                        <td>{conta.agencia || '—'}</td>
                        <td>{conta.conta || '—'}</td>
                        <td>
                          {conta.infinitepay_handle
                            ? `$${conta.infinitepay_handle}`
                            : '—'}
                        </td>
                        <td>{labelContaEscopo(conta, ramoMap, secaoMap)}</td>
                        <td>
                          <div className="atividades-row-actions">
                            <button
                              type="button"
                              className="btn btn-soft"
                              disabled={disabled || contaBusyId === conta.id}
                              onClick={() => {
                                setContaEditando(conta)
                                setContaModalOpen(true)
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger"
                              disabled={disabled || contaBusyId === conta.id}
                              onClick={() => void excluirContaBancaria(conta.id)}
                            >
                              {contaBusyId === conta.id
                                ? 'Excluindo…'
                                : 'Excluir'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {contaModalOpen && !isNew && id ? (
        <ContaBancariaModal
          empresaId={Number(id)}
          ramos={ramos}
          secoes={secoes}
          editing={contaEditando}
          onClose={() => {
            setContaModalOpen(false)
            setContaEditando(null)
          }}
          onSaved={(row) => {
            setContasBancarias((prev) => {
              const idx = prev.findIndex((c) => c.id === row.id)
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = row
                return next
              }
              return [...prev, row]
            })
            toast.success(
              contaEditando ? 'Conta atualizada.' : 'Conta cadastrada.',
            )
          }}
        />
      ) : null}

      {saldoListaOpen ? (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={() => setSaldoListaOpen(false)}
        >
          <div
            className="passagem-dialog conta-bancaria-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="saldo-lista-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="passagem-dialog-header">
              <div>
                <h3 id="saldo-lista-title">Locais do saldo</h3>
                <p className="muted">
                  Onde está o dinheiro de cada caixa (conta, investimento,
                  dinheiro em caixa…). Aparece no Portal da Transparência.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => setSaldoListaOpen(false)}
              >
                Fechar
              </button>
            </header>

            <div className="toolbar" style={{ marginBottom: '0.85rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-with-icon"
                disabled={disabled}
                onClick={() => {
                  setSaldoEditando(null)
                  setSaldoModalOpen(true)
                }}
              >
                <AddIcon />
                Novo local
              </button>
            </div>

            {saldoLocais.length === 0 ? (
              <div className="empty">Nenhum local de saldo cadastrado.</div>
            ) : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Local</th>
                      <th>Caixa</th>
                      <th>Seção</th>
                      <th>Valor</th>
                      <th>Portal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {saldoLocais.map((local) => (
                      <tr key={local.id}>
                        <td>{local.nome}</td>
                        <td>
                          {PORTAL_CAIXAS.find((c) => c.id === local.caixa_id)
                            ?.label ?? `Caixa ${local.caixa_id}`}
                        </td>
                        <td>
                          {local.secao_id != null
                            ? (secaoMap.get(local.secao_id) ?? local.secao_id)
                            : '—'}
                        </td>
                        <td>{formatMoney(local.valor)}</td>
                        <td>{local.ativo === false ? 'Oculto' : 'Sim'}</td>
                        <td>
                          <div className="atividades-row-actions">
                            <button
                              type="button"
                              className="btn btn-soft"
                              disabled={disabled || saldoBusyId === local.id}
                              onClick={() => {
                                setSaldoEditando(local)
                                setSaldoModalOpen(true)
                              }}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger"
                              disabled={disabled || saldoBusyId === local.id}
                              onClick={() => void excluirSaldoLocal(local.id)}
                            >
                              {saldoBusyId === local.id
                                ? 'Excluindo…'
                                : 'Excluir'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {saldoModalOpen && !isNew && id ? (
        <SaldoLocalModal
          empresaId={Number(id)}
          ramos={ramos}
          secoes={secoes}
          editing={saldoEditando}
          onClose={() => {
            setSaldoModalOpen(false)
            setSaldoEditando(null)
          }}
          onSaved={(row) => {
            setSaldoLocais((prev) => {
              const idx = prev.findIndex((l) => l.id === row.id)
              if (idx >= 0) {
                const next = [...prev]
                next[idx] = row
                return next
              }
              return [...prev, row].sort(
                (a, b) =>
                  a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'),
              )
            })
            toast.success(
              saldoEditando ? 'Local atualizado.' : 'Local cadastrado.',
            )
          }}
        />
      ) : null}
    </>
  )
}

function labelContaEscopo(
  conta: ContaBancariaRow,
  ramoMap: Map<number, string>,
  secaoMap: Map<number, string>,
): string {
  if (conta.ramo_id == null) return 'Grupo'
  const parts: string[] = [ramoMap.get(conta.ramo_id) ?? `Ramo ${conta.ramo_id}`]
  if (conta.secao_id != null) {
    parts.push(secaoMap.get(conta.secao_id) ?? `Seção ${conta.secao_id}`)
  }
  return parts.join(' · ')
}
