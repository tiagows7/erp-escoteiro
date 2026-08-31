import { supabase } from '@/lib/supabase'
import { parseStorageRef, toStorageRef } from '@/lib/documentUrls'

export const REGIMENTO_BUCKET = 'empresa-regimento'
const MAX_BYTES = 10 * 1024 * 1024

function isPdf(file: File): boolean {
  if (file.type === 'application/pdf') return true
  return file.name.toLowerCase().endsWith('.pdf')
}

/** Envia o PDF do regimento e grava a ref em empresa.regimento_interno. */
export async function uploadRegimentoInterno(
  empresaId: number,
  file: File,
): Promise<{ ref: string } | { error: string }> {
  if (!isPdf(file)) {
    return { error: 'Envie um arquivo PDF (máx. 10 MB).' }
  }
  if (file.size > MAX_BYTES) {
    return { error: 'O PDF deve ter no máximo 10 MB.' }
  }

  const path = `${empresaId}/regimento.pdf`
  const { error: uploadError } = await supabase.storage
    .from(REGIMENTO_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: 'application/pdf',
      cacheControl: '3600',
    })

  if (uploadError) {
    return { error: uploadError.message }
  }

  const ref = toStorageRef(REGIMENTO_BUCKET, path)
  const { error: updateError } = await supabase
    .from('empresa')
    .update({ regimento_interno: ref })
    .eq('id', empresaId)

  if (updateError) {
    return { error: updateError.message }
  }

  return { ref }
}

/** Remove o PDF do storage e limpa a coluna na empresa. */
export async function removeRegimentoInterno(
  empresaId: number,
  currentRef: string | null | undefined,
): Promise<{ ok: true } | { error: string }> {
  const parsed = currentRef ? parseStorageRef(currentRef) : null
  if (parsed?.bucket === REGIMENTO_BUCKET) {
    const { error: removeError } = await supabase.storage
      .from(REGIMENTO_BUCKET)
      .remove([parsed.path])
    if (removeError) {
      return { error: removeError.message }
    }
  } else {
    // Caminho padrão caso a ref esteja vazia/inválida.
    await supabase.storage
      .from(REGIMENTO_BUCKET)
      .remove([`${empresaId}/regimento.pdf`])
  }

  const { error: updateError } = await supabase
    .from('empresa')
    .update({ regimento_interno: null })
    .eq('id', empresaId)

  if (updateError) {
    return { error: updateError.message }
  }

  return { ok: true }
}
