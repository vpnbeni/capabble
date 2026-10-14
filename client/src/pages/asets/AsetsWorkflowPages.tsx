import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Download,
  FolderTree,
  History,
  IndianRupee,
  MapPin,
  Minus,
  Package,
  PackageCheck,
  Plus,
  ScanLine,
  SearchX,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  UserCheck,
  UserRound,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import asetsService from '@/services/asetsService'
import { DISPOSAL_REASONS, MAINTENANCE_STATUSES } from '@/constants/asetsConstants'
import { AsetsStatusBadge } from '@/components/asets/AsetsUi'
import {
  Page,
  Card,
  StatCard,
  FilterBar,
  EmptyState,
  DataTable,
  Dialog,
  Sheet,
  Menu,
  Button,
  Badge,
  Icon,
  TextField,
  TextArea,
  Select,
  Checkbox,
  cx,
  formatDate,
  orDash,
  formatINR,
  type DataTableColumn,
  type MenuItem,
  type Tone,
} from '@/components/ui'
import '@/components/asets/workflow.css'

/* ============================== Shared helpers ============================== */

const errMsg = (error: any, fallback: string) => error?.response?.data?.message || fallback

const idOf = (value: any): string => (value && typeof value === 'object' ? String(value._id || '') : String(value || ''))

/** A populated ref's name, or the name looked up from a lookup list when only the id came back. */
const refName = (value: any, list?: any[]): string => {
  if (!value) return ''
  if (typeof value === 'object') return value.path || value.name || ''
  return list?.find((item) => item._id === value)?.name || ''
}

const matchesText = (query: string, ...parts: unknown[]) =>
  !query || parts.filter((part) => part != null && part !== '').join(' ').toLowerCase().includes(query)

const countBy = (rows: any[], key: string, value: string) => rows.filter((row) => row[key] === value).length

const sentence = (text: string) => {
  const words = String(text || '').replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Workflow states AsetsUi does not map yet (see report). Everything else defers to AsetsStatusBadge. */
const LOCAL_TONE: Record<string, Tone | 'accent'> = {
  REPORTED: 'warning',
  ASSIGNED: 'info',
  AWAITING_PARTS: 'warning',
  VERIFIED: 'success',
  WRONG_LOCATION: 'warning',
  NOT_FOUND: 'danger',
  UNVERIFIED: 'neutral',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'danger',
}

const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const key = String(status || '').trim().toUpperCase().replace(/\s+/g, '_')
  if (!key) return <span className="cb-subtle">—</span>
  if (LOCAL_TONE[key]) return <Badge tone={LOCAL_TONE[key]}>{sentence(key)}</Badge>
  return <AsetsStatusBadge status={key} />
}

const PRIORITY_TONE: Record<string, Tone> = { Critical: 'danger', High: 'warning', Medium: 'info', Low: 'neutral' }

const Loading: React.FC<{ label: string }> = ({ label }) => (
  <div className="cb-table-state" role="status">
    <span className="cb-spinner" aria-hidden="true" />
    {label}
  </div>
)

const AssetCell: React.FC<{ asset: any }> = ({ asset }) => (
  <span className="aw-entity">
    <span className="aw-entity__primary aw-code">{orDash(asset?.assetId)}</span>
    {asset?.name ? <span className="aw-entity__secondary">{asset.name}</span> : null}
  </span>
)

const EntityCell: React.FC<{ primary?: React.ReactNode; secondary?: React.ReactNode }> = ({ primary, secondary }) => (
  <span className="aw-entity">
    <span className="aw-entity__primary">{primary || '—'}</span>
    {secondary ? <span className="aw-entity__secondary">{secondary}</span> : null}
  </span>
)

const assetOption = (asset: any) => ({ value: asset._id, label: `${asset.assetId} — ${asset.name}` })
const locationOption = (usePath: boolean) => (loc: any) => ({ value: loc._id, label: usePath ? loc.path || loc.name : loc.name })
const nameOption = (item: any) => ({ value: item._id, label: item.name })
const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: sentence(value) }))

const useLookups = () => {
  const [assets, setAssets] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [vendors, setVendors] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])

  useEffect(() => {
    void Promise.all([
      asetsService.listAssets({ limit: 200 }),
      asetsService.listLocations(),
      asetsService.listVendors(),
      asetsService.listCategories(),
    ]).then(([assetData, locs, vends, cats]) => {
      setAssets(assetData.items || [])
      setLocations(locs)
      setVendors(vends)
      setCategories(cats)
    }).catch((error: any) => toast.error(errMsg(error, 'Failed to load lookups.')))
  }, [])

  return { assets, locations, vendors, categories }
}

/** Loads a record list once, then on demand. */
const useRecords = (fetcher: () => Promise<any[]>, errorText: string) => {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const reload = useCallback(async () => {
    try {
      const rows = await fetcherRef.current()
      setItems(Array.isArray(rows) ? rows : [])
    } catch {
      toast.error(errorText)
    } finally {
      setLoading(false)
    }
  }, [errorText])

  useEffect(() => {
    void reload()
  }, [reload])

  return { items, loading, reload }
}

/** Row-level actions: one busy key at a time, toasts on success and failure. */
const useRowAction = () => {
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<unknown>, success: string | null, failure: string) => {
    setBusy(key)
    try {
      await fn()
      if (success) toast.success(success)
      return true
    } catch (error: any) {
      toast.error(errMsg(error, failure))
      return false
    } finally {
      setBusy(null)
    }
  }
  return { busy, run }
}

/** State for a create form shown in a Sheet. Keeps the draft when the sheet is dismissed. */
function useFormSheet<T extends Record<string, any>>(initial: T) {
  const initialRef = useRef(initial)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<T>(initial)
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof T>(key: K, value: T[K]) => setForm((prev) => ({ ...prev, [key]: value }))
  const show = () => {
    setTried(false)
    setOpen(true)
  }
  const hide = () => {
    if (!saving) setOpen(false)
  }
  const submit = async (valid: boolean, action: () => Promise<void>, failure: string) => {
    if (!valid) {
      setTried(true)
      return false
    }
    setSaving(true)
    try {
      await action()
      setForm(initialRef.current)
      setTried(false)
      setOpen(false)
      return true
    } catch (error: any) {
      toast.error(errMsg(error, failure))
      return false
    } finally {
      setSaving(false)
    }
  }
  return { open, form, set, tried, saving, show, hide, submit }
}

const FormSheet: React.FC<{
  open: boolean
  onClose: () => void
  title: string
  description?: string
  icon: LucideIcon
  submitLabel: string
  saving: boolean
  onSubmit: () => void
  children: React.ReactNode
}> = ({ open, onClose, title, description, icon, submitLabel, saving, onSubmit, children }) => (
  <Sheet
    open={open}
    onClose={onClose}
    title={title}
    description={description}
    icon={icon}
    onSubmit={(event) => {
      event.preventDefault()
      onSubmit()
    }}
    footer={
      <>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {submitLabel}
        </Button>
      </>
    }
  >
    <div className="cb-form-grid">{children}</div>
  </Sheet>
)

/** Flush card: filter toolbar on top, the table underneath. */
const RecordsCard: React.FC<{ toolbar: React.ReactNode; children: React.ReactNode }> = ({ toolbar, children }) => (
  <Card flush className="aw-card">
    <div className="aw-toolbar">{toolbar}</div>
    {children}
  </Card>
)

const ListEmpty: React.FC<{
  total: number
  icon: LucideIcon
  title: string
  body: string
  filteredTitle: string
  onClear: () => void
}> = ({ total, icon, title, body, filteredTitle, onClear }) =>
  total === 0 ? (
    <EmptyState icon={icon} title={title} body={body} />
  ) : (
    <EmptyState
      icon={SearchX}
      title={filteredTitle}
      body="Try another search or clear the filters."
      action={
        <Button size="sm" onClick={onClear}>
          Clear filters
        </Button>
      }
      compact
    />
  )

const FilterSelect: React.FC<{
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  options: Array<{ value: string; label: string }>
}> = ({ label, value, onChange, placeholder, options }) => (
  <Select aria-label={label} size="sm" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} options={options} />
)

const actionsColumn = <R,>(render: (row: R) => React.ReactNode): DataTableColumn<R> => ({
  key: 'actions',
  header: <span className="cb-visually-hidden">Actions</span>,
  headerLabel: 'Actions',
  align: 'right',
  interactive: true,
  render: (row) => <div className="aw-actions">{render(row)}</div>,
})

/* ============================== Allocations ============================== */

const ALLOCATION_STATUSES = ['Active', 'Returned', 'Cancelled']

