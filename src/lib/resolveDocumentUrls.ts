import { supabase } from '@/lib/supabase'
import { parseDocumentUrls, parseStorageRef } from '@/lib/documentUrls'

const SIGN_TTL_SEC = 60 * 60

export async function resolveDocumentDisplayUrl(ref: string): Promise<string> {
  const parsed = parseStorageRef(ref)
  if (!parsed) return ref
  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, SIGN_TTL_SEC)
  if (error || !data?.signedUrl) return ref
  return data.signedUrl
}

export async function resolveDocumentDisplayUrls(
  value: string | null | undefined,
): Promise<string[]> {
  const docs = parseDocumentUrls(value)
  return Promise.all(docs.map((d) => resolveDocumentDisplayUrl(d)))
}

export async function resolveDocumentRefList(refs: string[]): Promise<string[]> {
  return Promise.all(refs.map((d) => resolveDocumentDisplayUrl(d)))
}
