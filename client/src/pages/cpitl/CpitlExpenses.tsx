import React, { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, BarChart3, CalendarDays, Plus, Receipt, Scale, Shapes, Wallet } from 'lucide-react'
import { useBudgets, useExpenseCategories, useExpenseSummary } from '@/hooks/useCpitl'
import type { ExpenseKind, ExpenseSummary } from '@/services/cpitlService'
import { Badge, Button, Card, DataTable, EmptyState, Page, StatCard, cx, type DataTableColumn } from '@/components/ui'
import { CategoryIcon, catStyle } from '@/components/cpitl/IconPicker'
import { MONTHS, UsageBar, fmtDate, inr, inrShort } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/expenses.css'

export const KIND_META: Record<ExpenseKind, { label: string; href: string }> = {
  salary: { label: 'Salary', href: '/cpitl/payroll' },
  fuel: { label: 'Fuel', href: '/cpitl/fuel' },
  electricity: { label: 'Electricity', href: '/cpitl/electricity' },
  operating: { label: 'Operating costs', href: '/cpitl/operating' },
  infra: { label: 'Infrastructure', href: '/cpitl/infra' },
}

// Validated pair (light + dark surfaces) — see dataviz validate_palette. Kept for pages that import them.
export const INCOME_COLOR = '#0d9488'
export const EXPENSE_COLOR = '#6366f1'