export const AsetsAllocations: React.FC = () => {
  const { assets, locations } = useLookups()
  const { items, loading, reload } = useRecords(
    async () => (await asetsService.listAllocations({ limit: 100 })).items || [],
    'Failed to load allocations.'
  )
  const sheet = useFormSheet({ assetId: '', toLocationId: '', newCustodianName: '', reason: '', approvedBy: '' })
  const { busy, run } = useRowAction()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [location, setLocation] = useState('')

  const query = search.trim().toLowerCase()
  const rows = useMemo(
    () =>
      items.filter(
        (row) =>
          (!status || row.status === status) &&
          (!location || idOf(row.toLocationId) === location) &&
          matchesText(query, row.assetId?.assetId, row.assetId?.name, refName(row.toLocationId, locations), row.newCustodianName, row.reason)
      ),
    [items, status, location, query, locations]
  )
  const clear = () => {
    setSearch('')
    setStatus('')
    setLocation('')
  }

  const columns: DataTableColumn<any>[] = [
    { key: 'asset', header: 'Asset', mobile: 'title', render: (row) => <AssetCell asset={row.assetId} /> },
    { key: 'location', header: 'Allocated to', mobile: 'subtitle', render: (row) => <span className="aw-clip">{orDash(refName(row.toLocationId, locations))}</span> },
    { key: 'custodian', header: 'Custodian', render: (row) => orDash(row.newCustodianName) },
    { key: 'date', header: 'Allocated on', render: (row) => formatDate(row.allocationDate) },
    { key: 'status', header: 'Status', mobile: 'aside', render: (row) => <StatusBadge status={row.status} /> },
    actionsColumn((row: any) =>
      row.status === 'Active' ? (
        <Button
          size="sm"
          loading={busy === row._id}
          onClick={async () => {
            const ok = await run(row._id, () => asetsService.returnAllocation(row._id), 'Asset returned.', 'Return failed.')
            if (ok) await reload()
          }}
        >
          Return
        </Button>
      ) : null
    ),
  ]

  const { form, set, tried } = sheet
  const save = () =>
    void sheet.submit(
      Boolean(form.assetId && form.toLocationId),
      async () => {
        await asetsService.createAllocation(form)
        toast.success('Asset allocated.')
        await reload()
      },
      'Allocation failed.'
    )

  return (
    <Page>
      <div className="cb-stats">
        <StatCard label="Allocations" value={items.length} icon={UserCheck} />
        <StatCard label="Active" value={countBy(items, 'status', 'Active')} hint="Assets out with a custodian" />
        <StatCard label="Returned" value={countBy(items, 'status', 'Returned')} />
        <StatCard label="Cancelled" value={countBy(items, 'status', 'Cancelled')} />
      </div>

      <RecordsCard
        toolbar={
          <FilterBar
            search={{ placeholder: 'Search asset, location or custodian', value: search, onChange: setSearch, label: 'Search allocations' }}
            filters={
              <>
                <FilterSelect label="Status" value={status} onChange={setStatus} placeholder="All statuses" options={toOptions(ALLOCATION_STATUSES)} />
                <FilterSelect label="Location" value={location} onChange={setLocation} placeholder="All locations" options={locations.map(locationOption(true))} />
              </>
            }
            actions={
              <Button variant="primary" icon={Plus} onClick={sheet.show}>
                Allocate asset
              </Button>
            }
          />
        }
      >
        <DataTable
          caption="Allocations"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row._id}
          loading={loading}
          loadingLabel="Loading allocations…"
          empty={
            <ListEmpty
              total={items.length}
              icon={UserCheck}
              title="No assets allocated yet"
              body="Allocate an asset to place it in a room or with a custodian."
              filteredTitle="No allocations match these filters"
              onClear={clear}
            />
          }
        />
      </RecordsCard>

      <FormSheet
        open={sheet.open}
        onClose={sheet.hide}
        title="Allocate asset"
        description="Assign the asset to a location and, optionally, a custodian. History is kept."
        icon={UserCheck}
        submitLabel="Allocate asset"
        saving={sheet.saving}
        onSubmit={save}
      >
        <Select
          className="is-wide"
          label="Asset"
          required
          value={form.assetId}
          onChange={(e) => set('assetId', e.target.value)}
          placeholder="Select asset"
          options={assets.map(assetOption)}
          error={tried && !form.assetId ? 'Choose an asset.' : undefined}
        />
        <Select
          className="is-wide"
          label="Allocate to"
          required
          value={form.toLocationId}
          onChange={(e) => set('toLocationId', e.target.value)}
          placeholder="Select location"
          options={locations.map(locationOption(true))}
          error={tried && !form.toLocationId ? 'Choose a location.' : undefined}
        />
        <TextField label="New custodian" value={form.newCustodianName} onChange={(e) => set('newCustodianName', e.target.value)} />
        <TextField label="Approved by" value={form.approvedBy} onChange={(e) => set('approvedBy', e.target.value)} />
        <TextField className="is-wide" label="Reason" value={form.reason} onChange={(e) => set('reason', e.target.value)} />
      </FormSheet>
    </Page>
  )
}

/* ============================== Transfers ============================== */

const TRANSFER_STATUSES = ['Pending', 'Approved', 'Completed', 'Rejected']

export const AsetsTransfers: React.FC = () => {
  const { assets, locations } = useLookups()
  const { items, loading, reload } = useRecords(
    async () => (await asetsService.listTransfers({ limit: 100 })).items || [],
    'Failed to load transfers.'
  )
  const sheet = useFormSheet({ assetId: '', destinationLocationId: '', reason: '', approvedBy: '', requestedBy: '' })
  const { busy, run } = useRowAction()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const query = search.trim().toLowerCase()
  const rows = useMemo(
    () =>
      items.filter(
        (row) =>
          (!status || row.status === status) &&
          matchesText(
            query,
            row.assetId?.assetId,
            row.assetId?.name,
            refName(row.sourceLocationId, locations),
            refName(row.destinationLocationId, locations),
            row.requestedBy,
            row.reason
          )
      ),
    [items, status, query, locations]
  )
  const clear = () => {
    setSearch('')
    setStatus('')
  }

  const columns: DataTableColumn<any>[] = [
    { key: 'asset', header: 'Asset', mobile: 'title', render: (row) => <AssetCell asset={row.assetId} /> },
    {
      key: 'route',
      header: 'From → to',
      headerLabel: 'Route',
      mobile: 'subtitle',
      render: (row) => (
        <span className="aw-route">
          <span className="aw-clip">{orDash(refName(row.sourceLocationId, locations))}</span>
          <Icon icon={ArrowRight} size={14} />
          <span className="aw-clip">{orDash(refName(row.destinationLocationId, locations))}</span>
        </span>
      ),
    },
    { key: 'requestedBy', header: 'Requested by', render: (row) => orDash(row.requestedBy) },
    { key: 'date', header: 'Date', render: (row) => formatDate(row.transferDate || row.createdAt) },
    { key: 'status', header: 'Status', mobile: 'aside', render: (row) => <StatusBadge status={row.status} /> },
    actionsColumn((row: any) =>
      row.status === 'Pending' ? (
        <Button
          size="sm"
          loading={busy === row._id}
          onClick={async () => {
            const ok = await run(row._id, () => asetsService.completeTransfer(row._id, { approvedBy: 'admin' }), 'Transfer completed.', 'Approval failed.')
            if (ok) await reload()
          }}
        >
          Approve
        </Button>
      ) : null
    ),
  ]

  const { form, set, tried } = sheet
  const save = () =>
    void sheet.submit(
      Boolean(form.assetId && form.destinationLocationId),
      async () => {
        await asetsService.createTransfer(form)
        toast.success('Transfer recorded.')
        await reload()
      },
      'Transfer failed.'
    )

  return (
    <Page>
      <div className="cb-stats">
        <StatCard label="Transfers" value={items.length} icon={ArrowLeftRight} />
        <StatCard label="Pending approval" value={countBy(items, 'status', 'Pending')} />
        <StatCard label="Completed" value={countBy(items, 'status', 'Completed') + countBy(items, 'status', 'Approved')} />
        <StatCard label="Rejected" value={countBy(items, 'status', 'Rejected')} />
      </div>

      <RecordsCard
        toolbar={
          <FilterBar
            search={{ placeholder: 'Search asset, location or requester', value: search, onChange: setSearch, label: 'Search transfers' }}
            filters={<FilterSelect label="Status" value={status} onChange={setStatus} placeholder="All statuses" options={toOptions(TRANSFER_STATUSES)} />}
            actions={
              <Button variant="primary" icon={Plus} onClick={sheet.show}>
                Request transfer
              </Button>
            }
          />
        }
      >
        <DataTable
          caption="Transfers"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row._id}
          loading={loading}
          loadingLabel="Loading transfers…"
          empty={
            <ListEmpty
              total={items.length}
              icon={ArrowLeftRight}
              title="No transfers yet"
              body="Request a transfer to move an asset between locations."
              filteredTitle="No transfers match these filters"
              onClear={clear}
            />
          }
        />
      </RecordsCard>

      <FormSheet
        open={sheet.open}
        onClose={sheet.hide}
        title="Request transfer"
        description="Moves the asset to a new location and records it in the asset's history."
        icon={ArrowLeftRight}
        submitLabel="Request transfer"
        saving={sheet.saving}
        onSubmit={save}
      >
        <Select
          className="is-wide"
          label="Asset"
          required
          value={form.assetId}
          onChange={(e) => set('assetId', e.target.value)}
          placeholder="Select asset"
          options={assets.map(assetOption)}
          error={tried && !form.assetId ? 'Choose an asset.' : undefined}
        />
        <Select
          className="is-wide"
          label="Destination"
          required
          value={form.destinationLocationId}
          onChange={(e) => set('destinationLocationId', e.target.value)}
          placeholder="Select location"
          options={locations.map(locationOption(true))}
          error={tried && !form.destinationLocationId ? 'Choose a destination.' : undefined}
        />
        <TextField label="Requested by" value={form.requestedBy} onChange={(e) => set('requestedBy', e.target.value)} />
        <TextField label="Approved by" value={form.approvedBy} onChange={(e) => set('approvedBy', e.target.value)} />
        <TextField className="is-wide" label="Reason" value={form.reason} onChange={(e) => set('reason', e.target.value)} />
      </FormSheet>
    </Page>
  )
}

