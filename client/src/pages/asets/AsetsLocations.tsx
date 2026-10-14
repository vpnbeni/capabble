import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, MapPin, Plus, Search } from 'lucide-react'
import asetsService from '@/services/asetsService'
import { Button, Card, EmptyState, Page, Tabs, TextField, cx } from '@/components/ui'
import type { PanCanvasHandle } from '@/components/common/PanCanvas'
import LocationTree, {
  LocationCanvas,
  findLocationNode,
  findMatches,
  locationLabel,
  plural,
  type LocationAction,
  type LocationTreeNode,
} from '@/components/asets/locations/LocationTree'
import LocationDetailPanel, { ArchiveLocationDialog, type ArchiveTarget } from '@/components/asets/locations/LocationDetailPanel'
import LocationFormModal from '@/components/asets/locations/LocationFormModal'
import { childTypeForParent, normalizeLocationType, type LocationType } from '@/constants/locationConstants'
import '@/components/asets/locations/locations.css'

type ViewMode = 'canvas' | 'list'
const VIEW_KEY = 'asets.locations.view'

const readView = (): ViewMode => {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'canvas'
  } catch {
    return 'canvas'
  }
}

const AsetsLocations: React.FC = () => {
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const canvasRef = useRef<PanCanvasHandle>(null)
  const [tree, setTree] = useState<LocationTreeNode[]>([])
  const [schoolName, setSchoolName] = useState('School')
  const [summary, setSummary] = useState({ campuses: 0, blocks: 0, floors: 0, rooms: 0, assetsAssigned: 0 })
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<ViewMode>(readView)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [detailId, setDetailId] = useState<string | undefined>()
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailReload, setDetailReload] = useState(0)
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formType, setFormType] = useState<LocationType>('Campus')
  const [formParent, setFormParent] = useState<any>(null)
  const [editRecord, setEditRecord] = useState<any>(null)
  const pendingFocus = useRef<string | null>(null)
  const detailIdRef = useRef(detailId)
  detailIdRef.current = detailId

  const refresh = useCallback(async (focusId?: string) => {
    setLoading(true)
    try {
      const [treeData, summaryData] = await Promise.all([asetsService.getLocationTree(), asetsService.getLocationSummary()])
      const nextTree: LocationTreeNode[] = treeData.tree || []
      setTree(nextTree)
      setSchoolName(treeData.schoolName || 'School')
      setSummary({
        campuses: summaryData.campuses || 0,
        blocks: summaryData.blocks || 0,
        floors: summaryData.floors || 0,
        rooms: summaryData.rooms || 0,
        assetsAssigned: summaryData.assetsAssigned || 0,
      })
      if (detailIdRef.current && !findLocationNode(nextTree, detailIdRef.current)) {
        setDetailOpen(false)
        setDetailId(undefined)
      }
      if (focusId && findLocationNode(nextTree, focusId)) {
        setSelectedId(focusId)
        pendingFocus.current = focusId
      }
    } catch {
      toast.error('Failed to load locations.')
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Deep link from the full location page: /asets/locations?add=block&parent=<id>
  useEffect(() => {
    const params = new URLSearchParams(routerLocation.search)
    const add = params.get('add')
    const parentId = params.get('parent')
    if (!add || !parentId) return
    const typeMap: Record<string, LocationType> = { campus: 'Campus', block: 'Block', floor: 'Floor', room: 'Room', location: 'Room' }
    const type = typeMap[add.toLowerCase()]
    if (!type) return
    void asetsService
      .getLocationOverview(parentId)
      .then((data) => {
        setFormParent({ ...data.location, pathSegments: data.pathSegments })
        setFormType(type)
        setEditRecord(null)
        setFormOpen(true)
      })
      .catch(() => toast.error('Could not open add form.'))
  }, [routerLocation.search])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [query])

  const matches = useMemo(() => findMatches(tree, debouncedQuery), [tree, debouncedQuery])
  const currentMatchId = matches.length ? matches[((matchIndex % matches.length) + matches.length) % matches.length] : undefined

  useEffect(() => {
    setMatchIndex(0)
  }, [debouncedQuery])

  // Centre the canvas on the current search match, or on a location that was just added or edited.
  useEffect(() => {
    if (view !== 'canvas') return
    const target = currentMatchId || pendingFocus.current
    if (!target) return
    const frame = requestAnimationFrame(() => {
      if (canvasRef.current?.focusNode(target) && target === pendingFocus.current) pendingFocus.current = null
    })
    return () => cancelAnimationFrame(frame)
  }, [currentMatchId, view, tree])

  const changeView = (next: string) => {
    const mode: ViewMode = next === 'list' ? 'list' : 'canvas'
    setView(mode)
    try {
      window.localStorage.setItem(VIEW_KEY, mode)
    } catch {
      /* storage unavailable */
    }
  }

  const openAdd = (type: LocationType, parent?: any) => {
    setEditRecord(null)
    setFormType(type)
    setFormParent(type === 'Campus' ? null : parent || null)
    setFormOpen(true)
  }

  const openSmartAdd = () => {
    const selected = selectedId ? findLocationNode(tree, selectedId) : null
    const child = selected ? childTypeForParent(String(normalizeLocationType(selected.type))) : null
    if (selected && child) openAdd(child, selected)
    else openAdd('Campus')
  }

  const openEdit = (id: string) => {
    void asetsService
      .getLocationOverview(id)
      .then((data) => {
        setEditRecord(data.location)
        setFormParent(data.parent ? { ...data.parent, pathSegments: data.pathSegments.slice(0, -1) } : null)
        setFormType(normalizeLocationType(data.location.type) as LocationType)
        setFormOpen(true)
      })
      .catch((error) => toast.error(error?.response?.data?.message || 'Could not open the edit form.'))
  }

  const openDetail = (id: string) => {
    setSelectedId(id)
    setDetailId(id)
    setDetailOpen(true)
  }

  const handleAction = (action: LocationAction, node: LocationTreeNode) => {
    if (action === 'open') openDetail(node._id)
    if (action === 'open-page') navigate(`/asets/locations/${node._id}`)
    if (action === 'edit') openEdit(node._id)
    if (action === 'add-child') {
      const child = childTypeForParent(String(normalizeLocationType(node.type)))
      if (child) openAdd(child, node)
    }
    if (action === 'archive') {
      setArchiveTarget({
        id: node._id,
        name: locationLabel(node),
        childCount: (node.children || []).length,
        assetCount: node.totalAssetCount || 0,
      })
    }
  }

  const stepMatch = (step: number) => {
    if (!matches.length) return
    setMatchIndex((index) => index + step)
  }

  const summaryLine = [
    plural(summary.campuses, 'campus', 'campuses'),
    plural(summary.blocks, 'block', 'blocks'),
    plural(summary.floors, 'floor', 'floors'),
    plural(summary.rooms, 'room', 'rooms'),
    `${plural(summary.assetsAssigned, 'asset', 'assets')} placed`,
  ].join(' · ')

  if (!loaded) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading the location structure
        </div>
      </Page>
    )
  }

  const emptyCampus = summary.campuses === 0 && tree.length === 0
  const canvasMode = view === 'canvas' && !emptyCampus
  const position = matches.length ? (((matchIndex % matches.length) + matches.length) % matches.length) + 1 : 0

  return (
    <Page width={canvasMode ? 'full' : 'default'} className={cx('al-page', canvasMode && 'al-page--canvas')}>
      <div className="al-toolbar">
        <Tabs
          variant="segmented"
          label="Choose a view"
          value={view}
          onChange={changeView}
          items={[
            { id: 'canvas', label: 'Canvas' },
            { id: 'list', label: 'List' },
          ]}
        />
        <div className="al-toolbar__search">
          <TextField
            type="search"
            size="sm"
            icon={Search}
            aria-label="Search locations"
            placeholder="Search names, room numbers, codes or classes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                stepMatch(event.shiftKey ? -1 : 1)
              }
            }}
          />
          {canvasMode && debouncedQuery ? (
            <div className="al-matchnav" aria-live="polite">
              <span className="al-matchnav__count">{matches.length ? `${position} of ${matches.length}` : 'No matches'}</span>
              <Button variant="tertiary" size="sm" icon={ChevronUp} aria-label="Previous match" disabled={matches.length < 2} onClick={() => stepMatch(-1)} />
              <Button variant="tertiary" size="sm" icon={ChevronDown} aria-label="Next match" disabled={matches.length < 2} onClick={() => stepMatch(1)} />
            </div>
          ) : null}
        </div>
        <span className="al-toolbar__spacer" />
        <Button variant="primary" icon={Plus} onClick={openSmartAdd}>
          Add location
        </Button>
      </div>

      {emptyCampus ? (
        <Card>
          <EmptyState
            icon={MapPin}
            title="No campuses yet"
            body="Add a campus first, then build out its blocks, floors and rooms."
            action={
              <Button variant="primary" icon={Plus} onClick={() => openAdd('Campus')}>
                Add campus
              </Button>
            }
          />
        </Card>
      ) : view === 'canvas' ? (
        <LocationCanvas
          canvasRef={canvasRef}
          schoolName={schoolName}
          nodes={tree}
          summary={loading ? 'Refreshing…' : summaryLine}
          selectedId={selectedId}
          matchIds={matches}
          currentMatchId={currentMatchId}
          onAction={handleAction}
          layoutKey="locations"
        />
      ) : (
        <LocationTree nodes={tree} search={debouncedQuery} selectedId={selectedId} summary={summaryLine} onAction={handleAction} />
      )}

      <LocationDetailPanel
        locationId={detailId}
        open={detailOpen && !formOpen}
        reloadKey={detailReload}
        onClose={() => setDetailOpen(false)}
        onOpenLocation={openDetail}
        onAddChild={(parent, type) => openAdd(type as LocationType, parent)}
        onEdit={(record) => {
          setEditRecord(record)
          setFormType(normalizeLocationType(record.type) as LocationType)
          setFormOpen(true)
        }}
        onArchived={() => {
          setDetailOpen(false)
          setDetailId(undefined)
          setSelectedId(undefined)
          void refresh()
        }}
      />

      <ArchiveLocationDialog
        target={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onArchived={(target) => {
          setArchiveTarget(null)
          if (detailId === target.id) {
            setDetailOpen(false)
            setDetailId(undefined)
          }
          if (selectedId === target.id) setSelectedId(undefined)
          void refresh()
        }}
      />

      <LocationFormModal
        open={formOpen}
        initialType={formType}
        parent={formParent}
        editRecord={editRecord}
        onClose={() => {
          setFormOpen(false)
          setEditRecord(null)
          setFormParent(null)
          setDetailReload((n) => n + 1)
          if (routerLocation.search) navigate('/asets/locations', { replace: true })
        }}
        onSaved={(created) => {
          void refresh(created?._id)
        }}
      />
    </Page>
  )
}

export default AsetsLocations
