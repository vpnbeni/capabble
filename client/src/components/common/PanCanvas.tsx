import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import { Icon, cx } from '@/components/ui'
import './pan-canvas.css'

/**
 * A pannable, zoomable canvas for hierarchies (org charts, location trees).
 *
 * Mark nodes inside `children` with data attributes and the canvas draws the connectors:
 * - `data-canvas-node="id"` on every node,
 * - `data-canvas-parent="parentId"` on a child,
 * - `data-canvas-wire="elbow" | "spine" | "straight"` (default elbow): elbow drops from the parent's
 *   bottom centre to the child's top centre; spine runs a trunk down the parent's left side with a
 *   branch into each child's left edge (for vertical stacks),
 * - `data-canvas-dashed="true"` for a dashed wire (vacant role, placeholder).
 *
 * Drag (or one finger) pans, pinch / Ctrl + scroll zooms around the pointer, plain scroll pans,
 * arrow keys pan, + / − zoom, 0 fits. A press that moves less than a few pixels stays a click, so
 * nodes can be buttons. Put `data-pancanvas-nopan` on anything that must not start a drag.
 */

export type PanCanvasHandle = {
  /** Shows the whole chart. */
  fit: () => void
  /** Centres a node (by its data-canvas-node id), zooming in to a readable size if needed. */
  focusNode: (id: string, options?: { minScale?: number }) => boolean
  zoomIn: () => void
  zoomOut: () => void
}

export interface PanCanvasProps {
  children: React.ReactNode
  /** Small pill in the top-left corner. */
  summary?: React.ReactNode
  /** Bottom-left hint; pass false to hide it. Hidden on phones. */
  hint?: React.ReactNode | false
  /** Accessible name for the canvas region. */
  label?: string
  /** Change it to re-fit (for example when the data set changes). */
  layoutKey?: string | number
  /** First view: 'readable' never shrinks below READABLE_SCALE and starts at the top; 'all' fits everything. */
  initialFit?: 'readable' | 'all'
  className?: string
}

type View = { scale: number; x: number; y: number }
type Wire = { d: string; dashed: boolean }

const MIN_SCALE = 0.25
const MAX_SCALE = 2
const ZOOM_STEP = 1.2
const FIT_PADDING = 40
const READABLE_SCALE = 0.6
const DRAG_THRESHOLD = 4
const SPINE_INSET = 20
const RADIUS = 10

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
/** Position of `el` inside `layer` in layout pixels — unaffected by the canvas transform. */
const offsetWithin = (el: HTMLElement, layer: HTMLElement) => {
  let x = 0
  let y = 0
  let node: HTMLElement | null = el
  // The layer is position: relative, so every node's offsetParent chain ends at it.
  while (node && node !== layer) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return node === layer ? { x, y } : null
}

const NO_PAN = 'input, textarea, select, [role="menu"], [data-pancanvas-nopan]'

