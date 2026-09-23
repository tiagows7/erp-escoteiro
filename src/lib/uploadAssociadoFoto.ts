import { supabase } from '@/lib/supabase'

const BUCKET = 'associados'
const MAX_BYTES = 2 * 1024 * 1024
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function extensionFor(mime: string, fileName: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  const fromName = fileName.split('.').pop()?.toLowerCase()
  if (fromName && ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  return 'jpg'
}

export async function uploadAssociadoFoto(
  empresaId: number,
  associadoId: number,
  file: File,
): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED.has(file.type)) {
    return { error: 'Use imagem PNG, JPG, WEBP ou GIF.' }
  }
  if (file.size > MAX_BYTES) {
    return { error: 'A foto deve ter no máximo 2 MB.' }
  }

  const ext = extensionFor(file.type, file.name)
  const path = `${empresaId}/${associadoId}/foto.${ext}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    })

  if (uploadError) {
    return { error: uploadError.message }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const url = `${data.publicUrl}?v=${Date.now()}`

  const { error: updateError } = await supabase
    .from('associados')
    .update({ foto_url: url })
    .eq('associado_id', associadoId)
    .eq('empresa_id', empresaId)

  if (updateError) {
    return { error: updateError.message }
  }

  return { url }
}

export async function removerAssociadoFoto(
  empresaId: number,
  associadoId: number,
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase
    .from('associados')
    .update({ foto_url: null })
    .eq('associado_id', associadoId)
    .eq('empresa_id', empresaId)

  if (error) return { error: error.message }
  return { ok: true }
}
