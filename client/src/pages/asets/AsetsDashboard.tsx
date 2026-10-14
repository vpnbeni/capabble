import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  FileBarChart,
  IndianRupee,
  MapPin,
  Package,
  RefreshCw,
  SearchX,
  ShieldAlert,
  ShoppingCart,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import asetsService from '@/services/asetsService'
import { AsetsStatusBadge } from '@/components/asets/AsetsUi'
import { Button, Card, EmptyState, Icon, Page, StatCard, cx, formatDate, formatINR } from '@/components/ui'
import '@/components/asets/overview.css'

const count = (value: unknown) => Number(value || 0).toLocaleString('en-IN')

const sentence = (value: string) => {
  const words = String(value || '').replace(/_/g, ' ').toLowerCase().trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ''
}

/** Where each server alert type is handled. */
const ALERT_TARGETS: Record<string, { to: string; label: string; danger?: boolean }> = {
  low_stock: { to: '/asets/stock', label: 'View stock' },
  warranty: { to: '/asets/assets', label: 'View assets' },
  maintenance: { to: '/asets/maintenance', label: 'View maintenance' },
  audit: { to: '/asets/audits', label: 'Start an audit' },
  missing: { to: '/asets/assets', label: 'View assets', danger: true },
  damaged: { to: '/asets/assets', label: 'View assets' },
}

const SHORTCUTS: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/asets/assets', label: 'Assets', icon: Package },
  { to: '/asets/locations', label: 'Locations', icon: MapPin },
  { to: '/asets/allocations', label: 'Allocations', icon: ArrowRightLeft },
  { to: '/asets/maintenance', label: 'Maintenance', icon: Wrench },
  { to: '/asets/stock', label: 'Stock', icon: Boxes },
  { to: '/asets/audits', label: 'Audits', icon: ClipboardCheck },
  { to: '/asets/procurement', label: 'Procurement', icon: ShoppingCart },
  { to: '/asets/reports', label: 'Reports', icon: FileBarChart },
]

type BarRow = { key: string; label: string; value: number }

const Bars: React.FC<{ rows: BarRow[]; variant?: 'alt' | 'cond'; label: string }> = ({ rows, variant, label }) => {
  const max = Math.max(0, ...rows.map((r) => r.value))
  return (
    <ul className={cx('ao-bars', variant && `ao-bars--${variant}`)} aria-label={label}>
      {rows.map((row) => (
        <li key={row.key} className={row.value === 0 ? 'is-zero' : undefined}>
          <span className="ao-bars__label" title={row.label}>
            {row.label}
          </span>
          <span className="ao-bars__track" aria-hidden="true">
            <span className="ao-bars__fill" style={{ width: `${max > 0 ? (row.value / max) * 100 : 0}%` }} />
          </span>
          <span className="ao-bars__value">{count(row.value)}</span>
        </li>
      ))}
    </ul>
  )
}

const ViewAll: React.FC<{ to: string; children?: React.ReactNode }> = ({ to, children = 'View all' }) => (
  <Link to={to} className="cb-link">
    {children}
  </Link>
)

