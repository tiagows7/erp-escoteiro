import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const PAGE_SIZE = 1000
const BUCKET = 'backups'
const SIGNED_URL_SECONDS = 60 * 60 // 1h

/** Tabelas com filtro por empresa_id (ou id, no caso de empresa). */
const TENANT_TABLES: { name: string; filterColumn: string }[] = [
  { name: 'empresa', filterColumn: 'id' },
  { name: 'profiles', filterColumn: 'empresa_id' },
  { name: 'secao', filterColumn: 'empresa_id' },
  { name: 'secao_nome', filterColumn: 'empresa_id' },
  { name: 'tipo_mensalidade', filterColumn: 'empresa_id' },
  { name: 'tipo_pagamento', filterColumn: 'empresa_id' },
  { name: 'associados', filterColumn: 'empresa_id' },
  { name: 'grupo_produto', filterColumn: 'empresa_id' },
  { name: 'produto', filterColumn: 'empresa_id' },
  { name: 'produto_custo', filterColumn: 'empresa_id' },
  { name: 'produto_preco', filterColumn: 'empresa_id' },
  { name: 'fornecedor_despesa', filterColumn: 'empresa_id' },
  { name: 'despesas', filterColumn: 'empresa_id' },
  { name: 'despesa_pagamento', filterColumn: 'empresa_id' },
  { name: 'movimento_estoque', filterColumn: 'empresa_id' },
  { name: 'receitas', filterColumn: 'empresa_id' },
  { name: 'receita_pagamento', filterColumn: 'empresa_id' },
  { name: 'atividades', filterColumn: 'empresa_id' },
  { name: 'atividade_confirmacao', filterColumn: 'empresa_id' },
  { name: 'atividade_pagamento', filterColumn: 'empresa_id' },
  { name: 'projetos', filterColumn: 'empresa_id' },
  { name: 'calendario_grupo', filterColumn: 'empresa_id' },
  { name: 'empresa_saldo_local', filterColumn: 'empresa_id' },
  { name: 'acao_entre_amigos', filterColumn: 'empresa_id' },
  { name: 'acao_entre_amigos_faixa', filterColumn: 'empresa_id' },
  { name: 'acao_entre_amigos_venda', filterColumn: 'empresa_id' },
  { name: 'venda_eventos', filterColumn: 'empresa_id' },
  { name: 'venda_evento_compra', filterColumn: 'empresa_id' },
  { name: 'venda_evento_convite', filterColumn: 'empresa_id' },
  { name: 'venda_evento_tipo', filterColumn: 'empresa_id' },
  { name: 'loja_pedido', filterColumn: 'empresa_id' },
  { name: 'loja_pedido_item', filterColumn: 'empresa_id' },
  { name: 'infinitepay_pedidos', filterColumn: 'empresa_id' },
  { name: 'pix_cobrancas', filterColumn: 'empresa_id' },
  { name: 'empresa_ramo_pix_sicredi', filterColumn: 'empresa_id' },
  { name: 'empresa_conta_bancaria', filterColumn: 'empresa_id' },
  { name: 'lgpd_consentimento_log', filterColumn: 'empresa_id' },
  { name: 'auditoria_log', filterColumn: 'empresa_id' },
]

/** Cadastros globais (sem tenant). */
const GLOBAL_TABLES = ['ramos', 'estado', 'cidade', 'categoria', 'funcao'] as const

/** Campos sensíveis omitidos / mascarados no export. */
const REDACT_FIELDS: Record<string, string[]> = {
  empresa: [
    'sicredi_pix_client_secret',
    'sicredi_pix_cert',
    'sicredi_pix_key',
  ],
  empresa_ramo_pix_sicredi: [
    'sicredi_pix_client_secret',
    'sicredi_pix_cert',
    'sicredi_pix_key',
  ],
  empresa_conta_bancaria: [
    'api_client_secret',
    'api_pix_cert',
    'api_pix_key',
  ],
}

