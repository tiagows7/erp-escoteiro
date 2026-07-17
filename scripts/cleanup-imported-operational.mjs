/**
 * Remove do Supabase dados operacionais importados do Firebird.
 * Mantém: ramos, estado, cidade, categoria, funcao
 * Mantém empresas que têm usuário (profiles) — grupos criados no app.
 *
 * Uso: npm run cleanup:operational
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

const PK = {
  movimento_estoque: 'movimentoest_id',
  produto_custo: 'produtopreco_id',
  produto_preco: 'produtopreco_id',
  despesas: 'despesa_id',
  fornecedor_despesa: 'fordespesa_id',
  produto: 'produto_id',
  grupo_produto: 'grupoproduto_id',
  associados: 'associado_id',
  secao_nome: 'secaonome_id',
  secao: 'secao_id',
  tipo_mensalidade: 'tipomensalidade_id',
  tipo_pagamento: 'tipopagto_id',
}

async function wipe(table) {
  const pk = PK[table]
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .gte(pk, 0)

  if (error) {
    console.log(`✗ ${table}: ${error.message}`)
    return
  }
  console.log(`✓ ${table}: removidos ${count ?? '?'}`)
}

async function main() {
  console.log('Limpando dados operacionais importados do Firebird...\n')

  for (const table of [
    'movimento_estoque',
    'produto_custo',
    'produto_preco',
    'despesas',
    'fornecedor_despesa',
    'produto',
    'grupo_produto',
    'associados',
    'secao_nome',
    'secao',
    'tipo_mensalidade',
    'tipo_pagamento',
  ]) {
    await wipe(table)
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('empresa_id')
  const used = new Set(
    (profiles || []).map((p) => p.empresa_id).filter((id) => id != null),
  )

  const { data: empresas } = await supabase.from('empresa').select('id, nome')
  const orphanIds = (empresas || [])
    .filter((e) => !used.has(e.id))
    .map((e) => e.id)

  if (orphanIds.length) {
    const { error, count } = await supabase
      .from('empresa')
      .delete({ count: 'exact' })
      .in('id', orphanIds)
    if (error) console.log(`✗ empresa órfãs: ${error.message}`)
    else
      console.log(
        `✓ empresa (sem usuário): removidas ${count ?? orphanIds.length}`,
      )
  } else {
    console.log(
      '✓ empresa: nenhuma órfã (grupos com usuário foram preservados)',
    )
  }

  console.log(
    '\nMantidos: ramos, estado, cidade, categoria, funcao + grupos com usuário.',
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
