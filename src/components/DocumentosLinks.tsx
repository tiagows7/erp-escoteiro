import { useEffect, useState } from 'react'
import {
  resolveDocumentDisplayUrl,
  resolveDocumentDisplayUrls,
} from '@/lib/resolveDocumentUrls'
import { documentLabel, parseDocumentUrls } from '@/lib/documentUrls'

type Props = {
  value: string | null | undefined
  /** Se true, não gera link (portal público). */
  hideLinks?: boolean
}

/** Links de comprovantes com URL assinada quando o bucket é privado. */
export function DocumentosLinks({ value, hideLinks = false }: Props) {
  const docs = parseDocumentUrls(value)
  const [hrefs, setHrefs] = useState<string[]>(docs)

  useEffect(() => {
    let cancelled = false
    if (docs.length === 0 || hideLinks) {
      setHrefs(docs)
      return
    }
    void (async () => {
      const next = await resolveDocumentDisplayUrls(value)
      if (!cancelled) setHrefs(next)
    })()
    return () => {
      cancelled = true
    }
  }, [value, hideLinks, docs.length])

  if (docs.length === 0) return <span className="muted">—</span>

  if (hideLinks) {
    return (
      <span className="muted">
        {docs.length === 1
          ? 'Documento anexado'
          : `${docs.length} documentos anexados`}
      </span>
    )
  }

  return (
    <div className="portal-doc-links">
      {docs.map((ref, index) => (
        <a
          key={ref}
          className="btn btn-soft"
          href={hrefs[index] ?? ref}
          target="_blank"
          rel="noreferrer"
        >
          {docs.length === 1 ? 'Ver documento' : documentLabel(ref, index)}
        </a>
      ))}
    </div>
  )
}

export { resolveDocumentDisplayUrls, resolveDocumentDisplayUrl }
