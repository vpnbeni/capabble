import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import asetsService from '@/services/asetsService'
import { AsetsCard, AsetsEmpty, AsetsStatusBadge, btnPrimary, btnSecondary } from '@/components/asets/AsetsUi'
import { LOCATION_TYPE_META, childTypeForParent, normalizeLocationType } from '@/constants/locationConstants'
import { formatMoney } from '@/constants/asetsConstants'

type Props = {
  locationId?: string
  onAddChild: (parent: any, type: string) => void
  onEdit: (record: any) => void
  onArchived: () => void
}

const date = (value?: string) => (value ? new Date(value).toLocaleDateString('en-GB') : '—')

const LocationDetailPanel: React.FC<Props> = ({ locationId, onAddChild, onEdit, onArchived }) => {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [tab, setTab] = useState('overview')

  useEffect(() => {
    if (!locationId) {
      setData(null)
      return
    }
    setLoading(true)
    void asetsService.getLocationOverview(locationId)
      .then(setData)
      .catch((error) => toast.error(error?.response?.data?.message || 'Failed to load location.'))
      .finally(() => setLoading(false))
  }, [locationId])

  if (!locationId) {
    return (
      <AsetsCard>
        <div className="py-16 text-center text-sm text-slate-500">Select a location from the tree to view details.</div>
      </AsetsCard>
    )
  }

  if (loading || !data) {
    return <AsetsCard><div className="py-16 text-center text-sm text-slate-500">Loading location details...</div></AsetsCard>
  }

  const { location, parent, pathSegments = [], children = [], assets = [], summary } = data
  const normalized = normalizeLocationType(location.type)
  const meta = LOCATION_TYPE_META[normalized] || LOCATION_TYPE_META.Room
  const childType = childTypeForParent(normalized)
  const blocks = children.filter((child: any) => normalizeLocationType(child.type) === 'Block')
  const floors = children.filter((child: any) => normalizeLocationType(child.type) === 'Floor')
  const rooms = children.filter((child: any) => normalizeLocationType(child.type) === 'Room')

  const archive = async () => {
    const message = summary.childCount || summary.totalAssetCount
      ? `This location contains:\n\n${summary.childCount || 0} sub-location(s)\n${summary.totalAssetCount || 0} asset(s)\n\nArchive anyway?`
      : `Archive ${location.name}?`
    if (!window.confirm(message)) return
    setArchiving(true)
    try {
      await asetsService.removeLocation(locationId)
      toast.success('Location archived.')
      onArchived()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not archive location.')
    } finally {
      setArchiving(false)
    }
  }

  const tabs = ['overview', 'blocks', 'floors', 'rooms', 'assets', 'history']

  return (
    <div className="space-y-4">
      <AsetsCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span aria-hidden className="text-xl">{meta.icon}</span>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{location.name}</h2>
              <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold uppercase ${meta.badge}`}>{meta.label}</span>
            </div>
            <div className="mt-2 text-sm text-slate-500">
              {pathSegments.map((segment: any, index: number) => (
                <span key={segment._id}>
                  {index > 0 ? ' → ' : ''}
                  {segment.name}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {childType ? (
              <button type="button" className={btnPrimary} onClick={() => onAddChild(location, childType)}>+ Add {childType}</button>
            ) : null}
            <button type="button" className={btnSecondary} onClick={() => onEdit(location)}>Edit</button>
            {normalized !== 'Campus' ? (
              <button type="button" disabled={archiving} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60" onClick={archive}>
                {archiving ? 'Archiving...' : 'Archive'}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Direct assets" value={summary.assetCount} />
          <Metric label="Total assets" value={summary.totalAssetCount} />
          <Metric label="Asset value" value={formatMoney(summary.totalAssetValue || summary.assetValue)} />
          <Metric label="Sub-locations" value={summary.childCount} />
        </div>
      </AsetsCard>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
        {tabs.map((key) => (
          <button
            key={key}
            type="button"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${tab === key ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300' : 'text-slate-500 hover:text-slate-700'}`}
            onClick={() => setTab(key)}
          >
            {key}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <AsetsCard>
            <h3 className="font-semibold dark:text-white">Location Details</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="Name" value={location.name} />
              <Row label="Code" value={location.code || '—'} />
              <Row label="Type" value={normalized} />
              <Row label="Parent" value={parent?.name || 'School / Tenant'} />
              {location.address ? <Row label="Address" value={location.address} /> : null}
              {location.roomNumber ? <Row label="Room number" value={location.roomNumber} /> : null}
              {location.className && location.section ? (
                <Row label="Class & section" value={`${location.className} - ${location.section}`} />
              ) : null}
              {location.roomType ? <Row label="Room type" value={location.roomType} /> : null}
              {location.capacityHint ? <Row label="Capacity" value={location.capacityHint} /> : null}
              <Row label="Status" value={location.locationStatus || (location.isActive === false ? 'Inactive' : 'Active')} />
              <Row label="Description" value={location.notes || '—'} />
              <Row label="Created on" value={date(location.createdAt)} />
              <Row label="Updated on" value={date(location.updatedAt)} />
            </dl>
          </AsetsCard>
          <AsetsCard>
            <h3 className="font-semibold dark:text-white">Location Hierarchy</h3>
            <div className="mt-4 space-y-3 text-sm">
              {pathSegments.map((segment: any, index: number) => (
                <div key={segment._id} className="flex items-center gap-3">
                  <div className="w-24 text-xs font-semibold uppercase text-slate-400">{normalizeLocationType(segment.type)}</div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">{segment.name}</div>
                  {index < pathSegments.length - 1 ? <div className="text-slate-300">↓</div> : null}
                </div>
              ))}
              {normalized === 'Campus' ? (
                <>
                  <HierarchyRow label="Blocks" value={summary.blocks || blocks.length} />
                  <HierarchyRow label="Floors" value={summary.floors || floors.length} />
                  <HierarchyRow label="Rooms" value={summary.rooms || rooms.length} />
                </>
              ) : null}
              {normalized === 'Block' ? <HierarchyRow label="Floors" value={summary.floors || floors.length} /> : null}
              {normalized === 'Floor' ? <HierarchyRow label="Rooms" value={`${summary.rooms || rooms.length} rooms`} /> : null}
            </div>
            <div className="mt-6 space-y-2">
              <h4 className="text-sm font-semibold dark:text-white">Quick Actions</h4>
              {childType ? (
                <button type="button" className={btnPrimary} onClick={() => onAddChild(location, childType)}>Add {childType}</button>
              ) : (
                <Link className={btnSecondary} to={`/asets/assets?locationId=${location._id}`}>View Assets</Link>
              )}
            </div>
          </AsetsCard>
        </div>
      ) : null}

      {tab === 'blocks' ? <ChildList title="Blocks" items={blocks} empty="No blocks yet." actionLabel="+ Add Block" onAction={() => onAddChild(location, 'Block')} /> : null}
      {tab === 'floors' ? <ChildList title="Floors" items={floors} empty="No floors yet." actionLabel="+ Add Floor" onAction={() => onAddChild(location, 'Floor')} /> : null}
      {tab === 'rooms' ? <ChildList title="Rooms" items={rooms} empty="No rooms yet." actionLabel="+ Add Room" onAction={() => onAddChild(location, 'Room')} /> : null}

      {tab === 'assets' ? (
        <AsetsCard>
          <h3 className="font-semibold dark:text-white">Assets at this location</h3>
          {!assets.length ? <div className="mt-4"><AsetsEmpty message="No assets are currently assigned here." /></div> : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs text-slate-500">
                  <tr><th className="pb-2">Asset</th><th className="pb-2">Category</th><th className="pb-2">Status</th></tr>
                </thead>
                <tbody>
                  {assets.map((asset: any) => (
                    <tr key={asset._id} className="border-b border-slate-100 last:border-0 dark:border-slate-700">
                      <td className="py-3"><Link className="font-medium text-indigo-600" to={`/asets/assets/${asset._id}`}>{asset.name}</Link></td>
                      <td className="py-3 text-slate-600">{asset.categoryId?.name || '—'}</td>
                      <td className="py-3"><AsetsStatusBadge status={asset.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AsetsCard>
      ) : null}

      {tab === 'history' ? (
        <AsetsCard>
          <h3 className="font-semibold dark:text-white">History</h3>
          <p className="mt-3 text-sm text-slate-500">Created on {date(location.createdAt)}. Updates and archive events are tracked through ASETS lifecycle records.</p>
        </AsetsCard>
      ) : null}
    </div>
  )
}

const Metric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="rounded-xl bg-slate-50 px-4 py-3 text-center dark:bg-slate-900/40">
    <div className="text-lg font-semibold dark:text-white">{value}</div>
    <div className="text-xs text-slate-500">{label}</div>
  </div>
)

const Row: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="grid grid-cols-[120px_1fr] gap-3">
    <dt className="text-slate-500">{label}</dt>
    <dd className="font-medium text-slate-800 dark:text-slate-100">{value}</dd>
  </div>
)

const HierarchyRow: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="flex items-center gap-3 border-t border-slate-100 pt-3 dark:border-slate-700">
    <div className="w-24 text-xs font-semibold uppercase text-slate-400">{label}</div>
    <div className="font-medium text-slate-800 dark:text-slate-100">{value}</div>
  </div>
)

const ChildList: React.FC<{ title: string; items: any[]; empty: string; actionLabel: string; onAction: () => void }> = ({
  title, items, empty, actionLabel, onAction,
}) => (
  <AsetsCard>
    <div className="flex items-center justify-between gap-3">
      <h3 className="font-semibold dark:text-white">{title}</h3>
      <button type="button" className="text-sm font-semibold text-indigo-600" onClick={onAction}>{actionLabel}</button>
    </div>
    {!items.length ? <div className="mt-4"><AsetsEmpty message={empty} /></div> : (
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item._id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="text-xs font-semibold uppercase text-slate-400">{normalizeLocationType(item.type)}</div>
            <div className="mt-1 font-semibold text-slate-900 dark:text-white">{item.name}</div>
            <div className="mt-1 text-xs text-slate-500">{item.code || 'No code'}</div>
          </div>
        ))}
      </div>
    )}
  </AsetsCard>
)

export default LocationDetailPanel
