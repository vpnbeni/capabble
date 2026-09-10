import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, MoreVertical } from 'lucide-react'
import { LOCATION_TYPE_META, childTypeForParent, normalizeLocationType } from '@/constants/locationConstants'
import { getRoomDisplayNumber, sortLocationChildren } from '@/utils/roomLocationSort'

export type LocationTreeNode = {
  _id: string
  name: string
  type: string
  code?: string
  roomNumber?: string
  children?: LocationTreeNode[]
  directAssetCount?: number
  totalAssetCount?: number
}

type Props = {
  nodes: LocationTreeNode[]
  selectedId?: string
  search?: string
  onSelect: (node: LocationTreeNode) => void
  onAction: (action: string, node: LocationTreeNode) => void
}

const matchesSearch = (node: LocationTreeNode, query: string): boolean => {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const self = `${node.name} ${node.roomNumber || ''} ${node.code || ''}`.toLowerCase().includes(q)
  if (self) return true
  return (node.children || []).some((child) => matchesSearch(child, q))
}

const filterTree = (nodes: LocationTreeNode[], query: string): LocationTreeNode[] => {
  if (!query.trim()) return nodes
  return nodes
    .map((node) => {
      const children = filterTree(node.children || [], query)
      if (matchesSearch(node, query) || children.length) return { ...node, children }
      return null
    })
    .filter(Boolean) as LocationTreeNode[]
}

const TreeNode: React.FC<{
  node: LocationTreeNode
  depth: number
  selectedId?: string
  expanded: Record<string, boolean>
  onToggle: (id: string) => void
  onSelect: (node: LocationTreeNode) => void
  onAction: (action: string, node: LocationTreeNode) => void
  forceExpand?: boolean
}> = ({ node, depth, selectedId, expanded, onToggle, onSelect, onAction, forceExpand }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const normalized = normalizeLocationType(node.type)
  const meta = LOCATION_TYPE_META[normalized] || LOCATION_TYPE_META.Room
  const hasChildren = (node.children || []).length > 0
  const isExpanded = forceExpand || expanded[node._id] !== false
  const isSelected = selectedId === node._id
  const childType = childTypeForParent(normalized)
  const sortedChildren = useMemo(
    () => sortLocationChildren(node.children || [], node.type),
    [node.children, node.type],
  )
  const roomDisplayNumber = getRoomDisplayNumber(node)

  const actions: { key: string; label: string }[] = [{ key: 'open', label: 'Open' }]
  if (childType === 'Block') actions.push({ key: 'add-block', label: 'Add Block' })
  if (childType === 'Floor') actions.push({ key: 'add-floor', label: 'Add Floor' })
  if (childType === 'Room') actions.push({ key: 'add-room', label: 'Add Room' })
  actions.push({ key: 'edit', label: 'Edit' })
  if (normalized !== 'Campus') actions.push({ key: 'archive', label: 'Archive' })

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 ${isSelected ? 'bg-indigo-50 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:ring-indigo-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <button
          type="button"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-600"
          onClick={() => hasChildren && onToggle(node._id)}
        >
          {hasChildren ? (isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="inline-block w-4" />}
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelect(node)}>
          <span aria-hidden>{meta.icon}</span>
          <span className="truncate text-sm font-medium text-slate-900 dark:text-white">
            {normalized === 'Room' && roomDisplayNumber ? (
              <>
                <span className="font-semibold text-slate-700 dark:text-slate-200">{roomDisplayNumber}</span>
                <span className="text-slate-400"> · </span>
                <span>{node.name}</span>
              </>
            ) : (
              node.name
            )}
          </span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${meta.badge}`}>{meta.label}</span>
          {(node.totalAssetCount || 0) > 0 ? (
            <span className="shrink-0 text-[11px] text-slate-400">{node.totalAssetCount}</span>
          ) : null}
        </button>
        <div className="relative">
          <button
            type="button"
            aria-label="Location actions"
            className="rounded p-1 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                  onClick={() => {
                    setMenuOpen(false)
                    onAction(action.key, node)
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {hasChildren && isExpanded ? (
        <div className="border-l border-slate-200 dark:border-slate-700" style={{ marginLeft: `${depth * 16 + 20}px` }}>
          {sortedChildren.map((child) => (
            <TreeNode
              key={child._id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onAction={onAction}
              forceExpand={forceExpand}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

const LocationTree: React.FC<Props> = ({ nodes, selectedId, search = '', onSelect, onAction }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const filtered = useMemo(() => filterTree(nodes, search), [nodes, search])
  const forceExpand = Boolean(search.trim())

  const expandAll = () => {
    const next: Record<string, boolean> = {}
    const walk = (items: LocationTreeNode[]) => {
      items.forEach((item) => {
        next[item._id] = true
        walk(item.children || [])
      })
    }
    walk(nodes)
    setExpanded(next)
  }

  const collapseAll = () => setExpanded({})

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: prev[id] === false }))

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">Location Structure</div>
        <div className="flex gap-2 text-xs">
          <button type="button" className="text-indigo-600 hover:underline" onClick={expandAll}>Expand All</button>
          <button type="button" className="text-indigo-600 hover:underline" onClick={collapseAll}>Collapse All</button>
        </div>
      </div>
      {!filtered.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
          No locations match your search.
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          {filtered.map((node) => (
            <TreeNode
              key={node._id}
              node={node}
              depth={0}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={toggle}
              onSelect={onSelect}
              onAction={onAction}
              forceExpand={forceExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default LocationTree
