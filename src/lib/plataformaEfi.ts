import { supabase } from '@/lib/supabase'

export type PlataformaEfiPixSafe = {
  id: number
  client_id: string | null
  pix_chave: string | null
  sandbox: boolean
  ativo: boolean
  base_url: string | null
  updated_at: string | null
  has_client_secret: boolean
  has_certificado: boolean
  has_certificado_senha: boolean
}

export type PlataformaEfiPixForm = {
  client_id: string
  client_secret: string
  pix_chave: string
  certificado: string
  certificado_senha: string
  sandbox: boolean
  ativo: boolean
  base_url: string
  has_client_secret: boolean
  has_certificado: boolean
  has_certificado_senha: boolean
}

export const emptyPlataformaEfiForm = (): PlataformaEfiPixForm => ({
  client_id: '',
  client_secret: '',
  pix_chave: '',
  certificado: '',
  certificado_senha: '',
  sandbox: false,
  ativo: false,
  base_url: '',
  has_client_secret: false,
  has_certificado: false,
  has_certificado_senha: false,
})

export function formFromEfiSafe(
  row: PlataformaEfiPixSafe | null,
): PlataformaEfiPixForm {
  if (!row) return emptyPlataformaEfiForm()
  return {
    client_id: row.client_id ?? '',
    client_secret: '',
    pix_chave: row.pix_chave ?? '',
    certificado: '',
    certificado_senha: '',
    sandbox: row.sandbox === true,
    ativo: row.ativo === true,
    base_url: row.base_url ?? '',
    has_client_secret: row.has_client_secret === true,
    has_certificado: row.has_certificado === true,
    has_certificado_senha: row.has_certificado_senha === true,
  }
}

export async function loadPlataformaEfiPix(): Promise<
  { data: PlataformaEfiPixSafe | null; error: string | null }
> {
  const { data, error } = await supabase
    .from('plataforma_efi_pix_safe')
    .select(
      'id, client_id, pix_chave, sandbox, ativo, base_url, updated_at, has_client_secret, has_certificado, has_certificado_senha',
    )
    .eq('id', 1)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  return { data: (data as PlataformaEfiPixSafe | null) ?? null, error: null }
}

/** Lê arquivo de certificado como texto (PEM) ou base64 (P12). */
export async function readCertificadoFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pem') || name.endsWith('.crt') || name.endsWith('.key')) {
    return file.text()
  }
  // .p12 / .pfx → base64
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function savePlataformaEfiPix(
  form: PlataformaEfiPixForm,
  userId: string | null,
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = {
    id: 1,
    client_id: form.client_id.trim() || null,
    pix_chave: form.pix_chave.trim() || null,
    sandbox: form.sandbox,
    ativo: form.ativo,
    base_url: form.base_url.trim() || null,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }

  if (form.client_secret.trim()) {
    payload.client_secret = form.client_secret.trim()
  }
  if (form.certificado.trim()) {
    payload.certificado = form.certificado.trim()
  }
  if (form.certificado_senha.trim()) {
    payload.certificado_senha = form.certificado_senha.trim()
  }

  const { error } = await supabase.from('plataforma_efi_pix').upsert(payload, {
    onConflict: 'id',
  })

  return { error: error?.message ?? null }
}

export function efiPixBaseUrl(sandbox: boolean, override?: string | null) {
  const custom = override?.trim()
  if (custom) return custom.replace(/\/$/, '')
  return sandbox
    ? 'https://pix-h.api.efipay.com.br'
    : 'https://pix.api.efipay.com.br'
}