/* ============================== Maintenance ============================== */

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']
const MAINTENANCE_DONE = ['Completed', 'Closed']

export const AsetsMaintenance: React.FC = () => {
  const { assets, vendors } = useLookups()
  const { items, loading, reload } = useRecords(
    async () => (await asetsService.listMaintenance({ limit: 100 })).items || [],
    'Failed to load maintenance.'
  )
  const sheet = useFormSheet({ assetId: '', issue: '', priority: 'Medium', assignedTo: '', vendorId: '' })
  const { busy, run } = useRowAction()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [priority, setPriority] = useState('')

  const query = search.trim().toLowerCase()
  const rows = useMemo(
    () =>
      items.filter(
        (row) =>
          (!status || row.status === status) &&
          (!priority || row.priority === priority) &&
          matchesText(query, row.assetId?.assetId, row.assetId?.name, row.issue, row.assignedTo, refName(row.vendorId, vendors))
      ),
    [items, status, priority, query, vendors]
  )
  const clear = () => {
    setSearch('')
    setStatus('')
    setPriority('')
  }
  const open = items.filter((row) => !MAINTENANCE_DONE.includes(row.status))

  const setRowStatus = async (row: any, next: string) => {
    const ok = await run(
      row._id,
      () =>
        asetsService.updateMaintenance(row._id, {
          status: next,
          completionDate: MAINTENANCE_DONE.includes(next) ? new Date().toISOString() : undefined,
        }),
      'Updated.',
      'Update failed.'
    )
    if (ok) await reload()
  }

  const columns: DataTableColumn<any>[] = [
    { key: 'asset', header: 'Asset', mobile: 'title', render: (row) => <AssetCell asset={row.assetId} /> },
    { key: 'issue', header: 'Issue', mobile: 'subtitle', render: (row) => <span className="aw-clip" title={row.issue}>{orDash(row.issue)}</span> },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) =>
        row.priority ? (
          <Badge tone={PRIORITY_TONE[row.priority] || 'neutral'} dot={false}>
            {row.priority}
          </Badge>
        ) : (
          '—'
        ),
    },
    { key: 'assignedTo', header: 'Assigned to', render: (row) => orDash(row.assignedTo || refName(row.vendorId, vendors)) },
    { key: 'reported', header: 'Reported on', render: (row) => formatDate(row.reportedDate) },
    { key: 'status', header: 'Status', mobile: 'aside', render: (row) => <StatusBadge status={row.status} /> },
    actionsColumn((row: any) => {
      const menu: MenuItem[] = MAINTENANCE_STATUSES.filter((s) => s !== row.status).map((s) => ({
        label: `Mark as ${s.toLowerCase()}`,
        disabled: busy === row._id,
        onSelect: () => void setRowStatus(row, s),
      }))
      return busy === row._id ? <span className="cb-spinner" role="status" aria-label="Updating" /> : <Menu items={menu} label={`Change status for ${row.assetId?.assetId || 'record'}`} />
    }),
  ]

  const { form, set, tried } = sheet
  const save = () =>
    void sheet.submit(
      Boolean(form.assetId && form.issue.trim()),
      async () => {
        await asetsService.createMaintenance(form)
        toast.success('Maintenance created.')
        await reload()
      },
      'Failed to log maintenance.'
    )

  return (
    <Page>
      <div className="cb-stats">
        <StatCard label="Open jobs" value={open.length} icon={Wrench} />
        <StatCard label="High or critical" value={open.filter((row) => ['High', 'Critical'].includes(row.priority)).length} hint="Open jobs only" />
        <StatCard label="Completed" value={items.filter((row) => MAINTENANCE_DONE.includes(row.status)).length} />
        <StatCard label="All records" value={items.length} />
      </div>

      <RecordsCard
        toolbar={
          <FilterBar
            search={{ placeholder: 'Search asset, issue or technician', value: search, onChange: setSearch, label: 'Search maintenance' }}
            filters={
              <>
                <FilterSelect label="Status" value={status} onChange={setStatus} placeholder="All statuses" options={toOptions(MAINTENANCE_STATUSES)} />
                <FilterSelect label="Priority" value={priority} onChange={setPriority} placeholder="Any priority" options={toOptions(PRIORITIES)} />
              </>
            }
            actions={
              <Button variant="primary" icon={Plus} onClick={sheet.show}>
                Log maintenance
              </Button>
            }
          />
        }
      >
        <DataTable
          caption="Maintenance"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row._id}
          loading={loading}
          loadingLabel="Loading maintenance…"
          empty={
            <ListEmpty
              total={items.length}
              icon={Wrench}
              title="No maintenance logged"
              body="Log an issue when an asset needs repair or a service visit."
              filteredTitle="No maintenance matches these filters"
              onClear={clear}
            />
          }
        />
      </RecordsCard>

      <FormSheet
        open={sheet.open}
        onClose={sheet.hide}
        title="Log maintenance"
        description="Report an issue and assign it to a technician or vendor."
        icon={Wrench}
        submitLabel="Log maintenance"
        saving={sheet.saving}
        onSubmit={save}
      >
        <Select
          className="is-wide"
          label="Asset"
          required
          value={form.assetId}
          onChange={(e) => set('assetId', e.target.value)}
          placeholder="Select asset"
          options={assets.map(assetOption)}
          error={tried && !form.assetId ? 'Choose an asset.' : undefined}
        />
        <TextArea
          className="is-wide"
          label="Issue"
          required
          value={form.issue}
          onChange={(e) => set('issue', e.target.value)}
          placeholder="What is wrong with the asset?"
          error={tried && !form.issue.trim() ? 'Describe the issue.' : undefined}
        />
        <Select label="Priority" value={form.priority} onChange={(e) => set('priority', e.target.value)} options={PRIORITIES} />
        <TextField label="Assigned to" value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)} placeholder="Technician or vendor" />
        <Select
          className="is-wide"
          label="Vendor"
          value={form.vendorId}
          onChange={(e) => set('vendorId', e.target.value)}
          placeholder="No vendor"
          options={vendors.map(nameOption)}
        />
      </FormSheet>
    </Page>
  )
}

/* ============================== Stock ============================== */

const STOCK_LEVELS = [
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
  { value: 'ok', label: 'In stock' },
]
const MOVEMENT_TYPES = [
  { value: 'receipt', label: 'Receipt (add to stock)' },
  { value: 'issue', label: 'Issue (take from stock)' },
  { value: 'adjustment', label: 'Adjustment (+ or −)' },
  { value: 'reserve', label: 'Reserve' },
  { value: 'release', label: 'Release reservation' },
]

const stockLevel = (row: any): 'out' | 'low' | 'ok' => {
  const qty = Number(row.quantityOnHand || 0)
  if (qty <= 0) return 'out'
  if (qty <= Number(row.reorderLevel || 0)) return 'low'
  return 'ok'
}

