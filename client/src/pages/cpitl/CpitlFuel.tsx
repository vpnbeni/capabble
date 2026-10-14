import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Download, Fuel, Gauge, Pencil, Plus, Route, Trash2, Truck, Wallet } from 'lucide-react'
import {
  Badge,
  Banner,
  BulkBar,
  BulkResultDialog,
  Button,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Menu,
  Page,
  Select,
  Sheet,
  StatCard,
  Tabs,
  TextArea,
  TextField,
  useRowSelection,
  type BulkResult,
  type DataTableColumn,
} from '@/components/ui'
import { useFuelAnalytics, useFuelLogs, useFuelVehicles, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { Attachment, FuelLog, FuelVehicle, PaymentMode, VehicleFuelStats } from '@/services/cpitlService'
import cpitlBulkService from '@/services/cpitlBulkService'
import AttachmentInput from '@/components/cpitl/AttachmentInput'
import { todayIso } from '@/components/cpitl/QuickExpenseSheet'
import { MODE_LABELS, MONTHS, errorMessage, fmtDate, inr, inrShort } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/utilities.css'

type Tab = 'log' | 'vehicles' | 'projection'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'log', label: 'Fuel log' },
  { id: 'vehicles', label: 'Per vehicle' },
  { id: 'projection', label: 'Next-year budget' },
]

const FUEL_OPTIONS = [
  { value: 'diesel', label: 'Diesel' },
  { value: 'petrol', label: 'Petrol' },
  { value: 'cng', label: 'CNG' },
  { value: 'ev', label: 'EV charging' },
]

const MODE_OPTIONS = (['cash', 'upi', 'card', 'bank_transfer', 'cheque'] as PaymentMode[]).map((m) => ({ value: m, label: MODE_LABELS[m] }))

const vehicleLabel = (v?: { busNo?: string; registrationNumber?: string }) =>
  [v?.busNo && `Bus ${v.busNo}`, v?.registrationNumber].filter(Boolean).join(' · ') || 'Vehicle'

const km = (value: number) => value.toLocaleString('en-IN')

