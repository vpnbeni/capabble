import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Archive,
  ArrowLeftRight,
  CalendarDays,
  ChevronRight,
  Copy,
  IndianRupee,
  Package,
  PackageX,
  Pencil,
  ShieldCheck,
  Trash2,
  TrendingDown,
  UserRoundCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import asetsService from '@/services/asetsService'
import { ASSET_CONDITIONS, ASSET_STATUSES, formatMoney } from '@/constants/asetsConstants'
import { AsetsStatusBadge, asetsStatusTone } from '@/components/asets/AsetsUi'
import {
  Badge,
  Button,
  Card,
  DetailList,
  Dialog,
  EmptyState,
  Icon,
  Menu,
  Page,
  Select,
  Sheet,
  Tabs,
  TextArea,
  TextField,
  formatDate,
  type Tone,
} from '@/components/ui'
import '@/components/asets/assets.css'

type EditState = {
  condition: string
  status: string
  notes: string
  custodianName: string
  conditionReason: string
  statusReason: string
}

const emptyEdit: EditState = { condition: '', status: '', notes: '', custodianName: '', conditionReason: '', statusReason: '' }

const sentence = (value?: string) => {
  const words = String(value || '')
    .replace(/[._]+/g, ' ')
    .trim()
    .toLowerCase()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ''
}

const MAINTENANCE_TONE: Record<string, Tone> = {
  Reported: 'warning',
  Assigned: 'info',
  'In Progress': 'info',
  'Awaiting Parts': 'warning',
  Completed: 'success',
  Closed: 'neutral',
}

const recordTone = (status?: string) => asetsStatusTone(String(status || '').replace(/\s+/g, '_'))

/** Decorative QR-style mark; the real payload text sits underneath it. */
const QR_CELLS = [1, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1]

const QUICK_LINKS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/asets/allocations', label: 'Allocate', icon: UserRoundCheck },
  { to: '/asets/transfers', label: 'Transfer', icon: ArrowLeftRight },
  { to: '/asets/maintenance', label: 'Log maintenance', icon: Wrench },
  { to: '/asets/disposals', label: 'Dispose', icon: PackageX },
]

