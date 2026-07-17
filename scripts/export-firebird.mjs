/**
 * Exporta tabelas do Firebird para CSV em data/export/
 * Requer isql do Firebird 3.
 *
 * Uso: npm run export:firebird
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const DB =
  process.env.FIREBIRD_DB ??
  'g:\\sistema\\BANCO\\bancosclientes\\BANCO_SCOUTH.FDB'
const USER = process.env.FIREBIRD_USER ?? 'SYSDBA'
const PASS = process.env.FIREBIRD_PASSWORD ?? 'masterkey'
const ISQL =
  process.env.FIREBIRD_ISQL ??
  'C:\\Program Files (x86)\\Firebird\\Firebird_3_0\\isql.exe'

const TABLES = [
  'EMPRESA',
  'RAMOS',
  'ESTADO',
  'CIDADE',
  'CATEGORIA',
  'FUNCAO',
  'SECAO',
  'SECAO_NOME',
  'TIPO_MENSALIDADE',
  'TIPO_PAGAMENTO',
  'ASSOCIADOS',
  'GRUPO_PRODUTO',
  'PRODUTO',
  'FORNECEDOR_DESPESA',
  'DESPESAS',
  'MOVIMENTO_ESTOQUE',
]

const outDir = path.resolve('data/export')
mkdirSync(outDir, { recursive: true })

if (!existsSync(ISQL)) {
  console.error('isql não encontrado:', ISQL)
  process.exit(1)
}

if (!existsSync(DB)) {
  console.error('Banco Firebird não encontrado:', DB)
  process.exit(1)
}

for (const table of TABLES) {
  const outFile = path.join(outDir, `${table.toLowerCase()}.csv`)
  const sql = `
SET LIST OFF;
SET HEADING ON;
OUTPUT '${outFile.replace(/\\/g, '/')}';
SELECT * FROM ${table};
OUTPUT;
QUIT;
`
  const result = spawnSync(ISQL, ['-user', USER, '-password', PASS, DB], {
    input: sql,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    console.error(`Falha ao exportar ${table}`)
    console.error(result.stdout)
    console.error(result.stderr)
    continue
  }
  console.log('OK', table, '->', outFile)
}

writeFileSync(
  path.join(outDir, 'README.txt'),
  [
    'Export gerado do Firebird.',
    'NÃO commitar este diretório (pode conter dados pessoais).',
    'Usuários NÃO são exportados aqui — criar no Supabase Auth e vincular em profiles.',
    '',
    `Fonte: ${DB}`,
    `Data: ${new Date().toISOString()}`,
  ].join('\n'),
)

console.log('\nExport concluído em', outDir)
