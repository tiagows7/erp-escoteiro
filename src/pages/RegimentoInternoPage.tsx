import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/contexts/ToastContext'
import { AlertMessage } from '@/components/AlertMessage'
import { WaitingOverlay } from '@/components/WaitingOverlay'
import { resolveDocumentDisplayUrl } from '@/lib/resolveDocumentUrls'
import { isAssociadoLogin } from '@/lib/roles'
import {
  removeRegimentoInterno,
  uploadRegimentoInterno,
} from '@/lib/uploadRegimentoInterno'

function isStorageRef(value: string | null | undefined): boolean {
  return !!value?.startsWith('empresa-regimento:')
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
  // Alguns browsers no celular só abrem viewer com type PDF explícito.
  if (blob.type === 'application/pdf') return blob
  return new Blob([blob], { type: 'application/pdf' })
}

export function RegimentoInternoPage() {
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
        .select('regimento_interno')
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

      const raw = (data?.regimento_interno as string | null) ?? null
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
  }, [empresaId])

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
        // Pop-up bloqueado / PWA: força navegação na mesma aba.
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
      a.download = 'regimento-interno.pdf'
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
    const result = await uploadRegimentoInterno(empresaId, file)
    setSaving(false)

    if ('error' in result) {
      setError(result.error)
      toast.error('Não foi possível enviar o PDF', result.error)
      return
    }

    setDocRef(result.ref)
    const url = await resolveDocumentDisplayUrl(result.ref)
    setPdfUrl(url)
    toast.success('Regimento PDF salvo')
  }

  async function onRemove() {
    if (!canCadastrar || !empresaId || !docRef) return
    const ok = await toast.confirm({
      title: 'Remover PDF?',
      message: 'O regimento interno deixará de aparecer para os associados.',
      confirmLabel: 'Remover',
      cancelLabel: 'Cancelar',
      danger: true,
    })
    if (!ok) return

    setSaving(true)
    setError(null)
    const result = await removeRegimentoInterno(empresaId, docRef)
    setSaving(false)

    if ('error' in result) {
      setError(result.error)
      toast.error('Não foi possível remover', result.error)
      return
    }

    setDocRef(null)
    setPdfUrl(null)
    toast.success('Regimento removido')
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
          <h2>Regimento interno</h2>
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
              <strong>Regimento interno (PDF)</strong>
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
              title="Regimento interno"
              src={pdfUrl}
            />
          ) : null}
        </section>
      ) : (
        <section className="panel">
          <p className="muted" style={{ margin: 0 }}>
            {canCadastrar
              ? 'Nenhum PDF cadastrado. Use Cadastrar PDF para enviar o regimento.'
              : 'O regimento interno ainda não foi publicado pelo grupo.'}
          </p>
        </section>
      )}
    </>
  )
}