export const AsetsStock: React.FC = () => {
  const { locations, categories, vendors } = useLookups()
  const { items, loading, reload } = useRecords(() => asetsService.listStock(), 'Failed to load stock.')
  const sheet = useFormSheet({ name: '', sku: '', unit: 'pcs', quantityOnHand: 0, reorderLevel: 0, locationId: '', categoryId: '', vendorId: '' })
  const { busy, run } = useRowAction()
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('')
  const [location, setLocation] = useState('')
  const [moveItem, setMoveItem] = useState<any>(null)
  const [move, setMove] = useState({ type: 'receipt', quantity: 1, reference: '', notes: '' })
  const [moveTried, setMoveTried] = useState(false)
  const [moving, setMoving] = useState(false)

  const query = search.trim().toLowerCase()
  const rows = useMemo(
    () =>
      items.filter(
        (row) =>
          (!level || stockLevel(row) === level || (level === 'low' && stockLevel(row) === 'out')) &&
          (!location || idOf(row.locationId) === location) &&
          matchesText(query, row.name, row.sku, refName(row.locationId, locations))
      ),
    [items, level, location, query, locations]
  )
  const clear = () => {
    setSearch('')
    setLevel('')
    setLocation('')
  }

  const quickAdjust = async (row: any, type: 'receipt' | 'issue') => {
    const ok = await run(`${row._id}:${type}`, () => asetsService.adjustStock(row._id, { type, quantity: 1 }), null, type === 'issue' ? 'Issue failed.' : 'Receipt failed.')
    if (ok) await reload()
  }

  const openMovement = (row: any) => {
    setMove({ type: 'receipt', quantity: 1, reference: '', notes: '' })
    setMoveTried(false)
    setMoveItem(row)
  }

  const saveMovement = async () => {
    if (!moveItem) return
    if (!Number.isFinite(move.quantity) || move.quantity === 0) {
      setMoveTried(true)
      return
    }
    setMoving(true)
    try {
      await asetsService.adjustStock(moveItem._id, move)
      toast.success('Stock updated.')
      setMoveItem(null)
      await reload()
    } catch (error: any) {
      toast.error(errMsg(error, 'Movement failed.'))
    } finally {
      setMoving(false)
    }
  }

  const columns: DataTableColumn<any>[] = [
    { key: 'name', header: 'Item', mobile: 'title', render: (row) => <EntityCell primary={row.name} secondary={row.sku ? `SKU ${row.sku}` : undefined} /> },
    { key: 'location', header: 'Location', mobile: 'subtitle', render: (row) => <span className="aw-clip">{orDash(refName(row.locationId, locations))}</span> },
    {
      key: 'onHand',
      header: 'On hand',
      numeric: true,
      align: 'right',
      render: (row) => (
        <span className="aw-qty">
          {Number(row.quantityOnHand || 0)}
          <span className="aw-qty__unit">{row.unit}</span>
        </span>
      ),
    },
    { key: 'reserved', header: 'Reserved', numeric: true, align: 'right', render: (row) => Number(row.reservedQuantity || 0) },
    { key: 'reorder', header: 'Reorder at', numeric: true, align: 'right', render: (row) => Number(row.reorderLevel || 0) },
    {
      key: 'level',
      header: 'Stock level',
      mobile: 'aside',
      render: (row) => {
        const lvl = stockLevel(row)
        return <StatusBadge status={lvl === 'out' ? 'OUT_OF_STOCK' : lvl === 'low' ? 'LOW_STOCK' : 'IN_STOCK'} />
      },
    },
    actionsColumn((row: any) => (
      <>
        <Button
          size="sm"
          variant="tertiary"
          icon={Minus}
          aria-label={`Issue 1 ${row.unit || ''} of ${row.name}`}
          title="Issue 1"
          loading={busy === `${row._id}:issue`}
          disabled={Boolean(busy)}
          onClick={() => void quickAdjust(row, 'issue')}
        />
        <Button
          size="sm"
          variant="tertiary"
          icon={Plus}
          aria-label={`Receive 1 ${row.unit || ''} of ${row.name}`}
          title="Receive 1"
          loading={busy === `${row._id}:receipt`}
          disabled={Boolean(busy)}
          onClick={() => void quickAdjust(row, 'receipt')}
        />
        <Menu label={`More actions for ${row.name}`} items={[{ label: 'Record movement', icon: ArrowLeftRight, onSelect: () => openMovement(row) }]} />
      </>
    )),
  ]

  const { form, set, tried } = sheet
  const save = () =>
    void sheet.submit(
      Boolean(form.name.trim()),
      async () => {
        await asetsService.saveStock({ ...form, openingStock: form.quantityOnHand })
        toast.success('Stock item saved.')
        await reload()
      },
      'Failed to save stock item.'
    )

  const lowCount = items.filter((row) => stockLevel(row) !== 'ok').length

  return (
    <Page>
      <div className="cb-stats">
        <StatCard label="Stock items" value={items.length} icon={Boxes} hint="Quantity-tracked consumables" />
        <StatCard label="Low stock" value={lowCount} hint="At or below reorder level" />
        <StatCard label="Out of stock" value={items.filter((row) => stockLevel(row) === 'out').length} />
        <StatCard label="Units reserved" value={items.reduce((sum, row) => sum + Number(row.reservedQuantity || 0), 0)} />
      </div>

      <RecordsCard
        toolbar={
          <FilterBar
            search={{ placeholder: 'Search item, SKU or location', value: search, onChange: setSearch, label: 'Search stock' }}
            filters={
              <>
                <FilterSelect label="Stock level" value={level} onChange={setLevel} placeholder="Any stock level" options={STOCK_LEVELS} />
                <FilterSelect label="Location" value={location} onChange={setLocation} placeholder="All locations" options={locations.map(locationOption(false))} />
              </>
            }
            actions={
              <Button variant="primary" icon={Plus} onClick={sheet.show}>
                Add stock item
              </Button>
            }
          />
        }
      >
        <DataTable
          caption="Stock items"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row._id}
          loading={loading}
          loadingLabel="Loading stock…"
          empty={
            <ListEmpty
              total={items.length}
              icon={Boxes}
              title="No consumable stock items"
              body="Add a stock item for consumables counted by quantity. Individually tracked assets stay in All assets."
              filteredTitle="No stock items match these filters"
              onClear={clear}
            />
          }
        />
      </RecordsCard>

      <FormSheet
        open={sheet.open}
        onClose={sheet.hide}
        title="Add stock item"
        description="For consumables counted by quantity. Individually tracked assets stay in All assets."
        icon={Boxes}
        submitLabel="Add stock item"
        saving={sheet.saving}
        onSubmit={save}
      >
        <TextField
          className="is-wide"
          label="Item name"
          required
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={tried && !form.name.trim() ? 'Enter the item name.' : undefined}
        />
        <TextField label="SKU" value={form.sku} onChange={(e) => set('sku', e.target.value)} />
        <TextField label="Unit" value={form.unit} onChange={(e) => set('unit', e.target.value)} placeholder="pcs" />
        <TextField label="Opening quantity" type="number" inputMode="numeric" value={form.quantityOnHand} onChange={(e) => set('quantityOnHand', Number(e.target.value))} />
        <TextField label="Reorder level" type="number" inputMode="numeric" value={form.reorderLevel} onChange={(e) => set('reorderLevel', Number(e.target.value))} hint="Flagged as low stock at or below this" />
        <Select className="is-wide" label="Location" value={form.locationId} onChange={(e) => set('locationId', e.target.value)} placeholder="No location" options={locations.map(locationOption(false))} />
        <Select
          label="Category"
          value={form.categoryId}
          onChange={(e) => set('categoryId', e.target.value)}
          placeholder="No category"
          options={categories.filter((c) => !c.parentId).map(nameOption)}
        />
        <Select label="Vendor" value={form.vendorId} onChange={(e) => set('vendorId', e.target.value)} placeholder="No vendor" options={vendors.map(nameOption)} />
      </FormSheet>

      <Sheet
        open={Boolean(moveItem)}
        onClose={() => !moving && setMoveItem(null)}
        title="Record stock movement"
        description={moveItem ? `${moveItem.name} · ${Number(moveItem.quantityOnHand || 0)} ${moveItem.unit || ''} on hand` : undefined}
        icon={ArrowLeftRight}
        onSubmit={(event) => {
          event.preventDefault()
          void saveMovement()
        }}
        footer={
          <>
            <Button onClick={() => setMoveItem(null)} disabled={moving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={moving}>
              Record movement
            </Button>
          </>
        }
      >
        <div className="cb-form-grid">
          <Select className="is-wide" label="Movement" value={move.type} onChange={(e) => setMove({ ...move, type: e.target.value })} options={MOVEMENT_TYPES} />
          <TextField
            label="Quantity"
            type="number"
            inputMode="numeric"
            required
            value={move.quantity}
            onChange={(e) => setMove({ ...move, quantity: Number(e.target.value) })}
            hint={move.type === 'adjustment' ? 'Use a negative number to reduce stock.' : undefined}
            error={moveTried && (!Number.isFinite(move.quantity) || move.quantity === 0) ? 'Enter a quantity other than 0.' : undefined}
          />
          <TextField label="Reference" value={move.reference} onChange={(e) => setMove({ ...move, reference: e.target.value })} placeholder="Slip or request number" />
          <TextArea className="is-wide" label="Notes" value={move.notes} onChange={(e) => setMove({ ...move, notes: e.target.value })} />
        </div>
      </Sheet>
    </Page>
  )
}

