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

const PRIVATE_DOC_BUCKETS = new Set([
  'receita-comprovantes',
  'despesa-notas',
  'empresa-regimento',
])

/** Extrai bucket + path de URL pública/assinada ou ref `bucket:path`. */
export function parseStorageRef(
  ref: string,
): { bucket: string; path: string } | null {
  const trimmed = ref.trim()
  if (!trimmed) return null

  const prefixed = trimmed.match(/^([a-z0-9-]+):(.+)$/i)
  if (
    prefixed &&
    PRIVATE_DOC_BUCKETS.has(prefixed[1]) &&
    !prefixed[2].includes('://')
  ) {
    return { bucket: prefixed[1], path: prefixed[2].replace(/^\/+/, '') }
  }

  try {
    const u = new URL(trimmed)
    const marker = '/storage/v1/object/'
    const idx = u.pathname.indexOf(marker)
    if (idx < 0) return null
    const rest = u.pathname.slice(idx + marker.length)
    // public/BUCKET/path | sign/BUCKET/path
    const parts = rest.split('/')
    if (parts.length < 3) return null
    const bucket = parts[1]
    const path = decodeURIComponent(parts.slice(2).join('/'))
    if (!PRIVATE_DOC_BUCKETS.has(bucket)) return null
    return { bucket, path }
  } catch {
    return null
  }
}

export function storagePathFromRef(ref: string): string | null {
  return parseStorageRef(ref)?.path ?? null
}

export function toStorageRef(bucket: string, path: string): string {
  return `${bucket}:${path.replace(/^\/+/, '')}`
}

function pathForLabel(ref: string): string {
  const fromStorage = storagePathFromRef(ref)
  if (fromStorage) return fromStorage
  try {
    return new URL(ref).pathname
  } catch {
    return ref
  }
}

export function isDocumentImage(url: string | null | undefined): boolean {
  if (!url) return false
  const lower = pathForLabel(url).toLowerCase().split('?')[0]
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.webp')
  )
}

export function documentLabel(url: string, index: number): string {
  try {
    const path = pathForLabel(url)
    const name = decodeURIComponent(path.split('/').pop() || '')
    if (name) return name.length > 48 ? `${name.slice(0, 45)}…` : name
  } catch {
    // ignore
  }
  return `Documento ${index + 1}`
}
