import React, { useMemo, useState } from 'react'
import {
  Archive,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  DoorOpen,
  ExternalLink,
  Layers,
  MapPin,
  Minus,
  Pencil,
  Plus,
  School,
  Warehouse,
  type LucideIcon,
} from 'lucide-react'
import PanCanvas, { type PanCanvasHandle } from '@/components/common/PanCanvas'
import { Badge, Button, Card, DataTable, EmptyState, Icon, Menu, cx, type DataTableColumn, type MenuItem, type Tone } from '@/components/ui'
import { childTypeForParent, normalizeLocationType } from '@/constants/locationConstants'
import { getRoomDisplayNumber, sortLocationChildren } from '@/utils/roomLocationSort'
import './locations.css'

export type LocationTreeNode = {
  _id: string
  name: string
  type: string
  code?: string
  roomNumber?: string
  className?: string
  section?: string
  roomType?: string
  isStore?: boolean
  isActive?: boolean
  locationStatus?: string
  children?: LocationTreeNode[]
  directAssetCount?: number
  totalAssetCount?: number
}

export type LocationAction = 'open' | 'open-page' | 'add-child' | 'edit' | 'archive'

/* ---------- Shared helpers ---------- */

const TYPE_ICON: Record<string, LucideIcon> = { Campus: MapPin, Block: Building2, Floor: Layers, Room: DoorOpen }
const TYPE_TONE: Record<string, Tone | 'accent'> = { Campus: 'accent', Block: 'info', Floor: 'neutral', Room: 'success' }
const TYPE_PLURAL: Record<string, string> = { Campus: 'campuses', Block: 'blocks', Floor: 'floors', Room: 'rooms' }

export const plural = (count: number, one: string, many: string) => `${count.toLocaleString('en-IN')} ${count === 1 ? one : many}`

export const locationTypeOf = (node: { type?: string }) => String(normalizeLocationType(node.type))

export const locationIcon = (node: { type?: string; roomType?: string; isStore?: boolean }): LucideIcon => {
  const type = locationTypeOf(node)
  if (type === 'Room' && (node.isStore || node.roomType === 'Store')) return Warehouse
  return TYPE_ICON[type] || DoorOpen
}

export const locationTypeTone = (type: string): Tone | 'accent' => TYPE_TONE[type] || 'neutral'

/** "101 · Physics lab" for rooms with a number, otherwise the name. */
export const locationLabel = (node: LocationTreeNode) => {
  const number = locationTypeOf(node) === 'Room' ? getRoomDisplayNumber(node) : ''
  return number && number !== node.name ? `${number} · ${node.name}` : node.name
}

export const isLocationInactive = (node: { locationStatus?: string; isActive?: boolean }) =>
  node.locationStatus === 'Inactive' || node.isActive === false

const selfMatches = (node: LocationTreeNode, q: string) =>
  [node.name, node.roomNumber, node.code, node.className, node.section, node.className && node.section ? `${node.className}-${node.section}` : '']
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q)

const matchesSearch = (node: LocationTreeNode, query: string): boolean => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return selfMatches(node, q) || (node.children || []).some((child) => matchesSearch(child, q))
}

export const filterTree = (nodes: LocationTreeNode[], query: string): LocationTreeNode[] => {
  if (!query.trim()) return nodes
  return nodes
    .map((node) => {
      const children = filterTree(node.children || [], query)
      if (matchesSearch(node, query) || children.length) return { ...node, children }
      return null
    })
    .filter(Boolean) as LocationTreeNode[]
}

const sortedChildren = (node: LocationTreeNode) => sortLocationChildren(node.children || [], node.type)

/** Ids of nodes that match the query themselves, in reading order. */
export const findMatches = (nodes: LocationTreeNode[], query: string): string[] => {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const out: string[] = []
  const walk = (items: LocationTreeNode[]) =>
    items.forEach((item) => {
      if (selfMatches(item, q)) out.push(item._id)
      walk(sortedChildren(item))
    })
  walk(nodes)
  return out
}

