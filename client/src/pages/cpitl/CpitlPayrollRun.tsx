import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { AlertTriangle, CheckCircle2, Download, Lock, Printer, RotateCcw, Save, Trash2 } from 'lucide-react'
import Modal from '@/components/common/Modal'
import { useInvalidateCpitl, usePayrollRun } from '@/hooks/useCpitl'
import cpitlService, { PaymentMode, Payslip } from '@/services/cpitlService'
import { todayIso } from '@/components/cpitl/QuickExpenseSheet'
import { monthTitle } from './CpitlPayroll'
import { CpitlBadge, CpitlCard, CpitlEmpty, CpitlPageShell, Field, MODE_LABELS, btnGhost, btnPrimary, btnSecondary, errorMessage, fmtDate, inputClass, inr, tableHead } from '@/components/cpitl/CpitlUi'

type Edit = { lopDays: string; arrears: string; otherDeduction: string; remarks: string }

const CpitlPayrollRun: React.FC = () => {
  const { month = '' } = useParams()
  const navigate = useNavigate()
  const invalidate = useInvalidateCpitl()
  const { data: run, isLoading } = usePayrollRun(month)
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [paidOn, setPaidOn] = useState(todayIso())
  const [mode, setMode] = useState<PaymentMode>('bank_transfer')
  const [reference, setReference] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => setEdits({}), [run])
  const draft = run?.status === 'draft'
  const dirty = Object.keys(edits).length > 0

  const valueOf = (p: Payslip, key: keyof Edit) => edits[p._id]?.[key] ?? String(p[key] ?? '')
  const setValue = (p: Payslip, key: keyof Edit, value: string) =>
    setEdits((prev) => {
      const base: Edit = prev[p._id] || {
        lopDays: String(p.lopDays ?? ''),
        arrears: String(p.arrears ?? ''),
        otherDeduction: String(p.otherDeduction ?? ''),
        remarks: p.remarks || '',
      }
      return { ...prev, [p._id]: { ...base, [key]: value } }
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

  const saveEdits = () =>
    act('save', () =>
      cpitlService.updatePayrollRun(
        month,
        Object.entries(edits).map(([_id, e]) => ({
          _id,
          lopDays: Number(e.lopDays) || 0,
          arrears: Number(e.arrears) || 0,
          otherDeduction: Number(e.otherDeduction) || 0,
          remarks: e.remarks,
        }))
      )
    )

  const attendanceDiffers = useMemo(
    () => (run?.payslips || []).filter((p) => p.lopFromAttendance !== null && p.lopFromAttendance !== p.lopDays).length,
    [run]
  )

  if (isLoading) return <CpitlPageShell><div className="h-96 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" /></CpitlPageShell>
  if (!run) return <CpitlPageShell><CpitlEmpty message="Payroll run not found." /></CpitlPageShell>

  const t = run.totals

  return (
    <CpitlPageShell
      title={`Payroll — ${monthTitle(run.month)}`}
      subtitle={`${t.staff} staff · ${run.daysInMonth} days${run.attendanceUsed ? ' · LOP pre-filled from attendance' : ' · Attendance module off — enter LOP by hand'}`}
      actions={
        <>
          <CpitlBadge status={run.status === 'paid' ? 'paid' : run.status === 'finalized' ? 'due' : 'draft'} label={run.status} />
          <button type="button" className={btnSecondary} onClick={() => cpitlService.openPayslips(run.month).catch(async (e) => toast.error(await errorMessage(e)))}>
            <Printer className="h-4 w-4" /> Payslips
          </button>
          <button type="button" className={btnSecondary} onClick={() => cpitlService.downloadBankSheet(run.month).catch(async (e) => toast.error(await errorMessage(e)))}>
            <Download className="h-4 w-4" /> Bank sheet
          </button>
          {draft ? (
            <>
              <button
                type="button"
                className={btnSecondary}
                disabled={Boolean(busy)}
                onClick={() => window.confirm('Delete this draft payroll?') && act('delete', () => cpitlService.deletePayrollRun(run.month), () => navigate('/cpitl/payroll'))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              {dirty ? (
                <button type="button" className={btnPrimary} disabled={Boolean(busy)} onClick={saveEdits}>
                  <Save className="h-4 w-4" /> Save changes
                </button>
              ) : (
                <button type="button" className={btnPrimary} disabled={Boolean(busy)} onClick={() => act('finalize', () => cpitlService.finalizePayrollRun(run.month))}>
                  <Lock className="h-4 w-4" /> Finalize
                </button>
              )}
            </>
          ) : null}
          {run.status === 'finalized' ? (
            <>
              <button type="button" className={btnSecondary} disabled={Boolean(busy)} onClick={() => act('reopen', () => cpitlService.reopenPayrollRun(run.month))}>
                <RotateCcw className="h-4 w-4" /> Reopen
              </button>
              <button type="button" className={btnPrimary} onClick={() => setPayOpen(true)}>
                <CheckCircle2 className="h-4 w-4" /> Mark paid
              </button>
            </>
          ) : null}
          {run.status === 'paid' ? (
            <button
              type="button"
              className={btnSecondary}
              disabled={Boolean(busy)}
              onClick={() => window.confirm('Reopen a paid payroll? Its salary expense entry will be voided.') && act('reopen', () => cpitlService.reopenPayrollRun(run.month))}
            >
              <RotateCcw className="h-4 w-4" /> Reopen
            </button>
          ) : null}
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: 'Gross', value: t.gross },
          { label: 'Deductions', value: t.deductions },
          { label: 'Net pay', value: t.net },
          { label: 'Employer PF + ESI', value: t.employerPf + t.employerEsi },
          { label: 'Total cost', value: t.net + t.deductions + t.employerPf + t.employerEsi },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-1.5 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{inr(s.value)}</p>
          </div>
        ))}
      </div>

      {run.status === 'paid' ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
          Paid on {fmtDate(run.paidOn)} by {MODE_LABELS[run.paymentMode] || run.paymentMode}
          {run.reference ? ` (${run.reference})` : ''}. Booked as a salary expense.
        </div>
      ) : null}
      {run.staffWithoutSalary?.length ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {run.staffWithoutSalary.length} active staff have no salary and are not in this run:{' '}
            {run.staffWithoutSalary.slice(0, 6).map((s) => s.name).join(', ')}
            {run.staffWithoutSalary.length > 6 ? '…' : ''}.{' '}
            <Link to="/cpitl/salary" className="font-medium underline">
              Set salaries
            </Link>
            {draft ? ', then delete and re-create this draft.' : '.'}
          </span>
        </div>
      ) : null}
      {draft && attendanceDiffers ? (
        <p className="text-xs text-slate-500">{attendanceDiffers} LOP value(s) changed from what attendance suggested.</p>
      ) : null}

      <CpitlCard>
        <div className="-mx-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="px-5 py-2.5">Staff</th>
                <th className="w-24 px-3 py-2.5">LOP days</th>
                <th className="w-28 px-3 py-2.5">Arrears ₹</th>
                <th className="w-28 px-3 py-2.5">Other ded. ₹</th>
                <th className="px-3 py-2.5 text-right">Gross</th>
                <th className="px-3 py-2.5 text-right">Deductions</th>
                <th className="px-3 py-2.5 text-right">Net pay</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {run.payslips.map((p) => (
                <React.Fragment key={p._id}>
                  <tr className={edits[p._id] ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}>
                    <td className="px-5 py-2">
                      <div className="font-medium text-slate-900 dark:text-white">{p.snapshot.name}</div>
                      <div className="text-xs text-slate-500">{[p.snapshot.designation, p.snapshot.employeeId].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="px-3 py-2">
                      {draft ? (
                        <input
                          type="number"
                          min={0}
                          max={run.daysInMonth}
                          step="0.5"
                          aria-label={`LOP days for ${p.snapshot.name}`}
                          className={`${inputClass} mt-0 tabular-nums`}
                          value={valueOf(p, 'lopDays')}
                          onChange={(e) => setValue(p, 'lopDays', e.target.value)}
                        />
                      ) : (
                        <span className="tabular-nums">{p.lopDays}</span>
                      )}
                      {p.lopFromAttendance !== null ? <div className="mt-0.5 text-[10px] text-slate-400">attendance: {p.lopFromAttendance}</div> : null}
                    </td>
                    <td className="px-3 py-2">
                      {draft ? (
                        <input
                          type="number"
                          min={0}
                          aria-label={`Arrears for ${p.snapshot.name}`}
                          className={`${inputClass} mt-0 tabular-nums`}
                          value={valueOf(p, 'arrears')}
                          onChange={(e) => setValue(p, 'arrears', e.target.value)}
                        />
                      ) : (
                        <span className="tabular-nums">{p.arrears ? inr(p.arrears) : '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {draft ? (
                        <input
                          type="number"
                          min={0}
                          aria-label={`Other deduction for ${p.snapshot.name}`}
                          className={`${inputClass} mt-0 tabular-nums`}
                          value={valueOf(p, 'otherDeduction')}
                          onChange={(e) => setValue(p, 'otherDeduction', e.target.value)}
                        />
                      ) : (
                        <span className="tabular-nums">{p.otherDeduction ? inr(p.otherDeduction) : '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(p.gross)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400">{inr(p.totalDeductions)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{inr(p.net)}</td>
                    <td className="px-5 py-2 text-right whitespace-nowrap">
                      <button type="button" className={btnGhost} onClick={() => setExpanded(expanded === p._id ? null : p._id)}>
                        {expanded === p._id ? 'Hide' : 'Details'}
                      </button>
                      <button
                        type="button"
                        className={btnGhost}
                        aria-label={`Payslip for ${p.snapshot.name}`}
                        onClick={() => cpitlService.openPayslips(run.month, p.staffKey).catch(async (e) => toast.error(await errorMessage(e)))}
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                  {expanded === p._id ? (
                    <tr className="bg-slate-50/60 dark:bg-slate-900/20">
                      <td colSpan={8} className="px-5 py-3">
                        <div className="grid gap-6 text-xs sm:grid-cols-3">
                          <div>
                            <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Earnings ({p.paidDays} paid days)</p>
                            {p.earnings.map((e) => (
                              <div key={e.code} className="flex justify-between">
                                <span>{e.name}</span>
                                <span className="tabular-nums">{inr(e.amount)}</span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Deductions</p>
                            {p.deductions.map((d) => (
                              <div key={d.code} className="flex justify-between">
                                <span>{d.name}</span>
                                <span className="tabular-nums">{inr(d.amount)}</span>
                              </div>
                            ))}
                            {!p.deductions.length ? <span className="text-slate-400">None</span> : null}
                          </div>
                          <div>
                            <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">Employer & bank</p>
                            <div>Employer PF {inr(p.employerPf)} · ESI {inr(p.employerEsi)}</div>
                            <div className="text-slate-500">
                              {[p.snapshot.bankName, p.snapshot.accountNumber, p.snapshot.ifscCode].filter(Boolean).join(' · ') || 'No bank details'}
                            </div>
                            {draft ? (
                              <input
                                aria-label="Remarks"
                                className={`${inputClass} mt-2`}
                                placeholder="Remarks on payslip"
                                value={valueOf(p, 'remarks')}
                                onChange={(e) => setValue(p, 'remarks', e.target.value)}
                              />
                            ) : p.remarks ? (
                              <div className="mt-1">Remarks: {p.remarks}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CpitlCard>

      <Modal isOpen={payOpen} onClose={() => setPayOpen(false)} title={`Mark ${monthTitle(run.month)} salary paid`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Net pay {inr(t.net)} to {t.staff} staff. The salary expense ({inr(t.net + t.employerPf + t.employerEsi)} incl. employer PF/ESI) is added to the
            expense ledger.
          </p>
          <Field label="Paid on">
            <input type="date" className={inputClass} value={paidOn} max={todayIso()} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
          <Field label="Mode">
            <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
              {(['bank_transfer', 'cheque', 'cash', 'upi'] as PaymentMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reference (bank batch / cheque no.)">
            <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={() => setPayOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={busy === 'pay'}
              onClick={() => act('pay', () => cpitlService.payPayrollRun(run.month, { paidOn, mode, reference }), () => setPayOpen(false))}
            >
              Mark paid
            </button>
          </div>
        </div>
      </Modal>
    </CpitlPageShell>
  )
}

export default CpitlPayrollRun
