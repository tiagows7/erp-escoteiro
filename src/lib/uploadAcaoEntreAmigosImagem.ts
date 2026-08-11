import { supabase } from '@/lib/supabase'

const BUCKET = 'acao-entre-amigos'
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
  return 'png'
}

export async function uploadAcaoEntreAmigosImagem(
  empresaId: number,
  acaoId: number,
  file: File,
): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED.has(file.type)) {
    return { error: 'Use imagem PNG, JPG, WEBP ou GIF.' }
  }
  if (file.size > MAX_BYTES) {
    return { error: 'A imagem deve ter no máximo 2 MB.' }
  }

  const ext = extensionFor(file.type, file.name)
  const path = `${empresaId}/${acaoId}/banner.${ext}`

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
    .from('acao_entre_amigos')
    .update({ imagem_url: url })
    .eq('acao_id', acaoId)
    .eq('empresa_id', empresaId)

  if (updateError) {
    return { error: updateError.message }
  }

  return { url }
}
