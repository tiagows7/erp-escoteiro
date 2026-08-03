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
    api_client_secret: row?.api_client_secret ?? '',
    api_pix_chave: row?.api_pix_chave ?? '',
    api_pix_ativo: row?.api_pix_ativo === true,
    api_pix_cert: row?.api_pix_cert ?? '',
    api_pix_key: row?.api_pix_key ?? '',
    api_pix_base_url: row?.api_pix_base_url ?? '',
  }
}

export function contaBancariaToDb(fields: ContaBancariaFields) {
  return {
    descricao: fields.descricao.trim() || null,
    banco_nome: fields.banco_nome.trim() || null,
    agencia: fields.agencia.trim() || null,
    conta: fields.conta.trim() || null,
    api_client_id: fields.api_client_id.trim() || null,
    api_client_secret: fields.api_client_secret.trim() || null,
    api_pix_chave: fields.api_pix_chave.trim() || null,
    api_pix_ativo: fields.api_pix_ativo === true,
    api_pix_cert: fields.api_pix_cert.trim() || null,
    api_pix_key: fields.api_pix_key.trim() || null,
    api_pix_base_url: fields.api_pix_base_url.trim() || null,
  }
}

export function contaBancariaHasData(fields: ContaBancariaFields): boolean {
  return Boolean(
    fields.banco_nome.trim() ||
      fields.agencia.trim() ||
      fields.conta.trim() ||
      fields.api_client_id.trim() ||
      fields.api_client_secret.trim() ||
      fields.api_pix_chave.trim() ||
      fields.api_pix_cert.trim() ||
      fields.api_pix_key.trim() ||
      fields.descricao.trim(),
  )
}

/** Colunas padrão ao ler/gravar conta bancária. */
export const CONTA_BANCARIA_SELECT =
  'id, empresa_id, ramo_id, secao_id, descricao, banco_nome, agencia, conta, api_client_id, api_client_secret, api_pix_chave, api_pix_ativo, api_pix_cert, api_pix_key, api_pix_base_url'