export const findLocationNode = (nodes: LocationTreeNode[], id: string): LocationTreeNode | null => {
  for (const node of nodes) {
    if (node._id === id) return node
    const child = findLocationNode(node.children || [], id)
    if (child) return child
  }
  return null
}

/** Every ancestor id of the given ids (so they can be expanded to reveal them). */
const ancestorsOf = (nodes: LocationTreeNode[], ids: string[]) => {
  const wanted = new Set(ids)
  const out = new Set<string>()
  const walk = (items: LocationTreeNode[], trail: string[]) =>
    items.forEach((item) => {
      if (wanted.has(item._id)) trail.forEach((id) => out.add(id))
      walk(item.children || [], [...trail, item._id])
    })
  walk(nodes, [])
  return out
}

const countsLine = (node: LocationTreeNode) => {
  const parts: string[] = []
  const kids = node.children || []
  if (kids.length) {
    const childType = childTypeForParent(locationTypeOf(node)) || 'Room'
    parts.push(plural(kids.length, childType.toLowerCase(), TYPE_PLURAL[childType] || 'locations'))
  }
  parts.push(plural(node.totalAssetCount || 0, 'asset', 'assets'))
  return parts.join(' · ')
}

export const locationMenuItems = (node: LocationTreeNode, onAction: (action: LocationAction, node: LocationTreeNode) => void): MenuItem[] => {
  const type = locationTypeOf(node)
  const childType = childTypeForParent(type)
  const items: MenuItem[] = [{ label: 'Open details', icon: ChevronRight, onSelect: () => onAction('open', node) }]
  if (childType) items.push({ label: `Add ${childType.toLowerCase()}`, icon: Plus, onSelect: () => onAction('add-child', node) })
  items.push({ label: 'Edit', icon: Pencil, onSelect: () => onAction('edit', node) })
  items.push({ label: 'Open full page', icon: ExternalLink, onSelect: () => onAction('open-page', node) })
  if (type !== 'Campus') {
    items.push({ divider: true })
    items.push({ label: 'Archive', icon: Archive, tone: 'danger', onSelect: () => onAction('archive', node) })
  }
  return items
}

/* ---------- Canvas view ---------- */

const STACK_PREVIEW = 8

type CanvasProps = {
  canvasRef?: React.Ref<PanCanvasHandle>
  schoolName: string
  nodes: LocationTreeNode[]
  summary?: React.ReactNode
  selectedId?: string
  /** Ids that match the search (highlighted; everything else dims). */
  matchIds?: string[]
  currentMatchId?: string
  onAction: (action: LocationAction, node: LocationTreeNode) => void
  layoutKey?: string | number
}

type CanvasState = {
  collapsed: Record<string, boolean>
  showAll: Record<string, boolean>
  forcedOpen: Set<string>
  searching: boolean
  matches: Set<string>
  currentMatchId?: string
  selectedId?: string
  toggleCollapsed: (id: string) => void
  toggleShowAll: (id: string) => void
  onAction: (action: LocationAction, node: LocationTreeNode) => void
}

