import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CalendarPlus, Users } from 'lucide-react'
import { useInvalidateCpitl, usePayrollRuns } from '@/hooks/useCpitl'
import cpitlService from '@/services/cpitlService'
import { CpitlBadge, CpitlCard, CpitlEmpty, CpitlPageShell, Field, MONTHS, btnPrimary, btnSecondary, errorMessage, fmtDate, inputClass, inr, tableHead } from '@/components/cpitl/CpitlUi'

export const monthTitle = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${y}`
}

const STATUS_BADGE: Record<string, string> = { draft: 'draft', finalized: 'due', paid: 'paid' }

const CpitlPayroll: React.FC = () => {
  const navigate = useNavigate()
  const invalidate = useInvalidateCpitl()
  const { data: runs = [], isLoading } = usePayrollRuns()
  const now = new Date()
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [month, setMonth] = useState(`${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`)
  const [creating, setCreating] = useState(false)

  const create = async () => {
    setCreating(true)
    try {
      const res = await cpitlService.createPayrollRun(month)
      toast.success(res?.message || 'Draft created.')
      invalidate()
      navigate(`/cpitl/payroll/${month}`)
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  return (
    <CpitlPageShell
      title="Payroll"
      subtitle="Monthly salary runs: draft → finalize → mark paid"
      actions={
        <Link to="/cpitl/salary" className={btnSecondary}>
          <Users className="h-4 w-4" /> Staff salaries
        </Link>
      }
    >
      <CpitlCard>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Salary month" className="w-48">
            <input type="month" className={inputClass} value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <button type="button" className={btnPrimary} disabled={creating || runs.some((r) => r.month === month)} onClick={create}>
            <CalendarPlus className="h-4 w-4" /> {runs.some((r) => r.month === month) ? 'Already created' : creating ? 'Creating…' : `Run payroll for ${monthTitle(month)}`}
          </button>
          <p className="text-xs text-slate-500">Loss-of-pay days are pre-filled from staff attendance when the Attendance module is on.</p>
        </div>
      </CpitlCard>

      <CpitlCard title="Payroll runs">
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />
        ) : runs.length ? (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className="px-5 py-2.5">Month</th>
                  <th className="px-3 py-2.5 text-right">Staff</th>
                  <th className="px-3 py-2.5 text-right">Gross</th>
                  <th className="px-3 py-2.5 text-right">Deductions</th>
                  <th className="px-3 py-2.5 text-right">Net pay</th>
                  <th className="px-3 py-2.5 text-right">Employer PF + ESI</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-5 py-2.5">Paid on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {runs.map((r) => (
                  <tr key={r._id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40" onClick={() => navigate(`/cpitl/payroll/${r.month}`)}>
                    <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-white">{monthTitle(r.month)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.totals.staff}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{inr(r.totals.gross)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{inr(r.totals.deductions)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{inr(r.totals.net)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{inr(r.totals.employerPf + r.totals.employerEsi)}</td>
                    <td className="px-3 py-2.5">
                      <CpitlBadge status={STATUS_BADGE[r.status]} label={r.status} />
                    </td>
                    <td className="px-5 py-2.5 text-slate-500">{r.paidOn ? fmtDate(r.paidOn) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <CpitlEmpty message="No payroll runs yet. Set staff salaries, then run payroll for a month." />
        )}
      </CpitlCard>
    </CpitlPageShell>
  )
}

export default CpitlPayroll
