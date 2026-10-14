import React, { useCallback, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  IndianRupee,
  Layers,
  Printer,
  Receipt,
  Wallet,
} from 'lucide-react'
import { useSelector } from 'react-redux'
import { useCpitlDashboard, useExpenseSummary } from '@/hooks/useCpitl'
import { selectUser } from '@/redux/slices/authSlice'
import { isFeatureEnabledForPath } from '@/constants/featureAccess'
import type { ClassRow, CpitlDashboard as DashboardData } from '@/services/cpitlService'
import { Banner, BulkBar, Button, Card, DataTable, EmptyState, Page, Progress, StatCard, cx, useRowSelection, type DataTableColumn } from '@/components/ui'
import { MODE_LABELS, MONTHS, errorMessage, fmtDate, inr, inrShort } from '@/components/cpitl/CpitlUi'
import cpitlBulkService from '@/services/cpitlBulkService'
import '@/components/cpitl/overview.css'

/** Bands for "collected against what has fallen due" — same thresholds as the home fees widget. */
const BAND_GOOD = 90
const BAND_WATCH = 70

type Band = 'good' | 'watch' | 'concern' | 'none'

const pct = (value?: number) => {
  const v = Number(value || 0)
  return `${v > 0 && v < 10 ? v.toFixed(1) : Math.round(v)}%`
}

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${String(y).slice(2)}`
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`

/** Share of dues-to-date that has been collected (capped at 100), and its band. */
/**
 * Share of what has fallen due up to the end of this month that is already paid.
 * Uses the server's month figures; falls back to "due by today" from older servers.
 */
const dueRate = (row: Pick<ClassRow, 'collected' | 'dueSoFar' | 'demandedThisMonth' | 'dueThisMonth'>): { rate: number; band: Band } => {
  const demanded = row.demandedThisMonth ?? row.dueSoFar
  if (!demanded || demanded <= 0) return { rate: 0, band: 'none' }
  const paid = row.demandedThisMonth != null ? demanded - (row.dueThisMonth || 0) : row.collected
  const rate = Math.max(0, Math.min(100, (paid / demanded) * 100))
  return { rate, band: rate >= BAND_GOOD ? 'good' : rate >= BAND_WATCH ? 'watch' : 'concern' }
}

const monthEndLabel = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

type Defaulter = DashboardData['defaulters'][number]

