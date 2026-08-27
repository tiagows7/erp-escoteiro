import type { SupabaseClient } from '@supabase/supabase-js'

/** Tipos de conquista máxima do movimento. */
export const CONQUISTA_TIPOS = [
  'cruzeiro_do_sul',
  'lis_de_ouro',
  'escoteiro_patria',
  'insignia_bp',
  'insignia_madeira',
] as const

export type ConquistaTipo = (typeof CONQUISTA_TIPOS)[number]

export const CONQUISTA_TIPO_LABEL: Record<ConquistaTipo, string> = {
  cruzeiro_do_sul: 'Cruzeiro do Sul',
  lis_de_ouro: 'Lis de Ouro',
  escoteiro_patria: 'Escoteiro da Pátria',
  insignia_bp: 'Insígnia de B.P.',
  insignia_madeira: 'Insígnia da Madeira',
}

/** Coluna do painel / ramo sugerido. */
export const CONQUISTA_COLUNAS = [
  {
    id: 'lobinho',
    titulo: 'Lobinho',
    tipo: 'cruzeiro_do_sul' as const,
    className: 'stat-card-lobinho',
  },
  {
    id: 'escoteiro',
    titulo: 'Escoteiro',
    tipo: 'lis_de_ouro' as const,
    className: 'stat-card-escoteiro',
  },
  {
    id: 'senior',
    titulo: 'Sênior',
    tipo: 'escoteiro_patria' as const,
    className: 'stat-card-senior',
  },
  {
    id: 'pioneiro',
    titulo: 'Pioneiro',
    tipo: 'insignia_bp' as const,
    className: 'stat-card-pioneiro',
  },
  {
    id: 'madeira',
    titulo: 'Voluntários',
    tipo: 'insignia_madeira' as const,
    className: 'stat-card-diretoria',
  },
] as const

/** Campos boolean/data no cadastro do associado (espelho). */
export const CONQUISTA_ASSOC_FIELDS: Record<
  ConquistaTipo,
  { flag: string; date: string }
> = {
  cruzeiro_do_sul: {
    flag: 'conquista_cruzeiro_do_sul',
    date: 'conquista_cruzeiro_do_sul_data',
  },
  lis_de_ouro: {
    flag: 'conquista_lis_de_ouro',
    date: 'conquista_lis_de_ouro_data',
  },
  escoteiro_patria: {
    flag: 'conquista_escoteiro_patria',
    date: 'conquista_escoteiro_patria_data',
  },
  insignia_bp: {
    flag: 'conquista_insignia_bp',
    date: 'conquista_insignia_bp_data',
  },
  insignia_madeira: {
    flag: 'conquista_insignia_madeira',
    date: 'conquista_insignia_madeira_data',
  },
}

export function isConquistaTipo(value: string): value is ConquistaTipo {
  return (CONQUISTA_TIPOS as readonly string[]).includes(value)
}

/** Sugere tipo conforme ramo (1–4 jovens; 5 / demais = madeira). */
export function sugestaoTipoPorRamo(ramo: number | null): ConquistaTipo {
  switch (ramo) {
    case 1:
      return 'cruzeiro_do_sul'
    case 2:
      return 'lis_de_ouro'
    case 3:
      return 'escoteiro_patria'
    case 4:
      return 'insignia_bp'
    default:
      return 'insignia_madeira'
  }
}

type SyncAssociadoConquistasInput = {
  empresaId: number
  associadoId: number
  ramo: number | null
  secao: number | null
  patrulha_matilha: number | null
  flags: Record<ConquistaTipo, { marcado: boolean; data: string | null }>
}

/** Espelha checkboxes do associado na tabela conquistas. */
export async function syncConquistasFromAssociado(
  client: SupabaseClient,
  input: SyncAssociadoConquistasInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const tipo of CONQUISTA_TIPOS) {
    const item = input.flags[tipo]
    if (item.marcado) {
      const { error } = await client.from('conquistas').upsert(
        {
          empresa_id: input.empresaId,
          associado_id: input.associadoId,
          ramo: input.ramo,
          secao: input.secao,
          patrulha_matilha: input.patrulha_matilha,
          tipo,
          data_conquista: item.data,
        },
        { onConflict: 'empresa_id,associado_id,tipo' },
      )
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await client
        .from('conquistas')
        .delete()
        .eq('empresa_id', input.empresaId)
        .eq('associado_id', input.associadoId)
        .eq('tipo', tipo)
      if (error) return { ok: false, error: error.message }
    }
  }
  return { ok: true }
}
