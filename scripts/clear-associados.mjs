import { readFileSync, existsSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(filePath = '.env') {
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
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnv()

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env')
  process.exit(1)
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { count: before, error: countError } = await sb
  .from('associados')
  .select('*', { count: 'exact', head: true })

if (countError) {
  console.error(countError.message)
  process.exit(1)
}

console.log('Associados antes:', before ?? 0)

const { error, count } = await sb
  .from('associados')
  .delete({ count: 'exact' })
  .gte('associado_id', 1)

if (error) {
  console.error(error.message)
  process.exit(1)
}

console.log('Removidos:', count ?? 0)

const { count: after } = await sb
  .from('associados')
  .select('*', { count: 'exact', head: true })

console.log('Associados depois:', after ?? 0)
