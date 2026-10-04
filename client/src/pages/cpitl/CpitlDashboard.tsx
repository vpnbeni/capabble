import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, CalendarClock, ChevronDown, ChevronRight, IndianRupee, Printer, Users, Wallet } from 'lucide-react'
import { useSelector } from 'react-redux'
import { useCpitlDashboard, useExpenseSummary } from '@/hooks/useCpitl'
import { selectUser } from '@/redux/slices/authSlice'
import { isFeatureEnabledForPath } from '@/constants/featureAccess'
import { IncomeExpenseChart } from './CpitlExpenses'
import cpitlService from '@/services/cpitlService'
import {
  CpitlCard,
  CpitlEmpty,
  CpitlPageShell,
  MODE_LABELS,
  MONTHS,
  ProgressBar,
  StatCard,
  btnGhost,
  btnPrimary,
  errorMessage,
  fmtDate,
  inr,
  inrShort,
  tableHead,
} from '@/components/cpitl/CpitlUi'

const pct = (value?: number) => {
  const v = Number(value || 0)
  return `${v > 0 && v < 10 ? v.toFixed(1) : Math.round(v)}%`
}

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${String(y).slice(2)}`
}

const CpitlDashboard: React.FC = () => {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useCpitlDashboard()
  const user = useSelector(selectUser)
  const expensesEnabled = isFeatureEnabledForPath('/cpitl/expenses', user?.featureToggles)
  const { data: summary } = useExpenseSummary({}, expensesEnabled)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [printing, setPrinting] = useState<string | null>(null)

  const chartData = useMemo(() => (data?.byMonth || []).map((m) => ({ ...m, label: monthLabel(m.month) })), [data])
  const modeMax = useMemo(() => Math.max(1, ...(data?.byMode || []).map((m) => m.amount)), [data])

  const toggle = (cls: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(cls)) next.delete(cls)
      else next.add(cls)
      return next
    })

  const printSlips = async (cls: string, section?: string) => {
    const key = `${cls}-${section || ''}`
    setPrinting(key)
    try {
      await cpitlService.openClassSlips({ class: cls, section })
    } catch (error) {
      toast.error(await errorMessage(error, 'Could not generate fee slips.'))
    } finally {
      setPrinting(null)
    }
  }

  if (isLoading) {
    return (
      <CpitlPageShell>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </CpitlPageShell>
    )
  }

  if (isError || !data) {
    return (
      <CpitlPageShell>
        <CpitlEmpty message="Could not load the finance dashboard." />
      </CpitlPageShell>
    )
  }

  const { totals, payments, coverage } = data
  const hasData = totals.expected > 0 || payments.count > 0

  if (!hasData) {
    return (
      <CpitlPageShell title="Fee Dashboard" subtitle="Collection and pending dues for the selected session">
        <CpitlEmpty
          message="No fees have been set up for this session yet. Create a fee structure and assign it to classes to start tracking collection."
          action={
            <Link to="/cpitl/fee-structures" className={btnPrimary}>
              Set up fee structures
            </Link>
          }
        />
      </CpitlPageShell>
    )
  }

  return (
    <CpitlPageShell
      title="Fee Dashboard"
      subtitle={`${coverage.studentsWithStructure} of ${coverage.activeStudents} active students have a fee structure`}
      actions={
        <Link to="/cpitl/collection" className={btnPrimary}>
          <IndianRupee className="h-4 w-4" /> Collect fee
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Session demand" value={inrShort(totals.expected)} hint={`${inr(totals.concession)} concession given`} icon={Wallet} tone="indigo" />
        <StatCard
          label="Collected"
          value={inrShort(totals.collected)}
          hint={`${pct(totals.collectionRate)} of session demand`}
          icon={IndianRupee}
          tone="emerald"
        />
        <StatCard label="Pending" value={inrShort(totals.pending)} hint="Includes future installments" icon={CalendarClock} tone="amber" />
        <StatCard
          label="Overdue"
          value={inrShort(totals.overdue)}
          hint={`${pct(totals.dueSoFarRate)} of dues-to-date collected`}
          icon={AlertTriangle}
          tone="rose"
        />
        <StatCard label="Today" value={inrShort(payments.today)} hint={`${payments.todayCount} receipt(s)`} icon={Users} tone="sky" />
      </div>

      <CpitlCard title="Class-wise collection">
        <div className="-mx-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="px-5 py-2.5">Class</th>
                <th className="px-3 py-2.5 text-right">Students</th>
                <th className="px-3 py-2.5 text-right">Demand</th>
                <th className="px-3 py-2.5 text-right">Received</th>
                <th className="px-3 py-2.5 text-right">Pending</th>
                <th className="px-3 py-2.5 text-right">Overdue</th>
                <th className="w-48 px-3 py-2.5">Collected</th>
                <th className="px-5 py-2.5 text-right">Slips</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {data.byClass.map((row) => {
                const open = expanded.has(row.class)
                return (
                  <React.Fragment key={row.class}>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="px-5 py-2.5">
                        <button type="button" onClick={() => toggle(row.class)} className="inline-flex items-center gap-1 font-semibold text-slate-900 dark:text-white">
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          Class {row.class}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{row.students}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{inr(row.expected)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{inr(row.collected)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{inr(row.pending)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {row.overdue > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            {inr(row.overdue)} <span className="text-xs text-slate-400">({row.defaulters})</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={row.collectionRate || 0} />
                          <span className="w-12 text-right text-xs tabular-nums text-slate-500">{pct(row.collectionRate)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <button type="button" className={btnGhost} disabled={printing === `${row.class}-`} onClick={() => printSlips(row.class)}>
                          <Printer className="h-3.5 w-3.5" /> {printing === `${row.class}-` ? 'Preparing…' : 'Print'}
                        </button>
                      </td>
                    </tr>
                    {open &&
                      (row.sections || []).map((sec) => {
                        const rate = sec.expected > 0 ? (sec.collected / sec.expected) * 100 : 0
                        return (
                          <tr key={`${row.class}-${sec.section}`} className="bg-slate-50/60 text-slate-600 dark:bg-slate-900/20 dark:text-slate-300">
                            <td className="px-5 py-2 pl-12">Section {sec.section || '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{sec.students}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{inr(sec.expected)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{inr(sec.collected)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{inr(sec.pending)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{sec.overdue > 0 ? `${inr(sec.overdue)} (${sec.defaulters})` : '—'}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <ProgressBar value={rate} />
                                <span className="w-12 text-right text-xs tabular-nums">{pct(rate)}</span>
                              </div>
                            </td>
                            <td className="px-5 py-2 text-right">
                              <button
                                type="button"
                                className={btnGhost}
                                disabled={printing === `${row.class}-${sec.section}`}
                                onClick={() => printSlips(row.class, sec.section)}
                              >
                                <Printer className="h-3.5 w-3.5" /> Print
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                  </React.Fragment>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 font-semibold dark:border-slate-600">
              <tr>
                <td className="px-5 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{data.byClass.reduce((s, r) => s + r.students, 0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{inr(totals.expected)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{inr(totals.collected)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{inr(totals.pending)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{inr(totals.overdue)}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{pct(totals.collectionRate)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </CpitlCard>

      <div className="grid gap-6 lg:grid-cols-3">
        <CpitlCard title="Monthly collection" className="lg:col-span-2">
          {chartData.length ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickFormatter={(v) => inrShort(v)} tickLine={false} axisLine={false} fontSize={12} width={64} />
                  <Tooltip
                    cursor={{ fillOpacity: 0.06 }}
                    formatter={(value: number, _name, item) => [`${inr(value)} · ${item?.payload?.count} receipts`, 'Collected']}
                  />
                  <Bar dataKey="amount" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <CpitlEmpty message="No payments recorded yet." />
          )}
        </CpitlCard>

        <CpitlCard title="By payment mode">
          {data.byMode.length ? (
            <ul className="space-y-3">
              {data.byMode.map((m) => (
                <li key={m.mode}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{MODE_LABELS[m.mode] || m.mode}</span>
                    <span className="tabular-nums text-slate-900 dark:text-white">{inr(m.amount)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(m.amount / modeMax) * 100}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{m.count} receipt(s)</p>
                </li>
              ))}
            </ul>
          ) : (
            <CpitlEmpty message="No payments recorded yet." />
          )}
        </CpitlCard>
      </div>

      {expensesEnabled && summary && (summary.totals.expense > 0 || summary.totals.income > 0) ? (
        <CpitlCard
          title="Income vs expenses"
          actions={
            <Link to="/cpitl/expenses" className={btnGhost}>
              Expense overview
            </Link>
          }
        >
          <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900/40">
              <p className="text-xs text-slate-500">Fee income</p>
              <p className="text-lg font-semibold tabular-nums">{inr(summary.totals.income)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900/40">
              <p className="text-xs text-slate-500">Expenses</p>
              <p className="text-lg font-semibold tabular-nums">{inr(summary.totals.expense)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-900/40">
              <p className="text-xs text-slate-500">{summary.totals.net >= 0 ? 'Surplus' : 'Deficit'}</p>
              <p className={`text-lg font-semibold tabular-nums ${summary.totals.net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {inr(Math.abs(summary.totals.net))}
              </p>
            </div>
          </div>
          <IncomeExpenseChart data={summary.byMonth} />
        </CpitlCard>
      ) : null}

      <CpitlCard
        title="Top defaulters"
        actions={
          <Link to="/cpitl/fee-slips" className={btnGhost}>
            <Printer className="h-3.5 w-3.5" /> Fee slips
          </Link>
        }
      >
        {data.defaulters.length ? (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className="px-5 py-2.5">Student</th>
                  <th className="px-3 py-2.5">Class</th>
                  <th className="px-3 py-2.5">Guardian phone</th>
                  <th className="px-3 py-2.5">Overdue since</th>
                  <th className="px-3 py-2.5 text-right">Installments</th>
                  <th className="px-5 py-2.5 text-right">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {data.defaulters.map((d) => (
                  <tr
                    key={d.accountId}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40"
                    onClick={() => d.studentId && navigate(`/cpitl/students/${d.studentId}`)}
                  >
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-slate-900 dark:text-white">{d.name}</div>
                      <div className="text-xs text-slate-500">{d.rollNumber}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      {d.class}
                      {d.section ? `-${d.section}` : ''}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{d.guardianPhone || '—'}</td>
                    <td className="px-3 py-2.5">{fmtDate(d.oldestDue)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{d.installments}</td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-rose-600 dark:text-rose-400">{inr(d.overdue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <CpitlEmpty message="No overdue dues." />
        )}
      </CpitlCard>
    </CpitlPageShell>
  )
}

export default CpitlDashboard
