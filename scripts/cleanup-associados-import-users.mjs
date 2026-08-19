/**
 * Limpa associados, seções e usuários criados pela importação Paxtu
 * (role leitura + e-mail r*@usuarios.local / com registro).
 *
 * Mantém: super_admin, admin, tesoureiro, chefe, escotista e demais sem padrão de import.
 *
 * Uso: node scripts/cleanup-associados-import-users.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(filePath = '.env') {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

loadEnvFile()
loadEnvFile('.env.local')

const url = process.env.VITE_SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('Falta VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function isImportUser(p) {
  if (p.role === 'super_admin' || p.role === 'admin') return false
  if (p.role !== 'leitura' && p.role !== 'L') return false
  const registro = (p.registro ?? '').toString().trim()
  if (!registro) return false
  const email = (p.email ?? '').toString().trim().toLowerCase()
  if (email.endsWith('@usuarios.local')) return true
  // Import sempre grava registro; e-mail sintetico pode estar só no Auth
  return /^\d+$/.test(registro)
}

async function main() {
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, nome, email, registro, role')

  if (error) {
    console.error('Falha ao listar profiles:', error.message)
    process.exit(1)
  }

  const toRemove = (profiles ?? []).filter(isImportUser)
  console.log(`Usuários de importação a remover: ${toRemove.length}`)

  let removedAuth = 0
  for (const p of toRemove) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(p.id)
    if (delErr) {
      // Tenta apagar só o profile se Auth já não existir
      console.log(`· auth ${p.registro ?? p.id}: ${delErr.message}`)
      const { error: profErr } = await supabase
        .from('profiles')
        .delete()
        .eq('id', p.id)
      if (profErr) console.log(`  ✗ profile: ${profErr.message}`)
      else console.log(`  ✓ profile removido: ${p.nome}`)
    } else {
      removedAuth += 1
      console.log(`✓ ${p.nome} (reg ${p.registro})`)
    }
  }
  console.log(`Auth removidos (profiles): ${removedAuth}`)

  // Auth órfãos da importação (e-mail sintético sem profile)
  const authUsers = []
  let page = 1
  for (;;) {
    const { data, error: listErr } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (listErr) throw listErr
    authUsers.push(...(data.users ?? []))
    if (!data.users?.length || data.users.length < 200) break
    page += 1
  }

  const keepIds = new Set(
    (profiles ?? [])
      .filter((p) => !isImportUser(p))
      .map((p) => p.id),
  )
  const orphanLocal = authUsers.filter((u) => {
    const email = (u.email ?? '').toLowerCase()
    if (!email.endsWith('@usuarios.local')) return false
    return !keepIds.has(u.id)
  })

  console.log(`Auth @usuarios.local órfãos: ${orphanLocal.length}`)
  let orphanRemoved = 0
  for (const u of orphanLocal) {
    const { error: delErr } = await supabase.auth.admin.deleteUser(u.id)
    if (delErr) console.log(`✗ ${u.email}: ${delErr.message}`)
    else {
      orphanRemoved += 1
      console.log(`✓ auth ${u.email}`)
    }
  }
  console.log(`Auth órfãos removidos: ${orphanRemoved}`)

  // Limpa associados / seções
  for (const table of ['associados', 'secao_nome', 'secao']) {
    const pk =
      table === 'associados'
        ? 'associado_id'
        : table === 'secao'
          ? 'secao_id'
          : 'secaonome_id'
    const { error: wipeErr, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .gte(pk, 0)
    if (wipeErr) console.log(`✗ ${table}: ${wipeErr.message}`)
    else console.log(`✓ ${table}: removidos ${count ?? '?'}`)
  }

  const [{ count: a }, { count: s }, { count: sn }] = await Promise.all([
    supabase.from('associados').select('*', { count: 'exact', head: true }),
    supabase.from('secao').select('*', { count: 'exact', head: true }),
    supabase.from('secao_nome').select('*', { count: 'exact', head: true }),
  ])
  console.log(
    `\nConferência → associados=${a ?? 0}, secao=${s ?? 0}, secao_nome=${sn ?? 0}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
