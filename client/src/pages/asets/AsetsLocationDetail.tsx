import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowRightLeft, MapPinOff, Plus } from 'lucide-react'
import asetsService from '@/services/asetsService'
import { Badge, Button, Card, DetailList, EmptyState, Icon, Page, cx, formatDate, formatINR } from '@/components/ui'
import { normalizeLocationType } from '@/constants/locationConstants'
import { isLocationInactive, locationIcon, locationLabel, locationTypeTone, plural } from '@/components/asets/locations/LocationTree'
import {
  ArchiveLocationDialog,
  LocationAssetsTable,
  LocationMetrics,
  LocationPath,
  locationDetailItems,
  type ArchiveTarget,
} from '@/components/asets/locations/LocationDetailPanel'
import '@/components/asets/locations/locations.css'

const AsetsLocationDetail: React.FC = () => {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [failed, setFailed] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState<ArchiveTarget | null>(null)

  useEffect(() => {
    setFailed(false)
    void asetsService
      .getLocationOverview(id)
      .then(setData)
      .catch((error) => {
        setFailed(true)
        toast.error(error?.response?.data?.message || 'Failed to load location.')
      })
  }, [id])

  const backToLocations = () => navigate('/asets/locations')

  if (failed && !data) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={MapPinOff}
            title="This location could not be loaded"
            body="It may have been archived. Go back to the location structure to pick another one."
            action={
              <Button variant="primary" onClick={backToLocations}>
                Back to locations
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  if (!data || data.location?._id !== id) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading the location profile
        </div>
      </Page>
    )
  }

  const { location, parent, assets = [], allocations = [], transfers = [], custodians = [], children = [], pathSegments = [], summary = {} } = data
  const type = String(normalizeLocationType(location.type))
  const blocks = children.filter((child: any) => child.type === 'Block')

  const addLink = (add: string, label: string, primary: boolean) => (
    <Link
      key={add}
      className={cx('cb-btn', 'cb-btn--md', primary ? 'cb-btn--primary' : 'cb-btn--secondary')}
      to={`/asets/locations?add=${add}&parent=${location._id}`}
    >
      <Icon icon={Plus} size={16} />
      <span className="cb-btn__label">{label}</span>
    </Link>
  )

  return (
    <Page>
      <Card>
        <div className="cb-stack">
          <div className="al-hero">
            <span className={cx('al-hero__icon', `al-tone--${type.toLowerCase()}`)} aria-hidden="true">
              <Icon icon={locationIcon(location)} size={22} />
            </span>
            <div className="al-hero__main">
              <div className="al-hero__name">
                <h2>{locationLabel(location)}</h2>
                <Badge tone={locationTypeTone(type)} dot={false}>
                  {type}
                </Badge>
                {isLocationInactive(location) ? <Badge tone="neutral">Inactive</Badge> : <Badge tone="success">Active</Badge>}
                {location.isStore ? <Badge tone="warning" dot={false}>Store</Badge> : null}
              </div>
              <LocationPath segments={pathSegments.length ? pathSegments : [{ name: location.path || location.name }]} />
            </div>
            <div className="al-hero__actions">
              {type === 'Campus' ? addLink('block', 'Add block', true) : null}
              {type === 'Block' ? [addLink('floor', 'Add floor', true), addLink('location', 'Add room', false)] : null}
              {type !== 'Campus' ? (
                <Button
                  variant="danger"
                  icon={Archive}
                  onClick={() =>
                    setArchiveTarget({ id: location._id, name: location.name, childCount: summary.childCount, assetCount: summary.assetCount })
                  }
                >
                  Archive
                </Button>
              ) : null}
            </div>
          </div>
          <LocationMetrics
            items={[
              { label: 'Assets', value: (summary.assetCount || 0).toLocaleString('en-IN') },
              { label: 'Value', value: formatINR(summary.assetValue || 0, { compact: true }) },
              { label: 'Sub-locations', value: (summary.childCount || 0).toLocaleString('en-IN') },
              { label: 'Custodians', value: custodians.length.toLocaleString('en-IN') },
            ]}
          />
        </div>
      </Card>

      {type === 'Campus' ? (
        <Card title="Blocks in this campus" subtitle={plural(blocks.length, 'block', 'blocks')}>
          {blocks.length ? (
            <ul className="al-children">
              {blocks.map((child: any) => (
                <li key={child._id}>
                  <Link className="al-child" to={`/asets/locations/${child._id}`}>
                    <span className="al-tname__icon al-tone--block" aria-hidden="true">
                      <Icon icon={locationIcon(child)} size={14} />
                    </span>
                    <span className="al-child__text">
                      <span className="al-child__name">{child.name}</span>
                      <span className="al-child__meta">{child.code || 'No code'}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No blocks in this campus yet" body="Add a block to start mapping its floors and rooms." compact />
          )}
        </Card>
      ) : null}

      <div className="cb-grid-8-4">
        <div className="cb-stack">
          <Card title="Assets at this location" subtitle={plural(assets.length, 'asset', 'assets')} flush>
            <LocationAssetsTable assets={assets} showCustodian />
          </Card>
          <Movement title="Transfer history" rows={transfers} transfer />
        </div>
        <div className="cb-stack">
          <Card title="Details">
            <DetailList columns={1} items={locationDetailItems(location, parent)} />
          </Card>
          <Card title="Custodians">
            {custodians.length ? (
              <div className="al-chips">
                {custodians.map((name: string) => (
                  <Badge key={name} tone="neutral" dot={false} size="lg">
                    {name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="cb-muted">No custodian is assigned to assets here.</p>
            )}
          </Card>
          <Movement title="Allocation history" rows={allocations} />
        </div>
      </div>

      <ArchiveLocationDialog
        target={archiveTarget}
        onClose={() => setArchiveTarget(null)}
        onArchived={() => {
          setArchiveTarget(null)
          navigate('/asets/locations')
        }}
      />
    </Page>
  )
}

const Movement: React.FC<{ title: string; rows: any[]; transfer?: boolean }> = ({ title, rows, transfer }) => (
  <Card title={title}>
    {!rows.length ? (
      <EmptyState icon={ArrowRightLeft} title={`No ${title.toLowerCase()} yet`} body="Movements in or out of this location appear here." compact />
    ) : (
      <ul className="al-moves">
        {rows.slice(0, 8).map((row) => {
          const from = transfer ? row.sourceLocationId : row.fromLocationId
          const to = transfer ? row.destinationLocationId : row.toLocationId
          return (
            <li key={row._id}>
              <span>
                <span className="cb-strong">{row.assetId?.name || 'Asset'}</span>
                <span className="cb-muted"> · {formatDate(row.transferDate || row.allocationDate)}</span>
              </span>
              <span className="al-moves__meta">
                {from?.name || 'Unassigned'} → {to?.name || 'Location'}
              </span>
            </li>
          )
        })}
      </ul>
    )}
  </Card>
)

export default AsetsLocationDetail
