/**
 * Importa do Firebird APENAS dados de referência (não operacionais).
 *
 * Importa:
 *   - ramos, estado, cidade, categoria, funcao
 *
 * NÃO importa (ficam no app / criação de grupos):
 *   - empresa, associados, secao, secao_nome, produtos, estoque, despesas, usuários
 *
 * Uso:
 *   npm run import:firebird:dry
 *   npm run import:firebird
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Firebird = require('node-firebird')

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

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const FIREBIRD_DB =
  process.env.FIREBIRD_DB ||
  'g:\\sistema\\BANCO\\bancosclientes\\BANCO_SCOUTH.FDB'
const FIREBIRD_USER = process.env.FIREBIRD_USER || 'SYSDBA'
const FIREBIRD_PASSWORD = process.env.FIREBIRD_PASSWORD || 'masterkey'
const FIREBIRD_HOST = process.env.FIREBIRD_HOST || '127.0.0.1'
const FIREBIRD_PORT = Number(process.env.FIREBIRD_PORT || 3050)
const BATCH_SIZE = Number(process.env.IMPORT_BATCH_SIZE || 200)
const DRY_RUN =
  process.env.DRY_RUN === '1' || process.argv.includes('--dry')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env',
  )
  process.exit(1)
}

if (!existsSync(FIREBIRD_DB)) {
  console.error('Arquivo Firebird não encontrado:', FIREBIRD_DB)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/** Somente cadastros de apoio (sem vínculo com grupos) */
const TABLES = [
  {
    firebird: 'RAMOS',
    supabase: 'ramos',
    pk: 'ramo_id',
    map: {
      RAMO_ID: 'ramo_id',
      NOME: 'nome',
      IDADE_INICIO: 'idade_inicio',
      IDADE_FIM: 'idade_fim',
    },
  },
  {
    firebird: 'ESTADO',
    supabase: 'estado',
    pk: 'id',
    map: {
      ID: 'id',
      CODIGO: 'codigo',
      NOME: 'nome',
      IBG: 'ibg',
    },
  },
  {
    firebird: 'CIDADE',
    supabase: 'cidade',
    pk: 'id',
    map: {
      ID: 'id',
      CODIGO: 'codigo',
      NOME: 'nome',
      UF: 'uf',
    },
  },
  {
    firebird: 'CATEGORIA',
    supabase: 'categoria',
    pk: 'categoria_id',
    map: {
      CATEGORIA_ID: 'categoria_id',
      NOME: 'nome',
    },
  },
  {
    firebird: 'FUNCAO',
    supabase: 'funcao',
    pk: 'funcao_id',
    map: {
      FUNCAO_ID: 'funcao_id',
      NOME: 'nome',
    },
  },
]

function cleanText(value) {
  if (value == null) return null
  if (typeof value !== 'string') return value
  return value.replace(/\0/g, '').trim() || null
}

function mapRow(table, raw) {
  const out = {}
  for (const [src, dest] of Object.entries(table.map)) {
    let value = raw[src]
    if (value === undefined) value = raw[src.toLowerCase()]
    if (typeof value === 'string') value = cleanText(value)
    else if (Buffer.isBuffer(value)) value = cleanText(value.toString('latin1'))
    out[dest] = value
  }
  return out
}

function queryFirebird(sql) {
  const options = {
    host: FIREBIRD_HOST,
    port: FIREBIRD_PORT,
    database: FIREBIRD_DB,
    user: FIREBIRD_USER,
    password: FIREBIRD_PASSWORD,
    lowercase_keys: false,
    encoding: 'WIN1252',
  }

  return new Promise((resolve, reject) => {
    Firebird.attach(options, (err, db) => {
      if (err) return reject(err)
      db.query(sql, (queryErr, result) => {
        db.detach()
        if (queryErr) reject(queryErr)
        else resolve(result || [])
      })
    })
  })
}

async function upsertBatch(table, rows) {
  if (!rows.length) return { count: 0 }

  if (DRY_RUN) {
    console.log(`  [dry-run] ${table.supabase}: ${rows.length} linhas`)
    return { count: rows.length }
  }

  let imported = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from(table.supabase).upsert(chunk, {
      onConflict: table.pk,
      ignoreDuplicates: false,
    })
    if (error) {
      throw new Error(
        `${table.supabase} (lote ${i / BATCH_SIZE + 1}): ${error.message}`,
      )
    }
    imported += chunk.length
    process.stdout.write(`\r  ${table.supabase}: ${imported}/${rows.length}`)
  }
  process.stdout.write('\n')
  return { count: imported }
}

function buildSequenceSql(results) {
  const lines = [
    '-- Rode no SQL Editor do Supabase após o import',
    '-- Alinha as sequences com os IDs importados do Firebird',
    '',
  ]
  for (const item of results) {
    if (item.status !== 'ok' || !item.maxId) continue
    lines.push(
      `select setval(pg_get_serial_sequence('public.${item.table}', '${item.pk}'), greatest(${item.maxId}, 1));`,
    )
  }
  lines.push('')
  return lines.join('\n')
}

async function main() {
  console.log('Firebird → Supabase (somente referência)')
  console.log('DB:', FIREBIRD_DB)
  console.log('URL:', SUPABASE_URL)
  console.log(
    'Ignorado: empresa, associados, seção, patrulha, produtos, estoque, despesas, usuários',
  )
  if (DRY_RUN) console.log('MODO DRY_RUN (não grava no Supabase)')

  const ping = await queryFirebird('select count(*) as CNT from CIDADE')
  console.log('Cidades no Firebird:', ping[0]?.CNT ?? ping[0]?.cnt)

  const summary = []

  for (const table of TABLES) {
    process.stdout.write(`\n→ ${table.firebird} ... `)
    let raw
    try {
      raw = await queryFirebird(`select * from ${table.firebird}`)
    } catch (err) {
      console.log('ERRO leitura:', err.message)
      summary.push({
        table: table.supabase,
        status: 'erro-leitura',
        detail: err.message,
      })
      continue
    }

    console.log(`${raw.length} linhas`)
    const mapped = raw
      .map((row) => mapRow(table, row))
      .filter((row) => row[table.pk] != null)

    try {
      const { count } = await upsertBatch(table, mapped)
      const maxId = mapped.reduce(
        (max, row) => Math.max(max, Number(row[table.pk]) || 0),
        0,
      )
      summary.push({
        table: table.supabase,
        pk: table.pk,
        status: 'ok',
        count,
        maxId,
      })
    } catch (err) {
      console.error('  FALHA:', err.message)
      summary.push({
        table: table.supabase,
        status: 'erro',
        detail: err.message,
      })
    }
  }

  console.log('\n========== RESUMO ==========')
  for (const item of summary) {
    if (item.status === 'ok') console.log(`✓ ${item.table}: ${item.count}`)
    else console.log(`✗ ${item.table}: ${item.status} ${item.detail || ''}`)
  }

  const outDir = path.resolve('data/export')
  mkdirSync(outDir, { recursive: true })
  const seqFile = path.join(outDir, 'fix-sequences.sql')
  writeFileSync(seqFile, buildSequenceSql(summary), 'utf8')
  console.log('\nSQL de sequences gerado em:', seqFile)
}

main().catch((err) => {
  console.error('\nFalha geral:', err)
  process.exit(1)
})
