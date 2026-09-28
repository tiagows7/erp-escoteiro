import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import { resolveDocumentDisplayUrl } from '@/lib/resolveDocumentUrls'
import { isAssociadoLogin } from '@/lib/roles'
import {
  REGIMENTO_BUCKET,
  removeEmpresaDocumentoPdf,
  uploadEmpresaDocumentoPdf,
  type EmpresaDocumentoColumn,
} from '@/lib/uploadRegimentoInterno'

export type GrupoDocumentoPdfConfig = {
  title: string
  column: EmpresaDocumentoColumn
  storageFile: string
  downloadName: string
  cardLabel: string
  emptyAdmin: string
  emptyViewer: string
  removeMessage: string
  savedToast: string
  removedToast: string
}

function isStorageRef(value: string | null | undefined): boolean {
  return !!value?.startsWith(`${REGIMENTO_BUCKET}:`)
}

function prefersMobilePdfActions(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.matchMedia('(max-width: 900px)').matches
  const ua = navigator.userAgent || ''
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
  return coarse || narrow || mobileUa
}

async function fetchPdfBlob(signedUrl: string): Promise<Blob> {
  const res = await fetch(signedUrl)
  if (!res.ok) {
    throw new Error('Não foi possível baixar o PDF.')
  }
  const blob = await res.blob()
  if (blob.type === 'application/pdf') return blob
  return new Blob([blob], { type: 'application/pdf' })
}

