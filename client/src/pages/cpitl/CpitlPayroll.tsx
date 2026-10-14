import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowRight, CalendarPlus, CalendarRange, Users } from 'lucide-react'
import { useInvalidateCpitl, usePayrollRuns } from '@/hooks/useCpitl'
import cpitlService, { PayrollRun } from '@/services/cpitlService'
import { Button, Card, DataTable, EmptyState, Page, TextField, type DataTableColumn } from '@/components/ui'
import { CpitlBadge, MONTHS, errorMessage, fmtDate, inr } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/payroll.css'

export const monthTitle = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${y}`
}

/** Payroll status → CpitlBadge tone key; the badge shows the run's own status word. */
export const PAYROLL_STATUS_BADGE: Record<string, string> = { draft: 'draft', finalized: 'due', paid: 'paid' }

type RunRow = Omit<PayrollRun, 'payslips'>

const CpitlPayroll: React.FC = () => {
  const navigate = useNavigate()
  const invalidate = useInvalidateCpitl()
  const { data: runs = [], isLoading } = usePayrollRuns()
  const now = new Date()
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const [month, setMonth] = useState(`${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`)
  const [creating, setCreating] = useState(false)

  const exists = runs.some((r) => r.month === month)

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

  const columns: DataTableColumn<RunRow>[] = [
    { key: 'month', header: 'Month', mobile: 'title', render: (r) => <span className="cp-strong">{monthTitle(r.month)}</span> },
    { key: 'status', header: 'Status', mobile: 'aside', render: (r) => <CpitlBadge status={PAYROLL_STATUS_BADGE[r.status]} label={r.status} /> },
    { key: 'staff', header: 'Staff', align: 'right', numeric: true, render: (r) => r.totals.staff },
    { key: 'gross', header: 'Gross', align: 'right', numeric: true, render: (r) => inr(r.totals.gross) },
    { key: 'deductions', header: 'Deductions', align: 'right', numeric: true, render: (r) => inr(r.totals.deductions) },
    { key: 'net', header: 'Net pay', align: 'right', numeric: true, render: (r) => <span className="cp-strong">{inr(r.totals.net)}</span> },
    { key: 'employer', header: 'Employer PF + ESI', align: 'right', numeric: true, render: (r) => inr(r.totals.employerPf + r.totals.employerEsi) },
    { key: 'paidOn', header: 'Paid on', render: (r) => (r.paidOn ? fmtDate(r.paidOn) : '—') },
  ]

  return (
    <Page>
      <Card flush className="cp-card" title="Payroll runs" subtitle="Each month moves from draft to finalized to paid.">
        <div className="cp-toolbar">
          <div className="cp-runbar">
            <TextField
              type="month"
              size="sm"
              label="Salary month"
              className="cp-runbar__month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            {exists ? (
              <Button size="sm" iconRight={ArrowRight} onClick={() => navigate(`/cpitl/payroll/${month}`)}>
                Open {monthTitle(month)}
              </Button>
            ) : (
              <Button variant="primary" size="sm" icon={CalendarPlus} loading={creating} disabled={!month} onClick={create}>
                {creating ? 'Creating…' : `Run payroll for ${monthTitle(month)}`}
              </Button>
            )}
            <span className="cp-runbar__spacer" />
            <Button variant="tertiary" size="sm" icon={Users} onClick={() => navigate('/cpitl/salary')}>
              Staff salaries
            </Button>
            <p className="cp-runbar__hint">Loss-of-pay days are pre-filled from staff attendance when the Attendance module is on.</p>
          </div>
        </div>
        <DataTable<RunRow>
          columns={columns}
          rows={runs}
          getRowKey={(r) => r._id}
          onRowClick={(r) => navigate(`/cpitl/payroll/${r.month}`)}
          loading={isLoading}
          loadingLabel="Loading payroll runs…"
          caption="Payroll runs"
          empty={
            <EmptyState
              icon={CalendarRange}
              title="No payroll runs yet"
              body="Set staff salaries, then run payroll for a month."
              action={
                <Button size="sm" icon={Users} onClick={() => navigate('/cpitl/salary')}>
                  Set staff salaries
                </Button>
              }
            />
          }
        />
      </Card>
    </Page>
  )
}

export default CpitlPayroll
