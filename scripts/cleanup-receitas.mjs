/**
 * Limpa receitas + recebimentos + pagamentos de atividade vinculados.
 * Uso: node scripts/cleanup-receitas.mjs
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

const url = process.env.VITE_SUPABASE_URL || ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!url || !key) {
  console.error('Falta VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function count(table) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) return { error: error.message }
  return { count: count ?? 0 }
}

async function wipe(table, pk) {
  const before = await count(table)
  const { error, count: removed } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .gte(pk, 0)

  if (error) {
    console.log(`✗ ${table}: ${error.message}`)
    return
  }
  console.log(
    `✓ ${table}: antes=${before.count ?? '?'} removidos=${removed ?? '?'}`,
  )
}

async function main() {
  console.log('Limpando receitas e recebimentos...\n')

  const before = {
    receita_pagamento: await count('receita_pagamento'),
    receitas: await count('receitas'),
  }
  console.log('Antes:', before)

  // Filhos primeiro; atividade_pagamento.receita_id vira null (ON DELETE SET NULL)
  await wipe('receita_pagamento', 'pagamento_id')
  await wipe('receitas', 'receita_id')

  const after = {
    receita_pagamento: await count('receita_pagamento'),
    receitas: await count('receitas'),
  }
  console.log('\nDepois:', after)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