const CanvasNode: React.FC<{
  node: LocationTreeNode
  parentId: string
  wire: 'elbow' | 'spine'
  compact?: boolean
  state: CanvasState
}> = ({ node, parentId, wire, compact, state }) => {
  const type = locationTypeOf(node)
  const label = locationLabel(node)
  const kids = node.children || []
  const isMatch = state.matches.has(node._id)
  const collapsed = Boolean(state.collapsed[node._id]) && !state.forcedOpen.has(node._id)
  const inactive = isLocationInactive(node)
  const meta = compact
    ? [node.roomType && node.roomType !== 'Other' ? node.roomType : '', node.className && node.section ? `${node.className}-${node.section}` : '', plural(node.totalAssetCount || 0, 'asset', 'assets')]
        .filter(Boolean)
        .join(' · ')
    : node.code || (type === 'Room' ? node.roomType : '') || 'No code'

  return (
    <div
      className={cx(
        'al-node',
        compact && 'al-node--compact',
        state.selectedId === node._id && 'is-selected',
        state.searching && (isMatch ? 'is-match' : 'is-dimmed'),
        state.currentMatchId === node._id && 'is-current',
        inactive && 'is-inactive'
      )}
      data-canvas-node={node._id}
      data-canvas-parent={parentId}
      data-canvas-wire={wire}
    >
      <button type="button" className="al-node__main" onClick={() => state.onAction('open', node)} aria-label={`Open ${label}`}>
        <span className={cx('al-node__icon', `al-tone--${type.toLowerCase()}`)} aria-hidden="true">
          <Icon icon={locationIcon(node)} size={compact ? 16 : 18} />
        </span>
        <span className="al-node__text">
          <span className="al-node__name">{label}</span>
          <span className="al-node__meta">{meta}</span>
        </span>
        {!compact ? (
          <span className="al-node__foot">
            <Badge tone={locationTypeTone(type)} dot={false}>
              {type}
            </Badge>
            {inactive ? <Badge tone="neutral">Inactive</Badge> : null}
            <span className="al-node__counts is-num">{countsLine(node)}</span>
          </span>
        ) : null}
      </button>
      <div className="al-node__menu">
        <Menu items={locationMenuItems(node, state.onAction)} label={`Actions for ${label}`} />
      </div>
      {kids.length && !compact ? (
        <button
          type="button"
          className="al-node__toggle"
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Show ${plural(kids.length, 'sub-location', 'sub-locations')} of ${label}` : `Hide sub-locations of ${label}`}
          onClick={() => state.toggleCollapsed(node._id)}
        >
          {collapsed ? <span className="is-num">{kids.length}</span> : <Icon icon={Minus} size={12} />}
        </button>
      ) : null}
    </div>
  )
}

const Ghost: React.FC<{ parent: LocationTreeNode; wire: 'elbow' | 'spine'; onAction: CanvasState['onAction'] }> = ({ parent, wire, onAction }) => {
  const childType = childTypeForParent(locationTypeOf(parent))
  if (!childType) return null
  return (
    <button
      type="button"
      className={cx('al-ghost', wire === 'spine' && 'al-ghost--compact')}
      data-canvas-node={`add-${parent._id}`}
      data-canvas-parent={parent._id}
      data-canvas-wire={wire}
      data-canvas-dashed="true"
      onClick={() => onAction('add-child', parent)}
    >
      <Icon icon={Plus} size={14} />
      Add {childType.toLowerCase()}
    </button>
  )
}

/** Renders as a vertical stack when nothing below it has its own children (rooms under a floor). */
const isLayoutLeaf = (node: LocationTreeNode) => !(node.children || []).length && !childTypeForParent(locationTypeOf(node))

const Branch: React.FC<{ node: LocationTreeNode; parentId: string; wire: 'elbow' | 'spine'; compact?: boolean; state: CanvasState }> = ({
  node,
  parentId,
  wire,
  compact,
  state,
}) => {
  const kids = sortedChildren(node)
  const collapsed = Boolean(state.collapsed[node._id]) && !state.forcedOpen.has(node._id)
  const childType = childTypeForParent(locationTypeOf(node))
  const stack = kids.length > 0 && kids.every(isLayoutLeaf)
  const showAll = state.showAll[node._id] || (state.searching && kids.some((kid) => state.matches.has(kid._id)))
  const visible = stack && !showAll ? kids.slice(0, STACK_PREVIEW) : kids
  const hidden = kids.length - visible.length

  return (
    <div className={cx('al-branch', stack && 'al-branch--stack')}>
      <CanvasNode node={node} parentId={parentId} wire={wire} compact={compact} state={state} />
      {compact || collapsed ? null : kids.length ? (
        stack ? (
          <div className="al-stack">
            {visible.map((kid) => (
              <Branch key={kid._id} node={kid} parentId={node._id} wire="spine" compact state={state} />
            ))}
            {kids.length > STACK_PREVIEW ? (
              <button type="button" className="al-more" onClick={() => state.toggleShowAll(node._id)}>
                {hidden > 0 ? `Show ${plural(hidden, 'more room', 'more rooms')}` : 'Show fewer'}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="al-row">
            {kids.map((kid) => (
              <Branch key={kid._id} node={kid} parentId={node._id} wire="elbow" state={state} />
            ))}
          </div>
        )
      ) : childType ? (
        <div className={childType === 'Room' ? 'al-stack' : 'al-row'}>
          <Ghost parent={node} wire={childType === 'Room' ? 'spine' : 'elbow'} onAction={state.onAction} />
        </div>
      ) : null}
    </div>
  )
}

export const LocationCanvas: React.FC<CanvasProps> = ({
  canvasRef,
  schoolName,
  nodes,
  summary,
  selectedId,
  matchIds = [],
  currentMatchId,
  onAction,
  layoutKey,
}) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = useState<Record<string, boolean>>({})
  const searching = matchIds.length > 0
  const forcedOpen = useMemo(() => ancestorsOf(nodes, matchIds), [nodes, matchIds])
  const matches = useMemo(() => new Set(matchIds), [matchIds])
  const roomCount = useMemo(() => {
    let rooms = 0
    const walk = (items: LocationTreeNode[]) =>
      items.forEach((item) => {
        if (locationTypeOf(item) === 'Room') rooms += 1
        walk(item.children || [])
      })
    walk(nodes)
    return rooms
  }, [nodes])

  const state: CanvasState = {
    collapsed,
    showAll,
    forcedOpen,
    searching,
    matches,
    currentMatchId,
    selectedId,
    toggleCollapsed: (id) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] })),
    toggleShowAll: (id) => setShowAll((prev) => ({ ...prev, [id]: !prev[id] })),
    onAction,
  }

  return (
    <PanCanvas
      ref={canvasRef}
      summary={summary}
      layoutKey={layoutKey}
      className="al-canvas"
      label="Location structure. Drag or use the arrow keys to move, plus and minus to zoom, 0 to fit."
    >
      <div className="al-chart">
        <div className="al-branch">
          <div className={cx('al-node al-node--root', searching && 'is-dimmed')} data-canvas-node="root">
            <span className="al-node__icon al-node__icon--root" aria-hidden="true">
              <Icon icon={School} size={18} />
            </span>
            <span className="al-node__rootname">{schoolName}</span>
            <span className="al-node__rootmeta is-num">
              {plural(nodes.length, 'campus', 'campuses')} · {plural(roomCount, 'room', 'rooms')}
            </span>
          </div>
          {nodes.length ? (
            <div className="al-row">
              {nodes.map((campus) => (
                <Branch key={campus._id} node={campus} parentId="root" wire="elbow" state={state} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </PanCanvas>
  )
}

/* ---------- List view ---------- */

type Row = { node: LocationTreeNode; depth: number; hasChildren: boolean; expanded: boolean }

type ListProps = {
  nodes: LocationTreeNode[]
  selectedId?: string
  search?: string
  summary?: React.ReactNode
  onAction: (action: LocationAction, node: LocationTreeNode) => void
}

/** Indented table of the hierarchy: easier than the canvas for scanning long lists. */
const LocationTree: React.FC<ListProps> = ({ nodes, search = '', summary, onAction }) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const filtered = useMemo(() => filterTree(nodes, search), [nodes, search])
  const searching = Boolean(search.trim())

  const rows = useMemo(() => {
    const out: Row[] = []
    const walk = (items: LocationTreeNode[], depth: number) =>
      items.forEach((node) => {
        const kids = sortedChildren(node)
        const expanded = searching || !collapsed[node._id]
        out.push({ node, depth, hasChildren: kids.length > 0, expanded })
        if (kids.length && expanded) walk(kids, depth + 1)
      })
    walk(filtered, 0)
    return out
  }, [filtered, collapsed, searching])

  const expandAll = () => setCollapsed({})
  const collapseAll = () => {
    const next: Record<string, boolean> = {}
    const walk = (items: LocationTreeNode[]) =>
      items.forEach((item) => {
        if ((item.children || []).length) next[item._id] = true
        walk(item.children || [])
      })
    walk(nodes)
    setCollapsed(next)
  }

  const columns: DataTableColumn<Row>[] = [
    {
      key: 'name',
      header: 'Location',
      mobile: 'title',
      render: ({ node, depth, hasChildren, expanded }) => {
        const type = locationTypeOf(node)
        const label = locationLabel(node)
        return (
          <div className="al-tname" style={{ '--al-depth': depth } as React.CSSProperties}>
            {hasChildren ? (
              <button
                type="button"
                className="al-tname__toggle"
                aria-expanded={expanded}
                aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
                disabled={searching}
                onClick={(event) => {
                  event.stopPropagation()
                  setCollapsed((prev) => ({ ...prev, [node._id]: !prev[node._id] }))
                }}
              >
                <Icon icon={expanded ? ChevronDown : ChevronRight} size={16} />
              </button>
            ) : (
              <span className="al-tname__spacer" aria-hidden="true" />
            )}
            <span className={cx('al-tname__icon', `al-tone--${type.toLowerCase()}`)} aria-hidden="true">
              <Icon icon={locationIcon(node)} size={14} />
            </span>
            <span className="al-tname__text">
              <span className="al-tname__primary">{label}</span>
              {node.code ? <span className="al-tname__secondary">{node.code}</span> : null}
            </span>
            {isLocationInactive(node) ? (
              <span className="al-tname__inactive">
                <Badge tone="neutral">Inactive</Badge>
              </span>
            ) : null}
          </div>
        )
      },
    },
    {
      key: 'type',
      header: 'Type',
      mobile: 'aside',
      width: 110,
      render: ({ node }) => {
        const type = locationTypeOf(node)
        return (
          <Badge tone={locationTypeTone(type)} dot={false}>
            {type}
          </Badge>
        )
      },
    },
    {
      key: 'children',
      header: 'Sub-locations',
      align: 'right',
      numeric: true,
      width: 130,
      render: ({ node }) => (node.children || []).length.toLocaleString('en-IN'),
    },
    {
      key: 'assets',
      header: 'Assets',
      align: 'right',
      numeric: true,
      width: 100,
      render: ({ node }) => (node.totalAssetCount || 0).toLocaleString('en-IN'),
    },
    {
      key: 'status',
      header: 'Status',
      width: 110,
      mobile: 'hidden',
      render: ({ node }) =>
        isLocationInactive(node) ? <Badge tone="neutral">Inactive</Badge> : <Badge tone="success">Active</Badge>,
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      width: 56,
      align: 'right',
      interactive: true,
      render: ({ node }) => <Menu items={locationMenuItems(node, onAction)} label={`Actions for ${locationLabel(node)}`} />,
    },
  ]

  return (
    <Card
      flush
      title="Location structure"
      subtitle={summary}
      className="al-list"
      action={
        <div className="al-list__actions">
          <Button size="sm" variant="tertiary" icon={ChevronsUpDown} onClick={expandAll} disabled={searching}>
            Expand all
          </Button>
          <Button size="sm" variant="tertiary" icon={ChevronsDownUp} onClick={collapseAll} disabled={searching}>
            Collapse all
          </Button>
        </div>
      }
    >
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.node._id}
        onRowClick={(row) => onAction('open', row.node)}
        caption="Location structure"
        empty={
          <EmptyState
            title="No locations match your search"
            body="Try a room number, a code or a class such as 10-A."
            compact
          />
        }
      />
    </Card>
  )
}

export default LocationTree
