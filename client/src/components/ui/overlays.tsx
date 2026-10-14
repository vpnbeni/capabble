import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, X, type LucideIcon } from 'lucide-react'
import { useBodyScrollLock, useFocusTrap } from '@/components/common/Dialog/useDialog'
import { cx } from './format'
import { Button, Icon } from './primitives'

const useEscape = (open: boolean, onClose?: () => void) => {
  useEffect(() => {
    if (!open || !onClose) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
}

/**
 * Portals to document.body inside a .cb-app wrapper (so tokens apply), fixed inset-0 z-[100]
 * with an absolute backdrop, scroll lock, Escape and a focus trap — per the overlay rules.
 */
const OverlayShell: React.FC<{
  open: boolean
  onClose?: () => void
  variant: 'dialog' | 'sheet'
  children: (trapRef: React.RefObject<HTMLDivElement>) => React.ReactNode
}> = ({ open, onClose, variant, children }) => {
  useEscape(open, onClose)
  useBodyScrollLock(open)
  const trapRef = useFocusTrap({ isOpen: open, onClose: onClose || (() => {}), closeOnEscape: true })
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div className="cb-app cb-portal">
      <div className={cx('cb-overlay', variant === 'sheet' && 'cb-overlay--sheet')}>
        <div className="cb-overlay__backdrop" aria-hidden="true" onMouseDown={() => onClose?.()} />
        {children(trapRef)}
      </div>
    </div>,
    document.body
  )
}

export interface DialogProps {
  open: boolean
  onClose?: () => void
  title: React.ReactNode
  description?: React.ReactNode
  tone?: 'default' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  footer?: React.ReactNode
  children?: React.ReactNode
}

/** A decision, or up to four fields. Destructive confirmations use tone="danger". */
export const Dialog: React.FC<DialogProps> = ({ open, onClose, title, description, tone, size = 'md', footer, children }) => {
  const id = useId()
  return (
    <OverlayShell open={open} onClose={onClose} variant="dialog">
      {(trapRef) => (
        <div
          ref={trapRef}
          className={cx('cb-dialog', `cb-dialog--${size}`)}
          role={tone === 'danger' ? 'alertdialog' : 'dialog'}
          aria-modal="true"
          aria-labelledby={`${id}-t`}
          aria-describedby={description ? `${id}-d` : undefined}
        >
          <div className="cb-dialog__head">
            <div>
              <h2 id={`${id}-t`} className="cb-dialog__title">
                {title}
              </h2>
              {description ? (
                <p id={`${id}-d`} className="cb-dialog__desc">
                  {description}
                </p>
              ) : null}
            </div>
            {onClose ? <Button variant="tertiary" size="sm" icon={X} aria-label="Close" onClick={onClose} /> : null}
          </div>
          {children ? <div className="cb-dialog__body">{children}</div> : null}
          {footer ? <div className="cb-dialog__foot">{footer}</div> : null}
        </div>
      )}
    </OverlayShell>
  )
}

export interface SheetProps {
  open: boolean
  onClose?: () => void
  title: React.ReactNode
  description?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: React.ReactNode
  children?: React.ReactNode
  /** Wraps body + footer in a <form> so Enter submits and the footer's submit button works. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void
}

/** Slides in from the right on desktop and up from the bottom on phones. */
export const Sheet: React.FC<SheetProps> = ({ open, onClose, title, description, size = 'md', footer, children, onSubmit }) => {
  const id = useId()
  const inner = (
    <>
      <div className="cb-sheet__body">{children}</div>
      {footer ? <div className="cb-sheet__foot">{footer}</div> : null}
    </>
  )
  return (
    <OverlayShell open={open} onClose={onClose} variant="sheet">
      {(trapRef) => (
        <div
          ref={trapRef}
          className={cx('cb-sheet', `cb-sheet--${size}`)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${id}-t`}
        >
          <div className="cb-sheet__head">
            <div style={{ minWidth: 0 }}>
              <h2 id={`${id}-t`} className="cb-dialog__title">
                {title}
              </h2>
              {description ? <p className="cb-dialog__desc">{description}</p> : null}
            </div>
            {onClose ? <Button variant="tertiary" size="sm" icon={X} aria-label="Close" onClick={onClose} /> : null}
          </div>
          {onSubmit ? (
            <form className="cb-sheet__form" onSubmit={onSubmit} noValidate>
              {inner}
            </form>
          ) : (
            inner
          )}
        </div>
      )}
    </OverlayShell>
  )
}

export type MenuItem =
  | { label: string; icon?: LucideIcon; hint?: string; onSelect?: () => void; tone?: 'danger'; disabled?: boolean }
  | { divider: true }

/** Secondary actions behind a "…" button. Destructive items go last and still confirm. */
export const Menu: React.FC<{
  items: MenuItem[]
  label?: string
  align?: 'end' | 'start'
  trigger?: (props: { onClick: () => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean }) => React.ReactNode
}> = ({ items, label = 'More actions', align = 'end', trigger }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onListKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'))
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      ;(buttons[index + 1] || buttons[0])?.focus()
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      ;(buttons[index - 1] || buttons[buttons.length - 1])?.focus()
    }
  }

  const triggerProps = {
    onClick: () => setOpen((prev) => !prev),
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
  }

  return (
    <div ref={ref} className="cb-menu">
      {trigger ? (
        trigger(triggerProps)
      ) : (
        <Button variant="tertiary" size="sm" icon={MoreHorizontal} aria-label={label} {...triggerProps} />
      )}
      {open ? (
        <div className={cx('cb-menu__panel', `cb-menu__panel--${align}`)} role="menu" onKeyDown={onListKey}>
          {items.map((item, index) => {
            if ('divider' in item) return <div key={`d${index}`} className="cb-menu__divider" role="separator" />
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={cx('cb-menu__item', item.tone === 'danger' && 'is-danger')}
                onClick={() => {
                  setOpen(false)
                  item.onSelect?.()
                }}
              >
                {item.icon ? <Icon icon={item.icon} size={16} /> : null}
                <span className="cb-menu__label">{item.label}</span>
                {item.hint ? <span className="cb-menu__hint">{item.hint}</span> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
