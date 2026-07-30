import { supabase } from '@/lib/supabase'
import {
  parseDocumentUrls,
  serializeDocumentUrls,
} from '@/lib/documentUrls'

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

async function uploadOneFile(
  empresaId: number,
  despesaId: number,
  file: File,
  index: number,
): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED.has(file.type)) {
    return { error: `${file.name}: use PDF, PNG, JPG ou WEBP (máx. 5 MB).` }
  }
  if (file.size > MAX_BYTES) {
    return { error: `${file.name}: o arquivo deve ter no máximo 5 MB.` }
  }

  const ext = extensionFor(file.type, file.name)
  const safeName = file.name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(0, 40)
  const path = `${empresaId}/${despesaId}/${Date.now()}-${index}-${safeName || `nota.${ext}`}`

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: '3600',
    })

  if (uploadError) {
    return { error: `${file.name}: ${uploadError.message}` }
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}

/** Upload de um ou mais arquivos; anexa aos documentos já existentes. */
export async function uploadDespesaNotas(
  empresaId: number,
  despesaId: number,
  files: File[],
  existingDocumento: string | null | undefined = null,
): Promise<{ urls: string[] } | { error: string }> {
  if (files.length === 0) {
    return { urls: parseDocumentUrls(existingDocumento) }
  }

  const uploaded: string[] = []
  for (let i = 0; i < files.length; i++) {
    const result = await uploadOneFile(empresaId, despesaId, files[i], i)
    if ('error' in result) {
      return { error: result.error }
    }
    uploaded.push(result.url)
  }

  const urls = [...parseDocumentUrls(existingDocumento), ...uploaded]
  const { error: updateError } = await supabase
    .from('despesas')
    .update({ despesa_documento: serializeDocumentUrls(urls) })
    .eq('despesa_id', despesaId)
    .eq('empresa_id', empresaId)

  if (updateError) {
    return { error: updateError.message }
  }

  return { urls }
}

/** @deprecated Use uploadDespesaNotas */
export async function uploadDespesaNota(
  empresaId: number,
  despesaId: number,
  file: File,
): Promise<{ url: string } | { error: string }> {
  const result = await uploadDespesaNotas(empresaId, despesaId, [file])
  if ('error' in result) return result
  return { url: result.urls[result.urls.length - 1] }
}

export { isDocumentImage as isNotaImage } from '@/lib/documentUrls'