const AsetsDashboard: React.FC = () => {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      setData(await asetsService.getDashboard())
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load ASETS dashboard.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  if (loading && !data) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading asset overview…
        </div>
      </Page>
    )
  }

  if (!data) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Asset overview couldn’t load"
            body="Check your connection, then try again."
            action={
              <Button icon={RefreshCw} onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  const kpis = data.kpis || {}
  const total = Number(kpis.totalAssets || 0)
  const share = (value: number) => (total > 0 ? Math.round((Number(value || 0) / total) * 100) : 0)

  const statusRows: BarRow[] = Object.entries(data.byStatus || {}).map(([name, value]) => ({
    key: name,
    label: sentence(name),
    value: Number(value || 0),
  }))
  const categories: any[] = data.byCategory || []
  const categoryMax = Math.max(0, ...categories.map((c) => Number(c.count || 0)))
  const locationRows: BarRow[] = (data.byLocation || []).slice(0, 8).map((row: any) => ({
    key: String(row._id),
    label: row.name || row.path || 'Unassigned',
    value: Number(row.count || 0),
  }))
  const conditionRows: BarRow[] = (data.byCondition || []).map((row: any) => ({
    key: String(row._id),
    label: row._id ? String(row._id) : 'Not recorded',
    value: Number(row.count || 0),
  }))
  const alerts: any[] = data.alerts || []

  return (
    <Page>
      <div className="ao-toolbar">
        <p className="ao-toolbar__lede">Know what the school owns, where it is, who has it, and what needs attention.</p>
        <div className="ao-toolbar__actions">
          <Button icon={RefreshCw} loading={loading} onClick={() => void load()}>
            Refresh
          </Button>
          <Link to="/asets/assets" className="cb-btn cb-btn--primary cb-btn--md">
            <Icon icon={Package} size={16} />
            <span className="cb-btn__label">View all assets</span>
          </Link>
        </div>
      </div>

      <section className="cb-stats" aria-label="Asset totals">
        <StatCard label="Total assets" value={count(kpis.totalAssets)} icon={Package} hint="Active, not archived" />
        <StatCard
          label="Asset value"
          value={formatINR(Number(kpis.assetValue || 0), { compact: true })}
          icon={IndianRupee}
          hint={`Purchase cost ${formatINR(Number(kpis.purchaseValue || 0), { compact: true })}`}
        />
        <StatCard
          label="In use"
          value={count(kpis.inUse)}
          icon={CheckCircle2}
          hint={`${share(kpis.inUse)}% of assets`}
          progress={share(kpis.inUse)}
          progressTone="success"
        />
        <StatCard label="In stock" value={count(kpis.inStock)} icon={Boxes} hint={`${share(kpis.inStock)}% of assets`} />
        <StatCard
          label="Under maintenance"
          value={count(kpis.underMaintenance)}
          icon={Wrench}
          hint={kpis.underMaintenance ? 'Out of service for repair' : 'Nothing in repair'}
        />
        <StatCard label="Damaged" value={count(kpis.damaged)} icon={AlertTriangle} hint={kpis.damaged ? 'Needs repair or disposal' : 'None reported'} />
        <StatCard label="Lost" value={count(kpis.lost)} icon={SearchX} hint={kpis.lost ? 'Marked lost' : 'None missing'} />
        <StatCard
          label="Due for audit"
          value={count(kpis.assetsDueForAudit)}
          icon={ClipboardCheck}
          hint={kpis.assetsDueForAudit ? 'Not verified recently' : 'All verified'}
        />
      </section>

      {alerts.length ? (
        <Card title="Needs attention" subtitle={`${alerts.length} ${alerts.length === 1 ? 'item' : 'items'} to follow up`}>
          <ul className="ao-alerts">
            {alerts.map((alert) => {
              const target = ALERT_TARGETS[alert.type]
              return (
                <li key={alert.type} className={cx('ao-alert', target?.danger && 'is-danger')}>
                  <Icon icon={target?.danger ? ShieldAlert : AlertTriangle} size={16} />
                  <span className="ao-alert__text">{sentence(alert.message)}</span>
                  {target ? (
                    <Link to={target.to} className="cb-link ao-alert__link">
                      {target.label}
                    </Link>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </Card>
      ) : null}

      <nav aria-label="Asset sections">
        <ul className="ao-links">
          {SHORTCUTS.map((item) => (
            <li key={item.to}>
              <Link to={item.to} className="ao-link">
                <Icon icon={item.icon} size={16} />
                <span className="ao-link__label">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="cb-grid-6-6">
        <Card title="Lifecycle status" subtitle={`${count(total)} assets by current status`} action={<ViewAll to="/asets/assets" />}>
          {statusRows.length ? (
            <Bars rows={statusRows} label="Assets by lifecycle status" />
          ) : (
            <EmptyState title="No assets yet" body="Register assets to see where they are in their lifecycle." compact />
          )}
        </Card>

        <Card
          title="By category"
          subtitle={categories.length ? `Top ${categories.length} categories by count` : undefined}
          action={<ViewAll to="/asets/categories">Manage categories</ViewAll>}
        >
          {categories.length ? (
            <ul className="ao-tiles" aria-label="Assets by category">
              {categories.map((row, index) => (
                <li key={String(row._id)} className={`ao-tile ao-tile--c${(index % 6) + 1}`}>
                  <span className="ao-tile__name" title={row.name || 'Uncategorised'}>
                    {row.name || 'Uncategorised'}
                  </span>
                  <span className="ao-tile__count">{count(row.count)}</span>
                  <span className="ao-tile__bar" aria-hidden="true">
                    <span style={{ width: `${categoryMax > 0 ? (Number(row.count || 0) / categoryMax) * 100 : 0}%` }} />
                  </span>
                  <span className="ao-tile__meta">
                    {row.code ? `${row.code} · ` : ''}
                    {formatINR(Number(row.value || 0), { compact: true })} value
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No categorised assets" body="Add categories, then assign them when registering assets." compact />
          )}
        </Card>
      </div>

      <div className="cb-grid-6-6">
        <Card title="By location" subtitle="Top locations by asset count" action={<ViewAll to="/asets/locations" />}>
          {locationRows.length ? (
            <Bars rows={locationRows} variant="alt" label="Assets by location" />
          ) : (
            <EmptyState title="No location distribution yet" body="Assign assets to rooms and stores to see where they sit." compact />
          )}
        </Card>

        <Card title="Condition overview" subtitle="Assets by recorded condition">
          {conditionRows.length ? (
            <Bars rows={conditionRows} variant="cond" label="Assets by condition" />
          ) : (
            <EmptyState title="No conditions recorded" body="Condition is captured when assets are registered or audited." compact />
          )}
        </Card>
      </div>

      <div className="cb-grid-6-6">
        <Card title="Recently added" action={<ViewAll to="/asets/assets" />}>
          {data.recentlyAdded?.length ? (
            <ul className="ao-list">
              {data.recentlyAdded.map((asset: any) => (
                <li key={asset._id}>
                  <Link to={`/asets/assets/${asset._id}`} className="ao-row">
                    <span className="ao-row__text">
                      <span className="ao-row__title">{asset.name}</span>
                      <span className="ao-row__meta">
                        {[asset.assetId, asset.categoryId?.name, asset.locationId?.name].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <AsetsStatusBadge status={asset.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No assets added yet" body="New assets appear here as soon as they’re registered." compact />
          )}
        </Card>

        <Card title="Maintenance due" action={<ViewAll to="/asets/maintenance" />}>
          {data.maintenanceDue?.length ? (
            <ul className="ao-list">
              {data.maintenanceDue.map((row: any) => (
                <li key={row._id}>
                  <div className="ao-row">
                    <span className="ao-row__text">
                      <span className="ao-row__title">{row.assetId?.name || 'Asset'}</span>
                      <span className="ao-row__meta">
                        {[row.assetId?.assetId, row.issue, row.nextDueDate ? `due ${formatDate(row.nextDueDate)}` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <AsetsStatusBadge status={row.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CheckCircle2} title="No maintenance items need attention" body="Open repairs and services due in 30 days show here." compact />
          )}
        </Card>
      </div>

      <div className="cb-grid-3">
        <Card title="Recent allocations" action={<ViewAll to="/asets/allocations" />}>
          {data.recentAllocations?.length ? (
            <ul className="ao-list">
              {data.recentAllocations.slice(0, 5).map((row: any) => (
                <li key={row._id}>
                  <div className="ao-row">
                    <span className="ao-row__text">
                      <span className="ao-row__title">{row.assetId?.name || row.assetId?.assetId || 'Asset'}</span>
                      <span className="ao-row__meta">
                        {row.assetId?.assetId ? `${row.assetId.assetId} → ` : '→ '}
                        {row.toLocationId?.name || 'Location'}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No allocations yet" body="Allocate an asset to a room or person to track it here." compact />
          )}
        </Card>

        <Card title="Warranty alerts" action={<ViewAll to="/asets/assets" />}>
          {data.warrantySoon?.length ? (
            <ul className="ao-list">
              {data.warrantySoon.map((row: any) => (
                <li key={row._id}>
                  <Link to={`/asets/assets/${row._id}`} className="ao-row">
                    <span className="ao-row__text">
                      <span className="ao-row__title">{row.name || row.assetId}</span>
                      <span className="ao-row__meta">{row.assetId}</span>
                    </span>
                    <span className="ao-row__aside is-warning">Ends {formatDate(row.warranty?.endDate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CheckCircle2} title="No warranties expiring soon" compact />
          )}
        </Card>

        <Card title="Low stock" action={<ViewAll to="/asets/stock" />}>
          {data.lowStock?.length ? (
            <ul className="ao-list">
              {data.lowStock.map((row: any) => (
                <li key={row._id}>
                  <div className="ao-row">
                    <span className="ao-row__text">
                      <span className="ao-row__title">{row.name}</span>
                      <span className="ao-row__meta">Reorder at {count(row.reorderLevel)}</span>
                    </span>
                    <span className="ao-row__aside is-warning">
                      {count(row.quantityOnHand)} left
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={CheckCircle2} title="Stock levels look healthy" compact />
          )}
        </Card>
      </div>
    </Page>
  )
}

export default AsetsDashboard
