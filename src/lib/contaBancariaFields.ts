export type ContaBancariaFields = {
  descricao: string
  banco_nome: string
  agencia: string
  conta: string
  api_client_id: string
  api_client_secret: string
  api_pix_chave: string
  api_pix_ativo: boolean
  api_pix_cert: string
  api_pix_key: string
  api_pix_base_url: string
  /** InfiniteTag da InfinitePay (sem $). Vazio = usa PIX Sicredi. */
  infinitepay_handle: string
  /** Segredos já existem no banco (não são lidos pelo client). */
  has_api_client_secret?: boolean
  has_api_pix_cert?: boolean
  has_api_pix_key?: boolean
}

/** Normaliza a InfiniteTag: remove $ e espaços. */
export function normalizeInfinitePayHandle(value: string): string {
  return value.trim().replace(/^\$+/, '').trim()
}

export type ContaBancariaRow = ContaBancariaFields & {
  id: number
  empresa_id: number
  ramo_id: number | null
  secao_id: number | null
}

export const emptyContaBancariaFields = (): ContaBancariaFields => ({
  descricao: '',
  banco_nome: '',
  agencia: '',
  conta: '',
  api_client_id: '',
  api_client_secret: '',
  api_pix_chave: '',
  api_pix_ativo: false,
  api_pix_cert: '',
  api_pix_key: '',
  api_pix_base_url: '',
  infinitepay_handle: '',
  has_api_client_secret: false,
  has_api_pix_cert: false,
  has_api_pix_key: false,
})

export function contaBancariaFromRow(
  row: Partial<ContaBancariaFields> | null | undefined,
): ContaBancariaFields {
  return {
    descricao: row?.descricao ?? '',
    banco_nome: row?.banco_nome ?? '',
    agencia: row?.agencia ?? '',
    conta: row?.conta ?? '',
    api_client_id: row?.api_client_id ?? '',
    // Segredos nunca vêm do SELECT — campos ficam vazios para nova digitação.
    api_client_secret: '',
    api_pix_chave: row?.api_pix_chave ?? '',
    api_pix_ativo: row?.api_pix_ativo === true,
    api_pix_cert: '',
    api_pix_key: '',
    api_pix_base_url: row?.api_pix_base_url ?? '',
    infinitepay_handle: normalizeInfinitePayHandle(
      row?.infinitepay_handle ?? '',
    ),
    has_api_client_secret: row?.has_api_client_secret === true,
    has_api_pix_cert: row?.has_api_pix_cert === true,
    has_api_pix_key: row?.has_api_pix_key === true,
  }
}

export function contaBancariaToDb(
  fields: ContaBancariaFields,
  opts?: { keepExistingSecrets?: boolean },
) {
  const handle = normalizeInfinitePayHandle(fields.infinitepay_handle)
  const keep = opts?.keepExistingSecrets === true
  const payload: Record<string, unknown> = {
    descricao: fields.descricao.trim() || null,
    banco_nome: fields.banco_nome.trim() || null,
    agencia: fields.agencia.trim() || null,
    conta: fields.conta.trim() || null,
    api_client_id: fields.api_client_id.trim() || null,
    api_pix_chave: fields.api_pix_chave.trim() || null,
    api_pix_ativo: fields.api_pix_ativo === true,
    api_pix_base_url: fields.api_pix_base_url.trim() || null,
    infinitepay_handle: handle || null,
  }

  // Em edição, campo vazio = mantém o segredo já salvo (não sobrescreve com null).
  if (!keep || fields.api_client_secret.trim()) {
    payload.api_client_secret = fields.api_client_secret.trim() || null
  }
  if (!keep || fields.api_pix_cert.trim()) {
    payload.api_pix_cert = fields.api_pix_cert.trim() || null
  }
  if (!keep || fields.api_pix_key.trim()) {
    payload.api_pix_key = fields.api_pix_key.trim() || null
  }

  return payload
}

export function contaBancariaHasData(fields: ContaBancariaFields): boolean {
  return Boolean(
    fields.banco_nome.trim() ||
      fields.agencia.trim() ||
      fields.conta.trim() ||
      fields.api_client_id.trim() ||
      fields.api_client_secret.trim() ||
      fields.has_api_client_secret ||
      fields.api_pix_chave.trim() ||
      fields.api_pix_cert.trim() ||
      fields.has_api_pix_cert ||
      fields.api_pix_key.trim() ||
      fields.has_api_pix_key ||
      fields.infinitepay_handle.trim() ||
      fields.descricao.trim(),
  )
}

/** Colunas seguras ao ler conta bancária (sem PEM/secrets). */
export const CONTA_BANCARIA_SELECT =
  'id, empresa_id, ramo_id, secao_id, descricao, banco_nome, agencia, conta, api_client_id, api_pix_chave, api_pix_ativo, api_pix_base_url, infinitepay_handle, has_api_client_secret, has_api_pix_cert, has_api_pix_key'
