import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  canForProfile,
  canAnyForProfile,
  clearLoginVia,
  inferLoginViaFromAuthEmail,
  normalizeRole,
  ROLE_LABELS,
  setLoginVia,
  type AppRole,
  type Permission,
} from '@/lib/roles'
import { normalizeMenuKeys } from '@/lib/menuAccess'
import type { Empresa, Profile } from '@/types/database'
import type { PlataformaCobranca } from '@/lib/plataforma'
import {
  evaluatePlataformaAcesso,
  type PlataformaAcessoState,
} from '@/lib/plataformaAcesso'

const PLATAFORMA_ACESSO_OK: PlataformaAcessoState = {
  nivel: 'ok',
  mensagem: null,
  cobranca: null,
  diasAteVencimento: null,
}

const ACTING_EMPRESA_KEY = 'erp.actingEmpresaId'

const EMPRESA_SELECT =
  'id, nome, cnpj, email, slug, telefone, logo_url, ativo, plataforma_plano_id, plataforma_isento, plataforma_dia_vencimento'

type EmpresaOpt = { id: number; nome: string }

type AuthState = {
  session: Session | null
  user: User | null
  profile: Profile | null
  /** Grupo efetivo (perfil ou contexto escolhido pelo super admin). */
  empresa: Empresa | null
  role: AppRole | null
  roleLabel: string | null
  loading: boolean
  isSuperAdmin: boolean
  /** Lista de grupos para o seletor do super admin. */
  empresasContexto: EmpresaOpt[]
  setActingEmpresaId: (empresaId: number | null) => Promise<void>
  refreshEmpresasContexto: () => Promise<void>
  plataformaAcesso: PlataformaAcessoState
  refreshPlataformaAcesso: () => Promise<void>
  hasPermission: (permission: Permission) => boolean
  hasAnyPermission: (permissions: Permission[]) => boolean
  signIn: (
    login: string,
    password: string,
  ) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function mapProfile(row: Record<string, unknown>): Profile {
  const role = normalizeRole(
    (row.role as string | null) ?? (row.tipo as string | null),
  )

  return {
    id: String(row.id),
    empresa_id: (row.empresa_id as number | null) ?? null,
    nome: String(row.nome ?? ''),
    username: (row.username as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    tipo: (row.tipo as string | null) ?? null,
    role,
    ativo: row.ativo !== false,
    codigo_ramo: (row.codigo_ramo as number | null) ?? null,
    codigo_secao: (row.codigo_secao as number | null) ?? null,
    codigo_secao_nome: (row.codigo_secao_nome as number | null) ?? null,
    registro:
      row.registro != null && String(row.registro).trim()
        ? String(row.registro).trim()
        : null,
    menu_keys: normalizeMenuKeys(row.menu_keys),
  }
}

async function loadPlataformaAcessoFor(
  profile: Profile,
  empresa: Empresa | null,
): Promise<PlataformaAcessoState> {
  const isSuperAdmin = profile.role === 'super_admin'
  if (isSuperAdmin || !empresa) return PLATAFORMA_ACESSO_OK

  const isento = empresa.plataforma_isento === true
  const temPlano = empresa.plataforma_plano_id != null
  if (isento || !temPlano) {
    return evaluatePlataformaAcesso({
      isSuperAdmin: false,
      isento,
      temPlano,
      cobrancas: [],
    })
  }

  const { data } = await supabase
    .from('plataforma_cobranca')
    .select(
      'cobranca_id, empresa_id, plano_id, competencia, vencimento, descricao, valor, saldo, situacao, observacao, pago_em, plataforma_plano:plano_id(plano_id, nome)',
    )
    .eq('empresa_id', empresa.id)
    .in('situacao', [1, 2])
    .gt('saldo', 0)
    .order('vencimento', { ascending: true })

  return evaluatePlataformaAcesso({
    isSuperAdmin: false,
    isento,
    temPlano,
    cobrancas: (data as unknown as PlataformaCobranca[] | null) ?? [],
  })
}

async function fetchEmpresaById(id: number): Promise<Empresa | null> {
  const { data } = await supabase
    .from('empresa')
    .select(EMPRESA_SELECT)
    .eq('id', id)
    .maybeSingle()
  return (data as Empresa | null) ?? null
}

async function fetchEmpresasOpts(): Promise<EmpresaOpt[]> {
  const { data } = await supabase
    .from('empresa')
    .select('id, nome')
    .order('nome')
  return ((data as EmpresaOpt[] | null) ?? []).map((e) => ({
    id: Number(e.id),
    nome: e.nome,
  }))
}

function readStoredActingEmpresaId(): number | null {
  try {
    const raw = localStorage.getItem(ACTING_EMPRESA_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

function writeStoredActingEmpresaId(id: number | null) {
  try {
    if (id == null) localStorage.removeItem(ACTING_EMPRESA_KEY)
    else localStorage.setItem(ACTING_EMPRESA_KEY, String(id))
  } catch {
    /* ignore */
  }
}

async function loadProfile(userId: string) {
  const { data: profileRow, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error || !profileRow) {
    return {
      profile: null as Profile | null,
      empresa: null as Empresa | null,
      empresasContexto: [] as EmpresaOpt[],
      plataformaAcesso: PLATAFORMA_ACESSO_OK,
    }
  }

  const profile = mapProfile(profileRow as Record<string, unknown>)

  if (!profile.ativo) {
    return {
      profile,
      empresa: null,
      empresasContexto: [] as EmpresaOpt[],
      plataformaAcesso: PLATAFORMA_ACESSO_OK,
    }
  }

  const isSuper = profile.role === 'super_admin'

  if (isSuper) {
    const opts = await fetchEmpresasOpts()
    const stored = readStoredActingEmpresaId()
    const preferred =
      (stored && opts.some((o) => o.id === stored) ? stored : null) ??
      (profile.empresa_id && opts.some((o) => o.id === profile.empresa_id)
        ? profile.empresa_id
        : null) ??
      opts[0]?.id ??
      null

    const empresa = preferred != null ? await fetchEmpresaById(preferred) : null
    if (preferred != null) writeStoredActingEmpresaId(preferred)

    return {
      profile,
      empresa,
      empresasContexto: opts,
      plataformaAcesso: PLATAFORMA_ACESSO_OK,
    }
  }

  if (!profile.empresa_id) {
    return {
      profile,
      empresa: null,
      empresasContexto: [] as EmpresaOpt[],
      plataformaAcesso: PLATAFORMA_ACESSO_OK,
    }
  }

  const empresaTyped = await fetchEmpresaById(profile.empresa_id)
  const plataformaAcesso = await loadPlataformaAcessoFor(profile, empresaTyped)

  return {
    profile,
    empresa: empresaTyped,
    empresasContexto: [] as EmpresaOpt[],
    plataformaAcesso,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [empresasContexto, setEmpresasContexto] = useState<EmpresaOpt[]>([])
  const [plataformaAcesso, setPlataformaAcesso] =
    useState<PlataformaAcessoState>(PLATAFORMA_ACESSO_OK)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    async function applySession(next: Session | null) {
      setSession(next)
      setUser(next?.user ?? null)

      if (!next?.user) {
        setProfile(null)
        setEmpresa(null)
        setEmpresasContexto([])
        setPlataformaAcesso(PLATAFORMA_ACESSO_OK)
        return
      }

      // Garante modo equipe vs associado mesmo após F5 (sem novo signIn).
      inferLoginViaFromAuthEmail(next.user.email)

      const loaded = await loadProfile(next.user.id)
      if (!mounted) return
      // profiles.email às vezes vem vazio; usa o e-mail do Auth.
      const authEmail = next.user.email?.trim() || null
      const nextProfile = loaded.profile
        ? {
            ...loaded.profile,
            email: loaded.profile.email?.trim() || authEmail,
          }
        : null
      setProfile(nextProfile)
      setEmpresa(loaded.empresa)
      setEmpresasContexto(loaded.empresasContexto)
      setPlataformaAcesso(loaded.plataformaAcesso)
    }

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      await applySession(data.session)
      if (!mounted) return
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Refresh de token não precisa bloquear a UI.
      if (event === 'TOKEN_REFRESHED') {
        setSession(next)
        setUser(next?.user ?? null)
        return
      }

      // Evita flash de "perfil inexistente" entre sessão e carga do profile.
      setLoading(true)
      void applySession(next).finally(() => {
        if (mounted) setLoading(false)
      })
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const refreshEmpresasContexto = useCallback(async () => {
    if (profile?.role !== 'super_admin') {
      setEmpresasContexto([])
      return
    }
    const opts = await fetchEmpresasOpts()
    setEmpresasContexto(opts)
    if (empresa?.id && !opts.some((o) => o.id === empresa.id)) {
      const nextId = opts[0]?.id ?? null
      writeStoredActingEmpresaId(nextId)
      setEmpresa(nextId != null ? await fetchEmpresaById(nextId) : null)
    }
  }, [profile?.role, empresa?.id])

  const setActingEmpresaId = useCallback(
    async (empresaId: number | null) => {
      if (profile?.role !== 'super_admin') return
      writeStoredActingEmpresaId(empresaId)
      if (empresaId == null) {
        setEmpresa(null)
        return
      }
      const next = await fetchEmpresaById(empresaId)
      setEmpresa(next)
    },
    [profile?.role],
  )

  const refreshPlataformaAcesso = useCallback(async () => {
    if (!profile || !empresa || profile.role === 'super_admin') {
      setPlataformaAcesso(PLATAFORMA_ACESSO_OK)
      return
    }
    const next = await loadPlataformaAcessoFor(profile, empresa)
    setPlataformaAcesso(next)
  }, [profile, empresa])

  async function signIn(login: string, password: string) {
    const trimmed = login.trim()
    if (!trimmed) {
      return { error: 'Informe o e-mail ou o número de registro.' }
    }

    const viaEmail = trimmed.includes('@')
    let email = trimmed
    if (!viaEmail) {
      const { data, error: lookupError } = await supabase.rpc(
        'resolve_login_email',
        { p_login: trimmed },
      )
      if (lookupError) {
        return { error: lookupError.message }
      }
      if (!data || typeof data !== 'string') {
        return {
          error:
            'Registro não encontrado. Verifique o número ou use o e-mail.',
        }
      }
      email = data
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password,
    })
    if (!error) {
      setLoginVia(viaEmail ? 'email' : 'registro')
    }
    return { error: error?.message ?? null }
  }

  async function signOut() {
    clearLoginVia()
    await supabase.auth.signOut()
    setProfile(null)
    setEmpresa(null)
    setEmpresasContexto([])
    setPlataformaAcesso(PLATAFORMA_ACESSO_OK)
  }

  const role = profile?.ativo ? profile.role : null

  const value = useMemo<AuthState>(
    () => ({
      session,
      user,
      profile,
      empresa,
      role,
      roleLabel: role ? ROLE_LABELS[role] : null,
      loading,
      isSuperAdmin: role === 'super_admin',
      empresasContexto,
      setActingEmpresaId,
      refreshEmpresasContexto,
      plataformaAcesso,
      refreshPlataformaAcesso,
      hasPermission: (permission) => canForProfile(role, profile, permission),
      hasAnyPermission: (permissions) =>
        canAnyForProfile(role, profile, permissions),
      signIn,
      signOut,
    }),
    [
      session,
      user,
      profile,
      empresa,
      role,
      loading,
      empresasContexto,
      setActingEmpresaId,
      refreshEmpresasContexto,
      plataformaAcesso,
      refreshPlataformaAcesso,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
