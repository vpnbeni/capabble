import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  BadgePercent,
  Ban,
  CheckCircle2,
  ExternalLink,
  IndianRupee,
  Plus,
  Printer,
  Receipt,
  Trash2,
  Wallet,
} from 'lucide-react'
import {
  Avatar,
  Badge,
  Banner,
  BulkBar,
  BulkResultDialog,
  Button,
  Card,
  Checkbox,
  DataTable,
  DetailList,
  Dialog,
  EmptyState,
  Menu,
  Select,
  Sheet,
  StatCard,
  Tabs,
  TextArea,
  TextField,
  useRowSelection,
  type BulkResult,
  type DataTableColumn,
  type MenuItem,
} from '@/components/ui'
import { useCapitalSettings, useFeeHeads, useFeeStructures, useInvalidateCpitl, useStudentAccount } from '@/hooks/useCpitl'
import cpitlService, { ConcessionRule, FeeDemand, FeePayment, StudentAccount } from '@/services/cpitlService'
import cpitlBulkService from '@/services/cpitlBulkService'
import CollectPaymentModal from './CollectPaymentModal'
import { CpitlBadge, MODE_LABELS, errorMessage, fmtDate, inr } from './CpitlUi'
import './collection.css'

const AccountSettingsSheet: React.FC<{ isOpen: boolean; onClose: () => void; data: StudentAccount; onSaved: () => void }> = ({
  isOpen,
  onClose,
  data,
  onSaved,
}) => {
  const { data: heads = [] } = useFeeHeads()
  const { data: settings } = useCapitalSettings()
  const { data: structures = [] } = useFeeStructures()
  const [concessions, setConcessions] = useState<ConcessionRule[]>([])
  const [optional, setOptional] = useState<string[]>([])
  const [opening, setOpening] = useState(0)
  const [structureId, setStructureId] = useState<string>('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setConcessions(data.account?.concessions || [])
    setOptional((data.account?.optedOptionalHeads || []).map(String))
    setOpening(data.account?.openingBalance || 0)
    setStructureId(data.account?.structureId || '')
  }, [isOpen, data])

  const selectedStructure = structures.find((s) => s._id === structureId)
  const optionalHeads = (selectedStructure?.components || []).filter((c) => c.isOptional)
  const headByCode = useMemo(() => new Map(heads.map((h) => [h.code, h])), [heads])
  const headOptions = heads.map((h) => ({ value: h._id, label: h.name }))

  const addPreset = (presetName: string) => {
    const preset = settings?.concessionPresets.find((p) => p.name === presetName)
    if (!preset) return
    const head = preset.feeHeadCode ? headByCode.get(preset.feeHeadCode) : null
    setConcessions((prev) => [...prev, { name: preset.name, type: preset.type, value: preset.value, feeHead: head?._id || null, reason: '' }])
  }

  const update = (i: number, patch: Partial<ConcessionRule>) => setConcessions((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault()
    setSaving(true)
    try {
      const res = await cpitlService.updateStudentAccount(data.student._id, {
        concessions: concessions.map((c) => ({ ...c, feeHead: c.feeHead || null, value: Number(c.value) })),
        optedOptionalHeads: optional,
        openingBalance: Number(opening) || 0,
        structureId: structureId || null,
      })
      toast.success(res?.message || 'Fee account updated.')
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
      icon={BadgePercent}
      size="lg"
      title="Concessions and services"
      description={data.student.name}
      onSubmit={save}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>
            Save and recalculate
          </Button>
        </>
      }
    >
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Fee plan</h3>
        <div className="cb-form-grid">
          <Select
            label="Fee structure"
            value={structureId}
            onChange={(e) => setStructureId(e.target.value)}
            placeholder="None"
            options={structures
              .filter((s) => s.status !== 'archived' || s._id === structureId)
              .map((s) => ({ value: s._id, label: `${s.name} (v${s.version})` }))}
          />
          <TextField
            label="Previous session arrears"
            type="number"
            min={0}
            prefix="₹"
            hint="Added as a “Previous dues” installment"
            value={opening}
            onChange={(e) => setOpening(Number(e.target.value))}
          />
        </div>
      </div>

      {optionalHeads.length ? (
        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Optional services</h3>
          <div className="cc-optionals">
            {optionalHeads.map((c) => (
              <Checkbox
                key={c.feeHead}
                label={c.name}
                description={inr(c.amount)}
                checked={optional.includes(String(c.feeHead))}
                onChange={(checked) =>
                  setOptional((prev) => (checked ? [...prev, String(c.feeHead)] : prev.filter((x) => x !== String(c.feeHead))))
                }
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Concessions</h3>
        <div className="cc-presets" role="group" aria-label="Add a concession">
          {(settings?.concessionPresets || []).map((p) => (
            <Button key={p.name} size="sm" variant="secondary" icon={Plus} onClick={() => addPreset(p.name)}>
              {p.name}
            </Button>
          ))}
          <Button
            size="sm"
            variant="secondary"
            icon={Plus}
            onClick={() => setConcessions((prev) => [...prev, { name: 'Custom', type: 'percent', value: 0, feeHead: null, reason: '' }])}
          >
            Custom
          </Button>
        </div>
        {concessions.length ? (
          concessions.map((c, i) => (
            <div key={i} className="cc-concession">
              <TextField className="cc-concession__name" label="Name" value={c.name || ''} onChange={(e) => update(i, { name: e.target.value })} />
              <Select
                className="cc-concession__head"
                label="Applies to"
                value={c.feeHead || ''}
                placeholder="All fee heads"
                options={headOptions}
                onChange={(e) => update(i, { feeHead: e.target.value || null })}
              />
              <Select
                className="cc-concession__type"
                label="Type"
                value={c.type}
                options={[
                  { value: 'percent', label: 'Percent' },
                  { value: 'flat', label: 'Flat ₹ per installment' },
                ]}
                onChange={(e) => update(i, { type: e.target.value as ConcessionRule['type'] })}
              />
              <TextField
                className="cc-concession__value"
                label={c.type === 'percent' ? '%' : '₹'}
                type="number"
                min={0}
                value={c.value}
                onChange={(e) => update(i, { value: Number(e.target.value) })}
              />
              <TextField
                className="cc-concession__reason"
                label="Reason or approval"
                value={c.reason || ''}
                onChange={(e) => update(i, { reason: e.target.value })}
              />
              <div className="cc-concession__remove">
                <Button size="sm" variant="tertiary" icon={Trash2} onClick={() => setConcessions((prev) => prev.filter((_, idx) => idx !== i))}>
                  Remove
                </Button>
              </div>
            </div>
          ))
        ) : (
          <p className="cb-muted">No concessions. Add one from a preset or as a custom rule.</p>
        )}
      </div>

      <Banner tone="warning">Saving recalculates unpaid installments only. Installments with payments are not changed.</Banner>
    </Sheet>
  )
}

type Confirm =
  | { kind: 'cancel'; payment: FeePayment }
  | { kind: 'bounce'; payment: FeePayment }
  | null

const StudentLedgerPanel: React.FC<{ studentId: string; showProfileLink?: boolean }> = ({ studentId, showProfileLink }) => {
  const { data, isLoading, isError } = useStudentAccount(studentId)
  const { data: heads = [] } = useFeeHeads()
  const invalidate = useInvalidateCpitl()
  const [collectOpen, setCollectOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState('installments')
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    setTab('installments')
  }, [studentId])

  // Bulk waive / restore on the Installments tab. Only installments without payments can
  // be ticked (the server refuses the rest). Cleared when another student opens.
  const ledgerDemands = useMemo(() => data?.demands || [], [data])
  const getDemandId = useCallback((d: FeeDemand) => d._id, [])
  const isUnpaid = useCallback((d: FeeDemand) => !(d.paid > 0), [])
  const demandBulk = useRowSelection(ledgerDemands, getDemandId, {
    resetKey: studentId,
    isSelectable: isUnpaid,
    rowLabel: (d) => `Select ${d.label}`,
  })
  const [bulkBusy, setBulkBusy] = useState<'' | 'waive' | 'restore'>('')
  const [waiveConfirmOpen, setWaiveConfirmOpen] = useState(false)
  const [bulkResult, setBulkResult] = useState<(BulkResult & { action: string; noun: string }) | null>(null)
  const toWaive = demandBulk.selectedRows.filter((d) => d.status !== 'waived')
  const toRestore = demandBulk.selectedRows.filter((d) => d.status === 'waived')
  const waiveTotal = toWaive.reduce((sum, d) => sum + (d.balance || 0), 0)

  const runBulkWaive = async (waive: boolean) => {
    const rows = waive ? toWaive : toRestore
    if (!rows.length) return
    setBulkBusy(waive ? 'waive' : 'restore')
    try {
      const result = await cpitlBulkService.waiveDemands(
        rows.map((d) => d._id),
        waive
      )
      setWaiveConfirmOpen(false)
      demandBulk.clear()
      invalidate()
      const noun = result.succeeded === 1 ? 'installment' : 'installments'
      if (result.failed.length) setBulkResult({ ...result, action: waive ? 'Waive installments' : 'Restore installments', noun: 'installments' })
      else toast.success(`${result.succeeded} ${noun} ${waive ? 'waived' : 'restored'}.`)
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBulkBusy('')
    }
  }

  if (isLoading) {
    return (
      <Card>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading fee account…
        </div>
      </Card>
    )
  }
  if (isError || !data) {
    return (
      <Card>
        <EmptyState icon={AlertTriangle} title="Could not load this student's fee account." body="Check your connection and try again." />
      </Card>
    )
  }

  const { student, account, structure, demands, payments } = data
  const totals = account?.totals
  const overdue = demands.filter((d) => d.isOverdue && d.status !== 'waived').reduce((s, d) => s + d.balance, 0)
  const lateFeeDue = demands.reduce((s, d) => s + (d.lateFeeDue || 0), 0)
  // "Due" means up to the end of this month; due dates are stored as UTC midnight.
  const today = new Date()
  const monthCutoff = Date.UTC(today.getFullYear(), today.getMonth() + 1, 1)
  const monthEndLabel = new Date(today.getFullYear(), today.getMonth() + 1, 0).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const dueNow = demands
    .filter((d) => d.status !== 'waived' && new Date(d.dueDate).getTime() < monthCutoff)
    .reduce((s, d) => s + d.balance, 0)
  const headName = (id?: string | null) => (id ? heads.find((h) => h._id === id)?.name || 'Fee head' : 'All fee heads')
  const concessions = account?.concessions || []
  const paidPct = totals?.demanded ? Math.round((totals.paid / totals.demanded) * 100) : 0

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    try {
      const res = (await fn()) as { message?: string } | undefined
      if (res?.message) toast.success(res.message)
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const openConfirm = (next: Confirm) => {
    setReason('')
    setConfirm(next)
  }

  const runConfirm = () => {
    if (!confirm) return
    const { payment } = confirm
    if (confirm.kind === 'cancel') {
      if (!reason.trim()) return
      act(`cancel-${payment._id}`, () => cpitlService.cancelPayment(payment._id, reason.trim()))
    } else {
      act(`chq-${payment._id}`, () => cpitlService.updateChequeStatus(payment._id, 'bounced'))
    }
    setConfirm(null)
  }

  const accountStatus = !account ? (
    <Badge tone="neutral">No fee plan</Badge>
  ) : overdue > 0 ? (
    <Badge tone="danger">Overdue</Badge>
  ) : (totals?.balance || 0) > 0 ? (
    <Badge tone="warning">Dues pending</Badge>
  ) : (
    <Badge tone="success">Paid up</Badge>
  )

  const demandColumns: DataTableColumn<FeeDemand>[] = [
    {
      key: 'label',
      header: 'Installment',
      mobile: 'title',
      render: (d) => (
        <div className="cc-cell">
          <span className="cc-cell__primary">{d.label}</span>
          <span className="cc-cell__secondary cc-clip" title={d.lines.map((l) => l.name).join(', ')}>
            {d.lines.map((l) => `${l.name}${l.concession > 0 ? ` (−${inr(l.concession)})` : ''}`).join(', ')}
          </span>
        </div>
      ),
    },
    {
      key: 'dueDate',
      header: 'Due date',
      mobile: 'subtitle',
      render: (d) => <span className={d.isOverdue && d.status !== 'waived' ? 'cc-cell__danger' : undefined}>{fmtDate(d.dueDate)}</span>,
    },
    { key: 'total', header: 'Amount', align: 'right', numeric: true, render: (d) => inr(d.total) },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      numeric: true,
      render: (d) => (d.paid > 0 ? <span className="cc-money cc-money--paid">{inr(d.paid)}</span> : '—'),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      numeric: true,
      render: (d) => (
        <div className="cc-cell">
          <span className="cc-money">{d.balance > 0 && d.status !== 'waived' ? inr(d.balance) : '—'}</span>
          {d.lateFeeDue > 0 ? <span className="cc-cell__danger">+{inr(d.lateFeeDue)} late fee</span> : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (d) => <CpitlBadge status={d.isOverdue && d.status !== 'waived' ? 'overdue' : d.status} />,
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      interactive: true,
      render: (d) =>
        d.paid === 0 ? (
          <div className="cc-actions">
            <Button
              size="sm"
              variant="tertiary"
              loading={busy === `waive-${d._id}`}
              onClick={() => act(`waive-${d._id}`, () => cpitlService.waiveDemand(d._id, d.status !== 'waived'))}
            >
              {d.status === 'waived' ? 'Restore' : 'Waive'}
            </Button>
          </div>
        ) : null,
    },
  ]

  const paymentMenu = (p: FeePayment): MenuItem[] => {
    const items: MenuItem[] = [{ label: 'Print receipt', icon: Printer, onSelect: () => act(`rcpt-${p._id}`, () => cpitlService.openReceipt(p)) }]
    if (p.cheque?.status === 'pending' && p.status === 'valid') {
      items.push({ label: 'Mark cheque cleared', icon: CheckCircle2, onSelect: () => act(`chq-${p._id}`, () => cpitlService.updateChequeStatus(p._id, 'cleared')) })
      items.push({ label: 'Mark cheque bounced', icon: AlertTriangle, tone: 'danger', onSelect: () => openConfirm({ kind: 'bounce', payment: p }) })
    }
    if (p.status === 'valid') {
      items.push({ divider: true })
      items.push({ label: 'Cancel receipt', icon: Ban, tone: 'danger', disabled: busy === `cancel-${p._id}`, onSelect: () => openConfirm({ kind: 'cancel', payment: p }) })
    }
    return items
  }

  const paymentColumns: DataTableColumn<FeePayment>[] = [
    {
      key: 'receiptNo',
      header: 'Receipt',
      mobile: 'title',
      render: (p) => (
        <div className="cc-cell">
          <span className="cc-cell__primary cc-code">{p.receiptNo}</span>
          <span className="cc-cell__secondary">{p.collectedBy?.name ? `By ${p.collectedBy.name}` : fmtDate(p.date)}</span>
        </div>
      ),
    },
    { key: 'date', header: 'Date', mobile: 'subtitle', render: (p) => fmtDate(p.date) },
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
      key: 'for',
      header: 'For',
      render: (p) => <span className="cc-clip">{[...new Set(p.allocations.map((a) => a.periodLabel))].join(', ') || '—'}</span>,
    },
    {
      key: 'total',
      header: 'Amount',
      align: 'right',
      numeric: true,
      render: (p) => <span className={p.status === 'cancelled' ? 'cc-money cc-is-void' : 'cc-money'}>{inr(p.total, { decimals: true })}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (p) => (
        <div className="cc-cell">
          <div className="cc-status">
            <CpitlBadge status={p.status} />
            {p.cheque?.status ? <CpitlBadge status={p.cheque.status} label={`Cheque ${p.cheque.status}`} /> : null}
          </div>
          {p.status === 'cancelled' && p.cancellation?.reason ? (
            <span className="cc-cell__secondary" title={p.cancellation.reason}>
              {p.cancellation.reason}
            </span>
          ) : null}
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
          <Menu items={paymentMenu(p)} label={`Actions for receipt ${p.receiptNo}`} />
        </div>
      ),
    },
  ]

  const concessionColumns: DataTableColumn<ConcessionRule>[] = [
    { key: 'name', header: 'Concession', mobile: 'title', render: (c) => <span className="cc-cell__primary">{c.name || 'Concession'}</span> },
    { key: 'feeHead', header: 'Applies to', mobile: 'subtitle', render: (c) => headName(c.feeHead) },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      numeric: true,
      mobile: 'aside',
      render: (c) => (c.type === 'percent' ? `${c.value}%` : `${inr(c.value)} per installment`),
    },
    { key: 'reason', header: 'Reason or approval', render: (c) => c.reason || '—' },
  ]

  return (
    <div className="cc-ledger">
      <Card>
        <div className="cc-hero">
          <Avatar name={student.name} size="lg" square />
          <div className="cc-hero__main">
            <div className="cc-hero__name">
              <h2>{student.name}</h2>
              {accountStatus}
            </div>
            <p className="cc-hero__facts">
              <span>
                Class{' '}
                <strong>
                  {student.class}
                  {student.section ? `-${student.section}` : ''}
                </strong>
              </span>
              <span>
                Roll <strong className="is-num">{student.rollNumber || '—'}</strong>
              </span>
              {student.fatherName ? <span>{student.fatherName}</span> : null}
              {student.guardianPhone ? <span className="is-num">{student.guardianPhone}</span> : null}
            </p>
            <p className="cc-hero__plan">
              {structure ? (
                <>
                  <Link to={`/cpitl/fee-structures/${structure._id}`} className="cb-link">
                    {structure.name}
                  </Link>{' '}
                  v{account?.structureVersion}
                  {structure.isOutdated ? ` · structure updated to v${structure.version}` : ''}
                </>
              ) : (
                'No fee structure assigned'
              )}
              {concessions.length ? ` · ${concessions.length} ${concessions.length === 1 ? 'concession' : 'concessions'}` : ''}
            </p>
          </div>
          <div className="cc-hero__actions">
            {showProfileLink ? (
              <Link to={`/cpitl/students/${student._id}`} className="cb-btn cb-btn--tertiary cb-btn--md" title="Open full ledger">
                <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" className="cb-icon" />
                <span className="cb-btn__label">Full ledger</span>
              </Link>
            ) : null}
            <Button icon={BadgePercent} onClick={() => setSettingsOpen(true)}>
              Concessions
            </Button>
            <Button
              icon={Printer}
              loading={busy === 'slip'}
              disabled={!totals?.balance}
              onClick={() => act('slip', () => cpitlService.openStudentSlip(student._id))}
            >
              Fee slip
            </Button>
            <Button variant="primary" icon={IndianRupee} disabled={!totals?.balance} onClick={() => setCollectOpen(true)}>
              Collect fee
            </Button>
          </div>
        </div>
      </Card>

      {totals ? (
        <section className="cb-stats cc-stats" aria-label="Fee totals">
          <StatCard
            label="Expected"
            value={inr(totals.demanded)}
            hint={totals.concession > 0 ? `After ${inr(totals.concession)} concession` : 'Session fee'}
          />
          <StatCard
            label="Paid"
            value={inr(totals.paid)}
            hint={`${paidPct}% of session fee`}
            progress={paidPct}
            progressTone={paidPct >= 85 ? 'success' : paidPct >= 50 ? 'warning' : 'danger'}
          />
          <StatCard
            label={`Due by ${monthEndLabel}`}
            value={inr(dueNow)}
            hint={
              totals.balance - dueNow > 0
                ? `${inr(totals.balance - dueNow)} more later in the session`
                : totals.balance > 0
                  ? 'Nothing else this session'
                  : 'Nothing pending'
            }
          />
          <StatCard
            label="Overdue"
            value={inr(overdue)}
            hint={lateFeeDue > 0 ? `+ ${inr(lateFeeDue)} late fee` : overdue > 0 ? 'Past due date' : 'Nothing overdue'}
          />
        </section>
      ) : null}

      <Tabs
        label="Ledger sections"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'installments', label: 'Installments', count: demands.length },
          { id: 'payments', label: 'Payments', count: payments.length },
          { id: 'concessions', label: 'Concessions', count: concessions.length },
        ]}
      />

      {tab === 'installments' ? (
        <Card flush className="cc-card">
          {demandBulk.count > 0 ? (
            <div className="cc-bulk cc-bulk--ledger">
              <BulkBar count={demandBulk.count} noun="installment" onClear={demandBulk.clear} busy={Boolean(bulkBusy)}>
                {toWaive.length > 0 ? (
                  <Button size="sm" variant="danger" disabled={Boolean(bulkBusy)} onClick={() => setWaiveConfirmOpen(true)}>
                    Waive {toWaive.length}
                  </Button>
                ) : null}
                {toRestore.length > 0 ? (
                  <Button size="sm" loading={bulkBusy === 'restore'} disabled={Boolean(bulkBusy)} onClick={() => runBulkWaive(false)}>
                    Restore {toRestore.length}
                  </Button>
                ) : null}
              </BulkBar>
            </div>
          ) : null}
          <DataTable
            caption="Installments"
            columns={demandColumns}
            rows={demands}
            selection={demandBulk.selection}
            getRowKey={(d) => d._id}
            empty={
              <EmptyState
                icon={Wallet}
                title={account ? 'No installments yet.' : 'This student has no fee account.'}
                body={account ? 'Installments appear once a fee structure is applied.' : 'Assign a fee structure from Fee structures, or pick one under Concessions.'}
                action={
                  account ? undefined : (
                    <Button icon={BadgePercent} onClick={() => setSettingsOpen(true)}>
                      Set fee plan
                    </Button>
                  )
                }
              />
            }
          />
        </Card>
      ) : null}

      {tab === 'payments' ? (
        <Card flush className="cc-card">
          <DataTable
            caption="Payments"
            columns={paymentColumns}
            rows={payments}
            getRowKey={(p) => p._id}
            onRowClick={(p) => act(`rcpt-${p._id}`, () => cpitlService.openReceipt(p))}
            empty={
              <EmptyState
                icon={Receipt}
                title="No payments yet."
                body={totals?.balance ? 'Collect a fee to create the first receipt.' : undefined}
                action={
                  totals?.balance ? (
                    <Button variant="primary" icon={IndianRupee} onClick={() => setCollectOpen(true)}>
                      Collect fee
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </Card>
      ) : null}

      {tab === 'concessions' ? (
        <Card
          flush
          className="cc-card"
          title="Concessions and services"
          action={
            <Button size="sm" icon={BadgePercent} onClick={() => setSettingsOpen(true)}>
              Edit
            </Button>
          }
        >
          <div className="cc-card__intro">
            <DetailList
              columns={3}
              items={[
                { label: 'Fee structure', value: structure ? `${structure.name} (v${account?.structureVersion})` : 'None' },
                { label: 'Previous session arrears', value: inr(account?.openingBalance || 0) },
                { label: 'Optional services', value: account?.optedOptionalHeads?.length ? `${account.optedOptionalHeads.length} opted` : 'None' },
              ]}
            />
          </div>
          <DataTable
            caption="Concessions"
            columns={concessionColumns}
            rows={concessions}
            getRowKey={(c) => c._id || `${c.name}-${c.feeHead}-${c.value}`}
            empty={
              <EmptyState
                icon={BadgePercent}
                title="No concessions on this account."
                body="Add a scholarship, sibling or staff concession to reduce future installments."
                action={
                  <Button icon={Plus} onClick={() => setSettingsOpen(true)}>
                    Add concession
                  </Button>
                }
              />
            }
          />
        </Card>
      ) : null}

      <CollectPaymentModal isOpen={collectOpen} onClose={() => setCollectOpen(false)} data={data} onCollected={invalidate} />
      <AccountSettingsSheet isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} data={data} onSaved={invalidate} />

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        tone="danger"
        size="sm"
        title={confirm?.kind === 'bounce' ? 'Mark cheque as bounced?' : `Cancel receipt ${confirm?.payment.receiptNo || ''}?`}
        description={
          confirm?.kind === 'bounce'
            ? 'The receipt will be cancelled and the dues restored on this ledger.'
            : 'The amount goes back to the student’s dues. The receipt stays on record as cancelled.'
        }
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Keep receipt</Button>
            <Button variant="danger" disabled={confirm?.kind === 'cancel' && !reason.trim()} onClick={runConfirm}>
              {confirm?.kind === 'bounce' ? 'Mark bounced' : 'Cancel receipt'}
            </Button>
          </>
        }
      >
        {confirm?.kind === 'cancel' ? (
          <TextArea label="Reason" required rows={3} value={reason} autoFocus onChange={(e) => setReason(e.target.value)} />
        ) : null}
      </Dialog>

      <Dialog
        open={waiveConfirmOpen}
        onClose={() => (bulkBusy === 'waive' ? undefined : setWaiveConfirmOpen(false))}
        tone="danger"
        size="sm"
        title={`Waive ${toWaive.length} ${toWaive.length === 1 ? 'installment' : 'installments'}?`}
        description={`${inr(waiveTotal)} will no longer be due from ${student.name}. You can restore waived installments later.`}
        footer={
          <>
            <Button onClick={() => setWaiveConfirmOpen(false)} disabled={bulkBusy === 'waive'}>
              Keep dues
            </Button>
            <Button variant="danger" loading={bulkBusy === 'waive'} onClick={() => runBulkWaive(true)}>
              Waive {inr(waiveTotal)}
            </Button>
          </>
        }
      >
        <ul className="cc-bulk-list">
          {toWaive.map((d) => (
            <li key={d._id}>
              <span>{d.label}</span>
              <span className="cc-money">{inr(d.balance)}</span>
            </li>
          ))}
        </ul>
      </Dialog>

      <BulkResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />
    </div>
  )
}

export default StudentLedgerPanel
