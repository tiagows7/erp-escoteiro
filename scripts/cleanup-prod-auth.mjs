/**
 * Após o SQL de limpeza opção A: remove usuários Auth que não são super_admin
 * e limpa arquivos de storage de grupos/operacional.
 *
 * Uso: node scripts/cleanup-prod-auth.mjs
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

async function listAllUsers() {
  const users = []
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error
    users.push(...(data.users ?? []))
    if (!data.users?.length || data.users.length < 200) break
    page += 1
  }
  return users
}

async function emptyBucket(bucket) {
  const { data: listed, error } = await supabase.storage.from(bucket).list('', {
    limit: 1000,
  })
  if (error) {
    console.log(`· storage ${bucket}: ${error.message}`)
    return
  }
  const folders = (listed ?? []).filter((x) => !x.id)
  const files = (listed ?? []).filter((x) => x.id)

  async function wipePrefix(prefix) {
    const { data } = await supabase.storage.from(bucket).list(prefix, {
      limit: 1000,
    })
    const items = data ?? []
    const filePaths = items
      .filter((i) => i.id)
      .map((i) => (prefix ? `${prefix}/${i.name}` : i.name))
    if (filePaths.length) {
      const { error: remErr } = await supabase.storage
        .from(bucket)
        .remove(filePaths)
      if (remErr) console.log(`✗ ${bucket}/${prefix}: ${remErr.message}`)
      else console.log(`✓ ${bucket}: removidos ${filePaths.length} em ${prefix || '/'}`)
    }
    for (const dir of items.filter((i) => !i.id)) {
      await wipePrefix(prefix ? `${prefix}/${dir.name}` : dir.name)
    }
  }

  for (const f of files) {
    const { error: remErr } = await supabase.storage.from(bucket).remove([f.name])
    if (remErr) console.log(`✗ ${bucket}/${f.name}: ${remErr.message}`)
  }
  for (const folder of folders) {
    await wipePrefix(folder.name)
  }
  if (!folders.length && !files.length) {
    console.log(`✓ storage ${bucket}: vazio`)
  }
}

async function main() {
  const { data: supers, error } = await supabase
    .from('profiles')
    .select('id, nome, email, role')
    .eq('role', 'super_admin')

  if (error) {
    console.error('Falha ao ler super_admin:', error.message)
    process.exit(1)
  }

  const keep = new Set((supers ?? []).map((p) => p.id))
  console.log(`Super admin mantidos: ${(supers ?? []).length}`)
  for (const p of supers ?? []) {
    console.log(`  - ${p.nome} <${p.email ?? p.id}>`)
  }
  if (keep.size === 0) {
    console.error('ABORTADO: nenhum super_admin restante. Não removo Auth.')
    process.exit(1)
  }

  const users = await listAllUsers()
  let removed = 0
  for (const u of users) {
    if (keep.has(u.id)) continue
    const { error: delErr } = await supabase.auth.admin.deleteUser(u.id)
    if (delErr) {
      console.log(`✗ auth ${u.email ?? u.id}: ${delErr.message}`)
    } else {
      removed += 1
      console.log(`✓ auth removido: ${u.email ?? u.id}`)
    }
  }
  console.log(`Auth removidos: ${removed}`)

  for (const bucket of [
    'grupo-logos',
    'despesa-notas',
    'produto-imagens',
    'acao-entre-amigos',
    'venda-eventos',
    'backups',
  ]) {
    await emptyBucket(bucket)
  }

  console.log('\nLimpeza Auth/storage concluída.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