type Payload = {
  empresa_id?: number | null
  include_lookups?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Não autenticado.' }, 401)
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser()

    if (callerError || !caller) {
      return json({ error: 'Sessão inválida.' }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceKey)

    const { data: profile } = await adminClient
      .from('profiles')
      .select('role, ativo')
      .eq('id', caller.id)
      .maybeSingle()

    if (!profile || profile.ativo === false || profile.role !== 'super_admin') {
      return json(
        { error: 'Apenas super admin pode gerar backup.' },
        403,
      )
    }

    const body = (await req.json().catch(() => ({}))) as Payload
    const empresaId =
      body.empresa_id != null && Number.isFinite(Number(body.empresa_id))
        ? Number(body.empresa_id)
        : null
    const includeLookups = body.include_lookups !== false

    if (empresaId != null) {
      const { data: empresa } = await adminClient
        .from('empresa')
        .select('id, nome, slug')
        .eq('id', empresaId)
        .maybeSingle()
      if (!empresa) {
        return json({ error: 'Grupo não encontrado.' }, 404)
      }
    }

    const tables: Record<string, unknown[]> = {}
    const counts: Record<string, number> = {}
    const warnings: string[] = []

    for (const { name, filterColumn } of TENANT_TABLES) {
      try {
        const rows = await fetchAll(adminClient, name, (q) =>
          empresaId != null ? q.eq(filterColumn, empresaId) : q,
        )
        tables[name] = redactRows(name, rows)
        counts[name] = rows.length
      } catch (err) {
        warnings.push(
          `${name}: ${err instanceof Error ? err.message : 'falha ao exportar'}`,
        )
        tables[name] = []
        counts[name] = 0
      }
    }

    if (includeLookups) {
      for (const name of GLOBAL_TABLES) {
        try {
          const rows = await fetchAll(adminClient, name)
          tables[name] = rows
          counts[name] = rows.length
        } catch (err) {
          warnings.push(
            `${name}: ${err instanceof Error ? err.message : 'falha ao exportar'}`,
          )
          tables[name] = []
          counts[name] = 0
        }
      }
    }

    const generatedAt = new Date().toISOString()
    const scope =
      empresaId != null ? `empresa-${empresaId}` : 'plataforma'
    const stamp = generatedAt.replace(/[:.]/g, '-').slice(0, 19)
    const path = `${scope}/backup-${stamp}.json`

    const payload = {
      format: 'erp-escoteiro-logical-backup',
      version: 1,
      generated_at: generatedAt,
      generated_by: caller.id,
      scope: empresaId != null ? { type: 'empresa', empresa_id: empresaId } : {
        type: 'plataforma',
      },
      note:
        'Export lógico JSON. Segredos de API/PIX foram omitidos. Não substitui backup físico do Supabase (PITR).',
      counts,
      warnings,
      tables,
    }

    const bodyText = JSON.stringify(payload)
    const bytes = new TextEncoder().encode(bodyText)

    const { error: uploadError } = await adminClient.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: 'application/json',
        upsert: false,
      })

    if (uploadError) {
      return json(
        {
          error: `Falha ao gravar backup no Storage: ${uploadError.message}. Verifique se a migration 033 (bucket backups) foi aplicada.`,
        },
        500,
      )
    }

    const { data: signed, error: signedError } = await adminClient.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS)

    if (signedError || !signed?.signedUrl) {
      return json(
        {
          error:
            signedError?.message ??
            'Backup gravado, mas não foi possível gerar o link de download.',
          path,
        },
        500,
      )
    }

    return json({
      ok: true,
      path,
      download_url: signed.signedUrl,
      expires_in_seconds: SIGNED_URL_SECONDS,
      generated_at: generatedAt,
      scope: payload.scope,
      counts,
      warnings,
      size_bytes: bytes.byteLength,
    })
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Erro inesperado.' },
      500,
    )
  }
})

// deno-lint-ignore no-explicit-any
type AdminClient = any

async function fetchAll(
  client: AdminClient,
  table: string,
  applyFilter?: (q: any) => any,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  let from = 0

  for (;;) {
    let query = client.from(table).select('*').range(from, from + PAGE_SIZE - 1)
    if (applyFilter) query = applyFilter(query)

    const { data, error } = await query
    if (error) {
      // Tabela pode não existir em ambientes sem todas as migrations
      if (
        error.message?.toLowerCase().includes('does not exist') ||
        error.code === '42P01' ||
        error.code === 'PGRST205'
      ) {
        return all
      }
      throw new Error(error.message)
    }

    const rows = (data ?? []) as Record<string, unknown>[]
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return all
}

function redactRows(
  table: string,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const fields = REDACT_FIELDS[table]
  if (!fields?.length) return rows
  return rows.map((row) => {
    const copy = { ...row }
    for (const field of fields) {
      if (field in copy && copy[field] != null && copy[field] !== '') {
        copy[field] = '[REDACTED]'
      }
    }
    return copy
  })
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
