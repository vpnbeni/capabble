import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Archive, ExternalLink, Inbox, Package, Plus, Pencil } from 'lucide-react'
import asetsService from '@/services/asetsService'
import { AsetsStatusBadge } from '@/components/asets/AsetsUi'
import {
  Badge,
  Button,
  DataTable,
  DetailList,
  Dialog,
  EmptyState,
  Icon,
  Menu,
  Sheet,
  Tabs,
  cx,
  formatDate,
  formatINR,
  orDash,
} from '@/components/ui'
import { childTypeForParent, normalizeLocationType } from '@/constants/locationConstants'
import { isLocationInactive, locationIcon, locationLabel, locationTypeTone, plural } from './LocationTree'
import './locations.css'

/* ---------- Archive confirmation (shared by the canvas, the sheet and the full page) ---------- */

export type ArchiveTarget = { id: string; name: string; childCount?: number; assetCount?: number }

export const ArchiveLocationDialog: React.FC<{
  target: ArchiveTarget | null
  onClose: () => void
  onArchived: (target: ArchiveTarget) => void
}> = ({ target, onClose, onArchived }) => {
  const [archiving, setArchiving] = useState(false)
  const childCount = target?.childCount || 0
  const assetCount = target?.assetCount || 0
  const contents = [
    childCount ? plural(childCount, 'sub-location', 'sub-locations') : '',
    assetCount ? plural(assetCount, 'asset', 'assets') : '',
  ].filter(Boolean)

  const confirm = async () => {
    if (!target) return
    setArchiving(true)
    try {
      await asetsService.removeLocation(target.id)
      toast.success('Location archived.')
      onArchived(target)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Could not archive location.')
    } finally {
      setArchiving(false)
    }
  }

  return (
    <Dialog
      open={Boolean(target)}
      onClose={archiving ? undefined : onClose}
      tone="danger"
      size="sm"
      title={target ? `Archive ${target.name}?` : 'Archive location?'}
      description={
        contents.length
          ? `It still contains ${contents.join(' and ')}. Archiving removes it from the location structure.`
          : 'Archiving removes it from the location structure.'
      }
      footer={
        <>
          <Button onClick={onClose} disabled={archiving}>
            Keep location
          </Button>
          <Button variant="danger" icon={Archive} loading={archiving} onClick={() => void confirm()}>
            Archive location
          </Button>
        </>
      }
    />
  )
}

/* ---------- Shared bits ---------- */

export const LocationMetrics: React.FC<{ items: Array<{ label: string; value: React.ReactNode }> }> = ({ items }) => (
  <div className="al-metrics">
    {items.map((item) => (
      <div key={item.label} className="al-metric">
        <span className="al-metric__value">{item.value}</span>
        <span className="al-metric__label">{item.label}</span>
      </div>
    ))}
  </div>
)

export const LocationPath: React.FC<{ segments: Array<{ _id?: string; name: string }> }> = ({ segments }) =>
  segments.length ? (
    <ol className="al-path" aria-label="Location path">
      {segments.map((segment, index) => (
        <li key={segment._id || index}>{segment.name}</li>
      ))}
    </ol>
  ) : null

/** Every field of a location record as DetailList items. */
export const locationDetailItems = (location: any, parent?: any) => {
  const type = String(normalizeLocationType(location.type))
  return [
    { label: 'Name', value: location.name },
    { label: 'Code', value: orDash(location.code) },
    { label: 'Type', value: type },
    { label: 'Parent', value: parent?.name || 'School' },
    ...(location.address ? [{ label: 'Address', value: location.address, wide: true }] : []),
    ...(location.floorNumber ? [{ label: 'Floor number', value: location.floorNumber }] : []),
    ...(location.roomNumber ? [{ label: 'Room number', value: location.roomNumber }] : []),
    ...(location.className && location.section ? [{ label: 'Class and section', value: `${location.className}-${location.section}` }] : []),
    ...(location.roomType ? [{ label: 'Room type', value: location.roomType }] : []),
    ...(location.capacityHint ? [{ label: 'Capacity', value: location.capacityHint }] : []),
    {
      label: 'Status',
      value: isLocationInactive(location) ? <Badge tone="neutral">Inactive</Badge> : <Badge tone="success">Active</Badge>,
    },
    { label: 'Created', value: formatDate(location.createdAt) },
    { label: 'Updated', value: formatDate(location.updatedAt) },
    { label: 'Description', value: orDash(location.notes), wide: true },
  ]
}

