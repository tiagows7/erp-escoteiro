import { useEffect, useState } from 'react'
import { resolveDocumentRefList } from '@/lib/resolveDocumentUrls'

/** Resolve refs/URLs de documentos para links assinados (preview em formulários). */
export function useSignedDocumentUrls(refs: string[]): string[] {
  const key = refs.join('\0')
  const [hrefs, setHrefs] = useState<string[]>(refs)

  useEffect(() => {
    let cancelled = false
    if (refs.length === 0) {
      setHrefs([])
      return
    }
    void (async () => {
      const next = await resolveDocumentRefList(refs)
      if (!cancelled) setHrefs(next)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures refs
  }, [key])

  return hrefs.length === refs.length ? hrefs : refs
}
