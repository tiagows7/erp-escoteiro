type Props = {
  tone: 'success' | 'error' | 'info'
  title?: string
  children: React.ReactNode
  onClose?: () => void
}

export function AlertMessage({ tone, title, children, onClose }: Props) {
  return (
    <div className={`alert-message alert-${tone}`} role="alert">
      <span className="alert-icon" aria-hidden="true" />
      <div className="alert-body">
        {title ? <strong>{title}</strong> : null}
        <div className="alert-content">{children}</div>
      </div>
      {onClose ? (
        <button
          type="button"
          className="alert-close"
          aria-label="Fechar"
          onClick={onClose}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
