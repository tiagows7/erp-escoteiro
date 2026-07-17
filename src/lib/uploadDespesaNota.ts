import { supabase } from '@/lib/supabase'

const BUCKET = 'despesa-notas'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
])

function extensionFor(mime: string, fileName: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'application/pdf') return 'pdf'
  const fromName = fileName.split('.').pop()?.toLowerCase()
  if (fromName && ['png', 'jpg', 'jpeg', 'webp', 'pdf'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName
  }
  return 'bin'
}

export async function uploadDespesaNota(
  empresaId: number,
  despesaId: number,
  file: File,
): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED.has(file.type)) {
    return { error: 'Use PDF, PNG, JPG ou WEBP (máx. 5 MB).' }
  }
  if (file.size > MAX_BYTES) {
    return { error: 'O arquivo deve ter no máximo 5 MB.' }
  }

  const ext = extensionFor(file.type, file.name)
  const safeName = file.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 40)
  const path = `${empresaId}/${despesaId}/${Date.now()}-${safeName || `nota.${ext}`}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: '3600',
    })

  if (uploadError) {
    return { error: uploadError.message }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const url = data.publicUrl

  const { error: updateError } = await supabase
    .from('despesas')
    .update({ despesa_documento: url })
    .eq('despesa_id', despesaId)
    .eq('empresa_id', empresaId)

  if (updateError) {
    return { error: updateError.message }
  }

  return { url }
}

export function isNotaImage(url: string | null | undefined): boolean {
  if (!url) return false
  const lower = url.toLowerCase().split('?')[0]
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp')
  )
}
