import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import { useAuth } from '@/contexts/AuthContext'
import {
  exportBackup,
  getBackupDownloadUrl,
  listBackups,
  type BackupListItem,
} from '@/lib/exportBackup'
import { supabase } from '@/lib/supabase'
import type { Empresa } from '@/types/database'

function formatBytes(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR')
}

export function BackupPage() {
  const { isSuperAdmin } = useAuth()
  const [grupos, setGrupos] = useState<Pick<Empresa, 'id' | 'nome' | 'slug'>[]>(
    [],
  )
  const [empresaId, setEmpresaId] = useState<string>('')
  const [includeLookups, setIncludeLookups] = useState(true)
  const [loadingGrupos, setLoadingGrupos] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [lastCounts, setLastCounts] = useState<Record<string, number> | null>(
    null,
  )
  const [warnings, setWarnings] = useState<string[]>([])
  const [recent, setRecent] = useState<BackupListItem[]>([])
  const [listError, setListError] = useState<string | null>(null)
  const [listing, setListing] = useState(false)

  const loadRecent = useCallback(async () => {
    setListing(true)
    const { items, error: err } = await listBackups(15)
    setRecent(items)
    setListError(err ?? null)
    setListing(false)
  }, [])

  useEffect(() => {
    if (!isSuperAdmin) return
    let mounted = true
    void (async () => {
      setLoadingGrupos(true)
      const { data, error: qErr } = await supabase
        .from('empresa')
        .select('id, nome, slug')
        .order('nome')
      if (!mounted) return
      if (qErr) setError(qErr.message)
      setGrupos((data as Pick<Empresa, 'id' | 'nome' | 'slug'>[]) ?? [])
      setLoadingGrupos(false)
      await loadRecent()
    })()
    return () => {
      mounted = false
    }
  }, [isSuperAdmin, loadRecent])

  const totalRows = useMemo(() => {
    if (!lastCounts) return null
    return Object.values(lastCounts).reduce((a, b) => a + b, 0)
  }, [lastCounts])

  if (!isSuperAdmin) {
    return (
      <section className="panel">
        <p className="muted">Apenas o administrador da plataforma pode gerar backups.</p>
      </section>
    )
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setGenerating(true)
    setError(null)
    setSuccess(null)
    setDownloadUrl(null)
    setLastCounts(null)
    setWarnings([])

    const result = await exportBackup({
      empresaId: empresaId ? Number(empresaId) : null,
      includeLookups,
    })

    setGenerating(false)

    if (!result.ok) {
      setError(result.error ?? 'Falha ao gerar backup.')
      return
    }

    setDownloadUrl(result.downloadUrl ?? null)
    setLastCounts(result.counts ?? null)
    setWarnings(result.warnings ?? [])
    setSuccess(
      `Backup gerado (${formatBytes(result.sizeBytes)}${
        totalRowsFromCounts(result.counts) != null
          ? ` · ${totalRowsFromCounts(result.counts)} registros`
          : ''
      }). O link expira em cerca de 1 hora.`,
    )
    void loadRecent()
  }

  async function handleOpenRecent(path: string) {
    setError(null)
    const { url, error: err } = await getBackupDownloadUrl(path)
    if (err || !url) {
      setError(err ?? 'Não foi possível baixar.')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <WaitingOverlay
        open={generating}
        title="Gerando backup"
        message="Montando o export dos dados. Isso pode levar alguns instantes…"
      />

      <header className="page-header">
        <div>
          <h2>Backup do banco</h2>
          <p>
            Exportação lógica em JSON (dados do ERP). Não substitui o backup
            físico / PITR do Supabase.
          </p>
        </div>
      </header>

      {error ? (
        <AlertMessage tone="error" title="Erro">
          {error}
        </AlertMessage>
      ) : null}
      {success ? (
        <AlertMessage tone="success" title="Concluído">
          {success}
        </AlertMessage>
      ) : null}

      <section className="panel">
        <form className="form-grid" onSubmit={handleGenerate}>
          <label className="field field-span-2">
            <span>Escopo</span>
            <select
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              disabled={loadingGrupos || generating}
            >
              <option value="">Plataforma inteira (todos os grupos)</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                  {g.slug ? ` (${g.slug})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label
            className="field-span-2"
            style={{
              display: 'inline-flex',
              gap: '0.5rem',
              alignItems: 'center',
              margin: '0.25rem 0 0.5rem',
            }}
          >
            <input
              type="checkbox"
              checked={includeLookups}
              onChange={(e) => setIncludeLookups(e.target.checked)}
              disabled={generating}
            />
            Incluir cadastros globais (ramos, estados, cidades, categorias,
            funções)
          </label>

          <div className="form-actions field-span-2">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={generating || loadingGrupos}
            >
              {generating ? 'Gerando backup…' : 'Gerar backup'}
            </button>
            {downloadUrl ? (
              <a
                className="btn"
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Baixar JSON
              </a>
            ) : null}
          </div>
        </form>

        {warnings.length > 0 ? (
          <div className="muted" style={{ marginTop: '1rem' }}>
            <strong>Avisos:</strong>
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {lastCounts && totalRows != null ? (
          <details style={{ marginTop: '1rem' }}>
            <summary>
              Detalhe por tabela ({totalRows} registros)
            </summary>
            <ul className="muted">
              {Object.entries(lastCounts)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([table, count]) => (
                  <li key={table}>
                    {table}: {count}
                  </li>
                ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="panel" style={{ marginTop: '1.25rem' }}>
        <div className="page-header" style={{ marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Backups recentes</h3>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>
              Arquivos no Storage (bucket privado). Segredos de API/PIX não
              entram no JSON.
            </p>
          </div>
          <div className="page-header-actions">
            <button
              type="button"
              className="btn"
              onClick={() => void loadRecent()}
              disabled={listing}
            >
              {listing ? 'Atualizando…' : 'Atualizar lista'}
            </button>
          </div>
        </div>

        {listError ? (
          <p className="muted">
            Não foi possível listar backups: {listError}. Confirme se a migration
            033 (bucket <code>backups</code>) foi aplicada no Supabase.
          </p>
        ) : null}

        {recent.length === 0 && !listError ? (
          <p className="muted">Nenhum backup encontrado ainda.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Atualizado</th>
                  <th>Tamanho</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recent.map((item) => (
                  <tr key={item.path}>
                    <td>
                      <code>{item.path}</code>
                    </td>
                    <td>{formatDate(item.updatedAt)}</td>
                    <td>{formatBytes(item.size)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void handleOpenRecent(item.path)}
                      >
                        Baixar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function totalRowsFromCounts(counts?: Record<string, number>) {
  if (!counts) return null
  return Object.values(counts).reduce((a, b) => a + b, 0)
}
