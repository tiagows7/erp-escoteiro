/** Carrega UF/cidades do banco; se vazio, usa a API pública do IBGE. */

export type EstadoOpt = { codigo: string; nome: string }
export type CidadeOpt = { id: number; nome: string }

type IbgeEstado = { id: number; sigla: string; nome: string }
type IbgeMunicipio = { id: number; nome: string }

async function fetchEstadosIbge(): Promise<EstadoOpt[]> {
  const res = await fetch(
    'https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome',
  )
  if (!res.ok) return []
  const data = (await res.json()) as IbgeEstado[]
  return data.map((e) => ({
    codigo: String(e.sigla).toUpperCase(),
    nome: e.nome,
  }))
}

async function fetchCidadesIbge(uf: string): Promise<CidadeOpt[]> {
  const sigla = uf.trim().toUpperCase()
  if (!sigla) return []
  const res = await fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(sigla)}/municipios?orderBy=nome`,
  )
  if (!res.ok) return []
  const data = (await res.json()) as IbgeMunicipio[]
  return data.map((c) => ({
    id: Number(c.id),
    nome: c.nome,
  }))
}

export async function loadEstados(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
): Promise<EstadoOpt[]> {
  const { data, error } = await supabase
    .from('estado')
    .select('codigo, nome')
    .order('nome')

  if (!error && data && data.length > 0) {
    return (data as { codigo: string; nome: string }[]).map((row) => ({
      codigo: String(row.codigo).toUpperCase(),
      nome: row.nome,
    }))
  }

  return fetchEstadosIbge()
}

export async function loadCidades(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
  uf: string,
): Promise<CidadeOpt[]> {
  const sigla = uf.trim().toUpperCase()
  if (!sigla) return []

  const { data, error } = await supabase
    .from('cidade')
    .select('id, codigo, nome')
    .eq('uf', sigla)
    .order('nome')
    .limit(2000)

  if (!error && data && data.length > 0) {
    return (
      data as { id: number; codigo: number | null; nome: string }[]
    ).map((row) => {
      // Preferência: código IBGE (mesmo valor usado pela API e por empresa.cidade).
      const codigo = row.codigo != null ? Number(row.codigo) : null
      return {
        id: codigo && Number.isFinite(codigo) ? codigo : Number(row.id),
        nome: row.nome,
      }
    })
  }

  return fetchCidadesIbge(sigla)
}