/** PDF do grupo: associados só leem; equipe sem ramo 1–5 cadastra. */
export function GrupoDocumentoPdfPage({
  config,
}: {
  config: GrupoDocumentoPdfConfig
}) {
  const { empresa, profile } = useAuth()
  const toast = useToast()
  const empresaId = empresa?.id
  const associadoLogin = isAssociadoLogin(profile)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /** Usuário do grupo (sem ramo 1–5): pode cadastrar/editar. */
  const canCadastrar = (() => {
    if (associadoLogin) return false
    const r = profile?.codigo_ramo
    return r == null || r < 1 || r > 5
  })()

  const [docRef, setDocRef] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mobileUi, setMobileUi] = useState(() => prefersMobilePdfActions())

  useEffect(() => {
    function sync() {
      setMobileUi(prefersMobilePdfActions())
    }
    sync()
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  useEffect(() => {
    if (!empresaId) {
      setDocRef(null)
      setPdfUrl(null)
      setLoading(false)
      return
    }

    let mounted = true
    void (async () => {
      setLoading(true)
      const { data, error: loadError } = await supabase
        .from('empresa')
        .select(config.column)
        .eq('id', empresaId)
        .maybeSingle()

      if (!mounted) return
      if (loadError) {
        setError(loadError.message)
        setDocRef(null)
        setPdfUrl(null)
        setLoading(false)
        return
      }

      const row = (data ?? null) as Record<string, string | null> | null
      const raw = row?.[config.column] ?? null
      const ref = isStorageRef(raw) ? raw : null
      setError(null)
      setDocRef(ref)

      if (ref) {
        const url = await resolveDocumentDisplayUrl(ref)
        if (mounted) setPdfUrl(url)
      } else {
        setPdfUrl(null)
      }
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [empresaId, config.column])

  async function freshSignedUrl(): Promise<string> {
    if (!docRef) throw new Error('PDF não encontrado.')
    const url = await resolveDocumentDisplayUrl(docRef)
    setPdfUrl(url)
    return url
  }

  async function onAbrirPdf() {
    if (!docRef) return
    setOpening(true)
    setError(null)
    try {
      const signed = await freshSignedUrl()
      const blob = await fetchPdfBlob(signed)
      const blobUrl = URL.createObjectURL(blob)
      const win = window.open(blobUrl, '_blank', 'noopener,noreferrer')
      if (!win) {
        window.location.assign(blobUrl)
      } else {
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120_000)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao abrir o PDF.'
      setError(message)
      toast.error('Não foi possível abrir o PDF', message)
    } finally {
      setOpening(false)
    }
  }

  async function onBaixarPdf() {
    if (!docRef) return
    setOpening(true)
    setError(null)
    try {
      const signed = await freshSignedUrl()
      const blob = await fetchPdfBlob(signed)
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = config.downloadName
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
      toast.success('Download iniciado')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Falha ao baixar o PDF.'
      setError(message)
      toast.error('Não foi possível baixar o PDF', message)
    } finally {
      setOpening(false)
    }
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !canCadastrar || !empresaId) return

    setSaving(true)
    setError(null)
    const result = await uploadEmpresaDocumentoPdf(
      empresaId,
      file,
      config.column,
      config.storageFile,
    )
    setSaving(false)

    if ('error' in result) {
      setError(result.error)
      toast.error('Não foi possível enviar o PDF', result.error)
      return
    }

    setDocRef(result.ref)
    const url = await resolveDocumentDisplayUrl(result.ref)
    setPdfUrl(url)
    toast.success(config.savedToast)
  }

  async function onRemove() {
    if (!canCadastrar || !empresaId || !docRef) return
    const ok = await toast.confirm({
      title: 'Remover PDF?',
      message: config.removeMessage,
      confirmLabel: 'Remover',
      cancelLabel: 'Cancelar',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)
    const result = await removeEmpresaDocumentoPdf(
      empresaId,
      config.column,
      config.storageFile,
      docRef,
    )
    setSaving(false)

    if ('error' in result) {
      setError(result.error)
      toast.error('Não foi possível remover', result.error)
      return
    }

    setDocRef(null)
    setPdfUrl(null)
    toast.success(config.removedToast)
  }

  if (!empresaId) {
    return (
      <section className="panel">
        <p className="muted">
          Seu usuário precisa estar vinculado a um grupo escoteiro.
        </p>
      </section>
    )
  }

  return (
    <>
      <WaitingOverlay
        open={saving || opening}
        message={opening ? 'Preparando PDF…' : 'Processando PDF…'}
      />
      <header className="page-header">
        <div>
          <h2>{config.title}</h2>
          <p>
            Documento do grupo — <strong>{empresa?.nome}</strong>
          </p>
        </div>
        {canCadastrar ? (
          <div className="page-header-actions">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => void onFileChange(e)}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || opening}
              onClick={() => fileInputRef.current?.click()}
            >
              {docRef ? 'Substituir PDF' : 'Cadastrar PDF'}
            </button>
            {docRef ? (
              <button
                type="button"
                className="btn btn-danger"
                disabled={saving || opening}
                onClick={() => void onRemove()}
              >
                Remover
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? (
        <AlertMessage tone="error" title="Não foi possível continuar">
          {error}
        </AlertMessage>
      ) : null}

      {loading ? (
        <section className="panel">
          <div className="loading">Carregando…</div>
        </section>
      ) : docRef && (pdfUrl || mobileUi) ? (
        <section className="panel">
          <div className="regimento-pdf-card">
            <div className="regimento-pdf-card-info">
              <strong>{config.cardLabel}</strong>
              <p className="muted">
                {mobileUi
                  ? 'No celular, use os botões abaixo para abrir ou baixar o arquivo.'
                  : 'Visualize abaixo ou abra em outra aba.'}
              </p>
            </div>
            <div className="regimento-pdf-toolbar">
              <button
                type="button"
                className="btn btn-primary"
                disabled={opening || saving}
                onClick={() => void onAbrirPdf()}
              >
                Abrir PDF
              </button>
              <button
                type="button"
                className="btn btn-soft"
                disabled={opening || saving}
                onClick={() => void onBaixarPdf()}
              >
                Baixar PDF
              </button>
            </div>
          </div>

          {!mobileUi && pdfUrl ? (
            <iframe
              className="regimento-pdf-frame"
              title={config.title}
              src={pdfUrl}
            />
          ) : null}
        </section>
      ) : (
        <section className="panel">
          <p className="muted" style={{ margin: 0 }}>
            {canCadastrar ? config.emptyAdmin : config.emptyViewer}
          </p>
        </section>
      )}
    </>
  )
}
