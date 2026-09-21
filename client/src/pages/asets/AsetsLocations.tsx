import React, { useCallback, useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useLocation, useNavigate } from 'react-router-dom'
import asetsService from '@/services/asetsService'
import { AsetsCard, AsetsEmpty, AsetsPageShell, btnPrimary } from '@/components/asets/AsetsUi'
import LocationTree, { type LocationTreeNode } from '@/components/asets/locations/LocationTree'
import LocationDetailPanel from '@/components/asets/locations/LocationDetailPanel'
import LocationFormModal from '@/components/asets/locations/LocationFormModal'
import { childTypeForParent, normalizeLocationType, type LocationType } from '@/constants/locationConstants'

const SummaryCard: React.FC<{ label: string; value: number; suffix: string }> = ({ label, value, suffix }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
    <div className="text-2xl font-semibold text-slate-900 dark:text-white">{value}</div>
    <div className="mt-1 text-sm text-slate-500">{suffix}</div>
    <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">{label}</div>
  </div>
)

const AsetsLocations: React.FC = () => {
  const routerLocation = useLocation()
  const navigate = useNavigate()
  const [tree, setTree] = useState<LocationTreeNode[]>([])
  const [schoolName, setSchoolName] = useState('School')
  const [summary, setSummary] = useState({ campuses: 0, blocks: 0, floors: 0, rooms: 0, assetsAssigned: 0 })
  const [selected, setSelected] = useState<LocationTreeNode | null>(null)
  const [treeSearch, setTreeSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [formType, setFormType] = useState<LocationType>('Campus')
  const [formParent, setFormParent] = useState<any>(null)
  const [editRecord, setEditRecord] = useState<any>(null)

  const refresh = useCallback(async (keepSelectionId?: string) => {
    setLoading(true)
    try {
      const [treeData, summaryData] = await Promise.all([
        asetsService.getLocationTree(),
        asetsService.getLocationSummary(),
      ])
      setTree(treeData.tree || [])
      setSchoolName(treeData.schoolName || 'School')
      setSummary({
        campuses: summaryData.campuses || 0,
        blocks: summaryData.blocks || 0,
        floors: summaryData.floors || 0,
        rooms: summaryData.rooms || 0,
        assetsAssigned: summaryData.assetsAssigned || 0,
      })
      const findNode = (nodes: LocationTreeNode[], id: string): LocationTreeNode | null => {
        for (const node of nodes) {
          if (node._id === id) return node
          const child = findNode(node.children || [], id)
          if (child) return child
        }
        return null
      }
      const targetId = keepSelectionId || selected?._id
      if (targetId) {
        const match = findNode(treeData.tree || [], targetId)
        if (match) setSelected(match)
      } else if ((treeData.tree || []).length) {
        setSelected(treeData.tree[0])
      }
    } catch {
      toast.error('Failed to load locations.')
    } finally {
      setLoading(false)
    }
  }, [selected?._id])

  useEffect(() => { void refresh() }, [])

  useEffect(() => {
    const params = new URLSearchParams(routerLocation.search)
    const add = params.get('add')
    const parentId = params.get('parent')
    if (!add || !parentId) return
    const typeMap: Record<string, LocationType> = { campus: 'Campus', block: 'Block', floor: 'Floor', room: 'Room', location: 'Room' }
    const type = typeMap[add.toLowerCase()]
    if (!type) return
    void asetsService.getLocationOverview(parentId).then((data) => {
      setFormParent({ ...data.location, pathSegments: data.pathSegments })
      setFormType(type)
      setEditRecord(null)
      setFormOpen(true)
    }).catch(() => toast.error('Could not open add form.'))
  }, [routerLocation.search])

  useEffect(() => {
    const q = globalSearch.trim()
    if (!q) {
      setSearchResults([])
      return
    }
    const timer = window.setTimeout(() => {
      void asetsService.searchLocations(q).then(setSearchResults).catch(() => setSearchResults([]))
    }, 250)
    return () => window.clearTimeout(timer)
  }, [globalSearch])

  const openAdd = (type: LocationType, parent?: any) => {
    setEditRecord(null)
    setFormType(type)
    setFormParent(type === 'Campus' ? null : parent || null)
    setFormOpen(true)
  }

  const openSmartAdd = () => {
    if (!selected) {
      openAdd('Campus')
      return
    }
    const child = childTypeForParent(normalizeLocationType(selected.type))
    if (child) {
      openAdd(child, selected)
      return
    }
    openAdd('Campus')
  }

  const handleTreeAction = (action: string, node: LocationTreeNode) => {
    if (action === 'open') {
      setSelected(node)
      return
    }
    if (action === 'edit') {
      void asetsService.getLocationOverview(node._id).then((data) => {
        setEditRecord(data.location)
        setFormParent(data.parent ? { ...data.parent, pathSegments: data.pathSegments.slice(0, -1) } : null)
        setFormType(normalizeLocationType(data.location.type) as LocationType)
        setFormOpen(true)
      })
      return
    }
    if (action === 'archive') {
      setSelected(node)
      return
    }
    if (action === 'add-block') openAdd('Block', node)
    if (action === 'add-floor') openAdd('Floor', node)
    if (action === 'add-room') openAdd('Room', node)
  }

  const selectedParentContext = useMemo(() => {
    if (!formParent) return null
    return formParent
  }, [formParent])

  const emptyCampus = !loading && summary.campuses === 0

  return (
    <AsetsPageShell
      title="Locations"
      subtitle="Manage campuses, blocks, floors and rooms across your school."
      actions={(
        <>
          <div className="relative w-full sm:w-72">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              placeholder="Search locations..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
            {searchResults.length ? (
              <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {searchResults.map((result) => (
                  <button
                    key={result._id}
                    type="button"
                    className="block w-full border-b border-slate-100 px-3 py-3 text-left last:border-0 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700"
                    onClick={() => {
                      setSelected({ _id: result._id, name: result.name, type: result.type, children: [] })
                      setGlobalSearch('')
                      setSearchResults([])
                    }}
                  >
                    <div className="font-medium text-slate-900 dark:text-white">{result.name}</div>
                    <div className="text-xs text-slate-500">{normalizeLocationType(result.type)}</div>
                    <div className="mt-1 text-xs text-slate-400">{result.pathLabel}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button type="button" className={btnPrimary} onClick={openSmartAdd}>
            + Add Location
          </button>
        </>
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Campus" value={summary.campuses} suffix="Campuses" />
        <SummaryCard label="Blocks" value={summary.blocks} suffix="Blocks" />
        <SummaryCard label="Floors" value={summary.floors} suffix="Floors" />
        <SummaryCard label="Rooms" value={summary.rooms} suffix="Rooms" />
        <SummaryCard label="Assets Assigned" value={summary.assetsAssigned} suffix="Assets Assigned" />
      </div>

      {loading ? (
        <AsetsCard><div className="py-16 text-center text-sm text-slate-500">Loading location structure...</div></AsetsCard>
      ) : emptyCampus ? (
        <AsetsCard>
          <AsetsEmpty message="No campuses configured yet." />
          <div className="mt-4 flex justify-center">
            <button type="button" className={btnPrimary} onClick={() => openAdd('Campus')}>+ Add Campus</button>
          </div>
        </AsetsCard>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[2fr_3fr]">
          <AsetsCard>
            <div className="mb-3 text-xs text-slate-500">{schoolName}</div>
            <input
              className="mb-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              placeholder="Search locations..."
              value={treeSearch}
              onChange={(e) => setTreeSearch(e.target.value)}
            />
            <LocationTree
              nodes={tree}
              selectedId={selected?._id}
              search={treeSearch}
              onSelect={setSelected}
              onAction={handleTreeAction}
            />
          </AsetsCard>
          <LocationDetailPanel
            locationId={selected?._id}
            onAddChild={(parent, type) => openAdd(type as LocationType, parent)}
            onEdit={(record) => {
              setEditRecord(record)
              setFormType(normalizeLocationType(record.type) as LocationType)
              setFormOpen(true)
            }}
            onArchived={() => {
              setSelected(null)
              void refresh()
            }}
          />
        </div>
      )}

      <LocationFormModal
        open={formOpen}
        initialType={formType}
        parent={selectedParentContext}
        editRecord={editRecord}
        onClose={() => {
          setFormOpen(false)
          setEditRecord(null)
          setFormParent(null)
          if (routerLocation.search) navigate('/asets/locations', { replace: true })
        }}
        onSaved={(created) => {
          void refresh(created?._id)
        }}
      />
    </AsetsPageShell>
  )
}

export default AsetsLocations
