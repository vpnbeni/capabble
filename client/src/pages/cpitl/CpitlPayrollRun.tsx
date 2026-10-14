import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CheckCircle2, Download, FileSearch, Lock, Pencil, Printer, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useInvalidateCpitl, usePayrollRun } from '@/hooks/useCpitl'
import cpitlService, { PaymentMode, Payslip } from '@/services/cpitlService'
import cpitlBulkService from '@/services/cpitlBulkService'
import { todayIso } from '@/components/cpitl/QuickExpenseSheet'
import {
  Avatar,
  Banner,
  BulkBar,
  Button,
  Card,
  DataTable,
  DetailList,
  Dialog,
  EmptyState,
  Menu,
  Page,
  PageHeader,
  Select,
  Sheet,
  StatCard,
  TextArea,
  TextField,
  useRowSelection,
  type DataTableColumn,
  type MenuItem,
} from '@/components/ui'
import { CpitlBadge, MODE_LABELS, errorMessage, fmtDate, inr } from '@/components/cpitl/CpitlUi'
import { PAYROLL_STATUS_BADGE, monthTitle } from './CpitlPayroll'
import '@/components/cpitl/payroll.css'

type Edit = { lopDays: string; arrears: string; otherDeduction: string; remarks: string }
type Confirm = null | 'delete' | 'finalize' | 'reopen-paid'

const PAY_MODES: PaymentMode[] = ['bank_transfer', 'cheque', 'cash', 'upi']

const editFrom = (p: Payslip): Edit => ({
  lopDays: String(p.lopDays ?? ''),
  arrears: String(p.arrears ?? ''),
  otherDeduction: String(p.otherDeduction ?? ''),
  remarks: p.remarks || '',
})

const getSlipId = (p: Payslip) => p._id
const slipRowLabel = (p: Payslip) => `Select ${p.snapshot.name}`

const toNumber = (value: string) => Number(value) || 0