/* ============================== Audits ============================== */

const AUDIT_SCOPES = ['Full', 'Campus', 'Building', 'Department', 'Classroom', 'Category', 'Custom']
const AUDIT_STATUSES = ['Draft', 'In Progress', 'Closed']
const AUDIT_ITEM_STATES = ['Verified', 'Missing', 'Damaged', 'Wrong Location', 'Not Found', 'Unverified']

export const AsetsAudits: React.FC = () => {
  const { locations, categories } = useLookups()
  const { items: audits, loading, reload } = useRecords(() => asetsService.listAudits(), 'Failed to load audits.')
  const sheet = useFormSheet({ title: '', scopeType: 'Full', locationId: '', categoryId: '' })
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<any>(null)
  const [scanCode, setScanCode] = useState('')
  const [scanning, setScanning] = useState(false)
  const [itemBusy, setItemBusy] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [closing, setClosing] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [itemState, setItemState] = useState('')
  const scanRef = useRef<HTMLInputElement>(null)

  const openAudit = async (id: string) => {
    setSelectedId(id)
    try {
      setSelected(await asetsService.getAudit(id))
    } catch (error: any) {
      toast.error(errMsg(error, 'Failed to load audit.'))
    }
  }
  const showAudit = (id: string) => {
    setSelected(null)
    setScanCode('')
    setItemSearch('')
    setItemState('')
    setConfirmClose(false)
    void openAudit(id)
  }
  const hideAudit = () => {
    if (closing) return
    setSelectedId(null)
    setSelected(null)
  }

  const query = search.trim().toLowerCase()
  const rows = useMemo(
    () => audits.filter((row) => (!status || row.status === status) && matchesText(query, row.title, row.scopeType)),
    [audits, status, query]
  )
  const clear = () => {
    setSearch('')
    setStatus('')
  }

  const auditItems: any[] = selected?.items || []
  const itemQuery = itemSearch.trim().toLowerCase()
  const visibleItems = useMemo(
    () =>
      auditItems.filter(
        (item) =>
          (!itemState || item.state === itemState) &&
          matchesText(itemQuery, item.assetId?.assetId, item.assetId?.name, refName(item.expectedLocationId, locations))
      ),
    [auditItems, itemState, itemQuery, locations]
  )

  const isClosed = selected?.audit?.status === 'Closed'

  const scan = async () => {
    if (!selected || !scanCode.trim()) return
    setScanning(true)
    try {
      await asetsService.scanAudit(selected.audit._id, { code: scanCode })
      toast.success('Scan recorded.')
      setScanCode('')
      await openAudit(selected.audit._id)
    } catch (error: any) {
      toast.error(errMsg(error, 'Scan failed.'))
    } finally {
      setScanning(false)
      scanRef.current?.focus()
    }
  }

  const setItem = async (item: any, state: string) => {
    if (!selected) return
    setItemBusy(item._id)
    try {
      await asetsService.updateAuditItem(selected.audit._id, item._id, { state })
      await openAudit(selected.audit._id)
    } catch (error: any) {
      toast.error(errMsg(error, 'Update failed.'))
    } finally {
      setItemBusy(null)
    }
  }

  const closeAudit = async () => {
    if (!selected) return
    setClosing(true)
    try {
      await asetsService.closeAudit(selected.audit._id)
      toast.success('Audit closed.')
      setConfirmClose(false)
      await reload()
      await openAudit(selected.audit._id)
    } catch (error: any) {
      toast.error(errMsg(error, 'Failed to close audit.'))
    } finally {
      setClosing(false)
    }
  }

  const columns: DataTableColumn<any>[] = [
    { key: 'title', header: 'Audit', mobile: 'title', render: (row) => <EntityCell primary={row.title} secondary={`${row.scopeType || 'Full'} scope`} /> },
    { key: 'started', header: 'Started', mobile: 'subtitle', render: (row) => formatDate(row.startedAt || row.createdAt) },
    { key: 'expected', header: 'Expected', numeric: true, align: 'right', render: (row) => row.summary?.expected || 0 },
    { key: 'found', header: 'Found', numeric: true, align: 'right', render: (row) => row.summary?.found || 0 },
    { key: 'missing', header: 'Missing', numeric: true, align: 'right', render: (row) => row.summary?.missing || 0 },
    { key: 'status', header: 'Status', mobile: 'aside', render: (row) => <StatusBadge status={row.status} /> },
    actionsColumn((row: any) => (
      <Button size="sm" onClick={() => showAudit(row._id)}>
        {row.status === 'Closed' ? 'View' : 'Continue'}
      </Button>
    )),
  ]

  const itemColumns: DataTableColumn<any>[] = [
    { key: 'asset', header: 'Asset', mobile: 'title', render: (item) => <AssetCell asset={item.assetId} /> },
    { key: 'expected', header: 'Expected location', mobile: 'subtitle', render: (item) => orDash(refName(item.expectedLocationId, locations) || 'No expected location') },
    {
      key: 'state',
      header: 'State',
      mobile: 'aside',
      interactive: true,
      render: (item) =>
        isClosed ? (
          <StatusBadge status={item.state} />
        ) : (
          <Select
            aria-label={`State of ${item.assetId?.assetId || 'asset'}`}
            size="sm"
            className="aw-state-select"
            value={item.state}
            disabled={itemBusy === item._id}
            onChange={(e) => void setItem(item, e.target.value)}
            options={AUDIT_ITEM_STATES}
          />
        ),
    },
  ]

  const { form, set, tried } = sheet
  const save = async () => {
    let newId = ''
    const ok = await sheet.submit(
      Boolean(form.title.trim()),
      async () => {
        const res = await asetsService.createAudit(form)
        newId = res.data.data._id
        toast.success('Audit started.')
        await reload()
      },
      'Failed to start audit.'
    )
    if (ok && newId) showAudit(newId)
  }

  const summary = selected?.audit?.summary || {}
  const metrics = [
    { label: 'Expected', value: summary.expected },
    { label: 'Found', value: summary.found },
    { label: 'Missing', value: summary.missing },
    { label: 'Damaged', value: summary.damaged },
    { label: 'Wrong location', value: summary.wrongLocation },
    { label: 'Unverified', value: summary.unverified },
  ]

  return (
    <Page>
      <div className="cb-stats">
        <StatCard label="Audits" value={audits.length} icon={ClipboardCheck} />
        <StatCard label="In progress" value={countBy(audits, 'status', 'In Progress')} />
        <StatCard label="Closed" value={countBy(audits, 'status', 'Closed')} />
        <StatCard label="Missing across audits" value={audits.reduce((sum, row) => sum + Number(row.summary?.missing || 0), 0)} />
      </div>

      <RecordsCard
        toolbar={
          <FilterBar
            search={{ placeholder: 'Search audits', value: search, onChange: setSearch, label: 'Search audits' }}
            filters={<FilterSelect label="Status" value={status} onChange={setStatus} placeholder="All statuses" options={toOptions(AUDIT_STATUSES)} />}
            actions={
              <Button variant="primary" icon={Plus} onClick={sheet.show}>
                Start audit
              </Button>
            }
          />
        }
      >
        <DataTable
          caption="Audits"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row._id}
          onRowClick={(row) => showAudit(row._id)}
          loading={loading}
          loadingLabel="Loading audits…"
          empty={
            <ListEmpty
              total={audits.length}
              icon={ClipboardCheck}
              title="No audits yet"
              body="Start an audit to verify which assets are where they should be."
              filteredTitle="No audits match these filters"
              onClear={clear}
            />
          }
        />
      </RecordsCard>

      <FormSheet
        open={sheet.open}
        onClose={sheet.hide}
        title="Start audit"
        description="Every asset in scope is listed as expected. Scan or mark each one as you verify it."
        icon={ClipboardCheck}
        submitLabel="Start audit"
        saving={sheet.saving}
        onSubmit={() => void save()}
      >
        <TextField
          className="is-wide"
          label="Audit title"
          required
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          placeholder="For example, Science block — term 1"
          error={tried && !form.title.trim() ? 'Enter a title.' : undefined}
        />
        <Select className="is-wide" label="Scope" value={form.scopeType} onChange={(e) => set('scopeType', e.target.value)} options={AUDIT_SCOPES} />
        <Select label="Location" value={form.locationId} onChange={(e) => set('locationId', e.target.value)} placeholder="All locations" options={locations.map(locationOption(false))} />
        <Select
          label="Category"
          value={form.categoryId}
          onChange={(e) => set('categoryId', e.target.value)}
          placeholder="All categories"
          options={categories.filter((c) => !c.parentId).map(nameOption)}
        />
      </FormSheet>

      <Sheet
        open={Boolean(selectedId)}
        onClose={hideAudit}
        size="xl"
        icon={ClipboardCheck}
        title={selected?.audit?.title || 'Audit'}
        description={
          selected?.audit
            ? `${selected.audit.scopeType || 'Full'} scope · started ${formatDate(selected.audit.startedAt || selected.audit.createdAt)} · ${sentence(selected.audit.status)}`
            : undefined
        }
        footer={
          !selected ? undefined : isClosed ? (
            <Button onClick={hideAudit}>Done</Button>
          ) : confirmClose ? (
            <div className="aw-confirm">
              <span className="aw-confirm__text">Closing locks every item state and finalises the summary.</span>
              <Button onClick={() => setConfirmClose(false)} disabled={closing}>
                Keep open
              </Button>
              <Button variant="danger" loading={closing} onClick={() => void closeAudit()}>
                Close audit
              </Button>
            </div>
          ) : (
            <>
              <Button onClick={hideAudit}>Done</Button>
              <Button icon={ShieldCheck} onClick={() => setConfirmClose(true)}>
                Close audit
              </Button>
            </>
          )
        }
      >
        {!selected ? (
          <Loading label="Loading audit…" />
        ) : (
          <div className="aw-audit">
            <dl className="aw-audit__summary" aria-label="Audit summary">
              {metrics.map((metric) => (
                <div key={metric.label} className="aw-audit__metric">
                  <dt>{metric.label}</dt>
                  <dd>{Number(metric.value || 0)}</dd>
                </div>
              ))}
            </dl>

            {!isClosed ? (
              <form
                className="aw-scan"
                onSubmit={(event) => {
                  event.preventDefault()
                  void scan()
                }}
              >
                <TextField
                  ref={scanRef}
                  label="Scan or enter a code"
                  icon={ScanLine}
                  autoFocus
                  value={scanCode}
                  onChange={(e) => setScanCode(e.target.value)}
                  placeholder="Asset ID, barcode or QR payload"
                  autoComplete="off"
                />
                <Button type="submit" variant="primary" loading={scanning} disabled={!scanCode.trim()}>
                  Record scan
                </Button>
              </form>
            ) : null}

            <FilterBar
              search={{ placeholder: 'Search assets in this audit', value: itemSearch, onChange: setItemSearch, label: 'Search audit items' }}
              filters={<FilterSelect label="State" value={itemState} onChange={setItemState} placeholder="Any state" options={toOptions(AUDIT_ITEM_STATES)} />}
            />

            <DataTable
              caption="Audit items"
              columns={itemColumns}
              rows={visibleItems}
              getRowKey={(item) => item._id}
              maxHeight="480px"
              empty={
                auditItems.length === 0 ? (
                  <EmptyState icon={Package} title="No assets in this audit's scope" body="Start a new audit with a wider scope to include more assets." compact />
                ) : (
                  <EmptyState icon={SearchX} title="No assets match these filters" compact />
                )
              }
            />
          </div>
        )}
      </Sheet>
    </Page>
  )
}

