import { ReactNode, useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { X } from './icons'

interface DialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  /** Buttons along the bottom edge; the body scrolls above them. */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  tone?: 'default' | 'danger'
  children?: ReactNode
}

function useOverlay(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return undefined
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])
}

/** Design-system dialog: portals to <body> (itself .cb-app.dark), dims everything, closes on Escape. */
export function Dialog({ isOpen, onClose, title, description, footer, size = 'lg', tone = 'default', children }: DialogProps) {
  const titleId = useId()
  useOverlay(isOpen, onClose)

  if (!isOpen) return null

  return createPortal(
    <div className="cb-overlay admin-overlay">
      <div className="cb-overlay__backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className={`cb-dialog cb-dialog--${size}`}
        role={tone === 'danger' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="cb-dialog__head">
          <div>
            <h2 className="cb-dialog__title" id={titleId}>{title}</h2>
            {description ? <p className="cb-dialog__desc">{description}</p> : null}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X />
          </button>
        </div>
        {children ? <div className="cb-dialog__body">{children}</div> : null}
        {footer ? <div className="cb-dialog__foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}

interface SheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: ReactNode
  /** Wraps body and footer in a form so Enter submits. */
  onSubmit?: () => void
}

/** Side sheet for 5–10 fields or a record preview; a bottom sheet on phones. */
export function Sheet({ isOpen, onClose, title, description, footer, size = 'md', children, onSubmit }: SheetProps) {
  const titleId = useId()
  useOverlay(isOpen, onClose)

  if (!isOpen) return null

  const inner = (
    <>
      <div className="cb-sheet__body">{children}</div>
      {footer ? <div className="cb-sheet__foot">{footer}</div> : null}
    </>
  )

  return createPortal(
    <div className="cb-overlay cb-overlay--sheet admin-overlay">
      <div className="cb-overlay__backdrop" onClick={onClose} aria-hidden="true" />
      <div className={`cb-sheet cb-sheet--${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="cb-sheet__head">
          <div className="cb-sheet__titles">
            <h2 className="cb-sheet__title" id={titleId}>{title}</h2>
            {description ? <p className="cb-sheet__desc">{description}</p> : null}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        {onSubmit ? (
          <form
            className="cb-sheet__form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              onSubmit()
            }}
          >
            {inner}
          </form>
        ) : inner}
      </div>
    </div>,
    document.body,
  )
}
