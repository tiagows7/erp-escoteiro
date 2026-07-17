/**
 * Aplica 004_grupo_logos_storage.sql via REST Management não disponível.
 * Usa o cliente JS para criar o bucket (service role).
 * Policies de storage precisam do SQL Editor se falharem aqui.
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
    if (!process.env[key]) process.env[key] = value
  }
}

loadEnvFile()

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: buckets, error: listError } = await admin.storage.listBuckets()
if (listError) {
  console.error('listBuckets:', listError.message)
  process.exit(1)
}

const exists = (buckets ?? []).some((b) => b.id === 'grupo-logos')
if (exists) {
  const { error } = await admin.storage.updateBucket('grupo-logos', {
    public: true,
    fileSizeLimit: '2097152',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  })
  if (error) console.error('updateBucket:', error.message)
  else console.log('Bucket grupo-logos atualizado.')
} else {
  const { error } = await admin.storage.createBucket('grupo-logos', {
    public: true,
    fileSizeLimit: '2097152',
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
  })
  if (error) {
    console.error('createBucket:', error.message)
    process.exit(1)
  }
  console.log('Bucket grupo-logos criado.')
}

console.log(
  'Se o upload falhar por RLS, rode supabase/migrations/004_grupo_logos_storage.sql no SQL Editor.',
)