const Fact: React.FC<{ icon: LucideIcon; label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({
  icon,
  label,
  value,
  hint,
}) => (
  <div className="aa-fact">
    <Icon icon={icon} size={16} className="aa-fact__icon" />
    <div className="aa-fact__text">
      <span className="aa-fact__label">{label}</span>
      <span className="aa-fact__value">{value}</span>
      {hint ? <span className="aa-fact__hint">{hint}</span> : null}
    </div>
  </div>
)

const AsetsAssetDetail: React.FC = () => {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [edit, setEdit] = useState<EditState>(emptyEdit)
  const [editOpen, setEditOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [tab, setTab] = useState('overview')

  const resetEdit = (asset: any) =>
    setEdit({
      condition: asset?.condition || '',
      status: asset?.status || '',
      notes: asset?.notes || '',
      custodianName: asset?.custodianName || '',
      conditionReason: '',
      statusReason: '',
    })

  const load = async () => {
    setLoading(true)
    try {
      const result = await asetsService.getAsset(id)
      setData(result)
      resetEdit(result?.asset)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load asset.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) void load()
  }, [id])

  const openEdit = () => {
    resetEdit(data?.asset)
    setEditOpen(true)
  }

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault()
    setSaving(true)
    try {
      await asetsService.updateAsset(id, edit)
      toast.success('Asset updated.')
      setEditOpen(false)
      await load()
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Update failed.')
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    setArchiving(true)
    try {
      await asetsService.archiveAsset(id)
      toast.success('Asset archived.')
      setArchiveOpen(false)
      navigate('/asets/assets')
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to archive asset.')
    } finally {
      setArchiving(false)
    }
  }

  const copyId = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Asset ID copied.')
    } catch {
      toast.error('Could not copy. Select the ID and copy it instead.')
    }
  }

  if (loading && !data) {
    return (
      <Page>
        <Card>
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading asset profile…
          </div>
        </Card>
      </Page>
    )
  }

  if (!data?.asset) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={PackageX}
            title="This asset isn’t available"
            body="It may have been archived, or the link is wrong. Find it in the asset register instead."
            action={
              <Button variant="primary" onClick={() => navigate('/asets/assets')}>
                Open asset register
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  const asset = data.asset
  const timeline: any[] = data.timeline || []
  const allocations: any[] = data.allocations || []
  const transfers: any[] = data.transfers || []
  const maintenance: any[] = data.maintenance || []
  const qrPayload = asset.qrPayload || `asets://asset/${asset.assetId}`
  const location = asset.locationPath || asset.locationId?.name
  const warrantyEnd = asset.warranty?.endDate ? new Date(asset.warranty.endDate) : null
  const warrantyActive = warrantyEnd ? warrantyEnd.getTime() >= Date.now() : null
  const brandModel = [asset.brand, asset.model].filter(Boolean).join(' · ')

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'allocations', label: 'Allocations', count: allocations.length + transfers.length },
    { id: 'maintenance', label: 'Maintenance', count: maintenance.length },
    { id: 'history', label: 'History', count: timeline.length },
  ]

  return (
    <Page>
      <Card className="aa-hero-card">
        <div className="aa-hero">
          <span className="aa-hero__tile" aria-hidden="true">
            <Icon icon={Package} size={24} />
          </span>
          <div className="aa-hero__main">
            <div className="aa-hero__name">
              <h2>{asset.name}</h2>
              <AsetsStatusBadge status={asset.status} />
              {asset.condition ? (
                <Badge tone="neutral" dot={false}>
                  {asset.condition}
                </Badge>
              ) : null}
            </div>
            <div className="aa-hero__tags">
              <span className="aa-code">{asset.assetId}</span>
              <span className="aa-hero__sep" aria-hidden="true">·</span>
              <span>{asset.categoryId?.name || 'Uncategorized'}</span>
              <span className="aa-hero__sep" aria-hidden="true">·</span>
              <span>{location || 'No location'}</span>
            </div>
          </div>
          <div className="aa-hero__actions">
            <Button variant="primary" icon={Pencil} onClick={openEdit}>
              Edit asset
            </Button>
            <Menu
              label="More asset actions"
              items={[
                { label: 'Copy asset ID', icon: Copy, onSelect: () => void copyId(asset.assetId) },
                { divider: true },
                { label: 'Archive asset', icon: Trash2, tone: 'danger', onSelect: () => setArchiveOpen(true) },
              ]}
            />
          </div>
        </div>

        <div className="aa-facts">
          <Fact icon={IndianRupee} label="Purchase cost" value={formatMoney(asset.purchaseCost)} />
          <Fact icon={TrendingDown} label="Current value" value={formatMoney(asset.currentValue)} />
          <Fact icon={CalendarDays} label="Purchased" value={formatDate(asset.purchaseDate)} />
          <Fact
            icon={ShieldCheck}
            label="Warranty until"
            value={formatDate(asset.warranty?.endDate)}
            hint={warrantyActive == null ? undefined : warrantyActive ? 'In warranty' : 'Expired'}
          />
        </div>
      </Card>

      <div className="cb-grid-8-4">
        <Card className="aa-tabs-card">
          <Tabs items={tabs} value={tab} onChange={setTab} label="Asset sections" className="aa-tabs" />

          {tab === 'overview' ? (
            <>
              <section className="aa-section">
                <h3 className="aa-section__title">Details</h3>
                <DetailList
                  items={[
                    { label: 'Brand and model', value: brandModel },
                    { label: 'Serial number', value: asset.serialNumber ? <span className="aa-code">{asset.serialNumber}</span> : '' },
                    { label: 'Custodian', value: asset.custodianName },
                    { label: 'Department', value: asset.department },
                    { label: 'Ownership', value: asset.ownershipType },
                    { label: 'Funding source', value: asset.fundingSource },
                    { label: 'Vendor', value: asset.vendorId?.name },
                    { label: 'Location', value: location, wide: true },
                  ]}
                />
              </section>
              <section className="aa-section">
                <h3 className="aa-section__title">Purchase</h3>
                <DetailList
                  items={[
                    { label: 'Purchase cost', value: formatMoney(asset.purchaseCost) },
                    { label: 'Current value', value: formatMoney(asset.currentValue) },
                    { label: 'Purchase date', value: formatDate(asset.purchaseDate) },
                    { label: 'Invoice', value: asset.invoiceNumber },
                    { label: 'Purchase order', value: asset.purchaseOrder },
                  ]}
                />
              </section>
              <section className="aa-section">
                <h3 className="aa-section__title">Warranty</h3>
                <DetailList
                  items={[
                    { label: 'Provider', value: asset.warranty?.provider },
                    { label: 'Warranty number', value: asset.warranty?.warrantyNumber },
                    { label: 'Starts', value: formatDate(asset.warranty?.startDate) },
                    { label: 'Ends', value: formatDate(asset.warranty?.endDate) },
                  ]}
                />
              </section>
            </>
          ) : null}

          {tab === 'allocations' ? (
            <>
              <section className="aa-section">
                <h3 className="aa-section__title">Allocations</h3>
                {allocations.length ? (
                  <ul className="aa-records">
                    {allocations.map((row) => (
                      <li key={row._id} className="aa-record">
                        <div className="aa-record__main">
                          <span className="aa-record__title">
                            {row.toLocationId?.path || row.toLocationId?.name || 'Location'}
                            {row.newCustodianName ? ` · ${row.newCustodianName}` : ''}
                          </span>
                          <span className="aa-record__meta">
                            {formatDate(row.allocationDate)}
                            {row.returnDate ? ` – returned ${formatDate(row.returnDate)}` : ''}
                            {row.reason ? ` · ${row.reason}` : ''}
                          </span>
                        </div>
                        {row.status ? <Badge tone={recordTone(row.status)}>{row.status}</Badge> : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    compact
                    icon={UserRoundCheck}
                    title="Not allocated yet"
                    body="Allocate it to a room or a person to track who holds it."
                    action={
                      <Button size="sm" onClick={() => navigate('/asets/allocations')}>
                        Allocate asset
                      </Button>
                    }
                  />
                )}
              </section>
              {transfers.length ? (
                <section className="aa-section">
                  <h3 className="aa-section__title">Transfers</h3>
                  <ul className="aa-records">
                    {transfers.map((row) => (
                      <li key={row._id} className="aa-record">
                        <div className="aa-record__main">
                          <span className="aa-record__title">
                            {row.sourceLocationId?.name || 'Unplaced'} → {row.destinationLocationId?.name || 'Location'}
                          </span>
                          <span className="aa-record__meta">
                            {formatDate(row.transferDate)}
                            {row.reason ? ` · ${row.reason}` : ''}
                          </span>
                        </div>
                        {row.status ? <Badge tone={recordTone(row.status)}>{row.status}</Badge> : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}

          {tab === 'maintenance' ? (
            <section className="aa-section">
              {maintenance.length ? (
                <ul className="aa-records">
                  {maintenance.map((row) => (
                    <li key={row._id} className="aa-record">
                      <div className="aa-record__main">
                        <span className="aa-record__title">{row.issue}</span>
                        <span className="aa-record__meta">
                          Reported {formatDate(row.reportedDate)}
                          {row.priority ? ` · ${row.priority} priority` : ''}
                          {row.assignedTo ? ` · ${row.assignedTo}` : ''}
                          {row.cost ? ` · ${formatMoney(row.cost)}` : ''}
                        </span>
                      </div>
                      {row.status ? <Badge tone={MAINTENANCE_TONE[row.status] || 'neutral'}>{row.status}</Badge> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  compact
                  icon={Wrench}
                  title="No maintenance logged"
                  body="Log a repair or service visit when this asset needs attention."
                  action={
                    <Button size="sm" onClick={() => navigate('/asets/maintenance')}>
                      Log maintenance
                    </Button>
                  }
                />
              )}
            </section>
          ) : null}

          {tab === 'history' ? (
            <section className="aa-section">
              {timeline.length ? (
                <ol className="aa-timeline">
                  {timeline.map((event) => (
                    <li key={event._id} className="aa-event">
                      <span className="aa-event__rail" aria-hidden="true">
                        <span className="aa-event__dot" />
                      </span>
                      <div className="aa-event__text">
                        <span className="aa-event__title">{sentence(event.eventType) || 'Update'}</span>
                        <span className="aa-event__meta">
                          {formatDate(event.occurredAt)}
                          {event.reason ? ` · ${event.reason}` : ''}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState
                  compact
                  icon={CalendarDays}
                  title="No lifecycle events yet"
                  body="Status changes, allocations and repairs will appear here as they happen."
                />
              )}
            </section>
          ) : null}
        </Card>

        <div className="cb-stack">
          <Card title="Scan-ready identity">
            <div className="aa-qr">
              <div className="aa-qr__id">{asset.assetId}</div>
              <div className="aa-qr__frame">
                <div className="aa-qr__grid" aria-hidden="true">
                  {QR_CELLS.map((on, index) => (
                    <span key={index} className={on ? 'aa-qr__cell is-on' : 'aa-qr__cell'} />
                  ))}
                </div>
                <span className="aa-qr__payload" title={qrPayload}>
                  {qrPayload}
                </span>
              </div>
              <p className="aa-qr__hint">The barcode or QR payload resolves through ASETS lookup and audit scans.</p>
              <Button size="sm" icon={Copy} onClick={() => void copyId(asset.assetId)}>
                Copy asset ID
              </Button>
            </div>
          </Card>

          <Card title="Notes">
            {asset.notes ? (
              <p className="aa-notes">{asset.notes}</p>
            ) : (
              <p className="cb-muted">No notes yet. Add them with Edit asset.</p>
            )}
          </Card>

          <Card title="Next steps">
            <ul className="aa-links">
              {QUICK_LINKS.map((link) => (
                <li key={link.to}>
                  <Link className="aa-link" to={link.to}>
                    <Icon icon={link.icon} size={16} className="aa-link__icon" />
                    <span className="aa-link__label">{link.label}</span>
                    <Icon icon={ChevronRight} size={16} className="aa-link__chev" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Sheet
        open={editOpen}
        onClose={() => (saving ? undefined : setEditOpen(false))}
        icon={Pencil}
        title="Edit asset"
        description={`${asset.name} · ${asset.assetId}`}
        onSubmit={save}
        footer={
          <>
            <Button onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <h3 className="cb-form-section__title">State</h3>
          <div className="cb-form-grid">
            <Select
              label="Status"
              value={edit.status}
              onChange={(e) => setEdit({ ...edit, status: e.target.value })}
              options={ASSET_STATUSES.map((s) => ({ value: s, label: sentence(s) }))}
            />
            <Select
              label="Condition"
              value={edit.condition}
              onChange={(e) => setEdit({ ...edit, condition: e.target.value })}
              options={ASSET_CONDITIONS.map((c) => ({ value: c, label: c }))}
            />
            <TextField
              label="Status reason"
              className="is-wide"
              value={edit.statusReason}
              onChange={(e) => setEdit({ ...edit, statusReason: e.target.value })}
              hint="Recorded in the lifecycle history for audits."
            />
            <TextField
              label="Condition reason"
              className="is-wide"
              value={edit.conditionReason}
              onChange={(e) => setEdit({ ...edit, conditionReason: e.target.value })}
            />
          </div>
        </div>
        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Custody and notes</h3>
          <div className="cb-form-grid">
            <TextField
              label="Custodian"
              className="is-wide"
              value={edit.custodianName}
              onChange={(e) => setEdit({ ...edit, custodianName: e.target.value })}
            />
            <TextArea
              label="Notes"
              className="is-wide"
              rows={4}
              value={edit.notes}
              onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
            />
          </div>
        </div>
      </Sheet>

      <Dialog
        open={archiveOpen}
        onClose={() => (archiving ? undefined : setArchiveOpen(false))}
        tone="danger"
        size="sm"
        title={`Archive ${asset.name}?`}
        description="It leaves the asset register. Its lifecycle history is kept."
        footer={
          <>
            <Button onClick={() => setArchiveOpen(false)} disabled={archiving}>
              Keep asset
            </Button>
            <Button variant="danger" icon={Archive} loading={archiving} onClick={() => void archive()}>
              Archive asset
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default AsetsAssetDetail