/* ============================== Procurement ============================== */

const PROCUREMENT_STATUSES = ['Draft', 'Requested', 'Ordered', 'Received', 'Cancelled']
const TRACKING_OPTIONS = [
  { value: 'individual', label: 'Individual assets' },
  { value: 'consumable', label: 'Consumable stock' },
]

export const AsetsProcurement: React.FC = () => {
  const { vendors, categories, locations } = useLookups()
  const { items, loading, reload } = useRecords(() => asetsService.listProcurement(), 'Failed to load procurement.')
  const sheet = useFormSheet({
    title: '', itemName: '', vendorId: '', categoryId: '', locationId: '', quantity: 1, unitCost: 0, trackingMode: 'individual', generateAssets: true, purchaseOrder: '',
  })
  const { busy, run } = useRowAction()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [receiving, setReceiving] = useState<any>(null)

  const query = search.trim().toLowerCase()
  const rows = useMemo(
    () =>
      items.filter(
        (row) =>
          (!status || row.status === status) &&
          matchesText(query, row.title, row.itemName, row.purchaseOrder, row.requestNumber, refName(row.vendorId, vendors))
      ),
    [items, status, query, vendors]
  )
  const clear = () => {
    setSearch('')
    setStatus('')
  }
  const openCount = items.filter((row) => !['Received', 'Cancelled'].includes(row.status)).length

  const receive = async () => {
    if (!receiving) return
    const row = receiving
    const ok = await run(row._id, () => asetsService.receiveProcurement(row._id), 'Received.', 'Receipt failed.')
    setReceiving(null)
    if (ok) await reload()
  }

  const columns: DataTableColumn<any>[] = [
    { key: 'title', header: 'Request', mobile: 'title', render: (row) => <EntityCell primary={row.title} secondary={row.itemName || row.purchaseOrder} /> },
    { key: 'vendor', header: 'Vendor', mobile: 'subtitle', render: (row) => orDash(refName(row.vendorId, vendors)) },
    { key: 'quantity', header: 'Qty', numeric: true, align: 'right', render: (row) => Number(row.quantity || 0) },
    { key: 'total', header: 'Total', numeric: true, align: 'right', render: (row) => formatINR(Number(row.totalCost || 0)) },
    { key: 'tracking', header: 'Tracking', render: (row) => (row.trackingMode === 'consumable' ? 'Consumable stock' : 'Individual assets') },
    { key: 'status', header: 'Status', mobile: 'aside', render: (row) => <StatusBadge status={row.status} /> },
    actionsColumn((row: any) =>
      row.status !== 'Received' ? (
        <Button size="sm" icon={PackageCheck} loading={busy === row._id} onClick={() => setReceiving(row)}>
          Receive
        </Button>
      ) : null
    ),
  ]

  const { form, set, tried } = sheet
  const save = () =>
    void sheet.submit(
      Boolean(form.title.trim()),
      async () => {
        await asetsService.createProcurement(form)
        toast.success('Procurement saved.')
        await reload()
      },
      'Failed to save the request.'
    )

  return (
    <Page>
      <div className="cb-stats">
        <StatCard label="Open requests" value={openCount} icon={ShoppingCart} />
        <StatCard label="Received" value={countBy(items, 'status', 'Received')} />
        <StatCard label="Cancelled" value={countBy(items, 'status', 'Cancelled')} />
        <StatCard
          label="Value received"
          value={formatINR(items.filter((row) => row.status === 'Received').reduce((sum, row) => sum + Number(row.totalCost || 0), 0), { compact: true })}
        />
      </div>

      <RecordsCard
        toolbar={
          <FilterBar
            search={{ placeholder: 'Search title, item, vendor or PO', value: search, onChange: setSearch, label: 'Search procurement' }}
            filters={<FilterSelect label="Status" value={status} onChange={setStatus} placeholder="All statuses" options={toOptions(PROCUREMENT_STATUSES)} />}
            actions={
              <Button variant="primary" icon={Plus} onClick={sheet.show}>
                Raise purchase request
              </Button>
            }
          />
        }
      >
        <DataTable
          caption="Procurement"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row._id}
          loading={loading}
          loadingLabel="Loading procurement…"
          empty={
            <ListEmpty
              total={items.length}
              icon={ShoppingCart}
              title="No purchase requests yet"
              body="Raise a purchase request; receiving it creates the assets or stock."
              filteredTitle="No requests match these filters"
              onClear={clear}
            />
          }
        />
      </RecordsCard>

      <FormSheet
        open={sheet.open}
        onClose={sheet.hide}
        title="Raise purchase request"
        description="Receiving the request later generates individual assets or adds consumable stock."
        icon={ShoppingCart}
        submitLabel="Raise request"
        saving={sheet.saving}
        onSubmit={save}
      >
        <TextField
          className="is-wide"
          label="Title"
          required
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          error={tried && !form.title.trim() ? 'Enter a title.' : undefined}
        />
        <TextField label="Item name" value={form.itemName} onChange={(e) => set('itemName', e.target.value)} />
        <TextField label="Purchase order" value={form.purchaseOrder} onChange={(e) => set('purchaseOrder', e.target.value)} placeholder="PO number" />
        <Select label="Vendor" value={form.vendorId} onChange={(e) => set('vendorId', e.target.value)} placeholder="No vendor" options={vendors.map(nameOption)} />
        <Select
          label="Category"
          value={form.categoryId}
          onChange={(e) => set('categoryId', e.target.value)}
          placeholder="No category"
          options={categories.filter((c) => !c.parentId).map(nameOption)}
        />
        <Select
          className="is-wide"
          label="Receive into location"
          value={form.locationId}
          onChange={(e) => set('locationId', e.target.value)}
          placeholder="No location"
          options={locations.map(locationOption(false))}
        />
        <TextField label="Quantity" type="number" inputMode="numeric" value={form.quantity} onChange={(e) => set('quantity', Number(e.target.value))} />
        <TextField label="Unit cost" type="number" inputMode="decimal" prefix="₹" value={form.unitCost} onChange={(e) => set('unitCost', Number(e.target.value))} />
        <Select className="is-wide" label="Track as" value={form.trackingMode} onChange={(e) => set('trackingMode', e.target.value)} options={TRACKING_OPTIONS} />
        <div className="aw-sheet-total is-wide">
          <span>Estimated total</span>
          <strong>{formatINR(Number(form.quantity || 0) * Number(form.unitCost || 0))}</strong>
        </div>
      </FormSheet>

      <Dialog
        open={Boolean(receiving)}
        onClose={() => !busy && setReceiving(null)}
        title="Receive this order?"
        description={
          receiving
            ? receiving.trackingMode === 'consumable'
              ? `${Number(receiving.quantity || 0)} units of "${receiving.itemName || receiving.title}" will be added to stock.`
              : `${Number(receiving.quantity || 0)} individual assets will be created for "${receiving.itemName || receiving.title}".`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button onClick={() => setReceiving(null)} disabled={Boolean(busy)}>
              Cancel
            </Button>
            <Button variant="primary" icon={PackageCheck} loading={Boolean(busy)} onClick={() => void receive()}>
              Receive order
            </Button>
          </>
        }
      />
    </Page>
  )
}

