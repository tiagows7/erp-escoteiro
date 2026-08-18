import { supabase } from '@/lib/supabase'

export type PixEfiCobrancaResumo = {
  id: number
  cobranca_id: number
  valor: number
  txid: string
  status: string
  pix_copia_e_cola: string | null
  location?: string | null
  descricao?: string | null
}

export async function getPixEfiConfigured(): Promise<{
  configured: boolean
  message?: string
}> {
  const { data, error } = await supabase.functions.invoke('pix-efi', {
    body: { action: 'config' },
  })
  if (error) {
    return { configured: false, message: error.message }
  }
  const row = data as { configured?: boolean; message?: string }
  return {
    configured: row.configured === true,
    message: row.message,
  }
}

export async function createPixEfiCobranca(cobrancaId: number): Promise<{
  ok: boolean
  cobranca?: PixEfiCobrancaResumo
  error?: string
}> {
  const { data, error } = await supabase.functions.invoke('pix-efi', {
    body: { action: 'create', cobranca_id: cobrancaId },
  })
  if (error) {
    return { ok: false, error: error.message }
  }
  const row = data as {
    cobranca?: PixEfiCobrancaResumo
    error?: string
  }
  if (row.error || !row.cobranca) {
    return { ok: false, error: row.error ?? 'Falha ao gerar PIX Efí.' }
  }
  return { ok: true, cobranca: row.cobranca }
}

export async function checkPixEfiStatus(pixId: number): Promise<{
  ok: boolean
  paid: boolean
  cobranca?: PixEfiCobrancaResumo
  error?: string
}> {
  const { data, error } = await supabase.functions.invoke('pix-efi', {
    body: { action: 'status', pix_id: pixId },
  })
  if (error) {
    return { ok: false, paid: false, error: error.message }
  }
  const row = data as {
    paid?: boolean
    cobranca?: PixEfiCobrancaResumo
    error?: string
  }
  if (row.error) {
    return { ok: false, paid: false, error: row.error }
  }
  return {
    ok: true,
    paid: row.paid === true,
    cobranca: row.cobranca,
  }
}