export const LocationAssetsTable: React.FC<{ assets: any[]; showCustodian?: boolean }> = ({ assets, showCustodian }) => (
  <DataTable
    rows={assets}
    getRowKey={(asset: any) => asset._id}
    caption="Assets at this location"
    columns={[
      {
        key: 'name',
        header: 'Asset',
        mobile: 'title',
        render: (asset: any) => (
          <span className="al-asset-name">
            <Link to={`/asets/assets/${asset._id}`}>{asset.name}</Link>
            {asset.assetId ? <span className="al-asset-name__id">{asset.assetId}</span> : null}
          </span>
        ),
      },
      { key: 'category', header: 'Category', mobile: 'subtitle', render: (asset: any) => orDash(asset.categoryId?.name) },
      ...(showCustodian ? [{ key: 'custodian', header: 'Custodian', render: (asset: any) => orDash(asset.custodianName) }] : []),
      { key: 'status', header: 'Status', mobile: 'aside' as const, render: (asset: any) => <AsetsStatusBadge status={asset.status} /> },
    ]}
    empty={<EmptyState icon={Package} title="No assets are assigned here" body="Allocate or transfer an asset to this location to see it listed." compact />}
  />
)

/* ---------- Detail sheet ---------- */

type Props = {
  locationId?: string
  open: boolean
  /** Bump to reload after an edit or a new child. */
  reloadKey?: number
  onClose: () => void
  onAddChild: (parent: any, type: string) => void
  onEdit: (record: any) => void
  onArchived: () => void
  /** Opens another location (a child) in the same sheet. */
  onOpenLocation?: (id: string) => void
}