/* ============================== Disposals ============================== */

const DISPOSAL_STATUSES = ['Pending', 'Approved', 'Completed', 'Rejected']

export const AsetsDisposals: React.FC = () => {
  const { assets } = useLookups()
  const { items, loading, reload } = useRecords(() => asetsService.listDisposals(), 'Failed to load disposals.')
  const sheet = useFormSheet({ assetId: '', reason: 'Beyond repair', method: 'Scrapped', residualValue: 0, approvedBy: '', notes: '' })
  const { busy, run } = useRowAction()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [reason, setReason] = useState('')
  const [approving, setApproving] = useState<any>(null)

  const query = search.trim().toLowerCase()
  const rows = useMemo(
    () =>
      items.filter(
        (row) =>
          (!status || row.status === status) &&
          (!reason || row.reason === reason) &&
          matchesText(query, row.assetId?.assetId, row.assetId?.name, row.reason, row.method, row.approvedBy)
      ),
    [items, status, reason, query]
  )
  const clear = () => {
    setSearch('')
    setStatus('')
    setReason('')
  }

  const approve = async () => {
    if (!approving) return
    const row = approving
    const ok = await run(row._id, () => asetsService.approveDisposal(row._id, { approvedBy: 'admin' }), 'Approved.', 'Approval failed.')
    setApproving(null)
    if (ok) await reload()
  }

  const columns: DataTableColumn<any>[] = [
    { key: 'asset', header: 'Asset', mobile: 'title', render: (row) => <AssetCell asset={row.assetId} /> },
    { key: 'reason', header: 'Reason', mobile: 'subtitle', render: (row) => orDash(row.reason) },
    { key: 'method', header: 'Method', render: (row) => orDash(row.method) },
    { key: 'residual', header: 'Residual value', numeric: true, align: 'right', render: (row) => formatINR(Number(row.residualValue || 0)) },
    { key: 'date', header: 'Date', render: (row) => formatDate(row.disposalDate) },
    { key: 'status', header: 'Status', mobile: 'aside', render: (row) => <StatusBadge status={row.status} /> },
    actionsColumn((row: any) =>
      row.status === 'Pending' ? (
        <Button size="sm" loading={busy === row._id} onClick={() => setApproving(row)}>
          Approve
        </Button>
      ) : null
    ),
  ]

  const { form, set, tried } = sheet
  const save = () =>
    void sheet.submit(
      Boolean(form.assetId),
      async () => {
        await asetsService.createDisposal(form)
        toast.success('Disposal submitted.')
        await reload()
      },
      'Failed to record disposal.'
    )

  return (
    <Page>
      <div className="cb-stats">
        <StatCard label="Pending approval" value={countBy(items, 'status', 'Pending')} icon={Trash2} />
        <StatCard label="Disposed" value={countBy(items, 'status', 'Completed') + countBy(items, 'status', 'Approved')} />
        <StatCard label="Rejected" value={countBy(items, 'status', 'Rejected')} />
        <StatCard label="Residual value" value={formatINR(items.reduce((sum, row) => sum + Number(row.residualValue || 0), 0), { compact: true })} />
      </div>

      <RecordsCard
        toolbar={
          <FilterBar
            search={{ placeholder: 'Search asset, reason or method', value: search, onChange: setSearch, label: 'Search disposals' }}
            filters={
              <>
                <FilterSelect label="Status" value={status} onChange={setStatus} placeholder="All statuses" options={toOptions(DISPOSAL_STATUSES)} />
                <FilterSelect label="Reason" value={reason} onChange={setReason} placeholder="Any reason" options={DISPOSAL_REASONS.map((r) => ({ value: r, label: r }))} />
              </>
            }
            actions={
              <Button variant="primary" icon={Plus} onClick={sheet.show}>
                Record disposal
              </Button>
            }
          />
        }
      >
        <DataTable
          caption="Disposals"
          columns={columns}
          rows={rows}
          getRowKey={(row) => row._id}
          loading={loading}
          loadingLabel="Loading disposals…"
          empty={
            <ListEmpty
              total={items.length}
              icon={Trash2}
              title="No disposals recorded"
              body="Record a disposal when an asset is scrapped, sold or donated. Its history is kept."
              filteredTitle="No disposals match these filters"
              onClear={clear}
            />
          }
        />
      </RecordsCard>

      <FormSheet
        open={sheet.open}
        onClose={sheet.hide}
        title="Record disposal"
        description="The asset's history is kept after it is disposed."
        icon={Trash2}
        submitLabel="Submit disposal"
        saving={sheet.saving}
        onSubmit={save}
      >
        <Select
          className="is-wide"
          label="Asset"
          required
          value={form.assetId}
          onChange={(e) => set('assetId', e.target.value)}
          placeholder="Select asset"
          options={assets.filter((a) => a.status !== 'DISPOSED').map(assetOption)}
          error={tried && !form.assetId ? 'Choose an asset.' : undefined}
        />
        <Select label="Reason" value={form.reason} onChange={(e) => set('reason', e.target.value)} options={[...DISPOSAL_REASONS]} />
        <TextField label="Method" value={form.method} onChange={(e) => set('method', e.target.value)} />
        <TextField label="Residual value" type="number" inputMode="decimal" prefix="₹" value={form.residualValue} onChange={(e) => set('residualValue', Number(e.target.value))} />
        <TextField label="Approved by" value={form.approvedBy} onChange={(e) => set('approvedBy', e.target.value)} hint="Fill in to complete the disposal straight away." />
        <TextArea className="is-wide" label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </FormSheet>

      <Dialog
        open={Boolean(approving)}
        onClose={() => !busy && setApproving(null)}
        tone="danger"
        size="sm"
        title="Approve this disposal?"
        description={
          approving
            ? `${approving.assetId?.assetId || 'The asset'}${approving.assetId?.name ? ` (${approving.assetId.name})` : ''} will be marked as disposed. Its history is kept.`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setApproving(null)} disabled={Boolean(busy)}>
              Cancel
            </Button>
            <Button variant="danger" loading={Boolean(busy)} onClick={() => void approve()}>
              Approve disposal
            </Button>
          </>
        }
      />
    </Page>
  )
}

/* ============================== Reports ============================== */

type ReportDef = { id: string; title: string; description: string; group: string; icon: LucideIcon }

