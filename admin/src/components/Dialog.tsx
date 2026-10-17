import { ReactNode, useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { X } from './icons'

interface DialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/** Design-system dialog: portals to <body> (itself .cb-app.dark), dims everything, closes on Escape. */
export function Dialog({ isOpen, onClose, title, children }: DialogProps) {
  const titleId = useId()

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

  if (!isOpen) return null

  return createPortal(
    <div className="cb-overlay admin-overlay">
      <div className="cb-overlay__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="cb-dialog cb-dialog--lg" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="cb-dialog__head">
          <h2 className="cb-dialog__title" id={titleId}>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X />
          </button>
        </div>
        <div className="cb-dialog__body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
