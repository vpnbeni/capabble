import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, X, type LucideIcon } from 'lucide-react'
import { useBodyScrollLock, useFocusTrap } from '@/components/common/Dialog/useDialog'
import { cx } from './format'
import { useEscape } from './escape'
import { Button, Icon } from './primitives'

/**
 * Portals to document.body inside a .cb-app wrapper (so tokens apply), fixed inset-0 z-[100]
 * with an absolute backdrop, scroll lock, Escape and a focus trap — per the overlay rules.
 */
export const OverlayShell: React.FC<{
  open: boolean
  onClose?: () => void
  variant: 'dialog' | 'sheet' | 'command'
  children: (trapRef: React.RefObject<HTMLDivElement>) => React.ReactNode
}> = ({ open, onClose, variant, children }) => {
  useEscape(open, onClose)
  useBodyScrollLock(open)
  const trapRef = useFocusTrap({ isOpen: open, onClose: onClose || (() => {}), closeOnEscape: true })
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div className="cb-app cb-portal">
      <div className={cx('cb-overlay', variant !== 'dialog' && `cb-overlay--${variant}`)}>
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
  /** Small glyph shown in a grey rounded tile before the title. */
  icon?: LucideIcon
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: React.ReactNode
  children?: React.ReactNode
  /** Wraps body + footer in a <form> so Enter submits and the footer's submit button works. */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void
}

/** Slides in from the right on desktop and up from the bottom on phones. */
export const Sheet: React.FC<SheetProps> = ({ open, onClose, title, description, icon, size = 'md', footer, children, onSubmit }) => {
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
            {icon ? (
              <span className="cb-sheet__icon" aria-hidden="true">
                <Icon icon={icon} size={16} />
              </span>
            ) : null}
            <div className="cb-sheet__titles">
              <h2 id={`${id}-t`} className="cb-sheet__title">
                {title}
              </h2>
              {description ? <p className="cb-sheet__desc">{description}</p> : null}
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
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // The panel renders in a portal with fixed positioning, so tables, cards and canvases
  // that clip their overflow (e.g. a horizontally scrolling DataTable) can't cut it off.
  const place = () => {
    const trigger = ref.current?.getBoundingClientRect()
    if (!trigger) return
    const panelHeight = panelRef.current?.offsetHeight || 240
    const panelWidth = panelRef.current?.offsetWidth || 200
    const up = trigger.bottom + 4 + panelHeight > window.innerHeight - 8 && trigger.top - 4 - panelHeight > 8
    // Keep the whole panel on screen: on a phone an end-aligned menu near the middle would run off the left edge.
    const preferred = align === 'end' ? trigger.right - panelWidth : trigger.left
    setPos({
      top: up ? trigger.top - 4 - panelHeight : trigger.bottom + 4,
      left: Math.max(8, Math.min(preferred, window.innerWidth - 8 - panelWidth)),
      up,
    })
  }

  useLayoutEffect(() => {
    if (open) place()
    else setPos(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (ref.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    // Page scroll or resize would leave the fixed panel behind; scrolling inside the panel is fine.
    const onMove = (event: Event) => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open])

  // Escape closes only the menu, not a Sheet or Dialog it sits in.
  useEscape(open, () => setOpen(false))

  // Move focus into the menu when it opens, so arrow keys work straight away.
  useEffect(() => {
    if (open && pos) panelRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus()
  }, [open, pos])

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
      {open && typeof document !== 'undefined'
        ? createPortal(
        <div className="cb-app cb-portal">
        <div
          ref={panelRef}
          className={cx('cb-menu__panel', 'cb-menu__panel--floating')}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          role="menu"
          aria-label={label}
          onKeyDown={onListKey}
        >
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
        </div>,
            document.body
          )
        : null}
    </div>
  )
}

