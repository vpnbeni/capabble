import React, { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, CalendarDays, Plus, Scale, Wallet } from 'lucide-react'
import { useBudgets, useExpenseCategories, useExpenseSummary } from '@/hooks/useCpitl'
import type { ExpenseKind } from '@/services/cpitlService'
import { CategoryIcon } from '@/components/cpitl/IconPicker'
import { CpitlCard, CpitlEmpty, CpitlPageShell, MONTHS, StatCard, UsageBar, btnPrimary, fmtDate, inr, inrShort, tableHead } from '@/components/cpitl/CpitlUi'

export const KIND_META: Record<ExpenseKind, { label: string; href: string }> = {
  salary: { label: 'Salary', href: '/cpitl/payroll' },
  fuel: { label: 'Fuel', href: '/cpitl/fuel' },
  electricity: { label: 'Electricity', href: '/cpitl/electricity' },
  operating: { label: 'Operating costs', href: '/cpitl/operating' },
  infra: { label: 'Infrastructure', href: '/cpitl/infra' },
}

// Validated pair (light + dark surfaces) — see dataviz validate_palette.
export const INCOME_COLOR = '#0d9488'
export const EXPENSE_COLOR = '#6366f1'

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${String(y).slice(2)}`
}

/** Income vs expense by month — reused on the fee dashboard. */
export const IncomeExpenseChart: React.FC<{ data: Array<{ month: string; income: number; expense: number }> }> = ({ data }) => {
  const rows = data.map((m) => ({ ...m, label: monthLabel(m.month) }))
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} strokeOpacity={0.15} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickFormatter={(v) => inrShort(v)} tickLine={false} axisLine={false} fontSize={12} width={64} />
          <Tooltip cursor={{ fillOpacity: 0.06 }} formatter={(value: number, name) => [inr(value), name]} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="income" name="Income (fees)" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expense" name="Expenses" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const CpitlExpenses: React.FC = () => {
  const { data, isLoading } = useExpenseSummary()
  const { data: budgets } = useBudgets()
  const { data: categories = [] } = useExpenseCategories()

  const budgetByKind = useMemo(() => {
    const map = new Map<string, { budget: number; projected: number }>()
    budgets?.rows.filter((r) => r.targetKey === 'all').forEach((r) => map.set(r.kind, { budget: r.budget, projected: r.projectedYearEnd }))
    return map
  }, [budgets])
  const totalBudget = [...budgetByKind.values()].reduce((s, b) => s + b.budget, 0)
  const catById = useMemo(() => new Map(categories.map((c) => [c._id, c])), [categories])

  if (isLoading || !data) {
    return (
      <CpitlPageShell>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      </CpitlPageShell>
    )
  }

  const { totals, byKind, byMonth, byCategory, recent } = data
  const kindMax = Math.max(1, ...byKind.map((k) => k.amount))
  const catMax = Math.max(1, ...byCategory.map((c) => c.amount))

  return (
    <CpitlPageShell
      title="Expenses"
      subtitle="Where the school's money goes this session"
      actions={
        <Link to="/cpitl/operating" className={btnPrimary}>
          <Plus className="h-4 w-4" /> Add expense
        </Link>
      }
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Spent this session"
          value={inrShort(totals.expense)}
          hint={totalBudget > 0 ? `of ${inrShort(totalBudget)} budget` : 'No budget set'}
          icon={Wallet}
          tone="indigo"
        />
        <StatCard label="This month" value={inrShort(totals.thisMonth)} icon={CalendarDays} tone="sky" />
        <StatCard label="Fee income" value={inrShort(totals.income)} hint="Collected this session" icon={ArrowDownRight} tone="emerald" />
        <StatCard
          label={totals.net >= 0 ? 'Surplus' : 'Deficit'}
          value={inrShort(Math.abs(totals.net))}
          hint="Income minus expenses"
          icon={totals.net >= 0 ? Scale : ArrowUpRight}
          tone={totals.net >= 0 ? 'emerald' : 'rose'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <CpitlCard title="By expense type" className="lg:col-span-2">
          <ul className="space-y-4">
            {byKind.map((k) => {
              const b = budgetByKind.get(k.kind)
              return (
                <li key={k.kind}>
                  <div className="flex items-baseline justify-between text-sm">
                    <Link to={KIND_META[k.kind].href} className="font-medium text-slate-700 hover:text-indigo-600 dark:text-slate-200">
                      {KIND_META[k.kind].label}
                    </Link>
                    <span className="tabular-nums text-slate-900 dark:text-white">{inr(k.amount)}</span>
                  </div>
                  {b?.budget ? (
                    <>
                      <UsageBar pct={(k.amount / b.budget) * 100} className="mt-1" />
                      <p className="mt-0.5 text-xs text-slate-400">
                        {Math.round((k.amount / b.budget) * 100)}% of {inr(b.budget)} · on track for {inr(b.projected)}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                        <div className="h-full rounded-full" style={{ width: `${(k.amount / kindMax) * 100}%`, backgroundColor: EXPENSE_COLOR }} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">{k.count} entr{k.count === 1 ? 'y' : 'ies'}</p>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </CpitlCard>

        <CpitlCard title="Income vs expenses by month" className="lg:col-span-3">
          {byMonth.length ? <IncomeExpenseChart data={byMonth} /> : <CpitlEmpty message="No income or expenses recorded yet." />}
        </CpitlCard>
      </div>

      {byMonth.length ? (
        <CpitlCard title="Monthly statement">
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className="px-5 py-2.5">Month</th>
                  {(Object.keys(KIND_META) as ExpenseKind[]).map((k) => (
                    <th key={k} className="px-3 py-2.5 text-right">
                      {KIND_META[k].label}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right">Total expense</th>
                  <th className="px-3 py-2.5 text-right">Fee income</th>
                  <th className="px-5 py-2.5 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-700">
                {byMonth.map((m) => (
                  <tr key={m.month}>
                    <td className="px-5 py-2 font-medium text-slate-900 dark:text-white">{monthLabel(m.month)}</td>
                    {(Object.keys(KIND_META) as ExpenseKind[]).map((k) => (
                      <td key={k} className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                        {m.byKind[k] ? inr(m.byKind[k]) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-medium">{inr(m.expense)}</td>
                    <td className="px-3 py-2 text-right">{inr(m.income)}</td>
                    <td className={`px-5 py-2 text-right font-semibold ${m.net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {m.net >= 0 ? '' : '−'}
                      {inr(Math.abs(m.net))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CpitlCard>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <CpitlCard title="Top operating categories">
          {byCategory.length ? (
            <ul className="space-y-3">
              {byCategory.slice(0, 8).map((c) => (
                <li key={String(c.categoryId)} className="flex items-center gap-3">
                  <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="truncate text-slate-700 dark:text-slate-200">{c.name}</span>
                      <span className="tabular-nums text-slate-900 dark:text-white">{inr(c.amount)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                      <div className="h-full rounded-full" style={{ width: `${(c.amount / catMax) * 100}%`, backgroundColor: c.color }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <CpitlEmpty message="No operating expenses yet." />
          )}
        </CpitlCard>

        <CpitlCard title="Recent expenses">
          {recent.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-700">
              {recent.map((e) => {
                const cat = e.categoryId ? catById.get(e.categoryId) : undefined
                return (
                  <li key={e._id} className="flex items-center gap-3 py-2.5">
                    <CategoryIcon icon={cat?.icon || { fuel: 'fuel', electricity: 'zap', salary: 'users', infra: 'hard-hat', operating: 'shapes' }[e.kind]} color={cat?.color || '#64748b'} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{e.title || KIND_META[e.kind].label}</div>
                      <div className="text-xs text-slate-500">
                        {fmtDate(e.date)} · {KIND_META[e.kind].label}
                      </div>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{inr(e.amount)}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <CpitlEmpty message="Nothing yet." />
          )}
        </CpitlCard>
      </div>
    </CpitlPageShell>
  )
}

export default CpitlExpenses