const logId = (l: FuelLog) => l._id
const logRowLabel = (l: FuelLog) => `Select fuel entry for ${vehicleLabel(l.vehicleSnapshot)} on ${fmtDate(l.date)}`

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Builds a CSV in the browser and saves it (with a BOM so Excel reads ₹). */
const downloadCsv = (filename: string, header: string[], rows: unknown[][]) => {
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${String(y).slice(2)}`
}

const loadingState = (label: string) => (
  <div className="cb-table-state" role="status">
    <span className="cb-spinner" aria-hidden="true" />
    {label}
  </div>
)

/** Monthly fuel cost as tiny bars, one per month of the session. */
const Sparkline: React.FC<{ values: number[]; months: string[] }> = ({ values, months }) => {
  if (values.length < 2) return <span className="cb-subtle">—</span>
  const max = Math.max(...values, 1)
  return (
    <span className="cu-spark" role="img" aria-label={`Monthly fuel cost: ${values.map((v, i) => `${monthLabel(months[i])} ${inr(v)}`).join(', ')}`}>
      {values.map((v, i) => (
        <span
          key={months[i]}
          className={v > 0 ? 'cu-spark__bar' : 'cu-spark__bar is-zero'}
          style={v > 0 ? { height: `${Math.max(8, (v / max) * 100)}%` } : undefined}
          title={`${monthLabel(months[i])}: ${inr(v)}`}
        />
      ))}
    </span>
  )
}

/** Fleet fuel cost per month: one series, one hue, hover for the figure. */
const MonthlyCostChart: React.FC<{ rows: Array<{ month: string; amount: number }> }> = ({ rows }) => {
  const max = Math.max(...rows.map((r) => r.amount), 1)
  return (
    <div className="cu-chart">
      <div className="cu-chart__plot" role="list" aria-label="Fleet fuel cost per month">
        {rows.map((r) => (
          <div key={r.month} className="cu-chart__col" role="listitem" tabIndex={0} aria-label={`${monthLabel(r.month)}: ${inr(r.amount)}`}>
            <span
              className={r.amount > 0 ? 'cu-chart__bar cu-c1' : 'cu-chart__bar is-zero'}
              style={r.amount > 0 ? { height: `${(r.amount / max) * 100}%` } : undefined}
            />
            <span className="cu-chart__label">{monthLabel(r.month)}</span>
            <span className="cu-chart__tip" aria-hidden="true">
              <strong>{monthLabel(r.month)}</strong>
              {inr(r.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

type Draft = {
  _id?: string
  vehicleKey: string
  manualReg: string
  manualBus: string
  date: string
  fuelType: FuelLog['fuelType']
  litres: string
  ratePerLitre: string
  amount: string
  odometer: string
  fullTank: boolean
  station: string
  billNo: string
  filledBy: string
  mode: PaymentMode
  notes: string
  attachments: Attachment[]
}

const emptyDraft = (): Draft => ({
  vehicleKey: '',
  manualReg: '',
  manualBus: '',
  date: todayIso(),
  fuelType: 'diesel',
  litres: '',
  ratePerLitre: '',
  amount: '',
  odometer: '',
  fullTank: true,
  station: '',
  billNo: '',
  filledBy: '',
  mode: 'cash',
  notes: '',
  attachments: [],
})

const FuelEntrySheet: React.FC<{ isOpen: boolean; onClose: () => void; vehicles: FuelVehicle[]; log?: FuelLog | null; onSaved: () => void }> = ({
  isOpen,
  onClose,
  vehicles,
  log,
  onSaved,
}) => {
  const [d, setD] = useState<Draft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }))

  useEffect(() => {
    if (!isOpen) return
    if (!log) {
      setD(emptyDraft())
      return
    }
    setD({
      _id: log._id,
      vehicleKey: log.vehicleId || '',
      manualReg: log.vehicleId ? '' : log.vehicleSnapshot.registrationNumber || '',
      manualBus: log.vehicleId ? '' : log.vehicleSnapshot.busNo || '',
      date: log.date.slice(0, 10),
      fuelType: log.fuelType,
      litres: String(log.litres),
      ratePerLitre: String(log.ratePerLitre || ''),
      amount: String(log.amount),
      odometer: log.odometer !== null && log.odometer !== undefined ? String(log.odometer) : '',
      fullTank: log.fullTank,
      station: log.station,
      billNo: log.billNo,
      filledBy: log.filledBy,
      mode: (log.mode as PaymentMode) || 'cash',
      notes: log.notes,
      attachments: log.attachments || [],
    })
  }, [isOpen, log])

  const vehicle = vehicles.find((v) => v._id === d.vehicleKey)
  const computed = Number(d.litres) * Number(d.ratePerLitre)
  const amount = d.amount !== '' ? Number(d.amount) : computed
  const odometerBelowLast =
    !d._id && d.odometer !== '' && Boolean(vehicle?.lastOdometer) && Number(d.odometer) < Number(vehicle?.lastOdometer)

  const save = async () => {
    if (!d.vehicleKey && !d.manualReg.trim()) {
      toast.error('Pick a vehicle or enter its registration number.')
      return
    }
    setSaving(true)
    try {
      await cpitlService.saveFuelLog({
        _id: d._id,
        vehicleId: d.vehicleKey || null,
        vehicleSnapshot: d.vehicleKey ? undefined : { registrationNumber: d.manualReg.trim().toUpperCase(), busNo: d.manualBus.trim() },
        date: d.date,
        fuelType: d.fuelType,
        litres: Number(d.litres),
        ratePerLitre: Number(d.ratePerLitre) || 0,
        amount: amount || undefined,
        odometer: d.odometer === '' ? null : Number(d.odometer),
        fullTank: d.fullTank,
        station: d.station,
        billNo: d.billNo,
        filledBy: d.filledBy,
        mode: d.mode,
        notes: d.notes,
        attachments: d.attachments,
      } as Partial<FuelLog>)
      toast.success(d._id ? 'Fuel entry updated.' : 'Fuel entry saved.')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const quantityLabel = d.fuelType === 'ev' ? 'Units (kWh)' : d.fuelType === 'cng' ? 'Quantity (kg)' : 'Litres'

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      size="lg"
      icon={Fuel}
      title={d._id ? 'Edit fuel entry' : 'Log fuel'}
      description="Odometer readings on full-tank fills give the most accurate mileage."
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {amount > 0 ? `Save ${inr(amount)}` : 'Save entry'}
          </Button>
        </>
      }
    >
      <div className="cb-form-grid">
        <Select
          className="is-wide"
          label="Vehicle"
          value={d.vehicleKey}
          onChange={(e) => set({ vehicleKey: e.target.value })}
          placeholder={vehicles.length ? 'Select vehicle…' : 'Enter vehicle below'}
          options={vehicles
            .filter((v) => v._id)
            .map((v) => ({
              value: v._id as string,
              label: `${vehicleLabel(v)}${v.lastOdometer ? ` · last odo ${km(v.lastOdometer)}` : ''}`,
            }))}
        />
        {!d.vehicleKey ? (
          <>
            <TextField
              label="Registration number"
              value={d.manualReg}
              onChange={(e) => set({ manualReg: e.target.value.toUpperCase() })}
              placeholder="HR26AB1234"
              autoCapitalize="characters"
            />
            <TextField label="Bus no. (optional)" value={d.manualBus} onChange={(e) => set({ manualBus: e.target.value })} />
          </>
        ) : null}
        <TextField label="Date" type="date" value={d.date} max={todayIso()} onChange={(e) => set({ date: e.target.value })} />
        <Select label="Fuel" value={d.fuelType} onChange={(e) => set({ fuelType: e.target.value as Draft['fuelType'] })} options={FUEL_OPTIONS} />
        <TextField label={quantityLabel} type="number" inputMode="decimal" min={0} step="0.01" value={d.litres} onChange={(e) => set({ litres: e.target.value })} />
        <TextField
          label="Rate per unit"
          prefix="₹"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={d.ratePerLitre}
          onChange={(e) => set({ ratePerLitre: e.target.value, amount: '' })}
        />
        <TextField
          label="Amount"
          prefix="₹"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          hint={d.amount === '' && computed > 0 ? `Litres × rate = ${inr(computed, { decimals: true })}` : undefined}
          value={d.amount !== '' ? d.amount : computed > 0 ? computed.toFixed(2) : ''}
          onChange={(e) => set({ amount: e.target.value })}
        />
        <TextField
          label="Odometer"
          suffix="km"
          type="number"
          inputMode="numeric"
          min={0}
          hint={
            odometerBelowLast
              ? `Lower than the last reading of ${km(Number(vehicle?.lastOdometer))} km. Check the reading.`
              : vehicle?.lastOdometer
                ? `Last recorded ${km(vehicle.lastOdometer)} km`
                : 'Needed for km per litre'
          }
          value={d.odometer}
          onChange={(e) => set({ odometer: e.target.value })}
        />
        <Checkbox
          className="is-wide"
          label="Tank filled to full"
          description="Gives the most accurate mileage."
          checked={d.fullTank}
          onChange={(fullTank) => set({ fullTank })}
        />
        <TextField label="Fuel station" value={d.station} onChange={(e) => set({ station: e.target.value })} />
        <TextField label="Bill no." value={d.billNo} onChange={(e) => set({ billNo: e.target.value })} />
        <TextField label="Filled by" value={d.filledBy} placeholder="Driver name" onChange={(e) => set({ filledBy: e.target.value })} />
        <Select label="Paid by" value={d.mode} onChange={(e) => set({ mode: e.target.value as PaymentMode })} options={MODE_OPTIONS} />
        <div className="is-wide">
          <AttachmentInput value={d.attachments} onChange={(attachments) => set({ attachments })} label="Attach fuel bill" />
        </div>
      </div>
    </Sheet>
  )
}

const RemoveEntryDialog: React.FC<{ log: FuelLog | null; onClose: () => void; onRemoved: () => void }> = ({ log, onClose, onRemoved }) => {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (log) setReason('')
  }, [log])
  const confirm = async () => {
    if (!log || !reason.trim()) return
    setBusy(true)
    try {
      await cpitlService.removeFuelLog(log._id, reason)
      toast.success('Fuel entry removed.')
      onRemoved()
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={Boolean(log)}
      onClose={onClose}
      tone="danger"
      size="sm"
      title="Remove this fuel entry?"
      description={log ? `${inr(log.amount)} for ${vehicleLabel(log.vehicleSnapshot)} on ${fmtDate(log.date)}. It stops counting toward mileage and cost.` : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={confirm}>
            Remove entry
          </Button>
        </>
      }
    >
      <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Duplicate entry, wrong vehicle…" autoFocus />
    </Dialog>
  )
}

const CpitlFuel: React.FC = () => {
  const invalidate = useInvalidateCpitl()
  const [tab, setTab] = useState<Tab>('log')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [growthPct, setGrowthPct] = useState(8)
  const [sheet, setSheet] = useState<{ open: boolean; log?: FuelLog | null }>({ open: false })
  const [removing, setRemoving] = useState<FuelLog | null>(null)
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false)
  const [bulkReason, setBulkReason] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState<(BulkResult & { action: string; noun: string }) | null>(null)
  const { data: vehicleData } = useFuelVehicles()
  const { data: logData, isLoading } = useFuelLogs(vehicleFilter ? { vehicleId: vehicleFilter } : {})
  const logs = useMemo(() => logData || [], [logData])
  // Selection clears when the vehicle filter or tab changes.
  const bulk = useRowSelection(logs, logId, { resetKey: `${tab}|${vehicleFilter}`, rowLabel: logRowLabel })
  const selectedTotal = bulk.selectedRows.reduce((s, l) => s + l.amount, 0)
  const { data: analytics, isLoading: analyticsLoading } = useFuelAnalytics(growthPct)
  const vehicles = vehicleData?.vehicles || []
  const vehicleOptions = vehicles.filter((v) => v._id).map((v) => ({ value: v._id as string, label: vehicleLabel(v) }))

  const fleet = analytics?.fleet
  const fleetKmpl = fleet && fleet.litres > 0 && fleet.km > 0 ? fleet.km / fleet.litres : null
  const monthsAll = useMemo(() => {
    const set = new Set<string>()
    analytics?.vehicles.forEach((v) => v.monthly.forEach((m) => set.add(m.month)))
    return [...set].sort()
  }, [analytics])
  const fleetMonthly = useMemo(
    () =>
      monthsAll.map((month) => ({
        month,
        amount: (analytics?.vehicles || []).reduce((s, v) => s + (v.monthly.find((m) => m.month === month)?.amount || 0), 0),
      })),
    [analytics, monthsAll]
  )

  const download = async () => {
    try {
      await cpitlService.downloadFuelProjection(growthPct)
    } catch (error) {
      toast.error(await errorMessage(error, 'Export failed.'))
    }
  }

  const exportSelected = () => {
    const rows = [...bulk.selectedRows].sort((a, b) => a.date.localeCompare(b.date))
    downloadCsv(
      'fuel-entries.csv',
      ['Date', 'Bus no.', 'Registration', 'Fuel', 'Litres', 'Rate', 'Amount', 'Odometer', 'Full tank', 'Station', 'Bill no.', 'Filled by', 'Mode'],
      rows.map((l) => [
        l.date.slice(0, 10),
        l.vehicleSnapshot?.busNo || '',
        l.vehicleSnapshot?.registrationNumber || '',
        FUEL_OPTIONS.find((f) => f.value === l.fuelType)?.label || l.fuelType,
        l.litres,
        l.ratePerLitre,
        l.amount,
        l.odometer ?? '',
        l.fullTank ? 'Yes' : 'No',
        l.station,
        l.billNo,
        l.filledBy,
        MODE_LABELS[l.mode as string] || l.mode || '',
      ])
    )
  }

  const openBulkRemove = () => {
    setBulkReason('')
    setBulkRemoveOpen(true)
  }

  const runBulkRemove = async () => {
    const reason = bulkReason.trim()
    if (!reason || !bulk.count) return
    setBulkBusy(true)
    try {
      const result = await cpitlBulkService.removeFuelLogs(bulk.selectedIds, reason)
      setBulkRemoveOpen(false)
      bulk.clear()
      if (result.failed.length) setBulkResult({ ...result, action: 'Remove fuel entries', noun: 'entries' })
      else toast.success(`${result.succeeded} fuel ${result.succeeded === 1 ? 'entry' : 'entries'} removed.`)
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBulkBusy(false)
    }
  }

  const openNew = () => setSheet({ open: true, log: null })
  const vehicleKey = (v: VehicleFuelStats) => String(v.vehicleId || v.vehicle.registrationNumber)

  const logColumns: DataTableColumn<FuelLog>[] = [
    { key: 'date', header: 'Date', mobile: 'subtitle', render: (l) => fmtDate(l.date), width: 120 },
    {
      key: 'vehicle',
      header: 'Vehicle',
      mobile: 'title',
      render: (l) => (
        <span className="cu-entity">
          <span className="cu-entity__primary">{vehicleLabel(l.vehicleSnapshot)}</span>
          <span className="cu-entity__secondary">
            {FUEL_OPTIONS.find((f) => f.value === l.fuelType)?.label || l.fuelType} · {l.fullTank ? 'full tank' : 'partial'}
          </span>
        </span>
      ),
    },
    { key: 'litres', header: 'Litres', align: 'right', numeric: true, render: (l) => l.litres },
    { key: 'rate', header: 'Rate', align: 'right', numeric: true, render: (l) => `₹${l.ratePerLitre}` },
    { key: 'amount', header: 'Amount', align: 'right', numeric: true, mobile: 'aside', render: (l) => <span className="cu-strong">{inr(l.amount)}</span> },
    { key: 'odometer', header: 'Odometer', align: 'right', numeric: true, render: (l) => (l.odometer ? `${km(l.odometer)} km` : '—') },
    {
      key: 'station',
      header: 'Station / bill',
      render: (l) => (
        <span className="cu-clip cb-muted" title={[l.station, l.billNo].filter(Boolean).join(' · ') || undefined}>
          {[l.station, l.billNo].filter(Boolean).join(' · ') || '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: <span className="cb-visually-hidden">Actions</span>,
      headerLabel: 'Actions',
      align: 'right',
      interactive: true,
      render: (l) => (
        <span className="cu-rowactions">
          {l.attachments?.length ? (
            <a className="cb-btn cb-btn--tertiary cb-btn--sm" href={l.attachments[0].url} target="_blank" rel="noreferrer">
              <span className="cb-btn__label">View bill</span>
            </a>
          ) : null}
          <Menu
            label={`Actions for fuel entry on ${fmtDate(l.date)}`}
            items={[
              { label: 'Edit entry', icon: Pencil, onSelect: () => setSheet({ open: true, log: l }) },
              { divider: true },
              { label: 'Remove entry', icon: Trash2, tone: 'danger', onSelect: () => setRemoving(l) },
            ]}
          />
        </span>
      ),
    },
  ]

  const vehicleColumns: DataTableColumn<VehicleFuelStats>[] = [
    {
      key: 'vehicle',
      header: 'Vehicle',
      mobile: 'title',
      render: (v) => <span className="cu-strong">{vehicleLabel(v.vehicle)}</span>,
    },
    { key: 'fills', header: 'Fills', align: 'right', numeric: true, render: (v) => v.fills },
    { key: 'litres', header: 'Litres', align: 'right', numeric: true, render: (v) => v.litres.toLocaleString('en-IN') },
    { key: 'cost', header: 'Cost', align: 'right', numeric: true, mobile: 'aside', render: (v) => <span className="cu-strong">{inr(v.cost)}</span> },
    { key: 'km', header: 'Km', align: 'right', numeric: true, render: (v) => (v.km ? km(v.km) : '—') },
    {
      key: 'kmpl',
      header: 'Km / litre',
      align: 'right',
      numeric: true,
      render: (v) => {
        const low = v.kmpl != null && fleetKmpl != null && v.kmpl < fleetKmpl * 0.8
        return (
          <span className="cu-num" title={v.mileageMethod === 'full_tank' ? 'Full tank to full tank' : v.mileageMethod === 'odometer' ? 'Odometer span' : undefined}>
            {v.kmpl ?? '—'}
            {low ? (
              <Badge tone="warning" title={`Fleet average is ${fleetKmpl?.toFixed(1)} km per litre`}>
                Low mileage
              </Badge>
            ) : null}
          </span>
        )
      },
    },
    { key: 'costPerKm', header: '₹ / km', align: 'right', numeric: true, render: (v) => (v.costPerKm ? `₹${v.costPerKm}` : '—') },
    {
      key: 'trend',
      header: monthsAll.length ? `Monthly cost (${monthLabel(monthsAll[0])}–${monthLabel(monthsAll[monthsAll.length - 1])})` : 'Monthly cost',
      headerLabel: 'Monthly cost',
      render: (v) => {
        const byMonth = new Map(v.monthly.map((m) => [m.month, m.amount]))
        return <Sparkline values={monthsAll.map((m) => byMonth.get(m) || 0)} months={monthsAll} />
      },
    },
    { key: 'lastFill', header: 'Last fill', mobile: 'subtitle', render: (v) => <span className="cb-muted">{fmtDate(v.lastFill)}</span> },
  ]

  const projectionColumns: DataTableColumn<VehicleFuelStats>[] = [
    { key: 'vehicle', header: 'Vehicle', mobile: 'title', render: (v) => <span className="cu-strong">{vehicleLabel(v.vehicle)}</span> },
    { key: 'months', header: 'Months logged', align: 'right', numeric: true, render: (v) => v.monthsLogged },
    { key: 'spent', header: 'Spent so far', align: 'right', numeric: true, render: (v) => inr(v.cost) },
    { key: 'annualised', header: 'Full-year estimate', align: 'right', numeric: true, render: (v) => inr(v.annualised) },
    {
      key: 'projected',
      header: 'Next year budget',
      align: 'right',
      numeric: true,
      mobile: 'aside',
      render: (v) => <span className="cu-strong">{inr(v.projected)}</span>,
    },
  ]

  const noAnalytics = (
    <EmptyState
      icon={Truck}
      title="No fuel data yet"
      body="Log fuel with odometer readings to see cost and mileage per vehicle."
      action={
        <Button icon={Plus} onClick={openNew}>
          Log fuel
        </Button>
      }
    />
  )

  return (
    <Page>
      {vehicleData && !vehicleData.trnstActive ? (
        <Banner tone="info">Transport module is off, so vehicles are entered by registration number.</Banner>
      ) : null}

      <div className="cb-stats">
        <StatCard label="Fuel cost (session)" value={inrShort(fleet?.cost)} hint={`${(fleet?.litres || 0).toLocaleString('en-IN')} litres`} icon={Wallet} />
        <StatCard label="Distance" value={km(fleet?.km || 0)} unit="km" hint="From odometer readings" icon={Route} />
        <StatCard label="Fleet ₹ / km" value={fleet?.costPerKm ? `₹${fleet.costPerKm}` : '—'} icon={Gauge} />
        <StatCard label={`Next year at +${growthPct}%`} value={inrShort(fleet?.projected)} hint={`Full-year estimate ${inrShort(fleet?.annualised)}`} icon={Fuel} />
      </div>

      <div className="cu-tabbar">
        <Tabs items={TABS} value={tab} onChange={(id) => setTab(id as Tab)} label="Fuel views" />
        <Button variant="primary" icon={Plus} onClick={openNew}>
          Log fuel
        </Button>
      </div>

      {tab === 'log' && (
        <Card flush className="cu-records">
          <div className="cu-toolbar">
            <FilterBar
              filters={
                <Select
                  aria-label="Filter by vehicle"
                  size="sm"
                  value={vehicleFilter}
                  onChange={(e) => setVehicleFilter(e.target.value)}
                  placeholder="All vehicles"
                  options={vehicleOptions}
                />
              }
            />
          </div>
          {bulk.count ? (
            <div className="cu-bulk">
              <BulkBar count={bulk.count} noun="entry" nounPlural="entries" onClear={bulk.clear} busy={bulkBusy}>
                <Button size="sm" icon={Download} onClick={exportSelected} disabled={bulkBusy}>
                  Export CSV
                </Button>
                <Button size="sm" variant="danger" icon={Trash2} onClick={openBulkRemove} loading={bulkBusy}>
                  Remove
                </Button>
              </BulkBar>
            </div>
          ) : null}
          <DataTable
            caption="Fuel entries"
            columns={logColumns}
            rows={logs}
            getRowKey={(l) => l._id}
            selection={bulk.selection}
            onRowClick={(l) => setSheet({ open: true, log: l })}
            loading={isLoading}
            loadingLabel="Loading fuel entries…"
            empty={
              vehicleFilter ? (
                <EmptyState
                  icon={Fuel}
                  title="No fuel entries for this vehicle"
                  body="Show all vehicles, or log a fill for this one."
                  action={<Button onClick={() => setVehicleFilter('')}>Show all vehicles</Button>}
                />
              ) : (
                <EmptyState
                  icon={Fuel}
                  title="No fuel entries yet"
                  body="Log each fill with its odometer reading to track cost and mileage per vehicle."
                  action={
                    <Button icon={Plus} onClick={openNew}>
                      Log fuel
                    </Button>
                  }
                />
              )
            }
          />
        </Card>
      )}

      {tab === 'vehicles' && (
        <>
          {fleetMonthly.length > 1 ? (
            <Card title="Fleet fuel cost per month" subtitle={`${inr(fleet?.cost)} across ${fleetMonthly.length} months this session.`}>
              <MonthlyCostChart rows={fleetMonthly} />
            </Card>
          ) : null}
          <Card flush title="Cost per vehicle" subtitle={fleetKmpl ? `Fleet average ${fleetKmpl.toFixed(1)} km per litre.` : undefined} className="cu-records">
            {analyticsLoading ? (
              loadingState('Loading vehicles…')
            ) : (
              <DataTable caption="Cost per vehicle" columns={vehicleColumns} rows={analytics?.vehicles || []} getRowKey={vehicleKey} empty={noAnalytics} />
            )}
          </Card>
        </>
      )}

      {tab === 'projection' && (
        <Card flush className="cu-records">
          <div className="cu-toolbar">
            <p className="cu-toolbar__note">
              Each vehicle&apos;s spend is scaled to a full year over the months it has been logged this session, then the expected increase in fuel
              price and usage is added.
            </p>
            <div className="cu-growth">
              <TextField
                label="Expected increase"
                size="sm"
                type="number"
                inputMode="decimal"
                suffix="%"
                value={growthPct}
                onChange={(e) => setGrowthPct(Number(e.target.value) || 0)}
              />
              <Button size="sm" icon={Download} onClick={download}>
                Export Excel
              </Button>
            </div>
          </div>
          {analyticsLoading ? (
            loadingState('Loading budget…')
          ) : (
            <DataTable
              caption="Next-year fuel budget"
              columns={projectionColumns}
              rows={analytics?.vehicles || []}
              getRowKey={vehicleKey}
              empty={noAnalytics}
              footer={
                analytics?.vehicles.length ? (
                  <div className="cu-totals">
                    <span className="cu-totals__label">Fleet</span>
                    <span>
                      Spent so far <strong>{inr(fleet?.cost)}</strong>
                    </span>
                    <span>
                      Full-year estimate <strong>{inr(fleet?.annualised)}</strong>
                    </span>
                    <span>
                      Next year budget <strong>{inr(fleet?.projected)}</strong>
                    </span>
                  </div>
                ) : undefined
              }
            />
          )}
        </Card>
      )}

      <FuelEntrySheet isOpen={sheet.open} onClose={() => setSheet({ open: false })} vehicles={vehicles} log={sheet.log} onSaved={invalidate} />
      <RemoveEntryDialog log={removing} onClose={() => setRemoving(null)} onRemoved={invalidate} />
      <Dialog
        open={bulkRemoveOpen}
        onClose={() => !bulkBusy && setBulkRemoveOpen(false)}
        tone="danger"
        size="sm"
        title={`Remove ${bulk.count} fuel ${bulk.count === 1 ? 'entry' : 'entries'}?`}
        description={`${inr(selectedTotal)} stops counting toward mileage, cost and the expense ledger. The records are kept with your reason.`}
        footer={
          <>
            <Button onClick={() => setBulkRemoveOpen(false)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} loading={bulkBusy} disabled={!bulkReason.trim() || !bulk.count} onClick={() => void runBulkRemove()}>
              Remove {bulk.count} {bulk.count === 1 ? 'entry' : 'entries'}
            </Button>
          </>
        }
      >
        <TextArea
          label="Reason"
          required
          autoFocus
          rows={2}
          value={bulkReason}
          onChange={(e) => setBulkReason(e.target.value)}
          placeholder="Duplicate entries, wrong vehicle…"
          hint="Saved on every removed entry."
        />
      </Dialog>
      <BulkResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />
    </Page>
  )
}

export default CpitlFuel
