import * as XLSX from 'xlsx'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Associado } from '@/types/database'

type Cell = string | number | boolean | Date | null | undefined

export type ImportAssociadosResult = {
  total: number
  inserted: number
  updated: number
  failed: { nome: string; motivo: string }[]
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

function norm(value: Cell): string {
  return cellStr(value).toUpperCase()
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

export async function importAssociadosFromPaxtuExcel(
  client: SupabaseClient,
  empresaId: number,
  file: ArrayBuffer,
): Promise<ImportAssociadosResult> {
  const rows = sheetToRows(file)
  const dataRows = rows.slice(1).filter((row) => cellStr(row?.[0]) || cellStr(row?.[1]))

  const [
    { data: categorias },
    { data: ramos },
    { data: secoes },
    { data: patrulhas },
    { data: cidades },
  ] = await Promise.all([
    client.from('categoria').select('categoria_id, nome'),
    client.from('ramos').select('ramo_id, nome'),
    client.from('secao').select('secao_id, nome').eq('empresa_id', empresaId),
    client
      .from('secao_nome')
      .select('secaonome_id, nome')
      .eq('empresa_id', empresaId),
    client.from('cidade').select('codigo, nome, uf'),
  ])

  const catMap = new Map(
    (categorias ?? []).map((c) => [norm(c.nome), c.categoria_id as number]),
  )
  const ramoMap = new Map(
    (ramos ?? []).map((r) => [norm(r.nome), r.ramo_id as number]),
  )
  const secaoMap = new Map(
    (secoes ?? []).map((s) => [norm(s.nome), s.secao_id as number]),
  )
  const patrulhaMap = new Map(
    (patrulhas ?? []).map((p) => [norm(p.nome), p.secaonome_id as number]),
  )
  const cidadeMap = new Map(
    (cidades ?? []).map((c) => [
      `${norm(c.nome)}|${norm(c.uf)}`,
      c.codigo as number,
    ]),
  )
  const cidadeByName = new Map<string, number>()
  for (const c of cidades ?? []) {
    const key = norm(c.nome)
    if (!cidadeByName.has(key) && c.codigo != null) {
      cidadeByName.set(key, c.codigo as number)
    }
  }

  const result: ImportAssociadosResult = {
    total: dataRows.length,
    inserted: 0,
    updated: 0,
    failed: [],
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
            cidadeMap.get(`${norm(cidadeNome)}|${norm(endereco.endereco_uf)}`) ??
            null
        }
        if (endereco_cidade == null) {
          endereco_cidade = cidadeByName.get(norm(cidadeNome)) ?? null
        }
      }

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
        categoria: catMap.get(norm(row[3])) ?? null,
        categoria2: catMap.get(norm(row[4])) ?? null,
        ramo: ramoMap.get(norm(row[6])) ?? null,
        secao: secaoMap.get(norm(row[12])) ?? null,
        patrulha_matilha: patrulhaMap.get(norm(row[13])) ?? null,
        fone_residencial: truncate(cellStr(row[14]) || null, 20),
        celular: truncate(cellStr(row[15]) || null, 20),
        email: truncate(cellStr(row[16]) || null, 130),
        rg: parseRg(cellStr(row[17])),
        cpf: truncate(cellStr(row[18]) || null, 15),
        data_nascimento: parseDate(row[19]),
        isento: false,
        // V = validade; W não usada; X–AB = responsável
        validade_registro: parseDate(row[21]),
        responsavel_nome: truncate(norm(row[23]) || null, 100),
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
    } catch (err) {
      result.failed.push({
        nome: nome || cellStr(row[0]) || 'Linha sem nome',
        motivo: err instanceof Error ? err.message : 'Erro desconhecido',
      })
    }
  }

  return result
}
