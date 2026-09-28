import { supabase } from '@/lib/supabase'
import { parseStorageRef, toStorageRef } from '@/lib/documentUrls'

export const REGIMENTO_BUCKET = 'empresa-regimento'
const MAX_BYTES = 10 * 1024 * 1024

function isPdf(file: File): boolean {
  if (file.type === 'application/pdf') return true
  return file.name.toLowerCase().endsWith('.pdf')
}

export type EmpresaDocumentoColumn = 'regimento_interno' | 'estatuto'

/** Envia o PDF e grava a ref na coluna da empresa. */
export async function uploadEmpresaDocumentoPdf(
  empresaId: number,
  file: File,
  column: EmpresaDocumentoColumn,
  fileName: string,
): Promise<{ ref: string } | { error: string }> {
  if (!isPdf(file)) {
    return { error: 'Envie um arquivo PDF (máx. 10 MB).' }
  }
  if (file.size > MAX_BYTES) {
    return { error: 'O PDF deve ter no máximo 10 MB.' }
  }

  const path = `${empresaId}/${fileName}`
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
    .update({ [column]: ref })
    .eq('id', empresaId)

  if (updateError) {
    return { error: updateError.message }
  }

  return { ref }
}

/** Remove o PDF do storage e limpa a coluna na empresa. */
export async function removeEmpresaDocumentoPdf(
  empresaId: number,
  column: EmpresaDocumentoColumn,
  fileName: string,
  currentRef: string | null | undefined,
): Promise<{ ok: true } | { error: string }> {
  const parsed = currentRef ? parseStorageRef(currentRef) : null
  const path =
    parsed?.bucket === REGIMENTO_BUCKET
      ? parsed.path
      : `${empresaId}/${fileName}`
  const { error: removeError } = await supabase.storage
    .from(REGIMENTO_BUCKET)
    .remove([path])
  if (removeError) {
    return { error: removeError.message }
  }

  const { error: updateError } = await supabase
    .from('empresa')
    .update({ [column]: null })
    .eq('id', empresaId)

  if (updateError) {
    return { error: updateError.message }
  }

  return { ok: true }
}

/** Envia o PDF do regimento e grava a ref em empresa.regimento_interno. */
export async function uploadRegimentoInterno(
  empresaId: number,
  file: File,
): Promise<{ ref: string } | { error: string }> {
  return uploadEmpresaDocumentoPdf(
    empresaId,
    file,
    'regimento_interno',
    'regimento.pdf',
  )
}

/** Remove o PDF do storage e limpa a coluna na empresa. */
export async function removeRegimentoInterno(
  empresaId: number,
  currentRef: string | null | undefined,
): Promise<{ ok: true } | { error: string }> {
  return removeEmpresaDocumentoPdf(
    empresaId,
    'regimento_interno',
    'regimento.pdf',
    currentRef,
  )
}
