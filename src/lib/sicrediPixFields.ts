export type SicrediPixFields = {
  sicredi_pix_client_id: string
  sicredi_pix_client_secret: string
  sicredi_pix_chave: string
  sicredi_pix_cert: string
  sicredi_pix_key: string
  sicredi_pix_base_url: string
  sicredi_pix_ativo: boolean
}

export const emptySicrediPixFields = (): SicrediPixFields => ({
  sicredi_pix_client_id: '',
  sicredi_pix_client_secret: '',
  sicredi_pix_chave: '',
  sicredi_pix_cert: '',
  sicredi_pix_key: '',
  sicredi_pix_base_url: '',
  sicredi_pix_ativo: false,
})

export function sicrediPixFromRow(
  row: Partial<SicrediPixFields> | null | undefined,
): SicrediPixFields {
  return {
    sicredi_pix_client_id: row?.sicredi_pix_client_id ?? '',
    sicredi_pix_client_secret: row?.sicredi_pix_client_secret ?? '',
    sicredi_pix_chave: row?.sicredi_pix_chave ?? '',
    sicredi_pix_cert: row?.sicredi_pix_cert ?? '',
    sicredi_pix_key: row?.sicredi_pix_key ?? '',
    sicredi_pix_base_url: row?.sicredi_pix_base_url ?? '',
    sicredi_pix_ativo: row?.sicredi_pix_ativo === true,
  }
}

/** Payload para salvar (trim; base_url vazia vira null). */
export function sicrediPixToDb(fields: SicrediPixFields) {
  return {
    sicredi_pix_client_id: fields.sicredi_pix_client_id.trim() || null,
    sicredi_pix_client_secret: fields.sicredi_pix_client_secret.trim() || null,
    sicredi_pix_chave: fields.sicredi_pix_chave.trim() || null,
    sicredi_pix_cert: fields.sicredi_pix_cert.trim() || null,
    sicredi_pix_key: fields.sicredi_pix_key.trim() || null,
    sicredi_pix_base_url: fields.sicredi_pix_base_url.trim() || null,
    sicredi_pix_ativo: fields.sicredi_pix_ativo === true,
  }
}

export function sicrediPixConfigured(fields: SicrediPixFields): boolean {
  return (
    fields.sicredi_pix_ativo &&
    !!fields.sicredi_pix_client_id.trim() &&
    !!fields.sicredi_pix_client_secret.trim() &&
    !!fields.sicredi_pix_chave.trim() &&
    !!fields.sicredi_pix_cert.trim() &&
    !!fields.sicredi_pix_key.trim()
  )
}
