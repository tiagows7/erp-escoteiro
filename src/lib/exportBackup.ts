import { supabase } from '@/lib/supabase'

export type ExportBackupInput = {
  /** null = plataforma inteira */
  empresaId?: number | null
  includeLookups?: boolean
}

export type ExportBackupResult = {
  ok: boolean
  error?: string
  path?: string
  downloadUrl?: string
  expiresInSeconds?: number
  generatedAt?: string
  sizeBytes?: number
  counts?: Record<string, number>
  warnings?: string[]
}

export async function exportBackup(
  input: ExportBackupInput = {},
): Promise<ExportBackupResult> {
  const { data, error } = await supabase.functions.invoke('export-backup', {
    body: {
      empresa_id: input.empresaId ?? null,
      include_lookups: input.includeLookups !== false,
    },
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  if (data?.error) {
    return { ok: false, error: String(data.error) }
  }

  return {
    ok: true,
    path: data.path as string | undefined,
    downloadUrl: data.download_url as string | undefined,
    expiresInSeconds: data.expires_in_seconds as number | undefined,
    generatedAt: data.generated_at as string | undefined,
    sizeBytes: data.size_bytes as number | undefined,
    counts: data.counts as Record<string, number> | undefined,
    warnings: (data.warnings as string[] | undefined) ?? [],
  }
}

export type BackupListItem = {
  name: string
  path: string
  updatedAt: string | null
  size: number | null
}

/** Lista arquivos recentes no bucket (super_admin via RLS). */
export async function listBackups(limit = 20): Promise<{
  items: BackupListItem[]
  error?: string
}> {
  const { data: folders, error: listRootError } = await supabase.storage
    .from('backups')
    .list('', { limit: 100 })

  if (listRootError) {
    return { items: [], error: listRootError.message }
  }

  const items: BackupListItem[] = []

  for (const entry of folders ?? []) {
    // Pastas: empresa-N / plataforma
    if (!entry.name) continue
    const isFolder = !entry.id || entry.metadata == null
    if (isFolder && !entry.name.endsWith('.json')) {
      const { data: files, error } = await supabase.storage
        .from('backups')
        .list(entry.name, {
          limit,
          sortBy: { column: 'updated_at', order: 'desc' },
        })
      if (error) continue
      for (const file of files ?? []) {
        if (!file.name?.endsWith('.json')) continue
        items.push({
          name: file.name,
          path: `${entry.name}/${file.name}`,
          updatedAt: file.updated_at ?? file.created_at ?? null,
          size: (file.metadata as { size?: number } | null)?.size ?? null,
        })
      }
    } else if (entry.name.endsWith('.json')) {
      items.push({
        name: entry.name,
        path: entry.name,
        updatedAt: entry.updated_at ?? entry.created_at ?? null,
        size: (entry.metadata as { size?: number } | null)?.size ?? null,
      })
    }
  }

  items.sort((a, b) => {
    const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0
    const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0
    return tb - ta
  })

  return { items: items.slice(0, limit) }
}

export async function getBackupDownloadUrl(
  path: string,
): Promise<{ url?: string; error?: string }> {
  const { data, error } = await supabase.storage
    .from('backups')
    .createSignedUrl(path, 60 * 60)

  if (error || !data?.signedUrl) {
    return { error: error?.message ?? 'Não foi possível gerar o link.' }
  }
  return { url: data.signedUrl }
}