const CpitlDashboard: React.FC = () => {
  const navigate = useNavigate()
  const { data, isLoading, isError, refetch } = useCpitlDashboard()
  const user = useSelector(selectUser)
  const expensesEnabled = isFeatureEnabledForPath('/cpitl/expenses', user?.featureToggles)
  const { data: summary } = useExpenseSummary({}, expensesEnabled)

  // A fixed 12-month window ending this month, so one month of data doesn't float alone in the chart.
  const months = useMemo(() => {
    const byKey = new Map((data?.byMonth || []).map((m) => [m.month, m]))
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const hit = byKey.get(key)
      return { month: key, amount: hit?.amount || 0, count: hit?.count || 0, label: monthLabel(key) }
    })
  }, [data])
  const monthMax = useMemo(() => Math.max(1, ...months.map((m) => m.amount)), [months])
  const modeTotal = useMemo(() => (data?.byMode || []).reduce((s, m) => s + m.amount, 0), [data])
  const bandCounts = useMemo(() => {
    const counts = { good: 0, watch: 0, concern: 0, none: 0 }
    ;(data?.byClass || []).forEach((row) => {
      counts[dueRate(row).band] += 1
    })
    return counts
  }, [data])
  const ieMonths = useMemo(() => (summary?.byMonth || []).map((m) => ({ ...m, label: monthLabel(m.month) })), [summary])
  const ieMax = useMemo(() => Math.max(1, ...ieMonths.map((m) => Math.max(m.income, m.expense))), [ieMonths])

  // Top defaulters: tick students to print their fee slips in one PDF.
  const defaulters = useMemo(() => data?.defaulters || [], [data])
  const getDefaulterId = useCallback((d: Defaulter) => d.studentId, [])
  const hasStudentId = useCallback((d: Defaulter) => Boolean(d.studentId), [])
  const defaulterSelection = useRowSelection(defaulters, getDefaulterId, {
    isSelectable: hasStudentId,
    rowLabel: (d) => `Select ${d.name}`,
  })
  const [printingSlips, setPrintingSlips] = useState(false)
  const printSelectedSlips = async () => {
    setPrintingSlips(true)
    try {
      await cpitlBulkService.printStudentSlips(defaulterSelection.selectedIds)
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setPrintingSlips(false)
    }
  }

  if (isLoading) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading the fee dashboard
        </div>
      </Page>
    )
  }

  if (isError || !data) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load the fee dashboard"
            body="Check your connection, then try again."
            action={
              <Button variant="secondary" onClick={() => void refetch()}>
                Try again
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  const { totals, payments, coverage } = data
  const hasData = totals.expected > 0 || payments.count > 0
  const uncovered = Math.max(0, coverage.activeStudents - coverage.studentsWithStructure)

  if (!hasData) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={Layers}
            title="No fees set up for this session"
            body="Create a fee structure and assign it to classes to start tracking collection."
            action={
              <Button variant="primary" icon={Layers} onClick={() => navigate('/cpitl/fee-structures')}>
                Set up fee structures
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  const totalDue = dueRate({ collected: totals.collected, dueSoFar: totals.dueSoFar, demandedThisMonth: totals.demandedThisMonth, dueThisMonth: totals.dueThisMonth })
  const dueNow = totals.dueThisMonth ?? totals.dueSoFar
  const monthEnd = monthEndLabel()

  const defaulterColumns: DataTableColumn<Defaulter>[] = [
    {
      key: 'name',
      header: 'Student',
      mobile: 'title',
      render: (d) => (
        <span className="co-person">
          <span className="co-person__name">{d.name}</span>
          {d.rollNumber ? <span className="co-person__sub">{d.rollNumber}</span> : null}
        </span>
      ),
    },
    { key: 'class', header: 'Class', mobile: 'subtitle', render: (d) => `${d.class || '—'}${d.section ? `-${d.section}` : ''}` },
    { key: 'phone', header: 'Guardian phone', render: (d) => <span className="is-num">{d.guardianPhone || '—'}</span> },
    { key: 'since', header: 'Overdue since', render: (d) => fmtDate(d.oldestDue) },
    { key: 'installments', header: 'Instalments', align: 'right', numeric: true, render: (d) => d.installments },
    { key: 'overdue', header: 'Overdue', align: 'right', mobile: 'aside', render: (d) => <span className="co-overdue">{inr(d.overdue)}</span> },
    {
      key: 'collect',
      header: <span className="cb-visually-hidden">Actions</span>,
      headerLabel: 'Actions',
      align: 'right',
      interactive: true,
      render: (d) => (
        <Button
          variant="secondary"
          size="sm"
          icon={IndianRupee}
          onClick={() => navigate(d.studentId ? `/cpitl/students/${d.studentId}` : '/cpitl/collection')}
          aria-label={`Collect fee from ${d.name}`}
        >
          Collect
        </Button>
      ),
    },
  ]

  const showIncomeExpense = expensesEnabled && summary && (summary.totals.expense > 0 || summary.totals.income > 0)
  const bandTone = (band: Band) => (band === 'good' ? 'success' : band === 'watch' ? 'warning' : band === 'concern' ? 'danger' : 'accent')
  // Lowest first, so the classes that need a call appear at the top.
  const classRows = [...data.byClass].sort((x, y) => dueRate(x).rate - dueRate(y).rate)
  const behind = bandCounts.concern + bandCounts.watch

  return (
    <Page>
      <div className="co-toolbar">
        <p className="co-toolbar__lede">
          {coverage.studentsWithStructure.toLocaleString('en-IN')} of {plural(coverage.activeStudents, 'active student')} have a fee
          structure this session.
        </p>
        <div className="cb-card-actions">
          <Button icon={Printer} onClick={() => navigate('/cpitl/fee-slips')}>
            Print fee slips
          </Button>
          <Button variant="primary" icon={IndianRupee} onClick={() => navigate('/cpitl/collection')}>
            Collect fee
          </Button>
        </div>
      </div>

      {uncovered > 0 ? (
        <Banner tone="warning" title={`${plural(uncovered, 'active student')} ${uncovered === 1 ? 'has' : 'have'} no fee structure`}>
          Their fees aren't counted below. <Link to="/cpitl/fee-structures" className="cb-link">Assign a fee structure</Link> to their
          class to start billing them.
        </Banner>
      ) : null}

      <section className="co-stats" aria-label="Fee collection this session">
        <StatCard
          label="Collected this session"
          value={inrShort(totals.collected)}
          hint={`${pct(totals.collectionRate)} of ${inrShort(totals.expected)} demand${totals.concession > 0 ? ` · ${inrShort(totals.concession)} concession` : ''}`}
          progress={Math.min(100, totals.collectionRate || 0)}
          progressTone="success"
        />
        <StatCard
          label={`Due by ${monthEnd}`}
          value={inrShort(dueNow)}
          hint={
            totalDue.band === 'none'
              ? 'Nothing has fallen due yet'
              : `${pct(totalDue.rate)} of ${inrShort(totals.demandedThisMonth ?? totals.dueSoFar)} collected`
          }
          progress={totalDue.rate}
          progressTone={bandTone(totalDue.band)}
        />
        <StatCard
          label="Overdue"
          value={inrShort(totals.overdue)}
          hint={totals.overdue > 0 ? `${plural(data.defaulters.length, 'student')} behind on payments` : 'Nothing overdue'}
        />
        <StatCard label="Collected today" value={inrShort(payments.today)} hint={plural(payments.todayCount, 'receipt')} />
      </section>

      <div className="cb-grid-8-4 co-row">
        <Card
          title="Collection by class"
          subtitle={
            classRows.length === 0
              ? 'Collected against what has fallen due so far.'
              : behind === 0
                ? `Every class has collected ${BAND_GOOD}% or more of what is due by ${monthEnd}.`
                : `${plural(behind, 'class', 'classes')} below ${BAND_GOOD}% of what is due by ${monthEnd}. Lowest first; select a class to collect.`
          }
          fill
          footer={
            classRows.length
              ? `${inr(totals.pending)} still to collect this session, including instalments not yet due.`
              : undefined
          }
        >
          {classRows.length === 0 ? (
            <EmptyState
              compact
              icon={Layers}
              title="No classes billed yet"
              body="Assign a fee structure to a class to see its collection here."
            />
          ) : (
            <div className="cb-progress-list co-classlist">
              {classRows.map((row) => {
                const { rate, band } = dueRate(row)
                return (
                  <button
                    key={row.class}
                    type="button"
                    className="co-classrow"
                    onClick={() => navigate(`/cpitl/collection?${new URLSearchParams({ class: row.class }).toString()}`)}
                    aria-label={`Open fee collection for class ${row.class}`}
                  >
                  <Progress
                    label={`Class ${row.class}`}
                    value={rate}
                    tone={bandTone(band)}
                    valueLabel={
                      band === 'none'
                        ? 'Nothing due yet'
                        : `${pct(rate)} · ${inrShort(row.dueThisMonth ?? row.pending)} due${row.overdue > 0 ? ` · ${inrShort(row.overdue)} overdue` : ''}`
                    }
                  />
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        <Card fill title="By payment mode" subtitle={modeTotal > 0 ? `${inr(modeTotal)} collected so far.` : undefined}>
          {data.byMode.length ? (
            <div className="cb-progress-list">
              {data.byMode.map((m) => (
                <Progress
                  key={m.mode}
                  label={MODE_LABELS[m.mode] || m.mode}
                  value={modeTotal > 0 ? (m.amount / modeTotal) * 100 : 0}
                  tone="accent"
                  valueLabel={`${inrShort(m.amount)} · ${plural(m.count, 'receipt')}`}
                />
              ))}
            </div>
          ) : (
            <EmptyState compact icon={Wallet} title="No payments recorded yet" body="Record a payment from Collection to see the mix." />
          )}
        </Card>
      </div>

      <Card
        title="Monthly collection"
        subtitle={`${inr(payments.total)} from ${plural(payments.count, 'receipt')}${payments.lateFee > 0 ? `, including ${inr(payments.lateFee)} late fee` : ''}.`}
      >
        {months.length ? (
          <div className="co-trend">
            <div className="co-trend__scale" aria-hidden="true">
              <span>Highest month {inrShort(monthMax)}</span>
            </div>
            <div className="co-trend__plot" role="list" aria-label="Fees collected per month">
              {months.map((m) => (
                <div
                  key={m.month}
                  className="co-trend__col"
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${m.label}: ${inr(m.amount)} from ${plural(m.count, 'receipt')}`}
                >
                  <span
                    className={cx('co-trend__bar', m.amount <= 0 && 'is-zero')}
                    style={m.amount > 0 ? { height: `${(m.amount / monthMax) * 100}%` } : undefined}
                  />
                  <span className="co-trend__label">{m.label}</span>
                  <span className="co-trend__tip" aria-hidden="true">
                    <strong>{m.label}</strong>
                    {inr(m.amount)} · {plural(m.count, 'receipt')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyState compact icon={Receipt} title="No payments recorded yet" body="Collected fees show here month by month." />
        )}
      </Card>

      {showIncomeExpense && summary ? (
        <Card
          title="Income vs expenses"
          subtitle="Fee income against recorded expenses, month by month."
          action={
            <Button variant="tertiary" size="sm" iconRight={ArrowRight} onClick={() => navigate('/cpitl/expenses')}>
              Open expenses
            </Button>
          }
        >
          <div className="co-figures">
            <div className="co-figure">
              <span className="co-figure__label">Fee income</span>
              <span className="co-figure__value">{inr(summary.totals.income)}</span>
            </div>
            <div className="co-figure">
              <span className="co-figure__label">Expenses</span>
              <span className="co-figure__value">{inr(summary.totals.expense)}</span>
            </div>
            <div className="co-figure">
              <span className="co-figure__label">{summary.totals.net >= 0 ? 'Surplus' : 'Deficit'}</span>
              <span className={cx('co-figure__value', summary.totals.net >= 0 ? 'is-success' : 'is-danger')}>
                {inr(Math.abs(summary.totals.net))}
              </span>
            </div>
          </div>
          {ieMonths.length ? (
            <div className="co-trend">
              <div className="co-trend__plot" role="list" aria-label="Income and expenses per month">
                {ieMonths.map((m) => (
                  <div
                    key={m.month}
                    className="co-trend__col"
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${m.label}: income ${inr(m.income)}, expenses ${inr(m.expense)}`}
                  >
                    <span
                      className={cx('co-trend__bar', m.income <= 0 && 'is-zero')}
                      style={m.income > 0 ? { height: `${(m.income / ieMax) * 100}%` } : undefined}
                    />
                    <span
                      className={cx('co-trend__bar co-trend__bar--expense', m.expense <= 0 && 'is-zero')}
                      style={m.expense > 0 ? { height: `${(m.expense / ieMax) * 100}%` } : undefined}
                    />
                    <span className="co-trend__label">{m.label}</span>
                    <span className="co-trend__tip" aria-hidden="true">
                      <strong>{m.label}</strong>
                      Income {inr(m.income)} · Expenses {inr(m.expense)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="co-trend__legend">
                <span>
                  <i aria-hidden="true" />
                  Income (fees)
                </span>
                <span>
                  <i className="is-expense" aria-hidden="true" />
                  Expenses
                </span>
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      <div id="co-defaulters" />
      <Card
        title="Top defaulters"
        subtitle={data.defaulters.length ? 'Largest overdue balances. Open a student to collect.' : undefined}
        flush
        action={
          <Button variant="tertiary" size="sm" icon={FileText} onClick={() => navigate('/cpitl/fee-slips')}>
            Print fee slips
          </Button>
        }
      >
        {defaulterSelection.count > 0 ? (
          <div className="co-bulk">
            <BulkBar count={defaulterSelection.count} noun="student" onClear={defaulterSelection.clear} busy={printingSlips}>
              <Button size="sm" icon={FileText} loading={printingSlips} disabled={printingSlips} onClick={printSelectedSlips}>
                Print fee slips
              </Button>
            </BulkBar>
          </div>
        ) : null}
        <DataTable
          columns={defaulterColumns}
          rows={data.defaulters}
          selection={defaulterSelection.selection}
          getRowKey={(d) => d.accountId}
          onRowClick={(d) => d.studentId && navigate(`/cpitl/students/${d.studentId}`)}
          caption="Students with overdue fees"
          empty={
            <EmptyState compact icon={Wallet} title="No overdue fees" body="Students with unpaid instalments past their due date show here." />
          }
        />
      </Card>
    </Page>
  )
}

export default CpitlDashboard
