import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './format'
import { useEscape } from './escape'

/**
 * Light card that opens on hover, keyboard focus or tap, for a short list behind a figure
 * (e.g. who is absent). Not hover-only: tap toggles it, Escape and outside clicks close it.
 * The pointer can move from the trigger into the card, so links inside it stay reachable.
 */
export const HoverCard: React.FC<{
  content: React.ReactNode
  label: string
  children: React.ReactNode
  className?: string
  /** false keeps a second trigger for the same card out of the tab order. */
  focusable?: boolean
}> = ({ content, label, children, className, focusable = true }) => {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number>()
  const id = useId()

  const show = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(true), 120) }
  const hide = () => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setOpen(false), 160) }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const trigger = ref.current?.getBoundingClientRect()
    const card = cardRef.current
    if (!trigger || !card) return
    const width = card.offsetWidth
    const height = card.offsetHeight
    const below = trigger.bottom + 8 + height <= window.innerHeight - 8 || trigger.top - 8 - height < 8
    setPos({
      top: below ? trigger.bottom + 8 : trigger.top - 8 - height,
      left: Math.min(Math.max(8, trigger.left + trigger.width / 2 - width / 2), window.innerWidth - width - 8),
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (ref.current?.contains(target) || cardRef.current?.contains(target)) return
      setOpen(false)
    }
    const onMove = (event: Event) => {
      if (event.target instanceof Node && cardRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open])

  useEscape(open, () => setOpen(false))

  return (
    <span
      ref={ref}
      className={cx('cb-hovercard', className)}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') show() }}
      onPointerLeave={(event) => { if (event.pointerType === 'mouse') hide() }}
      onFocus={show}
      onBlur={(event) => { if (!cardRef.current?.contains(event.relatedTarget as Node)) hide() }}
    >
      <button
        type="button"
        className="cb-hovercard__trigger"
        aria-label={label}
        aria-expanded={open}
        tabIndex={focusable ? undefined : -1}
        aria-hidden={focusable ? undefined : true}
        aria-controls={open ? id : undefined}
        onClick={() => { window.clearTimeout(timer.current); setOpen((prev) => !prev) }}
      >
        {children}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
          <div className="cb-app cb-portal">
            <div
              ref={cardRef}
              id={id}
              role="dialog"
              aria-label={label}
              className="cb-hovercard__card"
              style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
              onPointerEnter={(event) => { if (event.pointerType === 'mouse') window.clearTimeout(timer.current) }}
              onPointerLeave={(event) => { if (event.pointerType === 'mouse') hide() }}
              onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node) && !ref.current?.contains(event.relatedTarget as Node)) hide() }}
            >
              {content}
            </div>
          </div>,
          document.body
        )
        : null}
    </span>
  )
}
