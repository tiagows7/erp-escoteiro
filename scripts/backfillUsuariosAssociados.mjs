/**
 * Cria logins para associados sem profile.registro.
 * Login = registro, senha = DDMMAAAA (data_nascimento).
 *
 * Uso: node --env-file=.env scripts/backfillUsuariosAssociados.mjs
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function passwordFromNascimento(iso) {
  if (!iso) return null
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  if (!y || !m || !d || y.length !== 4) return null
  return `${d}${m}${y}`
}

function roleToTipo(role) {
  return { admin: 'A', tesoureiro: 'T', chefe: 'C', escotista: 'E', leitura: 'L' }[
    role
  ] ?? 'L'
}

const { data: associados, error } = await admin
  .from('associados')
  .select(
    'associado_id, empresa_id, registro, nome, data_nascimento, ramo, secao',
  )
  .eq('ativo', true)
  .order('registro')

if (error) {
  console.error(error.message)
  process.exit(1)
}

let created = 0
let skipped = 0
let failed = 0

for (const a of associados ?? []) {
  const registro = String(a.registro ?? '').replace(/\D/g, '')
  const password = passwordFromNascimento(a.data_nascimento)
  const nome = (a.nome || '').trim()

  if (!registro || !password || !nome) {
    skipped += 1
    continue
  }

  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('registro', registro)
    .maybeSingle()

  if (existing?.id) {
    skipped += 1
    continue
  }

  const email = `r${registro}@usuarios.local`
  const codigoRamo =
    a.ramo != null && a.ramo >= 1 && a.ramo <= 4 ? a.ramo : null

  const { data: createdUser, error: userError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    })

  if (userError || !createdUser?.user) {
    const msg = (userError?.message ?? '').toLowerCase()
    if (msg.includes('already') || msg.includes('registered')) {
      skipped += 1
      continue
    }
    failed += 1
    console.error(`Falha ${registro} ${nome}: ${userError?.message}`)
    continue
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: createdUser.user.id,
    empresa_id: a.empresa_id,
    nome,
    email,
    username: registro,
    registro,
    role: 'leitura',
    tipo: roleToTipo('leitura'),
    ativo: true,
    codigo_ramo: codigoRamo,
    codigo_secao: a.secao ?? null,
  })

  if (profileError) {
    await admin.auth.admin.deleteUser(createdUser.user.id)
    failed += 1
    console.error(`Perfil ${registro}: ${profileError.message}`)
    continue
  }

  created += 1
  if (created % 10 === 0) console.log(`… ${created} criados`)
}

// limpa usuario de teste do diagnostico
await admin.auth.admin
  .listUsers({ page: 1, perPage: 200 })
  .then(async ({ data }) => {
    const junk = (data?.users ?? []).filter(
      (u) =>
        u.email === 'r9999999@usuarios.local' ||
        u.email === 'r8888888@usuarios.local',
    )
    for (const u of junk) {
      await admin.auth.admin.deleteUser(u.id)
      console.log(`Removido teste ${u.email}`)
    }
  })

console.log(
  JSON.stringify({ total: associados?.length ?? 0, created, skipped, failed }),
)
