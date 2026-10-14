import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Maximize, Minus, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAllTeachers } from '../hooks/useTeachers'
import { useCentreDetails } from '../hooks/useCentreDetails'
import { getOrgBandId, ORG_BANDS, type OrgBandId } from '../utils/staafStaff'
import type { Teacher } from '../redux/slices/teacherSlice'
import { Avatar, Icon, Page, cx } from '@/components/ui'
import { formatCount, studentPhotoUrl } from '@/components/students/studentFormat'
import '@/components/staaf/staaf.css'

type Band = { id: OrgBandId; label: string; level: number; members: Teacher[] }
type Edge = { from: string; to: string; kind: 'straight' | 'elbow' | 'spine'; vacant: boolean }
type View = { scale: number; x: number; y: number }

/** Sentence-case names for the bands, plus the phrase used when a band has nobody in it. */
const BAND_COPY: Record<OrgBandId, { title: string; empty: string }> = {
  principal: { title: 'Principal', empty: 'Position vacant' },
  'vice-principal': { title: 'Vice principal', empty: 'Position vacant' },
  pgt: { title: 'PGT', empty: 'No PGT teachers added yet' },
  tgt: { title: 'TGT', empty: 'No TGT teachers added yet' },
  prt: { title: 'PRT', empty: 'No PRT teachers added yet' },
  'sports-coach': { title: 'Sports coaches', empty: 'No sports coaches added yet' },
  admin: { title: 'Admin staff', empty: 'No admin staff added yet' },
  'class-iv': { title: 'Class IV', empty: 'No Class IV staff added yet' },
  drivers: { title: 'Drivers', empty: 'No drivers added yet' },
  conductors: { title: 'Conductors', empty: 'No conductors added yet' },
  security: { title: 'Security', empty: 'No security staff added yet' },
  other: { title: 'Other staff', empty: 'No other staff' },
}

const BAND_TINT: Record<OrgBandId, number> = {
  principal: 1,
  'vice-principal': 2,
  pgt: 4,
  tgt: 1,
  prt: 5,
  'sports-coach': 3,
  admin: 4,
  'class-iv': 3,
  drivers: 5,
  conductors: 2,
  security: 6,
  other: 6,
}

const PREVIEW_COUNT = 5
const MIN_SCALE = 0.25
const MAX_SCALE = 2
const ZOOM_STEP = 1.2
const FIT_PADDING = 40
const READABLE_SCALE = 0.6

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const memberKey = (member: Teacher) => member._id || member.id || member.name

