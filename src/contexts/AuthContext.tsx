import {
  createContext,
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
  normalizeRole,
  ROLE_LABELS,
  type AppRole,
  type Permission,
} from '@/lib/roles'
import type { Empresa, Profile } from '@/types/database'

type AuthState = {
  session: Session | null
  user: User | null
  profile: Profile | null
  empresa: Empresa | null
  role: AppRole | null
  roleLabel: string | null
  loading: boolean
  isSuperAdmin: boolean
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
  }
}

async function loadProfile(userId: string) {
  const { data: profileRow, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error || !profileRow) {
    return { profile: null, empresa: null }
  }

  const profile = mapProfile(profileRow as Record<string, unknown>)

  if (!profile.ativo) {
    return { profile, empresa: null }
  }

  if (!profile.empresa_id) {
    return { profile, empresa: null }
  }

  const { data: empresa } = await supabase
    .from('empresa')
    .select('id, nome, cnpj, email, slug, telefone, logo_url, ativo')
    .eq('id', profile.empresa_id)
    .maybeSingle()

  return {
    profile,
    empresa: (empresa as Empresa | null) ?? null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) {
        const loaded = await loadProfile(data.session.user.id)
        if (!mounted) return
        setProfile(loaded.profile)
        setEmpresa(loaded.empresa)
      }
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setUser(next?.user ?? null)
      if (next?.user) {
        void loadProfile(next.user.id).then((loaded) => {
          setProfile(loaded.profile)
          setEmpresa(loaded.empresa)
        })
      } else {
        setProfile(null)
        setEmpresa(null)
      }
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  async function signIn(login: string, password: string) {
    const trimmed = login.trim()
    if (!trimmed) {
      return { error: 'Informe o e-mail ou o número de registro.' }
    }

    let email = trimmed
    if (!trimmed.includes('@')) {
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
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setEmpresa(null)
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
      hasPermission: (permission) => canForProfile(role, profile, permission),
      hasAnyPermission: (permissions) =>
        canAnyForProfile(role, profile, permissions),
      signIn,
      signOut,
    }),
    [session, user, profile, empresa, role, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
