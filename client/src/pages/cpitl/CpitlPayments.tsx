import React, { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Ban, Download, Printer, Receipt, UserRound } from 'lucide-react'
import {
  BulkBar,
  BulkResultDialog,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Menu,
  Page,
  Select,
  TextArea,
  TextField,
  useRowSelection,
  type BulkResult,
  type DataTableColumn,
  type MenuItem,
} from '@/components/ui'
import { useCpitlClasses, useFeePayments, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { FeePayment } from '@/services/cpitlService'
import cpitlBulkService from '@/services/cpitlBulkService'
import { CpitlBadge, MODE_LABELS, errorMessage, fmtDate, inr } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/collection.css'

const isoDaysAgo = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const PRESETS = [
  { id: 'today', label: 'Today', days: 0 },
  { id: '7d', label: '7 days', days: 6 },
  { id: '30d', label: '30 days', days: 29 },
]

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Downloads the selected receipts as a CSV built in the browser (what the table shows). */
const downloadReceiptsCsv = (rows: FeePayment[]) => {
  const header = ['Receipt no.', 'Date', 'Student', 'Roll no.', 'Class-section', 'Mode', 'Reference', 'Amount', 'Status']
  const lines = rows.map((p) =>
    [
      p.receiptNo,
      fmtDate(p.date),
      p.studentSnapshot?.name,
      p.studentSnapshot?.rollNumber,
      `${p.studentSnapshot?.class || ''}${p.studentSnapshot?.section ? `-${p.studentSnapshot.section}` : ''}`,
      MODE_LABELS[p.mode] || p.mode,
      p.reference,
      Number(p.total || 0).toFixed(2),
      p.status === 'cancelled' ? 'Cancelled' : 'Valid',
    ]
      .map(csvCell)
      .join(',')
  )
  // BOM so Excel opens ₹ and names correctly.
  const blob = new Blob(['\ufeff' + [header.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `receipts_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => window.URL.revokeObjectURL(url), 10_000)
}

const CpitlPayments: React.FC = () => {
  const navigate = useNavigate()
  const invalidate = useInvalidateCpitl()
  const { data: classes = [] } = useCpitlClasses()
  const [filters, setFilters] = useState({ from: isoDaysAgo(0), to: isoDaysAgo(0), mode: '', class: '', status: '', q: '' })
  const { data, isLoading, isFetching } = useFeePayments(Object.fromEntries(Object.entries(filters).filter(([, v]) => v)))
  const items = data?.items || []
  const set = (patch: Partial<typeof filters>) => setFilters((prev) => ({ ...prev, ...patch }))
  const [cancelTarget, setCancelTarget] = useState<FeePayment | null>(null)
  const [reason, setReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // Bulk selection: cleared whenever the filters change.
  const getPaymentId = useCallback((p: FeePayment) => p._id, [])
  const bulk = useRowSelection(items, getPaymentId, {
    resetKey: JSON.stringify(filters),
    rowLabel: (p) => `Select receipt ${p.receiptNo}`,
  })
  const [bulkBusy, setBulkBusy] = useState<'' | 'print' | 'cancel'>('')
  const [bulkCancelOpen, setBulkCancelOpen] = useState(false)
  const [bulkReason, setBulkReason] = useState('')
  const [bulkResult, setBulkResult] = useState<(BulkResult & { action: string; noun: string }) | null>(null)
  const cancellable = bulk.selectedRows.filter((p) => p.status === 'valid')
  const cancellableTotal = cancellable.reduce((sum, p) => sum + (p.total || 0), 0)
  const alreadyCancelled = bulk.count - cancellable.length

  const printSelected = async () => {
    setBulkBusy('print')
    try {
      await cpitlBulkService.printReceipts(bulk.selectedIds)
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBulkBusy('')
    }
  }

  const cancelSelected = async () => {
    if (!cancellable.length || !bulkReason.trim()) return
    setBulkBusy('cancel')
    try {
      const result = await cpitlBulkService.cancelReceipts(
        cancellable.map((p) => p._id),
        bulkReason.trim()
      )
      setBulkCancelOpen(false)
      bulk.clear()
      invalidate()
      if (result.failed.length) setBulkResult({ ...result, action: 'Cancel receipts', noun: 'receipts' })
      else toast.success(`${result.succeeded} ${result.succeeded === 1 ? 'receipt' : 'receipts'} cancelled.`)
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBulkBusy('')
    }
  }

  const today = isoDaysAgo(0)
  const hasExtraFilters = Boolean(filters.mode || filters.class || filters.status || filters.q)

  const printReceipt = (p: FeePayment) => cpitlService.openReceipt(p).catch(async (error) => toast.error(await errorMessage(error)))

  const cancelReceipt = async () => {
    if (!cancelTarget || !reason.trim()) return
    setCancelling(true)
    try {
      const res = (await cpitlService.cancelPayment(cancelTarget._id, reason.trim())) as { message?: string } | undefined
      toast.success(res?.message || `Receipt ${cancelTarget.receiptNo} cancelled.`)
      invalidate()
      setCancelTarget(null)
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setCancelling(false)
    }
  }

  const rowMenu = (p: FeePayment): MenuItem[] => {
    const menu: MenuItem[] = [
      { label: 'Print receipt', icon: Printer, onSelect: () => printReceipt(p) },
      { label: 'Open student ledger', icon: UserRound, onSelect: () => navigate(`/cpitl/students/${p.student}`) },
    ]
    if (p.status === 'valid') {
      menu.push({ divider: true })
      menu.push({
        label: 'Cancel receipt',
        icon: Ban,
        tone: 'danger',
        onSelect: () => {
          setReason('')
          setCancelTarget(p)
        },
      })
    }
    return menu
  }

  const columns: DataTableColumn<FeePayment>[] = [
    {
      key: 'receiptNo',
      header: 'Receipt',
      mobile: 'title',
      render: (p) => <span className="cc-cell__primary cc-code">{p.receiptNo}</span>,
    },
    { key: 'date', header: 'Date', mobile: 'subtitle', render: (p) => fmtDate(p.date) },
    {
      key: 'student',
      header: 'Student',
      interactive: true,
      render: (p) => (
        <div className="cc-cell">
          <Link to={`/cpitl/students/${p.student}`} className="cb-link">
            {p.studentSnapshot?.name}
          </Link>
          <span className="cc-cell__secondary">
            {p.studentSnapshot?.class}
            {p.studentSnapshot?.section ? `-${p.studentSnapshot.section}` : ''} · Roll {p.studentSnapshot?.rollNumber}
          </span>
        </div>
      ),
    },
    {
      key: 'mode',
      header: 'Mode',
      render: (p) => (
        <div className="cc-cell">
          <span>{MODE_LABELS[p.mode]}</span>
          {p.reference ? <span className="cc-cell__secondary">{p.reference}</span> : null}
        </div>
      ),
    },
    {
      key: 'total',
      header: 'Amount',
      align: 'right',
      numeric: true,
      mobile: 'aside',
      render: (p) => <span className={p.status === 'cancelled' ? 'cc-money cc-is-void' : 'cc-money'}>{inr(p.total, { decimals: true })}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => (
        <div className="cc-status">
          <CpitlBadge status={p.status} />
          {p.cheque?.status ? <CpitlBadge status={p.cheque.status} label={`Cheque ${p.cheque.status}`} /> : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      interactive: true,
      render: (p) => (
        <div className="cc-actions">
          <Menu items={rowMenu(p)} label={`Actions for receipt ${p.receiptNo}`} />
        </div>
      ),
    },
  ]

  return (
    <Page>
      <Card flush className="cc-card">
        <div className="cc-toolbar">
          <FilterBar
            search={{ placeholder: 'Receipt no. or student', value: filters.q, onChange: (q) => set({ q }), label: 'Search receipts' }}
            chips={PRESETS.map((p) => ({ id: p.id, label: p.label, active: filters.from === isoDaysAgo(p.days) && filters.to === today }))}
            chipsLabel="Date range"
            onChipClick={(id) => {
              const preset = PRESETS.find((p) => p.id === id)
              if (preset) set({ from: isoDaysAgo(preset.days), to: isoDaysAgo(0) })
            }}
          />
          <div className="cb-filterbar">
            <div className="cc-range" role="group" aria-label="Custom date range">
              <TextField aria-label="From date" size="sm" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
              <span className="cc-range__sep">to</span>
              <TextField aria-label="To date" size="sm" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
            </div>
            <Select
              aria-label="Payment mode"
              size="sm"
              className="cc-filter"
              value={filters.mode}
              placeholder="All modes"
              options={Object.entries(MODE_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(e) => set({ mode: e.target.value })}
            />
            <Select
              aria-label="Class"
              size="sm"
              className="cc-filter"
              value={filters.class}
              placeholder="All classes"
              options={classes.map((c) => ({ value: c.class, label: `Class ${c.class}` }))}
              onChange={(e) => set({ class: e.target.value })}
            />
            <Select
              aria-label="Receipt status"
              size="sm"
              className="cc-filter"
              value={filters.status}
              placeholder="Valid and cancelled"
              options={[
                { value: 'valid', label: 'Valid' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
              onChange={(e) => set({ status: e.target.value })}
            />
            {hasExtraFilters ? (
              <Button variant="tertiary" size="sm" onClick={() => set({ mode: '', class: '', status: '', q: '' })}>
                Clear filters
              </Button>
            ) : null}
          </div>
          <div className="cc-summary" aria-live="polite">
            <span>
              Receipts <strong>{data?.summary.count ?? 0}</strong>
            </span>
            <span>
              Collected <strong>{inr(data?.summary.total, { decimals: true })}</strong>
            </span>
          </div>
        </div>

        {bulk.count > 0 ? (
          <div className="cc-bulk">
            <BulkBar count={bulk.count} noun="receipt" onClear={bulk.clear} busy={Boolean(bulkBusy)}>
              <Button size="sm" icon={Printer} loading={bulkBusy === 'print'} disabled={Boolean(bulkBusy)} onClick={printSelected}>
                Print receipts
              </Button>
              <Button size="sm" icon={Download} disabled={Boolean(bulkBusy)} onClick={() => downloadReceiptsCsv(bulk.selectedRows)}>
                Export CSV
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={Ban}
                disabled={Boolean(bulkBusy) || cancellable.length === 0}
                title={cancellable.length === 0 ? 'The selected receipts are already cancelled' : undefined}
                onClick={() => {
                  setBulkReason('')
                  setBulkCancelOpen(true)
                }}
              >
                Cancel receipts
              </Button>
            </BulkBar>
          </div>
        ) : null}

        <DataTable
          caption="Fee receipts"
          columns={columns}
          rows={items}
          getRowKey={(p) => p._id}
          loading={isLoading || isFetching}
          loadingLabel="Loading receipts…"
          onRowClick={printReceipt}
          selection={bulk.selection}
          empty={
            <EmptyState
              icon={Receipt}
              title="No receipts for these filters."
              body="Widen the date range or clear the filters. New receipts appear here when fees are collected."
              action={
                hasExtraFilters ? (
                  <Button onClick={() => set({ mode: '', class: '', status: '', q: '' })}>Clear filters</Button>
                ) : (
                  <Button onClick={() => navigate('/cpitl/collection')}>Go to fee collection</Button>
                )
              }
            />
          }
        />
      </Card>

      <Dialog
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        tone="danger"
        size="sm"
        title={`Cancel receipt ${cancelTarget?.receiptNo || ''}?`}
        description="The amount goes back to the student’s dues. The receipt stays on record as cancelled."
        footer={
          <>
            <Button onClick={() => setCancelTarget(null)}>Keep receipt</Button>
            <Button variant="danger" loading={cancelling} disabled={!reason.trim()} onClick={cancelReceipt}>
              Cancel receipt
            </Button>
          </>
        }
      >
        <TextArea label="Reason" required rows={3} value={reason} autoFocus onChange={(e) => setReason(e.target.value)} />
      </Dialog>

      <Dialog
        open={bulkCancelOpen}
        onClose={() => (bulkBusy === 'cancel' ? undefined : setBulkCancelOpen(false))}
        tone="danger"
        size="sm"
        title={`Cancel ${cancellable.length} ${cancellable.length === 1 ? 'receipt' : 'receipts'}?`}
        description={`${inr(cancellableTotal, { decimals: true })} goes back to the students’ dues. The receipts stay on record as cancelled.${
          alreadyCancelled > 0 ? ` ${alreadyCancelled} already cancelled ${alreadyCancelled === 1 ? 'receipt is' : 'receipts are'} left out.` : ''
        }`}
        footer={
          <>
            <Button onClick={() => setBulkCancelOpen(false)} disabled={bulkBusy === 'cancel'}>
              Keep receipts
            </Button>
            <Button variant="danger" loading={bulkBusy === 'cancel'} disabled={!bulkReason.trim()} onClick={cancelSelected}>
              Cancel {cancellable.length} {cancellable.length === 1 ? 'receipt' : 'receipts'}
            </Button>
          </>
        }
      >
        <TextArea
          label="Reason"
          hint="Saved on every cancelled receipt."
          required
          rows={3}
          value={bulkReason}
          autoFocus
          onChange={(e) => setBulkReason(e.target.value)}
        />
      </Dialog>

      <BulkResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />
    </Page>
  )
}

export default CpitlPayments