const LocationDetailPanel: React.FC<Props> = ({ locationId, open, reloadKey = 0, onClose, onAddChild, onEdit, onArchived, onOpenLocation }) => {
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('overview')
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null)

  useEffect(() => {
    setTab('overview')
  }, [locationId])

  useEffect(() => {
    if (!locationId || !open) return
    let cancelled = false
    setLoading(true)
    void asetsService
      .getLocationOverview(locationId)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((error) => toast.error(error?.response?.data?.message || 'Failed to load location.'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [locationId, open, reloadKey])

  const current = data && data.location?._id === locationId ? data : null

  if (!current) {
    return (
      <>
      <Sheet open={open && Boolean(locationId)} onClose={onClose} size="lg" title="Location">
        {loading ? (
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading location details
          </div>
        ) : (
          <EmptyState icon={Inbox} title="This location could not be loaded" body="It may have been archived. Close this panel and pick another location." compact />
        )}
      </Sheet>
      <ArchiveLocationDialog target={null} onClose={() => setArchiveTarget(null)} onArchived={() => undefined} />
      </>
    )
  }

  const { location, parent, pathSegments = [], children = [], assets = [], summary = {} } = current
  const type = String(normalizeLocationType(location.type))
  const childType = childTypeForParent(type)
  const childLabel = childType ? `${childType}s` : 'Sub-locations'
  const blocks = children.filter((child: any) => normalizeLocationType(child.type) === 'Block')
  const floors = children.filter((child: any) => normalizeLocationType(child.type) === 'Floor')
  const rooms = children.filter((child: any) => normalizeLocationType(child.type) === 'Room')

  const hierarchyItems = [
    ...(type === 'Campus'
      ? [
          { label: 'Blocks', value: summary.blocks || blocks.length },
          { label: 'Floors', value: summary.floors || floors.length },
          { label: 'Rooms', value: summary.rooms || rooms.length },
        ]
      : []),
    ...(type === 'Block' ? [{ label: 'Floors', value: summary.floors || floors.length }] : []),
    ...(type === 'Floor' ? [{ label: 'Rooms', value: summary.rooms || rooms.length }] : []),
  ]

  const menuItems = [
    { label: 'Open full page', icon: ExternalLink, onSelect: () => navigate(`/asets/locations/${location._id}`) },
    { label: 'View assets', icon: Package, onSelect: () => navigate(`/asets/assets?locationId=${location._id}`) },
    ...(type !== 'Campus'
      ? [
          { divider: true as const },
          {
            label: 'Archive',
            icon: Archive,
            tone: 'danger' as const,
            onSelect: () =>
              setArchiveTarget({
                id: location._id,
                name: location.name,
                childCount: summary.childCount,
                assetCount: summary.totalAssetCount,
              }),
          },
        ]
      : []),
  ]

  return (
    <>
      <Sheet
        open={open}
        onClose={archiveTarget ? undefined : onClose}
        size="lg"
        icon={locationIcon(location)}
        title={locationLabel(location)}
        description={pathSegments.length > 1 ? pathSegments.slice(0, -1).map((segment: any) => segment.name).join(' › ') : 'Top level'}
      >
        <div className="al-hero">
          <div className="al-hero__main">
            <div className="al-hero__name">
              <Badge tone={locationTypeTone(type)} dot={false}>
                {type}
              </Badge>
              {isLocationInactive(location) ? <Badge tone="neutral">Inactive</Badge> : <Badge tone="success">Active</Badge>}
              {location.isStore ? <Badge tone="warning" dot={false}>Store</Badge> : null}
            </div>
          </div>
          <div className="al-hero__actions">
            {childType ? (
              <Button variant="primary" size="sm" icon={Plus} onClick={() => onAddChild(location, childType)}>
                Add {childType.toLowerCase()}
              </Button>
            ) : null}
            <Button size="sm" icon={Pencil} onClick={() => onEdit(location)}>
              Edit
            </Button>
            <Menu items={menuItems} label="More location actions" />
          </div>
        </div>

        <LocationMetrics
          items={[
            { label: 'Direct assets', value: (summary.assetCount || 0).toLocaleString('en-IN') },
            { label: 'Total assets', value: (summary.totalAssetCount || 0).toLocaleString('en-IN') },
            { label: 'Asset value', value: formatINR(summary.totalAssetValue || summary.assetValue || 0, { compact: true }) },
            { label: 'Sub-locations', value: (summary.childCount || 0).toLocaleString('en-IN') },
          ]}
        />

        <Tabs
          label="Location sections"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'overview', label: 'Overview' },
            ...(childType ? [{ id: 'children', label: childLabel, count: children.length }] : []),
            { id: 'assets', label: 'Assets', count: assets.length },
            { id: 'history', label: 'History' },
          ]}
        />

        {tab === 'overview' ? (
          <>
            <DetailList items={locationDetailItems(location, parent)} />
            {hierarchyItems.length ? (
              <div className="al-section">
                <p className="al-section__title">Inside this {type.toLowerCase()}</p>
                <DetailList columns={3} items={hierarchyItems} />
              </div>
            ) : null}
          </>
        ) : null}

        {tab === 'children' && childType ? (
          <div className="al-section">
            <div className="al-section__head">
              <p className="al-section__title">{plural(children.length, childType.toLowerCase(), childLabel.toLowerCase())}</p>
              <Button size="sm" variant="tertiary" icon={Plus} onClick={() => onAddChild(location, childType)}>
                Add {childType.toLowerCase()}
              </Button>
            </div>
            {children.length ? (
              <ul className="al-children">
                {children.map((child: any) => {
                  const childKind = String(normalizeLocationType(child.type))
                  return (
                    <li key={child._id}>
                      <button
                        type="button"
                        className="al-child"
                        onClick={() => (onOpenLocation ? onOpenLocation(child._id) : navigate(`/asets/locations/${child._id}`))}
                      >
                        <span className={cx('al-tname__icon', `al-tone--${childKind.toLowerCase()}`)} aria-hidden="true">
                          <Icon icon={locationIcon(child)} size={14} />
                        </span>
                        <span className="al-child__text">
                          <span className="al-child__name">{locationLabel(child)}</span>
                          <span className="al-child__meta">{child.code || 'No code'}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState
                title={`No ${childLabel.toLowerCase()} yet`}
                body={`Add a ${childType.toLowerCase()} to keep building this ${type.toLowerCase()}.`}
                compact
              />
            )}
          </div>
        ) : null}

        {tab === 'assets' ? <LocationAssetsTable assets={assets} /> : null}

        {tab === 'history' ? (
          <p className="cb-muted">
            Created on {formatDate(location.createdAt)}. Updates and archive events are tracked through ASETS lifecycle records.
          </p>
        ) : null}
      </Sheet>

      <ArchiveLocationDialog
        target={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onArchived={() => {
          setArchiveTarget(null)
          onArchived()
        }}
      />
    </>
  )
}

export default LocationDetailPanel
