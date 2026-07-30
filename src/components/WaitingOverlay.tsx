type WaitingOverlayProps = {
  open: boolean
  title?: string
  message?: string
  /** Texto opcional de progresso (ex.: "120 de 500") */
  detail?: string | null
}

/**
 * Overlay de bloqueio para rotinas longas (gerar movimentos, importar, backup…).
 */
export function WaitingOverlay({
  open,
  title = 'Aguarde',
  message = 'Processando a rotina. Isso pode levar alguns instantes…',
  detail,
}: WaitingOverlayProps) {
  if (!open) return null

  return (
    <div
      className="waiting-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="assertive"
      aria-labelledby="waiting-overlay-title"
      aria-describedby="waiting-overlay-message"
    >
      <div className="waiting-dialog">
        <span className="spinner spinner-dark waiting-spinner" aria-hidden="true" />
        <strong id="waiting-overlay-title">{title}</strong>
        <p id="waiting-overlay-message">{message}</p>
        {detail ? <p className="waiting-detail">{detail}</p> : null}
      </div>
    </div>
  )
}
