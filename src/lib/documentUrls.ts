/** Normaliza o campo texto de documento (URL única legada ou JSON de URLs). */
export function parseDocumentUrls(
  value: string | null | undefined,
): string[] {
  if (!value?.trim()) return []
  const raw = value.trim()
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
      }
    } catch {
      // fallback: trata como URL única
    }
  }
  return [raw]
}

export function serializeDocumentUrls(urls: string[]): string | null {
  const clean = urls.map((u) => u.trim()).filter(Boolean)
  if (clean.length === 0) return null
  if (clean.length === 1) return clean[0]
  return JSON.stringify(clean)
}

export function isDocumentImage(url: string | null | undefined): boolean {
  if (!url) return false
  const lower = url.toLowerCase().split('?')[0]
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp')
  )
}

export function documentLabel(url: string, index: number): string {
  try {
    const path = new URL(url).pathname
    const name = decodeURIComponent(path.split('/').pop() || '')
    if (name) return name.length > 48 ? `${name.slice(0, 45)}…` : name
  } catch {
    // ignore
  }
  return `Documento ${index + 1}`
}