// Chart series follow the design-system chart tokens; the hex values are fallbacks outside `.cb-app`.
const INCOME_FILL = `var(--chart-5, ${INCOME_COLOR})`
const EXPENSE_FILL = `var(--chart-1, ${EXPENSE_COLOR})`

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${String(y).slice(2)}`
}

/** Income vs expense by month — reused on the fee dashboard. */
export const IncomeExpenseChart: React.FC<{ data: Array<{ month: string; income: number; expense: number }> }> = ({ data }) => {
  const rows = data.map((m) => ({ ...m, label: monthLabel(m.month) }))
  return (
    <div className="ce-chart" role="img" aria-label="Income and expenses by month">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
          <YAxis tickFormatter={(v) => inrShort(v)} tickLine={false} axisLine={false} fontSize={12} width={64} />
          <Tooltip cursor={{ fill: 'var(--surface-sunken, rgba(0,0,0,.05))' }} formatter={(value: number, name) => [inr(value), name]} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="income" name="Income (fees)" fill={INCOME_FILL} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expense" name="Expenses" fill={EXPENSE_FILL} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

const KIND_ICON: Record<ExpenseKind, string> = { fuel: 'fuel', electricity: 'zap', salary: 'users', infra: 'hard-hat', operating: 'shapes' }
const KINDS = Object.keys(KIND_META) as ExpenseKind[]
type MonthRow = ExpenseSummary['byMonth'][number]

const signed = (n: number) => `${n < 0 ? '−' : ''}${inr(Math.abs(n))}`

const CpitlExpenses: React.FC = () => {
  const navigate = useNavigate()
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

  const statementColumns = useMemo<DataTableColumn<MonthRow>[]>(
    () => [
      { key: 'month', header: 'Month', mobile: 'title', render: (m) => <span className="cb-strong">{monthLabel(m.month)}</span> },
      ...KINDS.map<DataTableColumn<MonthRow>>((k) => ({
        key: k,
        header: KIND_META[k].label,
        headerLabel: KIND_META[k].label,
        align: 'right',
        numeric: true,
        render: (m) => (m.byKind[k] ? inr(m.byKind[k]) : '—'),
      })),
      { key: 'expense', header: 'Total expense', align: 'right', numeric: true, mobile: 'aside', render: (m) => <span className="cb-strong">{inr(m.expense)}</span> },
      { key: 'income', header: 'Fee income', align: 'right', numeric: true, render: (m) => inr(m.income) },
      {
        key: 'net',
        header: 'Net',
        align: 'right',
        numeric: true,
        render: (m) => (
          <span className={cx('cb-strong', m.net < 0 ? 'ce-neg' : 'ce-pos')} title={m.net < 0 ? 'Deficit' : 'Surplus'}>
            {signed(m.net)}
          </span>
        ),
      },
    ],
    []
  )

  if (isLoading || !data) {
    return (
      <Page>
        <Card>
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading expenses…
          </div>
        </Card>
      </Page>
    )
  }

  const { totals, byKind, byMonth, byCategory, recent } = data
  const kindMax = Math.max(1, ...byKind.map((k) => k.amount))
  const catMax = Math.max(1, ...byCategory.map((c) => c.amount))
  const spentPct = totalBudget > 0 ? (totals.expense / totalBudget) * 100 : null

  return (
    <Page>
      <div className="ce-toolbar">
        <p className="ce-toolbar__lede">Where the school’s money goes this session.</p>
        <div className="ce-toolbar__actions">
          <Button variant="primary" icon={Plus} onClick={() => navigate('/cpitl/operating')}>
            Add expense
          </Button>
        </div>
      </div>

      <div className="cb-stats">
        <StatCard
          label="Spent this session"
          value={inrShort(totals.expense)}
          icon={Wallet}
          hint={totalBudget > 0 ? `${Math.round(spentPct || 0)}% of ${inrShort(totalBudget)} budget` : 'No budget set'}
          progress={spentPct !== null ? Math.min(100, spentPct) : undefined}
          progressTone={spentPct !== null && spentPct > 100 ? 'danger' : spentPct !== null && spentPct >= 85 ? 'warning' : 'success'}
        />
        <StatCard label="This month" value={inrShort(totals.thisMonth)} icon={CalendarDays} />
        <StatCard label="Fee income" value={inrShort(totals.income)} hint="Collected this session" icon={ArrowDownRight} />
        <StatCard
          label={totals.net >= 0 ? 'Surplus' : 'Deficit'}
          value={inrShort(Math.abs(totals.net))}
          hint="Income minus expenses"
          icon={Scale}
          delta={{ value: totals.net >= 0 ? 'Surplus' : 'Deficit', direction: totals.net >= 0 ? 'up' : 'down', tone: totals.net >= 0 ? 'success' : 'danger' }}
        />
      </div>

      <div className="cb-grid-8-4">
        <Card title="Income vs expenses by month" fill>
          {byMonth.length ? (
            <IncomeExpenseChart data={byMonth} />
          ) : (
            <EmptyState compact icon={BarChart3} title="No income or expenses recorded yet" body="The chart fills in as fees are collected and expenses are added." />
          )}
        </Card>

        <Card title="By expense type" subtitle="Against the session budget, where one is set">
          {byKind.length ? (
            <ul className="ce-bars">
              {byKind.map((k) => {
                const b = budgetByKind.get(k.kind)
                const pct = b?.budget ? (k.amount / b.budget) * 100 : null
                return (
                  <li key={k.kind} className="ce-bar">
                    <div className="ce-bar__head">
                      <Link to={KIND_META[k.kind].href} className="ce-bar__label">
                        {KIND_META[k.kind].label}
                      </Link>
                      <span className="ce-bar__value">{inr(k.amount)}</span>
                    </div>
                    {pct !== null && b ? (
                      <>
                        <UsageBar pct={pct} />
                        <div className="ce-bar__meta">
                          {pct > 100 ? <Badge tone="danger">Over budget</Badge> : null}
                          <span>
                            {Math.round(pct)}% of {inr(b.budget)} · on track for {inr(b.projected)}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="ce-bar__track" aria-hidden="true">
                          <span className="ce-bar__fill" style={{ width: `${(k.amount / kindMax) * 100}%` }} />
                        </div>
                        <div className="ce-bar__meta">
                          {k.count} entr{k.count === 1 ? 'y' : 'ies'} · no budget set
                        </div>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState compact icon={Receipt} title="No expenses yet" body="Add an expense to see the split by type." />
          )}
        </Card>
      </div>

      {byMonth.length ? (
        <Card flush title="Monthly statement" subtitle="Expenses by type, fee income and the net for each month" className="ce-records">
          <DataTable caption="Monthly statement" columns={statementColumns} rows={byMonth} getRowKey={(m) => m.month} />
        </Card>
      ) : null}

      <div className="cb-grid-6-6">
        <Card title="Top operating categories" action={<Link to="/cpitl/operating" className="cb-link">Open operating costs</Link>}>
          {byCategory.length ? (
            <ul className="ce-bars">
              {byCategory.slice(0, 8).map((c) => (
                <li key={String(c.categoryId)} className="ce-bar ce-bar--cat">
                  <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                  <div className="ce-bar__body">
                    <div className="ce-bar__head">
                      <span className="ce-bar__label">{c.name}</span>
                      <span className="ce-bar__value">{inr(c.amount)}</span>
                    </div>
                    <div className="ce-bar__track" aria-hidden="true">
                      <span className="ce-bar__fill" style={{ width: `${(c.amount / catMax) * 100}%`, ...catStyle(c.color) }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={Shapes} title="No operating expenses yet" body="Add one from Operating costs to see the top categories." />
          )}
        </Card>

        <Card title="Recent expenses">
          {recent.length ? (
            <ul className="ce-list">
              {recent.map((e) => {
                const cat = e.categoryId ? catById.get(e.categoryId) : undefined
                return (
                  <li key={e._id} className="ce-list__row">
                    <CategoryIcon icon={cat?.icon || KIND_ICON[e.kind]} color={cat?.color || '#64748b'} size="sm" />
                    <div className="ce-entity">
                      <span className="ce-entity__primary">{e.title || KIND_META[e.kind].label}</span>
                      <span className="ce-entity__secondary">
                        {fmtDate(e.date)} · {KIND_META[e.kind].label}
                      </span>
                    </div>
                    <span className="ce-list__amt">{inr(e.amount)}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState compact icon={Receipt} title="No expenses recorded yet" body="Expenses from salary, fuel, electricity and other pages show up here." />
          )}
        </Card>
      </div>
    </Page>
  )
}

export default CpitlExpenses