const PanCanvas = forwardRef<PanCanvasHandle, PanCanvasProps>(function PanCanvas(
  { children, summary, hint, label = 'Chart. Drag or use the arrow keys to move, plus and minus to zoom, 0 to fit.', layoutKey, initialFit = 'readable', className },
  ref
) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [wires, setWires] = useState<Wire[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [ready, setReady] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [animate, setAnimate] = useState(false)
  const touched = useRef(false)
  const pointers = useRef(new Map<number, { x: number; y: number; sx: number; sy: number }>())
  const gesture = useRef<{ distance: number; scale: number } | null>(null)
  const panning = useRef(false)
  const moved = useRef(false)

  /** Measures every marked node in chart units (independent of zoom) and draws the connectors. */
  const measure = useCallback(() => {
    const layer = nodesRef.current
    if (!layer) return
    const elements = Array.from(layer.querySelectorAll<HTMLElement>('[data-canvas-node]'))
    const boxes = new Map<string, { x: number; y: number; w: number; h: number; cx: number }>()
    elements.forEach((el) => {
      const pos = offsetWithin(el, layer)
      if (!pos || (!el.offsetWidth && !el.offsetHeight)) return
      const w = el.offsetWidth
      boxes.set(el.dataset.canvasNode || '', { x: pos.x, y: pos.y, w, h: el.offsetHeight, cx: pos.x + w / 2 })
    })

    const next: Wire[] = []
    const spines = new Map<string, { x: number; top: number; bottom: number; dashed: boolean }>()
    elements.forEach((el) => {
      const parentId = el.dataset.canvasParent
      if (!parentId) return
      const a = boxes.get(parentId)
      const b = boxes.get(el.dataset.canvasNode || '')
      if (!a || !b) return
      const dashed = el.dataset.canvasDashed === 'true'
      const kind = el.dataset.canvasWire || 'elbow'
      if (kind === 'straight') {
        next.push({ d: `M${a.cx},${a.y + a.h} L${b.cx},${b.y}`, dashed })
      } else if (kind === 'spine') {
        const trunkX = a.x + SPINE_INSET
        const anchorY = b.y + Math.min(b.h / 2, 22)
        const spine = spines.get(parentId) || { x: trunkX, top: a.y + a.h, bottom: anchorY, dashed: true }
        spine.bottom = Math.max(spine.bottom, anchorY)
        spine.dashed = spine.dashed && dashed
        spines.set(parentId, spine)
        const r = Math.min(RADIUS, Math.max(0, b.x - trunkX))
        next.push({
          d: `M${trunkX},${anchorY - r} Q${trunkX},${anchorY} ${trunkX + r},${anchorY} L${b.x},${anchorY}`,
          dashed,
        })
      } else {
        const startY = a.y + a.h
        const midY = startY + (b.y - startY) / 2
        const dir = Math.sign(b.cx - a.cx)
        const r = Math.min(RADIUS, Math.abs(b.cx - a.cx) / 2, Math.max(0, (b.y - startY) / 2))
        next.push({
          d:
            dir === 0 || r < 1
              ? `M${a.cx},${startY} L${a.cx},${midY} L${b.cx},${midY} L${b.cx},${b.y}`
              : `M${a.cx},${startY} L${a.cx},${midY - r} Q${a.cx},${midY} ${a.cx + dir * r},${midY} L${b.cx - dir * r},${midY} Q${b.cx},${midY} ${b.cx},${midY + r} L${b.cx},${b.y}`,
          dashed,
        })
      }
    })
    spines.forEach((spine) => {
      next.push({ d: `M${spine.x},${spine.top} L${spine.x},${spine.bottom - RADIUS}`, dashed: spine.dashed })
    })
    // Dashed first so a solid wire sharing a trunk paints over it.
    next.sort((p, q) => Number(q.dashed) - Number(p.dashed))
    setWires(next)
    setSize({ w: layer.offsetWidth, h: layer.offsetHeight })
  }, [])

  const fit = useCallback((mode: 'all' | 'readable' = 'all') => {
    const viewport = viewportRef.current
    const layer = nodesRef.current
    if (!viewport || !layer) return
    const vw = viewport.clientWidth
    const vh = viewport.clientHeight
    const cw = layer.offsetWidth
    const ch = layer.offsetHeight
    if (!vw || !vh || !cw || !ch) return
    const pad = vw < 480 ? FIT_PADDING / 2 : FIT_PADDING
    const scale = clamp(Math.min((vw - pad * 2) / cw, (vh - pad * 2 - 24) / ch), MIN_SCALE, 1)
    if (mode === 'readable' && scale < READABLE_SCALE) {
      setView({ scale: READABLE_SCALE, x: (vw - cw * READABLE_SCALE) / 2, y: pad + 24 })
      return
    }
    setView({ scale, x: (vw - cw * scale) / 2, y: Math.max(pad + 24, (vh - ch * scale) / 2) })
  }, [])

  const zoomAt = useCallback((factor: number, px?: number, py?: number) => {
    const viewport = viewportRef.current
    if (!viewport) return
    touched.current = true
    setView((current) => {
      const scale = clamp(current.scale * factor, MIN_SCALE, MAX_SCALE)
      const ox = px ?? viewport.clientWidth / 2
      const oy = py ?? viewport.clientHeight / 2
      const ratio = scale / current.scale
      return { scale, x: ox - (ox - current.x) * ratio, y: oy - (oy - current.y) * ratio }
    })
  }, [])

  const panBy = useCallback((dx: number, dy: number) => {
    touched.current = true
    setView((current) => ({ ...current, x: current.x + dx, y: current.y + dy }))
  }, [])

  const focusNode = useCallback((id: string, options?: { minScale?: number }) => {
    const viewport = viewportRef.current
    const layer = nodesRef.current
    if (!viewport || !layer) return false
    const el = Array.from(layer.querySelectorAll<HTMLElement>('[data-canvas-node]')).find((node) => node.dataset.canvasNode === id)
    if (!el) return false
    const pos = offsetWithin(el, layer)
    if (!pos) return false
    const current = viewRef.current
    const cx = pos.x + el.offsetWidth / 2
    const cy = pos.y + el.offsetHeight / 2
    const scale = clamp(Math.max(current.scale, options?.minScale ?? 0.8), MIN_SCALE, MAX_SCALE)
    touched.current = true
    setAnimate(true)
    setView({ scale, x: viewport.clientWidth / 2 - cx * scale, y: viewport.clientHeight / 2 - cy * scale })
    return true
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      fit: () => {
        touched.current = false
        setAnimate(true)
        fit('all')
      },
      focusNode,
      zoomIn: () => zoomAt(ZOOM_STEP),
      zoomOut: () => zoomAt(1 / ZOOM_STEP),
    }),
    [fit, focusNode, zoomAt]
  )

  useLayoutEffect(() => {
    measure()
  }, [measure, layoutKey])

  // Fit once the chart has a size; keep fitting on resize until the person moves the canvas.
  useLayoutEffect(() => {
    touched.current = false
    fit(initialFit)
    setReady(true)
  }, [fit, layoutKey, initialFit])

  // Re-measure whenever the nodes change size or the markup inside changes (expand, collapse, search).
  useEffect(() => {
    const layer = nodesRef.current
    const viewport = viewportRef.current
    if (!layer || !viewport) return
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        measure()
        if (!touched.current) fit(initialFit)
      })
    }
    const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    resize?.observe(layer)
    resize?.observe(viewport)
    const mutation = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null
    mutation?.observe(layer, { childList: true, subtree: true, characterData: true })
    return () => {
      cancelAnimationFrame(frame)
      resize?.disconnect()
      mutation?.disconnect()
    }
  }, [measure, fit, initialFit])

  // Wheel: pinch or Ctrl/⌘ + scroll zooms around the cursor; plain scroll moves the canvas.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setAnimate(false)
      const rect = viewport.getBoundingClientRect()
      if (event.ctrlKey || event.metaKey) {
        zoomAt(Math.exp(-clamp(event.deltaY, -50, 50) * 0.008), event.clientX - rect.left, event.clientY - rect.top)
      } else {
        panBy(-event.deltaX, -event.deltaY)
      }
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [zoomAt, panBy])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(NO_PAN)) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    moved.current = false
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY, sx: event.clientX, sy: event.clientY })
    if (pointers.current.size === 2) {
      const viewport = event.currentTarget
      pointers.current.forEach((_, id) => {
        try {
          viewport.setPointerCapture(id)
        } catch {
          /* pointer already released */
        }
      })
      const [p1, p2] = Array.from(pointers.current.values())
      gesture.current = { distance: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1, scale: viewRef.current.scale }
      panning.current = true
      moved.current = true
      setAnimate(false)
      setDragging(true)
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const point = { ...previous, x: event.clientX, y: event.clientY }
    if (!panning.current) {
      if (Math.hypot(point.x - previous.sx, point.y - previous.sy) < DRAG_THRESHOLD) return
      panning.current = true
      moved.current = true
      touched.current = true
      setAnimate(false)
      setDragging(true)
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        /* pointer already released */
      }
    }
    pointers.current.set(event.pointerId, point)
    if (pointers.current.size === 2 && gesture.current) {
      const [p1, p2] = Array.from(pointers.current.values())
      const rect = event.currentTarget.getBoundingClientRect()
      const target = gesture.current.scale * (Math.hypot(p1.x - p2.x, p1.y - p2.y) / gesture.current.distance)
      zoomAt(target / viewRef.current.scale, (p1.x + p2.x) / 2 - rect.left, (p1.y + p2.y) / 2 - rect.top)
      return
    }
    panBy(point.x - previous.x, point.y - previous.y)
  }

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size < 2) gesture.current = null
    if (pointers.current.size === 0) {
      panning.current = false
      setDragging(false)
    }
  }

  // A press that turned into a drag must not also click the node under it.
  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!moved.current) return
    moved.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest(NO_PAN)) return
    const step = event.shiftKey ? 120 : 40
    const actions: Record<string, () => void> = {
      ArrowLeft: () => panBy(step, 0),
      ArrowRight: () => panBy(-step, 0),
      ArrowUp: () => panBy(0, step),
      ArrowDown: () => panBy(0, -step),
      '+': () => zoomAt(ZOOM_STEP),
      '=': () => zoomAt(ZOOM_STEP),
      '-': () => zoomAt(1 / ZOOM_STEP),
      '0': () => {
        touched.current = false
        fit('all')
      },
    }
    const action = actions[event.key]
    if (action) {
      event.preventDefault()
      setAnimate(false)
      action()
    }
  }

  let dot = 20 * view.scale
  while (dot < 12) dot *= 2

  return (
    <div className={cx('pancanvas', className)}>
      <div
        ref={viewportRef}
        className={cx('pancanvas__viewport', dragging && 'is-dragging')}
        style={{ backgroundSize: `${dot}px ${dot}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
        tabIndex={0}
        role="region"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={onClickCapture}
        onKeyDown={onKeyDown}
      >
        <div
          ref={contentRef}
          className={cx('pancanvas__content', animate && 'is-animating')}
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            visibility: ready ? 'visible' : 'hidden',
          }}
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget) setAnimate(false)
          }}
        >
          <svg className="pancanvas__wires" width={size.w} height={size.h} aria-hidden="true">
            {wires.map((wire, index) => (
              <path key={index} d={wire.d} className={cx(wire.dashed && 'is-dashed')} />
            ))}
          </svg>
          <div ref={nodesRef} className="pancanvas__nodes">
            {children}
          </div>
        </div>
      </div>

      {summary ? <div className="pancanvas__summary">{summary}</div> : null}
      {hint !== false ? (
        <p className="pancanvas__hint">{hint || 'Drag to move · pinch or Ctrl + scroll to zoom'}</p>
      ) : null}

      <div className="pancanvas__toolbar" role="toolbar" aria-label="Zoom">
        <button
          type="button"
          className="pancanvas__tool"
          onClick={() => zoomAt(1 / ZOOM_STEP)}
          aria-label="Zoom out"
          disabled={view.scale <= MIN_SCALE}
        >
          <Icon icon={Minus} size={16} />
        </button>
        <span className="pancanvas__zoom is-num" aria-live="polite">
          {Math.round(view.scale * 100)}%
        </span>
        <button
          type="button"
          className="pancanvas__tool"
          onClick={() => zoomAt(ZOOM_STEP)}
          aria-label="Zoom in"
          disabled={view.scale >= MAX_SCALE}
        >
          <Icon icon={Plus} size={16} />
        </button>
        <span className="pancanvas__sep" aria-hidden="true" />
        <button
          type="button"
          className="pancanvas__tool pancanvas__tool--text"
          aria-label="Fit to view"
          onClick={() => {
            touched.current = false
            setAnimate(true)
            fit('all')
          }}
        >
          <Icon icon={Maximize} size={16} />
          <span className="pancanvas__toollabel">Fit</span>
        </button>
      </div>
    </div>
  )
})

export default PanCanvas