const REPORTS: ReportDef[] = [
  { id: 'register', title: 'Asset register', description: 'Every asset with its location and status', group: 'register', icon: ClipboardList },
  { id: 'by-category', title: 'By category', description: 'Asset counts grouped by category', group: 'register', icon: FolderTree },
  { id: 'by-location', title: 'By location', description: 'What sits in each room and building', group: 'register', icon: MapPin },
  { id: 'by-department', title: 'By department', description: 'Assets held by each department', group: 'register', icon: Building2 },
  { id: 'by-custodian', title: 'By custodian', description: 'Assets in each person’s care', group: 'register', icon: UserRound },
  { id: 'valuation', title: 'Valuation', description: 'Purchase cost and current book value', group: 'register', icon: IndianRupee },
  { id: 'maintenance', title: 'Maintenance', description: 'Repairs, services and their costs', group: 'operations', icon: Wrench },
  { id: 'warranty', title: 'Warranty', description: 'Warranties and their expiry dates', group: 'operations', icon: ShieldCheck },
  { id: 'transfers', title: 'Transfers', description: 'Moves between locations', group: 'operations', icon: ArrowLeftRight },
  { id: 'audits', title: 'Audits', description: 'Physical verification results', group: 'operations', icon: ClipboardCheck },
  { id: 'procurement', title: 'Procurement', description: 'Purchase requests and receipts', group: 'operations', icon: ShoppingCart },
  { id: 'missing', title: 'Missing assets', description: 'Assets not found in audits', group: 'exceptions', icon: SearchX },
  { id: 'damaged', title: 'Damaged assets', description: 'Assets marked damaged', group: 'exceptions', icon: AlertTriangle },
  { id: 'disposal', title: 'Disposals', description: 'Scrapped, sold or donated assets', group: 'exceptions', icon: Trash2 },
  { id: 'stock', title: 'Stock levels', description: 'Consumables on hand and reorder points', group: 'history', icon: Boxes },
  { id: 'lifecycle', title: 'Lifecycle events', description: 'Every change recorded on assets', group: 'history', icon: History },
]

const REPORT_GROUPS = [
  { id: 'all', label: 'All reports' },
  { id: 'register', label: 'Register' },
  { id: 'operations', label: 'Operations' },
  { id: 'exceptions', label: 'Exceptions' },
  { id: 'history', label: 'Stock and history' },
]

const humanizeKey = (key: string) => sentence(key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\bid\b/i, 'ID'))

const reportCellText = (value: any): string => {
  if (value == null || value === '') return '—'
  if (typeof value === 'object') return String(value.name || value.assetId || JSON.stringify(value).slice(0, 80))
  return String(value)
}

const csvEscape = (text: string) => (/[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)

export const AsetsReports: React.FC = () => {
  const [type, setType] = useState('register')
  const [group, setGroup] = useState('all')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const load = async (reportType = type) => {
    setLoading(true)
    try {
      const data = await asetsService.getReport(reportType)
      setRows(Array.isArray(data.rows) ? data.rows : [])
    } catch (error: any) {
      toast.error(errMsg(error, 'Failed to load report.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load('register')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = REPORTS.find((report) => report.id === type) || REPORTS[0]
  const tiles = group === 'all' ? REPORTS : REPORTS.filter((report) => report.group === group)
  const keys = useMemo(() => Object.keys(rows[0] || {}).slice(0, 8), [rows])
  const query = search.trim().toLowerCase()
  const filtered = useMemo(
    () => (query ? rows.filter((row) => keys.some((key) => reportCellText(row[key]).toLowerCase().includes(query))) : rows),
    [rows, keys, query]
  )
  const shown = filtered.slice(0, 200)

  const columns: DataTableColumn<any>[] = keys.map((key, index) => ({
    key,
    header: humanizeKey(key),
    mobile: index === 0 ? 'title' : index === 1 ? 'subtitle' : undefined,
    render: (row) => {
      const text = reportCellText(row[key])
      return (
        <span className="aw-report-cell" title={text}>
          {text}
        </span>
      )
    },
  }))

  const exportCsv = () => {
    const allKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row || {}))))
    const lines = [
      allKeys.map((key) => csvEscape(key)).join(','),
      ...filtered.map((row) => allKeys.map((key) => csvEscape(row[key] == null ? '' : reportCellText(row[key]))).join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `asets-${type}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const pick = (id: string) => {
    setType(id)
    setSearch('')
    void load(id)
  }

  return (
    <Page>
      <FilterBar
        chips={REPORT_GROUPS.map((g) => ({ id: g.id, label: g.label, active: group === g.id }))}
        onChipClick={setGroup}
        chipsLabel="Report groups"
      />

      <div className="aw-tiles" role="list" aria-label="Reports">
        {tiles.map((report) => (
          <div role="listitem" key={report.id}>
            <button
              type="button"
              className={cx('aw-tile', report.id === type && 'is-active')}
              aria-pressed={report.id === type}
              onClick={() => pick(report.id)}
            >
              <span className="aw-tile__icon" aria-hidden="true">
                <Icon icon={report.icon} size={16} />
              </span>
              <span className="aw-tile__text">
                <span className="aw-tile__title">{report.title}</span>
                <span className="aw-tile__desc">{report.description}</span>
              </span>
            </button>
          </div>
        ))}
      </div>

      <Card
        flush
        className="aw-card"
        title={active.title}
        subtitle={loading ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'row' : 'rows'} from live ASETS data`}
        action={
          <Button variant="primary" icon={Download} onClick={exportCsv} disabled={loading || filtered.length === 0}>
            Export CSV
          </Button>
        }
      >
        <div className="aw-toolbar">
          <FilterBar search={{ placeholder: `Search ${active.title.toLowerCase()}`, value: search, onChange: setSearch, label: 'Search report rows' }} />
        </div>
        <DataTable
          caption={active.title}
          columns={columns.length ? columns : [{ key: 'info', header: 'Info' }]}
          rows={loading ? [] : shown}
          getRowKey={(row) => String(row._id || rows.indexOf(row))}
          loading={loading}
          loadingLabel="Loading report…"
          footer={!loading && filtered.length > 200 ? `Showing the first 200 of ${filtered.length} rows. Export CSV for all of them.` : undefined}
          empty={
            rows.length === 0 ? (
              <EmptyState icon={active.icon} title="No rows for this report" body="Records appear here as assets are added and moved." compact />
            ) : (
              <EmptyState
                icon={SearchX}
                title="No rows match this search"
                action={
                  <Button size="sm" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                }
                compact
              />
            )
          }
        />
      </Card>
    </Page>
  )
}

/* ============================== Settings ============================== */

export const AsetsSettings: React.FC = () => {
  const [form, setForm] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void asetsService.getSettings().then(setForm).catch(() => toast.error('Failed to load settings.'))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await asetsService.updateSettings(form)
      toast.success('Settings saved.')
    } catch (error: any) {
      toast.error(errMsg(error, 'Failed to save settings.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page>
      <div className="aw-settings">
        <Card
          title="Module settings"
          subtitle="Defaults for alerts, approvals and stock rules across ASETS."
          footer={
            form ? (
              <div className="aw-settings__foot">
                <Button variant="primary" loading={saving} onClick={() => void save()}>
                  Save settings
                </Button>
              </div>
            ) : undefined
          }
        >
          {!form ? (
            <Loading label="Loading settings…" />
          ) : (
            <>
              <div className="cb-form-section">
                <h3 className="cb-form-section__title">Alerts</h3>
                <div className="cb-form-grid">
                  <TextField
                    label="Warranty alert"
                    type="number"
                    inputMode="numeric"
                    suffix="days"
                    value={form.defaultWarrantyAlertDays || 30}
                    onChange={(e) => setForm({ ...form, defaultWarrantyAlertDays: Number(e.target.value) })}
                    hint="Warn this many days before a warranty ends"
                  />
                  <TextField
                    label="Audit due after"
                    type="number"
                    inputMode="numeric"
                    suffix="days"
                    value={form.auditDueDays || 365}
                    onChange={(e) => setForm({ ...form, auditDueDays: Number(e.target.value) })}
                    hint="Time between physical audits"
                  />
                </div>
              </div>
              <div className="cb-form-section">
                <h3 className="cb-form-section__title">Approvals</h3>
                <Checkbox
                  label="Require approval for disposals"
                  description="Disposals stay pending until someone approves them."
                  checked={form.requireApprovalForDisposal !== false}
                  onChange={(checked) => setForm({ ...form, requireApprovalForDisposal: checked })}
                />
                <Checkbox
                  label="Require approval for transfers"
                  description="Transfers stay pending until someone approves them."
                  checked={Boolean(form.requireApprovalForTransfer)}
                  onChange={(checked) => setForm({ ...form, requireApprovalForTransfer: checked })}
                />
              </div>
              <div className="cb-form-section">
                <h3 className="cb-form-section__title">Stock</h3>
                <Checkbox
                  label="Allow negative stock"
                  description="Lets an issue go through even when it takes the quantity below zero."
                  checked={Boolean(form.allowNegativeStock)}
                  onChange={(checked) => setForm({ ...form, allowNegativeStock: checked })}
                />
              </div>
            </>
          )}
        </Card>
      </div>
    </Page>
  )
}