const StaafOrgStructure: React.FC = () => {
  const { data, isLoading } = useAllTeachers({
    includeAllRecords: true,
    sort: 'name',
  })
  const { data: centre } = useCentreDetails()
  const staff = (data?.items || []) as Teacher[]
  const schoolName = String(centre?.centreName || '').trim() || 'Your school'

  const bands = useMemo(() => {
    const grouped = new Map<OrgBandId, Teacher[]>()
    ORG_BANDS.forEach((band) => grouped.set(band.id, []))
    staff.forEach((member) => {
      const bandId = getOrgBandId(member)
      grouped.get(bandId)?.push(member)
    })
    return ORG_BANDS
      .map((band) => ({ ...band, members: grouped.get(band.id) || [] }))
      .filter((band) => band.id !== 'other' || band.members.length > 0)
  }, [staff])

  const principal = bands.find((band) => band.id === 'principal')
  const vicePrincipal = bands.find((band) => band.id === 'vice-principal')
  const academic = bands.filter((band) => band.level >= 3 && band.level <= 5)
  const support = bands.filter((band) => band.level >= 6)
  const wings = [
    { key: 'wing-academic', title: 'Academic wing', bands: academic },
    { key: 'wing-support', title: 'Administration and support', bands: support },
  ]
  const vacantRoles = bands.filter((band) => band.members.length === 0).length

  const edges = useMemo<Edge[]>(() => {
    const list: Edge[] = [
      { from: 'root', to: 'principal', kind: 'straight', vacant: !principal?.members.length },
      { from: 'principal', to: 'vice-principal', kind: 'straight', vacant: !vicePrincipal?.members.length },
    ]
    ;[
      { key: 'wing-academic', bands: academic },
      { key: 'wing-support', bands: support },
    ].forEach((wing) => {
      const staffed = wing.bands.some((band) => band.members.length > 0)
      list.push({ from: 'vice-principal', to: wing.key, kind: 'elbow', vacant: !staffed })
      wing.bands.forEach((band) => list.push({ from: wing.key, to: band.id, kind: 'spine', vacant: band.members.length === 0 }))
    })
    return list
  }, [principal, vicePrincipal, academic, support])

  if (isLoading && staff.length === 0) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading the organisation structure
        </div>
      </Page>
    )
  }

  return (
    <Page width="full" className="staaf-org-page">
      <OrgCanvas
        edges={edges}
        summary={vacantRoles ? `${vacantRoles} of ${bands.length} roles vacant` : 'Every role is filled'}
        layoutKey={`${staff.length}`}
      >
        {(register) => (
          <div className="staaf-chart">
            <div ref={register('root')} className="staaf-node staaf-node--root">
              <span className="staaf-node__eyebrow">Organisation</span>
              <h2 className="staaf-node__school">{schoolName}</h2>
              <span className="staaf-node__rootmeta">
                {formatCount(staff.length)} staff mapped across the hierarchy
              </span>
            </div>

            {principal ? <LeaderNode band={principal} nodeRef={register('principal')} /> : null}
            {vicePrincipal ? <LeaderNode band={vicePrincipal} nodeRef={register('vice-principal')} /> : null}

            <div className="staaf-chart__wings">
              {wings.map((wing) => {
                const count = wing.bands.reduce((sum, band) => sum + band.members.length, 0)
                return (
                  <section key={wing.key} className="staaf-wing" aria-label={wing.title}>
                    <div ref={register(wing.key)} className="staaf-wing__label">
                      <span>{wing.title}</span>
                      <span className="staaf-wing__count">{formatCount(count)}</span>
                    </div>
                    <div className="staaf-wing__grid">
                      {wing.bands.map((band) => (
                        <GroupNode key={band.id} band={band} nodeRef={register(band.id)} />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>
        )}
      </OrgCanvas>
    </Page>
  )
}

/* ---------- Nodes ---------- */

const PersonRow = ({ member, fallbackRole }: { member: Teacher; fallbackRole: string }) => {
  const navigate = useNavigate()
  const id = member._id || member.id
  return (
    <li className="staaf-node__person">
      <Avatar name={member.name} src={studentPhotoUrl(member.profileImage)} size="sm" />
      <span className="staaf-node__persontext">
        <span className="staaf-node__name">{member.name}</span>
        <span className="staaf-node__role">{member.designation || member.dutyType || fallbackRole}</span>
      </span>
      {id ? (
        <button
          type="button"
          className="staaf-node__open"
          aria-label={`Open ${member.name}'s profile`}
          title="Open profile"
          onClick={() => navigate(`/staaf/staff/${id}`)}
        >
          <Icon icon={ChevronRight} size={16} />
        </button>
      ) : null}
    </li>
  )
}

const LeaderNode = ({ band, nodeRef }: { band: Band; nodeRef: (el: HTMLElement | null) => void }) => {
  const copy = BAND_COPY[band.id]
  if (band.members.length === 0) {
    return (
      <div ref={nodeRef} className={cx('staaf-node staaf-node--leader is-vacant', `staaf-tint--c${BAND_TINT[band.id]}`)}>
        <span className="staaf-node__kicker">{copy.title}</span>
        <span className="staaf-node__vacant">{copy.empty}</span>
      </div>
    )
  }
  return (
    <div ref={nodeRef} className="staaf-node staaf-node--leader">
      <div className={cx('staaf-node__head', `staaf-tint--c${BAND_TINT[band.id]}`)}>
        <span className="staaf-node__title">{copy.title}</span>
      </div>
      <ul className="staaf-node__people">
        {band.members.map((member) => (
          <PersonRow key={memberKey(member)} member={member} fallbackRole={copy.title} />
        ))}
      </ul>
    </div>
  )
}

const GroupNode = ({ band, nodeRef }: { band: Band; nodeRef: (el: HTMLElement | null) => void }) => {
  const [expanded, setExpanded] = useState(false)
  const copy = BAND_COPY[band.id]
  const tint = `staaf-tint--c${BAND_TINT[band.id]}`
  const shown = expanded ? band.members : band.members.slice(0, PREVIEW_COUNT)
  const hidden = band.members.length - shown.length

  return (
    <div ref={nodeRef} className={cx('staaf-node staaf-node--group', band.members.length === 0 && 'is-empty')}>
      <div className={cx('staaf-node__head', tint)}>
        <span className="staaf-node__title">{copy.title}</span>
        <span className="staaf-node__count">{formatCount(band.members.length)}</span>
      </div>
      {band.members.length === 0 ? (
        <div className={cx('staaf-node__emptybox', tint)}>
          <span className="staaf-node__emptytitle">Vacant</span>
          <span>{copy.empty}</span>
        </div>
      ) : (
        <>
          <ul className="staaf-node__people">
            {shown.map((member) => (
              <PersonRow key={memberKey(member)} member={member} fallbackRole={copy.title} />
            ))}
          </ul>
          {band.members.length > PREVIEW_COUNT ? (
            <button type="button" className="staaf-node__more" onClick={() => setExpanded((open) => !open)}>
              {expanded ? 'Show fewer' : `Show ${formatCount(hidden)} more`}
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}

/* ---------- Canvas: pan, zoom, connectors ---------- */

type Register = (key: string) => (el: HTMLElement | null) => void

const OrgCanvas = ({
  children,
  edges,
  summary,
  layoutKey,
}: {
  children: (register: Register) => React.ReactNode
  edges: Edge[]
  summary: string
  layoutKey: string
}) => {
  const viewportRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const nodes = useRef(new Map<string, HTMLElement>())
  const registerCache = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })
  const viewRef = useRef(view)
  viewRef.current = view
  const [paths, setPaths] = useState<{ d: string; vacant: boolean }[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [ready, setReady] = useState(false)
  const touched = useRef(false)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ distance: number; scale: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const register = useCallback<Register>((key) => {
    let fn = registerCache.current.get(key)
    if (!fn) {
      fn = (el) => {
        if (el) nodes.current.set(key, el)
        else nodes.current.delete(key)
      }
      registerCache.current.set(key, fn)
    }
    return fn
  }, [])

  /** Measures every node in chart coordinates (independent of the current zoom) and draws the connectors. */
  const measure = useCallback(() => {
    const content = contentRef.current
    if (!content) return
    const base = content.getBoundingClientRect()
    const scale = viewRef.current.scale
    const box = (key: string) => {
      const el = nodes.current.get(key)
      if (!el) return null
      const r = el.getBoundingClientRect()
      const x = (r.left - base.left) / scale
      const y = (r.top - base.top) / scale
      return { x, y, w: r.width / scale, h: r.height / scale, cx: x + r.width / scale / 2 }
    }
    const radius = 10
    const next: { d: string; vacant: boolean }[] = []
    const spines = new Map<string, { x: number; top: number; bottom: number; vacant: boolean }>()

    edges.forEach((edge) => {
      const a = box(edge.from)
      const b = box(edge.to)
      if (!a || !b) return
      if (edge.kind === 'straight') {
        next.push({ d: `M${a.cx},${a.y + a.h} L${b.cx},${b.y}`, vacant: edge.vacant })
      } else if (edge.kind === 'elbow') {
        const startY = a.y + a.h
        const midY = startY + (b.y - startY) / 2
        const dir = Math.sign(b.cx - a.cx)
        const r = Math.min(radius, Math.abs(b.cx - a.cx) / 2, (b.y - startY) / 2)
        next.push({
          d: dir === 0
            ? `M${a.cx},${startY} L${b.cx},${b.y}`
            : `M${a.cx},${startY} L${a.cx},${midY - r} Q${a.cx},${midY} ${a.cx + dir * r},${midY} L${b.cx - dir * r},${midY} Q${b.cx},${midY} ${b.cx},${midY + r} L${b.cx},${b.y}`,
          vacant: edge.vacant,
        })
      } else {
        // Spine: a trunk drops from the wing label through the gap between columns, with a branch into each card.
        const anchorY = b.y + 20
        const spine = spines.get(edge.from) || { x: a.cx, top: a.y + a.h, bottom: anchorY, vacant: true }
        spine.bottom = Math.max(spine.bottom, anchorY)
        spine.vacant = spine.vacant && edge.vacant
        spines.set(edge.from, spine)
        const edgeX = b.cx < a.cx ? b.x + b.w : b.x
        const dir = Math.sign(edgeX - a.cx)
        next.push({
          d: `M${a.cx},${anchorY - radius} Q${a.cx},${anchorY} ${a.cx + dir * radius},${anchorY} L${edgeX},${anchorY}`,
          vacant: edge.vacant,
        })
      }
    })
    spines.forEach((spine) => {
      next.push({ d: `M${spine.x},${spine.top} L${spine.x},${spine.bottom - radius}`, vacant: spine.vacant })
    })
    setPaths(next)
    setSize({ w: content.offsetWidth, h: content.offsetHeight })
  }, [edges])

  /** `all` shows the whole chart; `readable` (first view) never shrinks below a readable size and starts at the top. */
  const fit = useCallback((mode: 'all' | 'readable' = 'all') => {
    const viewport = viewportRef.current
    const content = contentRef.current
    if (!viewport || !content) return
    const vw = viewport.clientWidth
    const vh = viewport.clientHeight
    const cw = content.offsetWidth
    const ch = content.offsetHeight
    if (!vw || !vh || !cw || !ch) return
    const scale = clamp(Math.min((vw - FIT_PADDING * 2) / cw, (vh - FIT_PADDING * 2) / ch), MIN_SCALE, 1)
    if (mode === 'readable' && scale < READABLE_SCALE) {
      setView({ scale: READABLE_SCALE, x: (vw - cw * READABLE_SCALE) / 2, y: FIT_PADDING + 24 })
      return
    }
    setView({
      scale,
      x: (vw - cw * scale) / 2,
      y: Math.max(FIT_PADDING, (vh - ch * scale) / 2),
    })
  }, [])

  useLayoutEffect(() => {
    measure()
  }, [measure, layoutKey])

  // Fit once the chart has a size; keep fitting on resize until the person moves the canvas themselves.
  useLayoutEffect(() => {
    touched.current = false
    fit('readable')
    setReady(true)
  }, [fit, layoutKey])

  useEffect(() => {
    const content = contentRef.current
    const viewport = viewportRef.current
    if (!content || !viewport || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      measure()
      if (!touched.current) fit('readable')
    })
    observer.observe(content)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [measure, fit])

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

  // Wheel: pinch or Ctrl/⌘ + scroll zooms around the cursor; plain scroll moves the canvas.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
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
    touched.current = true
    if ((event.target as HTMLElement).closest('button')) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.current.size === 2) {
      const [p1, p2] = Array.from(pointers.current.values())
      gesture.current = { distance: Math.hypot(p1.x - p2.x, p1.y - p2.y), scale: viewRef.current.scale }
    }
    setDragging(true)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const point = { x: event.clientX, y: event.clientY }
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
    if (pointers.current.size === 0) setDragging(false)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    touched.current = true
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
        fit()
      },
    }
    const action = actions[event.key]
    if (action) {
      event.preventDefault()
      action()
    }
  }

  let dot = 20 * view.scale
  while (dot < 12) dot *= 2

  return (
    <div className="staaf-canvas">
      <div
        ref={viewportRef}
        className={cx('staaf-canvas__viewport', dragging && 'is-dragging')}
        style={{
          backgroundSize: `${dot}px ${dot}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        tabIndex={0}
        role="region"
        aria-label="Organisation chart. Drag or use the arrow keys to move, plus and minus to zoom, 0 to fit."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        <div
          ref={contentRef}
          className="staaf-canvas__content"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            visibility: ready ? 'visible' : 'hidden',
          }}
        >
          <svg className="staaf-canvas__wires" width={size.w} height={size.h} aria-hidden="true">
            {paths.map((path, index) => (
              <path key={index} d={path.d} className={cx(path.vacant && 'is-vacant')} />
            ))}
          </svg>
          {children(register)}
        </div>
      </div>

      <div className="staaf-canvas__summary">{summary}</div>
      <p className="staaf-canvas__hint">Drag to move · pinch or Ctrl + scroll to zoom</p>

      <div className="staaf-canvas__toolbar" role="toolbar" aria-label="Zoom">
        <button type="button" className="staaf-canvas__tool" onClick={() => zoomAt(1 / ZOOM_STEP)} aria-label="Zoom out" disabled={view.scale <= MIN_SCALE}>
          <Icon icon={Minus} size={16} />
        </button>
        <span className="staaf-canvas__zoom is-num" aria-live="polite">
          {Math.round(view.scale * 100)}%
        </span>
        <button type="button" className="staaf-canvas__tool" onClick={() => zoomAt(ZOOM_STEP)} aria-label="Zoom in" disabled={view.scale >= MAX_SCALE}>
          <Icon icon={Plus} size={16} />
        </button>
        <span className="staaf-canvas__sep" aria-hidden="true" />
        <button
          type="button"
          className="staaf-canvas__tool staaf-canvas__tool--text"
          onClick={() => {
            touched.current = false
            fit()
          }}
        >
          <Icon icon={Maximize} size={16} />
          Fit
        </button>
      </div>
    </div>
  )
}

export default StaafOrgStructure
