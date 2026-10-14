import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { BarChart3, CheckCircle2, ExternalLink, Gauge, IndianRupee, Pencil, Plus, Receipt, Trash2, Zap } from 'lucide-react'
import {
  Badge,
  BulkBar,
  BulkResultDialog,
  Button,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  Menu,
  Page,
  Select,
  Sheet,
  StatCard,
  TextArea,
  TextField,
  useRowSelection,
  type BulkResult,
  type DataTableColumn,
  type MenuItem,
} from '@/components/ui'
import { useAssetLocations, useElectricityAnalytics, useElectricityBills, useElectricityConnections, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { Attachment, ElectricityBill, ElectricityConnection, PaymentMode } from '@/services/cpitlService'
import cpitlBulkService from '@/services/cpitlBulkService'
import AttachmentInput from '@/components/cpitl/AttachmentInput'
import { todayIso } from '@/components/cpitl/QuickExpenseSheet'
import { CpitlBadge, MODE_LABELS, MONTHS, errorMessage, fmtDate, inr, inrShort } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/utilities.css'

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${y}`
}
const shortMonth = (key: string) => monthLabel(key).replace(/ \d{2}(\d{2})$/, " '$1")
const currentMonth = () => todayIso().slice(0, 7)
const kwh = (value: number) => `${value.toLocaleString('en-IN')} kWh`

const PAY_MODES = (['bank_transfer', 'upi', 'cheque', 'cash', 'card'] as PaymentMode[]).map((m) => ({ value: m, label: MODE_LABELS[m] }))

const billId = (b: ElectricityBill) => b._id
const billRowLabel = (b: ElectricityBill) => `Select ${b.connectionSnapshot.name} bill for ${monthLabel(b.billMonth)}`
const billsNoun = (n: number) => (n === 1 ? 'bill' : 'bills')

const isOverdue = (b: ElectricityBill) => b.status === 'unpaid' && Boolean(b.dueDate) && new Date(b.dueDate as string) < new Date()

/* ---------------------------------------------------------------- connection form */

const ConnectionSheet: React.FC<{ isOpen: boolean; onClose: () => void; connection?: ElectricityConnection | null; onSaved: () => void }> = ({
  isOpen,
  onClose,
  connection,
  onSaved,
}) => {
  const { data: locations = [] } = useAssetLocations()
  const [form, setForm] = useState<Partial<ElectricityConnection>>({})
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (isOpen) setForm(connection || { name: '', consumerNo: '', meterNo: '', provider: '', locationId: null, locationText: '', sanctionedLoadKw: 0 })
  }, [isOpen, connection])
  const save = async () => {
    if (!form.name?.trim()) {
      toast.error('Name the connection, e.g. "Main Block".')
      return
    }
    setSaving(true)
    try {
      await cpitlService.saveElectricityConnection(form)
      toast.success('Connection saved.')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      icon={Zap}
      title={form._id ? 'Edit connection' : 'Add connection'}
      description="One connection per meter the school pays for."
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
            Save connection
          </Button>
        </>
      }
    >
      <div className="cb-form-grid">
        <TextField
          className="is-wide"
          label="Name"
          required
          value={form.name || ''}
          placeholder="Main Block / Hostel / Sports complex"
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <TextField label="Consumer / account no." value={form.consumerNo || ''} onChange={(e) => setForm({ ...form, consumerNo: e.target.value })} />
        <TextField label="Meter no." value={form.meterNo || ''} onChange={(e) => setForm({ ...form, meterNo: e.target.value })} />
        <TextField label="Provider" value={form.provider || ''} placeholder="e.g. DHBVN" onChange={(e) => setForm({ ...form, provider: e.target.value })} />
        <TextField
          label="Sanctioned load"
          suffix="kW"
          type="number"
          inputMode="decimal"
          min={0}
          value={form.sanctionedLoadKw || ''}
          onChange={(e) => setForm({ ...form, sanctionedLoadKw: Number(e.target.value) })}
        />
        {locations.length ? (
          <Select
            className="is-wide"
            label="Location (from Assets)"
            value={form.locationId || ''}
            onChange={(e) => setForm({ ...form, locationId: e.target.value || null })}
            placeholder="Not linked"
            options={locations.map((l) => ({ value: l._id, label: `${l.path || l.name} (${l.type})` }))}
          />
        ) : null}
        <TextField
          className="is-wide"
          label="Location / area served"
          value={form.locationText || ''}
          onChange={(e) => setForm({ ...form, locationText: e.target.value })}
        />
      </div>
    </Sheet>
  )
}

/* ---------------------------------------------------------------- bill form */

type BillDraft = {
  _id?: string
  connectionId: string
  billMonth: string
  billNo: string
  prevReading: string
  currReading: string
  units: string
  amount: string
  dueDate: string
  notes: string
  attachments: Attachment[]
  markPaid: boolean
  paidOn: string
  mode: PaymentMode
  reference: string
}

const BillSheet: React.FC<{
  isOpen: boolean
  onClose: () => void
  connections: ElectricityConnection[]
  bill?: ElectricityBill | null
  lastReading: (connectionId: string) => number | null
  onSaved: () => void
}> = ({ isOpen, onClose, connections, bill, lastReading, onSaved }) => {
  const [d, setD] = useState<BillDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<BillDraft>) => setD((prev) => (prev ? { ...prev, ...patch } : prev))

  useEffect(() => {
    if (!isOpen) return
    const connectionId = bill?.connectionId || connections[0]?._id || ''
    setD({
      _id: bill?._id,
      connectionId,
      billMonth: bill?.billMonth || currentMonth(),
      billNo: bill?.billNo || '',
      prevReading: bill?.prevReading !== null && bill?.prevReading !== undefined ? String(bill.prevReading) : String(lastReading(connectionId) ?? ''),
      currReading: bill?.currReading !== null && bill?.currReading !== undefined ? String(bill.currReading) : '',
      units: bill ? String(bill.units || '') : '',
      amount: bill ? String(bill.amount) : '',
      dueDate: bill?.dueDate ? bill.dueDate.slice(0, 10) : '',
      notes: bill?.notes || '',
      attachments: bill?.attachments || [],
      markPaid: false,
      paidOn: todayIso(),
      mode: 'bank_transfer',
      reference: '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bill])

  const readingUnits = d && d.prevReading !== '' && d.currReading !== '' ? Number(d.currReading) - Number(d.prevReading) : null

  const save = async () => {
    if (!d) return
    setSaving(true)
    try {
      await cpitlService.saveElectricityBill({
        _id: d._id,
        connectionId: d.connectionId,
        billMonth: d.billMonth,
        billNo: d.billNo,
        prevReading: d.prevReading === '' ? null : Number(d.prevReading),
        currReading: d.currReading === '' ? null : Number(d.currReading),
        units: readingUnits !== null ? readingUnits : Number(d.units) || 0,
        amount: Number(d.amount),
        dueDate: d.dueDate || null,
        notes: d.notes,
        attachments: d.attachments,
        ...(d._id ? {} : { markPaid: d.markPaid, paidOn: d.paidOn, mode: d.mode, reference: d.reference }),
      })
      toast.success('Bill saved.')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={isOpen && Boolean(d)}
      onClose={onClose}
      size="lg"
      icon={Receipt}
      title={d?._id ? 'Edit bill' : 'Add electricity bill'}
      description="Enter both meter readings and the units are worked out for you."
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
            Save bill
          </Button>
        </>
      }
    >
      {d ? (
        <div className="cb-form-grid">
          <Select
            label="Connection"
            value={d.connectionId}
            onChange={(e) => set({ connectionId: e.target.value, prevReading: d._id ? d.prevReading : String(lastReading(e.target.value) ?? '') })}
            options={connections.map((c) => ({ value: c._id, label: c.name }))}
          />
          <TextField label="Bill month" type="month" value={d.billMonth} onChange={(e) => set({ billMonth: e.target.value })} />
          <TextField label="Previous reading" type="number" inputMode="numeric" min={0} value={d.prevReading} onChange={(e) => set({ prevReading: e.target.value })} />
          <TextField
            label="Current reading"
            type="number"
            inputMode="numeric"
            min={0}
            value={d.currReading}
            error={readingUnits !== null && readingUnits < 0 ? 'Lower than the previous reading.' : undefined}
            onChange={(e) => set({ currReading: e.target.value })}
          />
          <TextField
            label="Units consumed"
            suffix="kWh"
            type="number"
            inputMode="numeric"
            min={0}
            hint={readingUnits !== null ? 'Calculated from readings' : undefined}
            value={readingUnits !== null ? readingUnits : d.units}
            disabled={readingUnits !== null}
            onChange={(e) => set({ units: e.target.value })}
          />
          <TextField
            label="Bill amount"
            prefix="₹"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={d.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
          <TextField label="Bill no." value={d.billNo} onChange={(e) => set({ billNo: e.target.value })} />
          <TextField label="Due date" type="date" value={d.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          <div className="is-wide">
            <AttachmentInput value={d.attachments} onChange={(attachments) => set({ attachments })} label="Attach bill" />
          </div>
          {!d._id ? (
            <div className="is-wide cu-paid">
              <Checkbox label="Already paid" checked={d.markPaid} onChange={(markPaid) => set({ markPaid })} />
              {d.markPaid ? (
                <div className="cb-form-grid cb-form-grid--3">
                  <TextField label="Paid on" type="date" value={d.paidOn} onChange={(e) => set({ paidOn: e.target.value })} />
                  <Select label="Mode" value={d.mode} onChange={(e) => set({ mode: e.target.value as PaymentMode })} options={PAY_MODES} />
                  <TextField label="Reference" value={d.reference} onChange={(e) => set({ reference: e.target.value })} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  )
}

/* ---------------------------------------------------------------- pay + remove */

const PayDialog: React.FC<{ bill: ElectricityBill | null; onClose: () => void; onSaved: () => void }> = ({ bill, onClose, onSaved }) => {
  const [paidOn, setPaidOn] = useState(todayIso())
  const [mode, setMode] = useState<PaymentMode>('bank_transfer')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const pay = async () => {
    if (!bill) return
    setBusy(true)
    try {
      await cpitlService.payElectricityBill(bill._id, { paidOn, mode, reference })
      toast.success('Bill marked paid.')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={Boolean(bill)}
      onClose={onClose}
      size="sm"
      title={`Pay ${bill ? inr(bill.amount) : ''}`}
      description={bill ? `${bill.connectionSnapshot.name} · ${monthLabel(bill.billMonth)}` : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon={CheckCircle2} loading={busy} onClick={pay}>
            Mark paid
          </Button>
        </>
      }
    >
      <div className="cu-form-stack">
        <TextField label="Paid on" type="date" value={paidOn} max={todayIso()} onChange={(e) => setPaidOn(e.target.value)} />
        <Select label="Mode" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)} options={PAY_MODES} />
        <TextField label="Reference / UTR" value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
    </Dialog>
  )
}

const RemoveBillDialog: React.FC<{ bill: ElectricityBill | null; onClose: () => void; onRemoved: () => void }> = ({ bill, onClose, onRemoved }) => {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (bill) setReason('')
  }, [bill])
  const confirm = async () => {
    if (!bill || !reason.trim()) return
    setBusy(true)
    try {
      await cpitlService.removeElectricityBill(bill._id, reason)
      toast.success('Bill removed.')
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
      open={Boolean(bill)}
      onClose={onClose}
      tone="danger"
      size="sm"
      title="Remove this bill?"
      description={bill ? `${bill.connectionSnapshot.name}, ${monthLabel(bill.billMonth)} · ${inr(bill.amount)}.` : undefined}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={confirm}>
            Remove bill
          </Button>
        </>
      }
    >
      <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Duplicate, wrong month…" autoFocus />
    </Dialog>
  )
}

/* ---------------------------------------------------------------- usage chart */

type ChartRow = { month: string; units: number; amount: number; lastYearUnits: number | null }

/** Units per month; pairs last year's bar (chart-2) with this year's (chart-1) when there is history. */
const UnitsChart: React.FC<{ rows: ChartRow[]; withLastYear: boolean }> = ({ rows, withLastYear }) => {
  const max = Math.max(...rows.map((r) => Math.max(r.units, r.lastYearUnits || 0)), 1)
  const bar = (value: number, tone: string) => (
    <span className={value > 0 ? `cu-chart__bar ${tone}` : 'cu-chart__bar is-zero'} style={value > 0 ? { height: `${(value / max) * 100}%` } : undefined} />
  )
  return (
    <div className="cu-chart">
      <div className="cu-chart__plot" role="list" aria-label="Units per month">
        {rows.map((r) => {
          const label = `${monthLabel(r.month)}: ${kwh(r.units)}, ${inr(r.amount)}${withLastYear && r.lastYearUnits !== null ? `; last year ${kwh(r.lastYearUnits)}` : ''}`
          return (
            <div key={r.month} className="cu-chart__col" role="listitem" tabIndex={0} aria-label={label}>
              {withLastYear ? bar(r.lastYearUnits || 0, 'cu-c2') : null}
              {bar(r.units, 'cu-c1')}
              <span className="cu-chart__label">{shortMonth(r.month)}</span>
              <span className="cu-chart__tip" aria-hidden="true">
                <strong>{monthLabel(r.month)}</strong>
                This year {kwh(r.units)} · {inr(r.amount)}
                {withLastYear ? (
                  <>
                    <br />
                    Last year {r.lastYearUnits !== null ? kwh(r.lastYearUnits) : '—'}
                  </>
                ) : null}
              </span>
            </div>
          )
        })}
      </div>
      {withLastYear ? (
        <div className="cu-chart__legend">
          <span>
            <i className="cu-c1" aria-hidden="true" />
            This year
          </span>
          <span>
            <i className="cu-c2" aria-hidden="true" />
            Last year
          </span>
        </div>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------- page */

const CpitlElectricity: React.FC = () => {
  const invalidate = useInvalidateCpitl()
  const { data: connections = [], isLoading: connectionsLoading } = useElectricityConnections()
  const { data: billData, isLoading } = useElectricityBills()
  const bills = useMemo(() => billData || [], [billData])
  const { data: series = [] } = useElectricityAnalytics()
  const [selected, setSelected] = useState<string>('')
  const [connSheet, setConnSheet] = useState<{ open: boolean; connection?: ElectricityConnection | null }>({ open: false })
  const [billSheet, setBillSheet] = useState<{ open: boolean; bill?: ElectricityBill | null }>({ open: false })
  const [payBill, setPayBill] = useState<ElectricityBill | null>(null)
  const [removing, setRemoving] = useState<ElectricityBill | null>(null)
  const [bulkDialog, setBulkDialog] = useState<'pay' | 'remove' | null>(null)
  const [bulkReason, setBulkReason] = useState('')
  const [bulkPaidOn, setBulkPaidOn] = useState(todayIso())
  const [bulkMode, setBulkMode] = useState<PaymentMode>('bank_transfer')
  const [bulkReference, setBulkReference] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState<(BulkResult & { action: string; noun: string }) | null>(null)
  const bulk = useRowSelection(bills, billId, { rowLabel: billRowLabel })
  const selectedUnpaid = bulk.selectedRows.filter((b) => b.status === 'unpaid')
  const selectedUnpaidTotal = selectedUnpaid.reduce((s, b) => s + b.amount, 0)
  const selectedTotal = bulk.selectedRows.reduce((s, b) => s + b.amount, 0)

  const activeConn = selected || connections[0]?._id || ''
  const activeName = connections.find((c) => c._id === activeConn)?.name || ''
  const unpaid = bills.filter((b) => b.status === 'unpaid')
  const sessionTotal = bills.reduce((s, b) => s + b.amount, 0)
  const sessionUnits = bills.reduce((s, b) => s + (b.units || 0), 0)

  const lastReading = (connectionId: string) => {
    const latest = bills.filter((b) => b.connectionId === connectionId && b.currReading !== null).sort((a, b) => b.billMonth.localeCompare(a.billMonth))[0]
    return latest?.currReading ?? null
  }

  const chartRows = useMemo<ChartRow[]>(() => {
    const s = series.find((x) => x.connectionId === activeConn)
    return (s?.months || []).slice(-12)
  }, [series, activeConn])
  const hasLastYear = chartRows.some((r) => r.lastYearUnits !== null)
  // Always show a full 12-month window ending at the latest bill, so a few bills don't stretch across the card.
  const chartMonths = useMemo<ChartRow[]>(() => {
    if (!chartRows.length) return []
    const byMonth = new Map(chartRows.map((r) => [r.month, r]))
    const [y, m] = chartRows[chartRows.length - 1].month.split('-').map(Number)
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(y, m - 1 - (11 - i), 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      return byMonth.get(key) || { month: key, units: 0, amount: 0, lastYearUnits: null }
    })
  }, [chartRows])

  /** Flags a bill whose units sit well away from that meter's other bills this session. */
  const usageFlag = useMemo(() => {
    const flags = new Map<string, { tone: 'warning' | 'info'; label: string; title: string }>()
    bills.forEach((b) => {
      if (!b.units) return
      const others = bills.filter((o) => o._id !== b._id && o.connectionId === b.connectionId && o.units > 0)
      if (others.length < 2) return
      const avg = others.reduce((s, o) => s + o.units, 0) / others.length
      const title = `Usual for this meter: about ${kwh(Math.round(avg))}`
      if (b.units > avg * 1.3) flags.set(b._id, { tone: 'warning', label: `${Math.round((b.units / avg - 1) * 100)}% above usual`, title })
      else if (b.units < avg * 0.5) flags.set(b._id, { tone: 'info', label: 'Unusually low', title })
    })
    return flags
  }, [bills])

  const openBulk = (kind: 'pay' | 'remove') => {
    setBulkReason('')
    setBulkPaidOn(todayIso())
    setBulkMode('bank_transfer')
    setBulkReference('')
    setBulkDialog(kind)
  }

  const runBulk = async () => {
    const kind = bulkDialog
    if (!kind) return
    const reason = bulkReason.trim()
    if (kind === 'remove' && (!reason || !bulk.count)) return
    if (kind === 'pay' && (!selectedUnpaid.length || !bulkPaidOn)) return
    setBulkBusy(true)
    try {
      const result =
        kind === 'pay'
          ? await cpitlBulkService.payBills(
              selectedUnpaid.map(billId),
              { date: bulkPaidOn, mode: bulkMode, ...(bulkReference.trim() ? { reference: bulkReference.trim() } : {}) }
            )
          : await cpitlBulkService.removeBills(bulk.selectedIds, reason)
      setBulkDialog(null)
      bulk.clear()
      const action = kind === 'pay' ? 'Mark bills paid' : 'Remove bills'
      if (result.failed.length) setBulkResult({ ...result, action, noun: 'bills' })
      else toast.success(`${result.succeeded} ${billsNoun(result.succeeded)} ${kind === 'pay' ? 'marked paid' : 'removed'}.`)
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBulkBusy(false)
    }
  }

  const openNewBill = () => setBillSheet({ open: true, bill: null })
  const openNewConnection = () => setConnSheet({ open: true, connection: null })

  const connectionColumns: DataTableColumn<ElectricityConnection>[] = [
    {
      key: 'name',
      header: 'Connection',
      mobile: 'title',
      render: (c) => (
        <span className="cu-entity">
          <span className="cu-entity__name">{c.name}</span>
          {c.consumerNo ? <span className="cu-entity__sub">Consumer {c.consumerNo}</span> : null}
        </span>
      ),
    },
    { key: 'provider', header: 'Provider', mobile: 'subtitle', render: (c) => c.provider || '—' },
    { key: 'location', header: 'Location', render: (c) => c.locationText || '—' },
    {
      key: 'bills',
      header: 'Bills',
      align: 'right',
      numeric: true,
      render: (c) => bills.filter((b) => b.connectionId === c._id).length,
    },
    {
      key: 'billed',
      header: 'Billed this session',
      align: 'right',
      numeric: true,
      mobile: 'aside',
      render: (c) => inr(bills.filter((b) => b.connectionId === c._id).reduce((sum, b) => sum + b.amount, 0)),
    },
    {
      key: 'edit',
      header: <span className="cb-visually-hidden">Actions</span>,
      headerLabel: 'Actions',
      align: 'right',
      interactive: true,
      render: (c) => (
        <Button variant="tertiary" size="sm" icon={Pencil} aria-label={`Edit ${c.name}`} onClick={() => setConnSheet({ open: true, connection: c })} />
      ),
    },
  ]

  const columns: DataTableColumn<ElectricityBill>[] = [
    { key: 'month', header: 'Month', mobile: 'title', render: (b) => <span className="cu-strong">{monthLabel(b.billMonth)}</span> },
    { key: 'connection', header: 'Connection', mobile: 'subtitle', render: (b) => b.connectionSnapshot.name },
    {
      key: 'units',
      header: 'Units',
      align: 'right',
      numeric: true,
      render: (b) => {
        const flag = usageFlag.get(b._id)
        return (
          <span className="cu-num">
            {b.units ? b.units.toLocaleString('en-IN') : '—'}
            {flag ? (
              <Badge tone={flag.tone} title={flag.title}>
                {flag.label}
              </Badge>
            ) : null}
          </span>
        )
      },
    },
    { key: 'amount', header: 'Amount', align: 'right', numeric: true, render: (b) => <span className="cu-strong">{inr(b.amount)}</span> },
    { key: 'rate', header: '₹ / unit', align: 'right', numeric: true, render: (b) => (b.units ? `₹${(b.amount / b.units).toFixed(2)}` : '—') },
    { key: 'due', header: 'Due', render: (b) => <span className={isOverdue(b) ? 'cu-overdue' : undefined}>{fmtDate(b.dueDate)}</span> },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (b) => {
        const overdue = isOverdue(b)
        return (
          <CpitlBadge
            status={b.status === 'paid' ? 'paid' : overdue ? 'overdue' : 'due'}
            label={b.status === 'paid' ? `Paid ${fmtDate(b.paidOn)}` : overdue ? 'Overdue' : 'Unpaid'}
          />
        )
      },
    },
    {
      key: 'actions',
      header: <span className="cb-visually-hidden">Actions</span>,
      headerLabel: 'Actions',
      align: 'right',
      interactive: true,
      render: (b) => {
        const items: MenuItem[] = []
        if (b.attachments?.length) items.push({ label: 'View bill', icon: ExternalLink, onSelect: () => window.open(b.attachments[0].url, '_blank', 'noopener,noreferrer') })
        items.push({ label: 'Edit bill', icon: Pencil, onSelect: () => setBillSheet({ open: true, bill: b }) })
        items.push({ divider: true })
        items.push({ label: 'Remove bill', icon: Trash2, tone: 'danger', onSelect: () => setRemoving(b) })
        return (
          <span className="cu-rowactions">
            {b.status === 'unpaid' ? (
              <Button size="sm" icon={CheckCircle2} onClick={() => setPayBill(b)}>
                Pay
              </Button>
            ) : null}
            <Menu label={`Actions for ${b.connectionSnapshot.name} ${monthLabel(b.billMonth)}`} items={items} />
          </span>
        )
      },
    },
  ]

  let content: React.ReactNode
  if (connectionsLoading) {
    content = (
      <Card>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading connections…
        </div>
      </Card>
    )
  } else if (!connections.length) {
    content = (
      <Card>
        <EmptyState
          icon={Zap}
          title="No electricity connections yet"
          body="Add each connection (meter) the school pays for, then log its monthly bills."
          action={
            <Button variant="primary" icon={Plus} onClick={openNewConnection}>
              Add connection
            </Button>
          }
        />
      </Card>
    )
  } else {
    content = (
      <>
        <div className="cu-actions">
          <Button icon={Plus} onClick={openNewConnection}>
            Add connection
          </Button>
          <Button variant="primary" icon={Plus} onClick={openNewBill}>
            Add bill
          </Button>
        </div>

        <div className="cb-stats">
          <StatCard label="Billed this session" value={inrShort(sessionTotal)} icon={IndianRupee} />
          <StatCard label="Units consumed" value={sessionUnits.toLocaleString('en-IN')} unit="kWh" icon={Zap} />
          <StatCard label="Avg ₹ / unit" value={sessionUnits ? `₹${(sessionTotal / sessionUnits).toFixed(2)}` : '—'} icon={Gauge} />
          <StatCard
            label="Unpaid bills"
            value={unpaid.length}
            hint={inrShort(unpaid.reduce((s, b) => s + b.amount, 0))}
            icon={Receipt}
          />
        </div>

        <Card
          title={connections.length > 1 ? 'Units per month' : `Units per month · ${activeName}`}
          subtitle={chartRows.length ? 'Last 12 months. Hover a month for units and cost.' : undefined}
          action={
            connections.length > 1 ? (
              <Select
                aria-label="Connection"
                size="sm"
                value={activeConn}
                onChange={(event) => setSelected(event.target.value)}
                options={connections.map((c) => ({ value: c._id, label: c.name }))}
                className="cu-connselect"
              />
            ) : null
          }
        >
          {chartRows.length ? (
            <UnitsChart rows={chartMonths} withLastYear={hasLastYear} />
          ) : (
            <EmptyState
              compact
              icon={BarChart3}
              title="No bills for this connection yet"
              body="Add a bill to start the monthly chart."
              action={
                <Button icon={Plus} onClick={openNewBill}>
                  Add bill
                </Button>
              }
            />
          )}
        </Card>

        <Card flush title="Bills this session" className="cu-records">
          {bulk.count ? (
            <div className="cu-bulk">
              <BulkBar count={bulk.count} noun="bill" onClear={bulk.clear} busy={bulkBusy}>
                <Button size="sm" icon={CheckCircle2} onClick={() => openBulk('pay')} disabled={bulkBusy || !selectedUnpaid.length} loading={bulkBusy && bulkDialog === 'pay'}>
                  Mark paid
                </Button>
                <Button size="sm" variant="danger" icon={Trash2} onClick={() => openBulk('remove')} disabled={bulkBusy} loading={bulkBusy && bulkDialog === 'remove'}>
                  Remove
                </Button>
              </BulkBar>
            </div>
          ) : null}
          <DataTable
            caption="Electricity bills this session"
            columns={columns}
            rows={bills}
            getRowKey={(b) => b._id}
            selection={bulk.selection}
            onRowClick={(b) => setBillSheet({ open: true, bill: b })}
            loading={isLoading}
            loadingLabel="Loading bills…"
            empty={
              <EmptyState
                icon={Receipt}
                title="No bills logged this session"
                body="Add each month's bill with its meter readings to track units and cost."
                action={
                  <Button icon={Plus} onClick={openNewBill}>
                    Add bill
                  </Button>
                }
              />
            }
          />
        </Card>

        <Card flush title="Connections" subtitle="Meters the school pays bills for." className="cu-records">
          <DataTable
            caption="Electricity connections"
            columns={connectionColumns}
            rows={connections}
            getRowKey={(c) => c._id}
            onRowClick={(c) => setConnSheet({ open: true, connection: c })}
          />
        </Card>
      </>
    )
  }

  return (
    <Page>
      {content}
      <ConnectionSheet isOpen={connSheet.open} onClose={() => setConnSheet({ open: false })} connection={connSheet.connection} onSaved={invalidate} />
      <BillSheet
        isOpen={billSheet.open}
        onClose={() => setBillSheet({ open: false })}
        connections={connections}
        bill={billSheet.bill}
        lastReading={lastReading}
        onSaved={invalidate}
      />
      <PayDialog bill={payBill} onClose={() => setPayBill(null)} onSaved={invalidate} />
      <RemoveBillDialog bill={removing} onClose={() => setRemoving(null)} onRemoved={invalidate} />
      <Dialog
        open={bulkDialog === 'pay'}
        onClose={() => !bulkBusy && setBulkDialog(null)}
        size="sm"
        title={`Mark ${selectedUnpaid.length} ${billsNoun(selectedUnpaid.length)} paid?`}
        description={`${inr(selectedUnpaidTotal)} is added to the expense ledger with these payment details.`}
        footer={
          <>
            <Button onClick={() => setBulkDialog(null)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button variant="primary" icon={CheckCircle2} loading={bulkBusy} disabled={!selectedUnpaid.length || !bulkPaidOn} onClick={() => void runBulk()}>
              Mark {selectedUnpaid.length} paid
            </Button>
          </>
        }
      >
        <div className="cu-form-stack">
          {bulk.count > selectedUnpaid.length ? (
            <p className="cu-bulknote">
              {bulk.count - selectedUnpaid.length} selected {billsNoun(bulk.count - selectedUnpaid.length)} already paid and will be left as they are.
            </p>
          ) : null}
          <TextField label="Paid on" type="date" required value={bulkPaidOn} max={todayIso()} onChange={(e) => setBulkPaidOn(e.target.value)} />
          <Select label="Mode" value={bulkMode} onChange={(e) => setBulkMode(e.target.value as PaymentMode)} options={PAY_MODES} />
          <TextField label="Reference / UTR" hint="Optional. Saved on every bill." value={bulkReference} onChange={(e) => setBulkReference(e.target.value)} />
        </div>
      </Dialog>
      <Dialog
        open={bulkDialog === 'remove'}
        onClose={() => !bulkBusy && setBulkDialog(null)}
        tone="danger"
        size="sm"
        title={`Remove ${bulk.count} ${billsNoun(bulk.count)}?`}
        description={`${inr(selectedTotal)} in bills. Paid ones are taken out of the expense ledger. The records are kept with your reason.`}
        footer={
          <>
            <Button onClick={() => setBulkDialog(null)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} loading={bulkBusy} disabled={!bulkReason.trim() || !bulk.count} onClick={() => void runBulk()}>
              Remove {bulk.count} {billsNoun(bulk.count)}
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
          placeholder="Duplicate, wrong month…"
          hint="Saved on every removed bill."
        />
      </Dialog>
      <BulkResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />
    </Page>
  )
}

export default CpitlElectricity