/** Edits LOP, arrears, other deductions and remarks for many payslips; saved in one update. */
const BulkAdjustSheet: React.FC<{
  slips: Payslip[]
  open: boolean
  daysInMonth: number
  saving: boolean
  onClose: () => void
  onSave: (changes: Array<{ _id: string; lopDays: number; arrears: number; otherDeduction: number; remarks: string }>) => void
}> = ({ slips, open, daysInMonth, saving, onClose, onSave }) => {
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [allLop, setAllLop] = useState('')
  const [allArrears, setAllArrears] = useState('')

  useEffect(() => {
    if (!open) return
    setEdits(Object.fromEntries(slips.map((p) => [p._id, editFrom(p)])))
    setAllLop('')
    setAllArrears('')
    // Only when the sheet opens: later refetches must not wipe what the user typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const setField = (id: string, key: keyof Edit, value: string) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))
  const setAll = (key: keyof Edit, value: string) =>
    setEdits((prev) => Object.fromEntries(Object.entries(prev).map(([id, e]) => [id, { ...e, [key]: value }])))

  const lopError = (value: string) => {
    const n = Number(value)
    if (value.trim() === '') return undefined
    if (!Number.isFinite(n) || n < 0 || n > daysInMonth) return `0 to ${daysInMonth}`
    if (Math.round(n * 2) !== n * 2) return 'Use whole or half days'
    return undefined
  }
  const moneyError = (value: string) => (value.trim() !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0) ? 'Enter 0 or more' : undefined)
  const hasErrors = slips.some((p) => {
    const e = edits[p._id]
    return e && (lopError(e.lopDays) || moneyError(e.arrears) || moneyError(e.otherDeduction))
  })
  const allLopError = lopError(allLop)
  const allArrearsError = moneyError(allArrears)

  const save = () => {
    const changes = slips
      .map((p) => ({ p, e: edits[p._id] }))
      .filter(({ p, e }) => e && (toNumber(e.lopDays) !== (p.lopDays || 0) || toNumber(e.arrears) !== (p.arrears || 0) || toNumber(e.otherDeduction) !== (p.otherDeduction || 0) || e.remarks !== (p.remarks || '')))
      .map(({ p, e }) => ({ _id: p._id, lopDays: toNumber(e.lopDays), arrears: toNumber(e.arrears), otherDeduction: toNumber(e.otherDeduction), remarks: e.remarks }))
    if (!changes.length) {
      toast('Nothing changed.')
      onClose()
      return
    }
    onSave(changes)
  }

  return (
    <Sheet
      open={open}
      onClose={saving ? undefined : onClose}
      size="xl"
      icon={Pencil}
      title={`Edit adjustments for ${slips.length} staff`}
      description="Net pay, PF and ESI are recalculated when you save."
      onSubmit={(e) => {
        e.preventDefault()
        if (!hasErrors && !saving) save()
      }}
      footer={
        <>
          <Button disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={Save} loading={saving} disabled={hasErrors || saving}>
            {`Save ${slips.length} payslips`}
          </Button>
        </>
      }
    >
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Apply the same value to everyone</h3>
        <div className="cp-applyall">
          <div className="cp-applyall__item">
            <TextField
              label="LOP days"
              type="number"
              min={0}
              max={daysInMonth}
              step="0.5"
              value={allLop}
              placeholder="0"
              error={allLopError}
              onChange={(e) => setAllLop(e.target.value)}
            />
            <Button size="sm" disabled={allLop.trim() === '' || Boolean(allLopError)} onClick={() => setAll('lopDays', allLop)}>
              Apply to all
            </Button>
          </div>
          <div className="cp-applyall__item">
            <TextField
              label="Arrears"
              type="number"
              min={0}
              prefix="₹"
              value={allArrears}
              placeholder="0"
              error={allArrearsError}
              onChange={(e) => setAllArrears(e.target.value)}
            />
            <Button size="sm" disabled={allArrears.trim() === '' || Boolean(allArrearsError)} onClick={() => setAll('arrears', allArrears)}>
              Apply to all
            </Button>
          </div>
        </div>
      </div>

      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Per staff member</h3>
        <ul className="cp-bulkedit" aria-label="Payslip adjustments">
          <li className="cp-bulkedit__head" aria-hidden="true">
            <span>Staff</span>
            <span>LOP days</span>
            <span>Arrears</span>
            <span>Other deduction</span>
            <span>Remarks</span>
          </li>
          {slips.map((p) => {
            const e = edits[p._id]
            if (!e) return null
            const name = p.snapshot.name
            return (
              <li key={p._id} className="cp-bulkedit__row">
                <span className="cp-bulkedit__name">
                  <span className="cp-person__name">{name}</span>
                  <span className="cp-person__meta">
                    {p.lopFromAttendance !== null ? `Attendance suggests ${p.lopFromAttendance} LOP` : `Net ${inr(p.net)}`}
                  </span>
                </span>
                <TextField
                  size="sm"
                  type="number"
                  min={0}
                  max={daysInMonth}
                  step="0.5"
                  label="LOP days"
                  aria-label={`LOP days for ${name}`}
                  value={e.lopDays}
                  error={lopError(e.lopDays)}
                  onChange={(ev) => setField(p._id, 'lopDays', ev.target.value)}
                />
                <TextField
                  size="sm"
                  type="number"
                  min={0}
                  prefix="₹"
                  label="Arrears"
                  aria-label={`Arrears for ${name}`}
                  value={e.arrears}
                  error={moneyError(e.arrears)}
                  onChange={(ev) => setField(p._id, 'arrears', ev.target.value)}
                />
                <TextField
                  size="sm"
                  type="number"
                  min={0}
                  prefix="₹"
                  label="Other deduction"
                  aria-label={`Other deduction for ${name}`}
                  value={e.otherDeduction}
                  error={moneyError(e.otherDeduction)}
                  onChange={(ev) => setField(p._id, 'otherDeduction', ev.target.value)}
                />
                <TextField
                  size="sm"
                  label="Remarks"
                  aria-label={`Remarks for ${name}`}
                  placeholder="Remarks"
                  value={e.remarks}
                  onChange={(ev) => setField(p._id, 'remarks', ev.target.value)}
                />
              </li>
            )
          })}
        </ul>
      </div>
    </Sheet>
  )
}

const CpitlPayrollRun: React.FC = () => {
  const { month = '' } = useParams()
  const navigate = useNavigate()
  const invalidate = useInvalidateCpitl()
  const { data: run, isLoading } = usePayrollRun(month)
  const [busy, setBusy] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [paidOn, setPaidOn] = useState(todayIso())
  const [mode, setMode] = useState<PaymentMode>('bank_transfer')
  const [reference, setReference] = useState('')
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [openSlipId, setOpenSlipId] = useState<string | null>(null)
  const [edit, setEdit] = useState<Edit | null>(null)
  const [bulkEditing, setBulkEditing] = useState(false)
  const [printing, setPrinting] = useState(false)

  const slips = useMemo(() => run?.payslips || [], [run])
  const { selection, selectedRows, count, clear } = useRowSelection(slips, getSlipId, {
    resetKey: `${month}|${run?.status || ''}`,
    rowLabel: slipRowLabel,
  })

  const act = async (key: string, fn: () => Promise<{ message?: string } | undefined>, after?: () => void) => {
    setBusy(key)
    try {
      const res = await fn()
      toast.success(res?.message || 'Done.')
      invalidate()
      after?.()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const attendanceDiffers = useMemo(
    () => (run?.payslips || []).filter((p) => p.lopFromAttendance !== null && p.lopFromAttendance !== p.lopDays).length,
    [run]
  )

  const openSlip = run?.payslips.find((p) => p._id === openSlipId) || null
  const draft = run?.status === 'draft'

  const openPayslip = (p: Payslip) => {
    setOpenSlipId(p._id)
    setEdit(editFrom(p))
  }
  const closePayslip = () => {
    setOpenSlipId(null)
    setEdit(null)
  }
  const setField = (key: keyof Edit, value: string) => setEdit((prev) => (prev ? { ...prev, [key]: value } : prev))

  const saveAdjustments = () => {
    if (!openSlip || !edit) return
    act(
      'save',
      () =>
        cpitlService.updatePayrollRun(month, [
          {
            _id: openSlip._id,
            lopDays: Number(edit.lopDays) || 0,
            arrears: Number(edit.arrears) || 0,
            otherDeduction: Number(edit.otherDeduction) || 0,
            remarks: edit.remarks,
          },
        ]),
      closePayslip
    )
  }

  const saveBulkAdjustments = (changes: Parameters<typeof cpitlService.updatePayrollRun>[1]) =>
    act('bulk-save', () => cpitlService.updatePayrollRun(month, changes), () => {
      setBulkEditing(false)
      clear()
    })

  const printSelected = async () => {
    setPrinting(true)
    try {
      await cpitlBulkService.printPayslips(month, selectedRows.map((p) => p.teacherId))
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setPrinting(false)
    }
  }

  const printSlips = (staffKey?: string) =>
    cpitlService.openPayslips(month, staffKey).catch(async (e) => toast.error(await errorMessage(e)))

  if (isLoading) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading payroll…
        </div>
      </Page>
    )
  }
  if (!run) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={FileSearch}
            title="Payroll run not found"
            body={`There is no payroll for ${month ? monthTitle(month) : 'this month'}. Run it from the payroll list.`}
            action={<Button onClick={() => navigate('/cpitl/payroll')}>Go to payroll</Button>}
          />
        </Card>
      </Page>
    )
  }

  const t = run.totals

  const menuItems: MenuItem[] = [
    {
      label: 'Download bank sheet',
      icon: Download,
      onSelect: () => cpitlService.downloadBankSheet(run.month).catch(async (e) => toast.error(await errorMessage(e))),
    },
  ]
  if (run.status === 'finalized') {
    menuItems.push({ divider: true }, { label: 'Reopen as draft', icon: RotateCcw, disabled: Boolean(busy), onSelect: () => act('reopen', () => cpitlService.reopenPayrollRun(run.month)) })
  }
  if (run.status === 'paid') {
    menuItems.push({ divider: true }, { label: 'Reopen payroll', icon: RotateCcw, tone: 'danger', disabled: Boolean(busy), onSelect: () => setConfirm('reopen-paid') })
  }
  if (draft) {
    menuItems.push({ divider: true }, { label: 'Delete draft', icon: Trash2, tone: 'danger', disabled: Boolean(busy), onSelect: () => setConfirm('delete') })
  }

  const columns: DataTableColumn<Payslip>[] = [
    {
      key: 'staff',
      header: 'Staff',
      mobile: 'title',
      render: (p) => (
        <span className="cp-person">
          <Avatar name={p.snapshot.name} size="sm" />
          <span className="cp-person__text">
            <span className="cp-person__name">{p.snapshot.name}</span>
            <span className="cp-person__meta">{[p.snapshot.designation, p.snapshot.employeeId].filter(Boolean).join(' · ') || '—'}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'lop',
      header: 'LOP days',
      align: 'right',
      numeric: true,
      render: (p) => (
        <>
          {p.lopDays}
          {p.lopFromAttendance !== null ? (
            <span className={p.lopFromAttendance !== p.lopDays ? 'cp-sub is-warn' : 'cp-sub'}>Attendance {p.lopFromAttendance}</span>
          ) : null}
        </>
      ),
    },
    { key: 'arrears', header: 'Arrears', align: 'right', numeric: true, render: (p) => (p.arrears ? inr(p.arrears) : '—') },
    { key: 'other', header: 'Other ded.', headerLabel: 'Other deductions', align: 'right', numeric: true, render: (p) => (p.otherDeduction ? inr(p.otherDeduction) : '—') },
    { key: 'gross', header: 'Gross', align: 'right', numeric: true, render: (p) => inr(p.gross) },
    { key: 'deductions', header: 'Deductions', align: 'right', numeric: true, render: (p) => <span className="cp-neg">{inr(p.totalDeductions)}</span> },
    { key: 'net', header: 'Net pay', align: 'right', numeric: true, mobile: 'aside', render: (p) => <span className="cp-strong">{inr(p.net)}</span> },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Payslip',
      interactive: true,
      width: 56,
      render: (p) => (
        <span className="cp-actions">
          <Button variant="tertiary" size="sm" icon={Printer} aria-label={`Print payslip for ${p.snapshot.name}`} onClick={() => printSlips(p.staffKey)} />
        </span>
      ),
    },
  ]

  const confirmCopy: Record<Exclude<Confirm, null>, { title: string; description: string; action: string; danger: boolean }> = {
    delete: {
      title: `Delete the ${monthTitle(run.month)} draft?`,
      description: 'The draft and its payslip adjustments are removed. You can run payroll for this month again.',
      action: 'Delete draft',
      danger: true,
    },
    finalize: {
      title: `Finalize ${monthTitle(run.month)} payroll?`,
      description: `Locks ${t.staff} payslips at a net pay of ${inr(t.net)}. You can reopen it as a draft until it is marked paid.`,
      action: 'Finalize payroll',
      danger: false,
    },
    'reopen-paid': {
      title: 'Reopen a paid payroll?',
      description: 'Its salary expense entry will be voided.',
      action: 'Reopen payroll',
      danger: true,
    },
  }

  const runConfirm = () => {
    if (confirm === 'delete') act('delete', () => cpitlService.deletePayrollRun(run.month), () => navigate('/cpitl/payroll'))
    if (confirm === 'finalize') act('finalize', () => cpitlService.finalizePayrollRun(run.month), () => setConfirm(null))
    if (confirm === 'reopen-paid') act('reopen', () => cpitlService.reopenPayrollRun(run.month), () => setConfirm(null))
  }

  return (
    <Page>
      <PageHeader
        title={
          <span className="cp-hero-title">
            {monthTitle(run.month)}
            <CpitlBadge status={PAYROLL_STATUS_BADGE[run.status]} label={run.status} />
          </span>
        }
        subtitle={`${t.staff} staff · ${run.daysInMonth} days${run.attendanceUsed ? ' · LOP pre-filled from attendance' : ' · Attendance module off — enter LOP by hand'}`}
        actions={
          <>
            <Button size="sm" icon={Printer} onClick={() => printSlips()}>
              Print payslips
            </Button>
            <Menu items={menuItems} label="More payroll actions" />
            {draft ? (
              <Button variant="primary" size="sm" icon={Lock} disabled={Boolean(busy)} onClick={() => setConfirm('finalize')}>
                Finalize payroll
              </Button>
            ) : null}
            {run.status === 'finalized' ? (
              <Button variant="primary" size="sm" icon={CheckCircle2} onClick={() => setPayOpen(true)}>
                Mark paid
              </Button>
            ) : null}
          </>
        }
      />

      <section className="cb-stats cp-stats--5" aria-label="Payroll totals">
        <StatCard label="Gross" value={inr(t.gross)} />
        <StatCard label="Deductions" value={inr(t.deductions)} />
        <StatCard label="Net pay" value={inr(t.net)} />
        <StatCard label="Employer PF + ESI" value={inr(t.employerPf + t.employerEsi)} />
        <StatCard label="Total cost" value={inr(t.net + t.deductions + t.employerPf + t.employerEsi)} />
      </section>

      {run.status === 'paid' ? (
        <Banner tone="success" title={`Paid on ${fmtDate(run.paidOn)}`}>
          By {MODE_LABELS[run.paymentMode] || run.paymentMode}
          {run.reference ? ` (${run.reference})` : ''}. Booked as a salary expense.
        </Banner>
      ) : null}
      {run.staffWithoutSalary?.length ? (
        <Banner tone="warning" title={`${run.staffWithoutSalary.length} active staff have no salary and are not in this run`}>
          {run.staffWithoutSalary.slice(0, 6).map((s) => s.name).join(', ')}
          {run.staffWithoutSalary.length > 6 ? '…' : ''}.{' '}
          <Link to="/cpitl/salary" className="cb-link">
            Set salaries
          </Link>
          {draft ? ', then delete and re-create this draft.' : '.'}
        </Banner>
      ) : null}

      <Card
        flush
        className="cp-card"
        title="Payslips"
        subtitle={
          draft
            ? `Select a staff member to adjust LOP days, arrears and deductions, or tick several to edit them together.${attendanceDiffers ? ` ${attendanceDiffers} LOP value(s) changed from what attendance suggested.` : ''}`
            : 'Select a staff member to see their payslip.'
        }
      >
        {count ? (
          <div className="cp-toolbar">
            <BulkBar count={count} noun="payslip" onClear={clear} busy={printing || busy === 'bulk-save'}>
              {draft ? (
                <Button size="sm" icon={Pencil} disabled={printing || Boolean(busy)} onClick={() => setBulkEditing(true)}>
                  Edit adjustments
                </Button>
              ) : null}
              <Button size="sm" icon={Printer} loading={printing} disabled={printing} onClick={printSelected}>
                Print payslips
              </Button>
            </BulkBar>
          </div>
        ) : null}
        <DataTable<Payslip>
          columns={columns}
          rows={run.payslips}
          selection={selection}
          getRowKey={(p) => p._id}
          onRowClick={openPayslip}
          caption={`Payslips for ${monthTitle(run.month)}`}
          empty={<EmptyState title="No payslips in this run" body="Set staff salaries, then delete and re-create this draft." compact />}
        />
      </Card>

      <Sheet
        open={Boolean(openSlip)}
        onClose={closePayslip}
        size="lg"
        title={openSlip?.snapshot.name || 'Payslip'}
        description={openSlip ? [openSlip.snapshot.designation, openSlip.snapshot.employeeId, `${openSlip.paidDays} paid days`].filter(Boolean).join(' · ') : undefined}
        footer={
          openSlip ? (
            <>
              <Button icon={Printer} onClick={() => printSlips(openSlip.staffKey)}>
                Print payslip
              </Button>
              {draft ? (
                <>
                  <Button onClick={closePayslip}>Cancel</Button>
                  <Button variant="primary" icon={Save} loading={busy === 'save'} onClick={saveAdjustments}>
                    Save adjustments
                  </Button>
                </>
              ) : (
                <Button variant="primary" onClick={closePayslip}>
                  Done
                </Button>
              )}
            </>
          ) : null
        }
      >
        {openSlip ? (
          <>
            {draft && edit ? (
              <div className="cb-form-section">
                <h3 className="cb-form-section__title">Adjustments</h3>
                <div className="cb-form-grid cb-form-grid--3">
                  <TextField
                    label="LOP days"
                    type="number"
                    min={0}
                    max={run.daysInMonth}
                    step="0.5"
                    value={edit.lopDays}
                    onChange={(e) => setField('lopDays', e.target.value)}
                    hint={openSlip.lopFromAttendance !== null ? `Attendance suggests ${openSlip.lopFromAttendance}` : `Out of ${run.daysInMonth} days`}
                  />
                  <TextField label="Arrears" type="number" min={0} prefix="₹" value={edit.arrears} onChange={(e) => setField('arrears', e.target.value)} />
                  <TextField
                    label="Other deduction"
                    type="number"
                    min={0}
                    prefix="₹"
                    value={edit.otherDeduction}
                    onChange={(e) => setField('otherDeduction', e.target.value)}
                  />
                  <TextArea
                    className="is-wide"
                    label="Remarks on payslip"
                    rows={2}
                    value={edit.remarks}
                    onChange={(e) => setField('remarks', e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <div className="cb-form-section">
              <h3 className="cb-form-section__title">Payslip{draft ? ' (amounts update after you save)' : ''}</h3>
              <div className="cp-slipgrid">
                <div className="cp-slip">
                  <ul className="cp-slip__group" aria-label="Earnings">
                    <li className="cp-slip__label">Earnings</li>
                    {openSlip.earnings.map((e) => (
                      <li key={e.code} className="cp-slip__row">
                        <span>{e.name}</span>
                        <span>{inr(e.amount)}</span>
                      </li>
                    ))}
                    <li className="cp-slip__row is-sum">
                      <span>Gross</span>
                      <span>{inr(openSlip.gross)}</span>
                    </li>
                  </ul>
                </div>
                <div className="cp-slip">
                  <ul className="cp-slip__group" aria-label="Deductions">
                    <li className="cp-slip__label">Deductions</li>
                    {openSlip.deductions.map((d) => (
                      <li key={d.code} className="cp-slip__row is-neg">
                        <span>{d.name}</span>
                        <span>{inr(d.amount)}</span>
                      </li>
                    ))}
                    {!openSlip.deductions.length ? <li className="cp-slip__empty">None</li> : null}
                    <li className="cp-slip__row is-sum">
                      <span>Total</span>
                      <span>{inr(openSlip.totalDeductions)}</span>
                    </li>
                  </ul>
                </div>
              </div>
              <div className="cp-slip__net">
                <span>Net pay</span>
                <strong>{inr(openSlip.net)}</strong>
              </div>
            </div>

            <div className="cb-form-section">
              <h3 className="cb-form-section__title">Employer & bank</h3>
              <DetailList
                columns={2}
                items={[
                  { label: 'Employer PF', value: inr(openSlip.employerPf) },
                  { label: 'Employer ESI', value: inr(openSlip.employerEsi) },
                  {
                    label: 'Bank',
                    wide: true,
                    value: [openSlip.snapshot.bankName, openSlip.snapshot.accountNumber, openSlip.snapshot.ifscCode].filter(Boolean).join(' · ') || 'No bank details',
                  },
                  ...(!draft && openSlip.remarks ? [{ label: 'Remarks', value: openSlip.remarks, wide: true }] : []),
                ]}
              />
            </div>
          </>
        ) : null}
      </Sheet>

      {draft ? (
        <BulkAdjustSheet
          slips={selectedRows}
          open={bulkEditing}
          daysInMonth={run.daysInMonth}
          saving={busy === 'bulk-save'}
          onClose={() => setBulkEditing(false)}
          onSave={saveBulkAdjustments}
        />
      ) : null}

      <Dialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        tone={confirm && confirmCopy[confirm].danger ? 'danger' : 'default'}
        size="sm"
        title={confirm ? confirmCopy[confirm].title : ''}
        description={confirm ? confirmCopy[confirm].description : undefined}
        footer={
          confirm ? (
            <>
              <Button onClick={() => setConfirm(null)}>Cancel</Button>
              <Button
                variant={confirmCopy[confirm].danger ? 'danger' : 'primary'}
                loading={Boolean(busy)}
                onClick={runConfirm}
              >
                {confirmCopy[confirm].action}
              </Button>
            </>
          ) : null
        }
      />

      <Dialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        size="sm"
        title={`Mark ${monthTitle(run.month)} salary paid`}
        description={`Net pay ${inr(t.net)} to ${t.staff} staff. The salary expense (${inr(t.net + t.employerPf + t.employerEsi)} incl. employer PF/ESI) is added to the expense ledger.`}
        footer={
          <>
            <Button onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon={CheckCircle2}
              loading={busy === 'pay'}
              onClick={() => act('pay', () => cpitlService.payPayrollRun(run.month, { paidOn, mode, reference }), () => setPayOpen(false))}
            >
              Mark paid
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <TextField label="Paid on" type="date" value={paidOn} max={todayIso()} onChange={(e) => setPaidOn(e.target.value)} />
          <Select
            label="Mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as PaymentMode)}
            options={PAY_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))}
          />
          <TextField label="Reference" hint="Bank batch or cheque number" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </Dialog>
    </Page>
  )
}

export default CpitlPayrollRun
