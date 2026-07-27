export type ContaBancariaFields = {
  descricao: string
  banco_nome: string
  agencia: string
  conta: string
  api_client_id: string
  api_client_secret: string
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
  }
}

export function contaBancariaHasData(fields: ContaBancariaFields): boolean {
  return Boolean(
    fields.banco_nome.trim() ||
      fields.agencia.trim() ||
      fields.conta.trim() ||
      fields.api_client_id.trim() ||
      fields.api_client_secret.trim() ||
      fields.descricao.trim(),
  )
}
