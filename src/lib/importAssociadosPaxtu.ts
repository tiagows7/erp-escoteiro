import * as XLSX from 'xlsx'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createUsuario } from '@/lib/createUsuario'
import type { Associado } from '@/types/database'

type Cell = string | number | boolean | Date | null | undefined

export type ImportAssociadosResult = {
  total: number
  inserted: number
  updated: number
  createdLookups: number
  createdUsers: number
  usersSkipped: number
  usersFailed: number
  failed: { nome: string; motivo: string }[]
  userErrors: { nome: string; motivo: string }[]
}

function cellStr(value: Cell): string {
  if (value == null) return ''
  if (value instanceof Date) {
    const d = value.getDate().toString().padStart(2, '0')
    const m = (value.getMonth() + 1).toString().padStart(2, '0')
    const y = value.getFullYear()
    return `${d}/${m}/${y}`
  }
  return String(value).trim()
}

/** Chave de comparação: maiúsculas sem acento */
function normKey(value: Cell): string {
  return cellStr(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
}

function displayName(value: Cell, max: number): string | null {
  const text = cellStr(value).toUpperCase().trim()
  if (!text) return null
  return text.length > max ? text.slice(0, max) : text
}

function truncate(value: string | null, max: number): string | null {
  if (!value) return null
  return value.length > max ? value.slice(0, max) : value
}

function parseRegistro(raw: string): { registro: number; identificador: number | null } | null {
  const text = raw.trim()
  if (!text) return null
  const dash = text.indexOf('-')
  if (dash <= 0) {
    const n = Number(text)
    return Number.isFinite(n) ? { registro: n, identificador: null } : null
  }
  const registro = Number(text.slice(0, dash).trim())
  const identificador = Number(text.slice(dash + 1).trim().slice(0, 5))
  if (!Number.isFinite(registro)) return null
  return {
    registro,
    identificador: Number.isFinite(identificador) ? identificador : null,
  }
}

/** Excel serial date or BR string → YYYY-MM-DD */
function parseDate(value: Cell): string | null {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (!parsed) return null
    const m = String(parsed.m).padStart(2, '0')
    const d = String(parsed.d).padStart(2, '0')
    return `${parsed.y}-${m}-${d}`
  }
  const text = cellStr(value)
  const br = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (br) {
    const day = br[1].padStart(2, '0')
    const month = br[2].padStart(2, '0')
    let year = br[3]
    if (year.length === 2) year = Number(year) > 50 ? `19${year}` : `20${year}`
    return `${year}-${month}-${day}`
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  return null
}

function takeUntilDash(text: string): { part: string; rest: string } {
  const pos = text.indexOf('-')
  if (pos < 0) return { part: text.trim(), rest: '' }
  return {
    part: text.slice(0, pos).trim(),
    rest: text.slice(pos + 1).trimStart(),
  }
}

function parseEndereco(raw: string): {
  endereco: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  cidadeNome: string | null
  endereco_uf: string | null
  endereco_cep: string | null
} {
  let auxiliar = raw.trim()
  if (!auxiliar) {
    return {
      endereco: null,
      endereco_numero: null,
      endereco_complemento: null,
      endereco_bairro: null,
      cidadeNome: null,
      endereco_uf: null,
      endereco_cep: null,
    }
  }

  const dashCount = (auxiliar.match(/-/g) || []).length
  let part: string

  ;({ part, rest: auxiliar } = takeUntilDash(auxiliar))
  const endereco = truncate(part.toUpperCase() || null, 80)

  ;({ part, rest: auxiliar } = takeUntilDash(auxiliar))
  const endereco_numero = truncate(part || null, 15)

  let endereco_complemento: string | null = null
  if (dashCount > 6) {
    ;({ part, rest: auxiliar } = takeUntilDash(auxiliar))
    endereco_complemento = truncate(part || null, 20)
  }

  ;({ part, rest: auxiliar } = takeUntilDash(auxiliar))
  const endereco_bairro = truncate(part.toUpperCase() || null, 30)

  ;({ part, rest: auxiliar } = takeUntilDash(auxiliar))
  const cidadeNome = part.trim() || null

  ;({ part, rest: auxiliar } = takeUntilDash(auxiliar))
  const endereco_uf = truncate(part.slice(0, 2).toUpperCase() || null, 2)
  const endereco_cep = truncate(
    auxiliar.replace(/-/g, '').replace(/\D/g, '').slice(0, 8) || null,
    8,
  )

  return {
    endereco,
    endereco_numero,
    endereco_complemento,
    endereco_bairro,
    cidadeNome,
    endereco_uf,
    endereco_cep,
  }
}

function parseRg(raw: string): string | null {
  const text = raw.trim()
  if (text.length <= 4) return null
  const slash = text.indexOf('/')
  const rg = slash >= 0 ? text.slice(0, slash) : text
  return truncate(rg, 15)
}

/** Senha = data nascimento DD/MM/AAAA sem barras → DDMMAAAA */
export function passwordFromNascimento(
  isoDate: string | null | undefined,
): string | null {
  if (!isoDate) return null
  const [y, m, d] = isoDate.slice(0, 10).split('-')
  if (!y || !m || !d || y.length !== 4) return null
  return `${d}${m}${y}`
}

function sheetToRows(file: ArrayBuffer): Cell[][] {
  const workbook = XLSX.read(file, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []
  const sheet = workbook.Sheets[sheetName]
  return XLSX.utils.sheet_to_json<Cell[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
  })
}

type LookupCache = {
  map: Map<string, number>
  created: number
}

async function ensureByNome(
  cache: LookupCache,
  rawNome: Cell,
  maxLen: number,
  insert: (nome: string) => Promise<number>,
): Promise<number | null> {
  const nome = displayName(rawNome, maxLen)
  if (!nome) return null
  const key = normKey(nome)
  const existing = cache.map.get(key)
  if (existing != null) return existing

  const id = await insert(nome)
  cache.map.set(key, id)
  cache.created += 1
  return id
}

export async function importAssociadosFromPaxtuExcel(
  client: SupabaseClient,
  empresaId: number,
  file: ArrayBuffer,
): Promise<ImportAssociadosResult> {
  const rows = sheetToRows(file)
  const dataRows = rows.slice(1).filter((row) => cellStr(row?.[0]) || cellStr(row?.[1]))

  const [
    { data: categorias },
    { data: funcoes },
    { data: ramos },
    { data: secoes },
    { data: patrulhas },
    { data: cidades },
  ] = await Promise.all([
    client.from('categoria').select('categoria_id, nome'),
    client.from('funcao').select('funcao_id, nome'),
    client.from('ramos').select('ramo_id, nome'),
    client.from('secao').select('secao_id, nome').eq('empresa_id', empresaId),
    client
      .from('secao_nome')
      .select('secaonome_id, nome')
      .eq('empresa_id', empresaId),
    client.from('cidade').select('codigo, nome, uf'),
  ])

  const catCache: LookupCache = {
    map: new Map(
      (categorias ?? []).map((c) => [
        normKey(c.nome),
        c.categoria_id as number,
      ]),
    ),
    created: 0,
  }
  const funcaoCache: LookupCache = {
    map: new Map(
      (funcoes ?? []).map((f) => [normKey(f.nome), f.funcao_id as number]),
    ),
    created: 0,
  }
  const ramoCache: LookupCache = {
    map: new Map(
      (ramos ?? []).map((r) => [normKey(r.nome), r.ramo_id as number]),
    ),
    created: 0,
  }
  const secaoCache: LookupCache = {
    map: new Map(
      (secoes ?? []).map((s) => [normKey(s.nome), s.secao_id as number]),
    ),
    created: 0,
  }
  const patrulhaCache: LookupCache = {
    map: new Map(
      (patrulhas ?? []).map((p) => [
        normKey(p.nome),
        p.secaonome_id as number,
      ]),
    ),
    created: 0,
  }

  const cidadeMap = new Map(
    (cidades ?? []).map((c) => [
      `${normKey(c.nome)}|${normKey(c.uf)}`,
      c.codigo as number,
    ]),
  )
  const cidadeByName = new Map<string, number>()
  for (const c of cidades ?? []) {
    const key = normKey(c.nome)
    if (!cidadeByName.has(key) && c.codigo != null) {
      cidadeByName.set(key, c.codigo as number)
    }
  }

  async function resolveCategoria(raw: Cell): Promise<number | null> {
    return ensureByNome(catCache, raw, 50, async (nome) => {
      const { data, error } = await client
        .from('categoria')
        .insert({ nome })
        .select('categoria_id')
        .single()
      if (error) throw new Error(`Categoria "${nome}": ${error.message}`)
      return data.categoria_id as number
    })
  }

  async function resolveFuncao(raw: Cell): Promise<number | null> {
    return ensureByNome(funcaoCache, raw, 30, async (nome) => {
      const { data, error } = await client
        .from('funcao')
        .insert({ nome })
        .select('funcao_id')
        .single()
      if (error) throw new Error(`Função "${nome}": ${error.message}`)
      return data.funcao_id as number
    })
  }

  async function resolveRamo(raw: Cell): Promise<number | null> {
    const nome = displayName(raw, 50)
    if (!nome) return null
    const key = normKey(nome)
    const existing = ramoCache.map.get(key)
    if (existing != null) return existing
    // Nao cria ramos novos (evita cards como "NAO SE APLICA")
    return null
  }

  async function resolveSecao(
    raw: Cell,
    ramoId: number | null,
  ): Promise<number | null> {
    return ensureByNome(secaoCache, raw, 80, async (nome) => {
      const { data, error } = await client
        .from('secao')
        .insert({
          empresa_id: empresaId,
          nome,
          ramo: ramoId,
        })
        .select('secao_id')
        .single()
      if (error) throw new Error(`Seção "${nome}": ${error.message}`)
      return data.secao_id as number
    })
  }

  async function resolvePatrulha(
    raw: Cell,
    ramoId: number | null,
    secaoId: number | null,
  ): Promise<number | null> {
    return ensureByNome(patrulhaCache, raw, 80, async (nome) => {
      const { data, error } = await client
        .from('secao_nome')
        .insert({
          empresa_id: empresaId,
          nome,
          ramo: ramoId,
          secao: secaoId,
        })
        .select('secaonome_id')
        .single()
      if (error) {
        throw new Error(`Patrulha/Matilha/Clã "${nome}": ${error.message}`)
      }
      return data.secaonome_id as number
    })
  }

  const result: ImportAssociadosResult = {
    total: dataRows.length,
    inserted: 0,
    updated: 0,
    createdLookups: 0,
    createdUsers: 0,
    usersSkipped: 0,
    usersFailed: 0,
    failed: [],
    userErrors: [],
  }

  for (const row of dataRows) {
    const nomeRaw = cellStr(row[1])
    const nome = truncate(nomeRaw.toUpperCase(), 100)
    try {
      const reg = parseRegistro(cellStr(row[0]))
      if (!reg || !nome) {
        throw new Error('Registro ou nome inválido')
      }

      const endereco = parseEndereco(cellStr(row[2]))
      // Coluna U: cidade do associado
      const cidadeNome = cellStr(row[20]) || endereco.cidadeNome
      let endereco_cidade: number | null = null
      if (cidadeNome) {
        if (endereco.endereco_uf) {
          endereco_cidade =
            cidadeMap.get(`${normKey(cidadeNome)}|${normKey(endereco.endereco_uf)}`) ??
            null
        }
        if (endereco_cidade == null) {
          endereco_cidade = cidadeByName.get(normKey(cidadeNome)) ?? null
        }
      }

      const categoria = await resolveCategoria(row[3])
      const categoria2 = await resolveCategoria(row[4])
      // Coluna F (índice 5) costuma vir entre categorias e ramo no Paxtu
      const funcao = await resolveFuncao(row[5])
      const ramo = await resolveRamo(row[6])
      const secao = await resolveSecao(row[12], ramo)
      const patrulha_matilha = await resolvePatrulha(row[13], ramo, secao)
      const dataNascimento = parseDate(row[19])

      const payload: Partial<Associado> = {
        empresa_id: empresaId,
        registro: reg.registro,
        registro_identificador: reg.identificador,
        nome,
        endereco: endereco.endereco,
        endereco_numero: endereco.endereco_numero,
        endereco_complemento: endereco.endereco_complemento,
        endereco_bairro: endereco.endereco_bairro,
        endereco_cidade,
        endereco_uf: endereco.endereco_uf,
        endereco_cep: endereco.endereco_cep,
        categoria,
        categoria2,
        funcao,
        ramo,
        secao,
        patrulha_matilha,
        fone_residencial: truncate(cellStr(row[14]) || null, 20),
        celular: truncate(cellStr(row[15]) || null, 20),
        email: truncate(cellStr(row[16]) || null, 130),
        rg: parseRg(cellStr(row[17])),
        cpf: truncate(cellStr(row[18]) || null, 15),
        data_nascimento: dataNascimento,
        isento: false,
        // V = validade; W não usada; X–AB = responsável
        validade_registro: parseDate(row[21]),
        responsavel_nome: displayName(row[23], 100),
        responsavel_foneresi: truncate(cellStr(row[24]) || null, 20),
        responsavel_fonecelular: truncate(cellStr(row[25]) || null, 20),
        responsavel_email: truncate(cellStr(row[26]) || null, 130),
        responsavel_cpf: truncate(cellStr(row[27]) || null, 15),
        ativo: true,
      }

      const { data: existing, error: findError } = await client
        .from('associados')
        .select('associado_id')
        .eq('empresa_id', empresaId)
        .eq('registro', reg.registro)
        .maybeSingle()

      if (findError) throw new Error(findError.message)

      if (existing?.associado_id) {
        const { error } = await client
          .from('associados')
          .update(payload)
          .eq('associado_id', existing.associado_id)
        if (error) throw new Error(error.message)
        result.updated += 1
      } else {
        const { error } = await client.from('associados').insert(payload)
        if (error) throw new Error(error.message)
        result.inserted += 1
      }

      // Usuario de acesso: login = registro, senha = DDMMAAAA
      const userStatus = await ensureUsuarioFromAssociado({
        client,
        nome,
        registro: reg.registro,
        dataNascimento,
        ramo,
        secao,
      })
      if (userStatus.status === 'created') result.createdUsers += 1
      else if (userStatus.status === 'skipped') result.usersSkipped += 1
      else {
        result.usersFailed += 1
        if (result.userErrors.length < 20) {
          result.userErrors.push({
            nome,
            motivo: userStatus.error || 'Falha ao criar usuário',
          })
        }
      }
    } catch (err) {
      result.failed.push({
        nome: nome || cellStr(row[0]) || 'Linha sem nome',
        motivo: err instanceof Error ? err.message : 'Erro desconhecido',
      })
    }
  }

  result.createdLookups =
    catCache.created +
    funcaoCache.created +
    ramoCache.created +
    secaoCache.created +
    patrulhaCache.created

  return result
}

async function ensureUsuarioFromAssociado(opts: {
  client: SupabaseClient
  nome: string
  registro: number
  dataNascimento: string | null
  ramo: number | null
  secao: number | null
}): Promise<
  | { status: 'created' }
  | { status: 'skipped' }
  | { status: 'failed'; error: string }
> {
  const registroStr = String(opts.registro)
  const password = passwordFromNascimento(opts.dataNascimento)
  if (!password) return { status: 'skipped' }

  const { data: existing } = await opts.client
    .from('profiles')
    .select('id')
    .eq('registro', registroStr)
    .maybeSingle()

  if (existing?.id) return { status: 'skipped' }

  const codigoRamo =
    opts.ramo != null && opts.ramo >= 1 && opts.ramo <= 4 ? opts.ramo : null

  // Sem e-mail do associado: Auth usa r{registro}@usuarios.local (login por registro)
  const result = await createUsuario({
    nome: opts.nome,
    registro: registroStr,
    password,
    role: 'leitura',
    ativo: true,
    codigo_ramo: codigoRamo,
    codigo_secao: opts.secao,
  })

  if (!result.ok) {
    const msg = (result.error ?? '').toLowerCase()
    // Ja existe no Auth / registro duplicado → nao aborta a importacao
    if (
      msg.includes('already') ||
      msg.includes('registered') ||
      msg.includes('duplicate') ||
      msg.includes('unique') ||
      msg.includes('já') ||
      msg.includes('ja ')
    ) {
      return { status: 'skipped' }
    }
    return { status: 'failed', error: result.error || 'Falha ao criar usuário' }
  }

  return { status: 'created' }
}
