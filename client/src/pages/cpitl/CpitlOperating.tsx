import React, { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronLeft, ChevronRight, Paperclip, Plus, Settings2 } from 'lucide-react'
import { useBudgets, useExpenseCategories, useExpenses, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { CapitalExpense, ExpenseCategory } from '@/services/cpitlService'
import QuickExpenseSheet from '@/components/cpitl/QuickExpenseSheet'
import CategoryManager from '@/components/cpitl/CategoryManager'
import { CategoryIcon } from '@/components/cpitl/IconPicker'
import { CpitlCard, CpitlEmpty, CpitlPageShell, MODE_LABELS, MONTHS, btnGhost, btnPrimary, btnSecondary, errorMessage, inr } from '@/components/cpitl/CpitlUi'

const monthBounds = (offset: number) => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: iso(start), to: iso(end), label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}` }
}

/** Budget ring around a category icon: stroke = share of monthly budget used. */
const BudgetRing: React.FC<{ pct: number | null; color: string; children: React.ReactNode }> = ({ pct, color, children }) => {
  const r = 26
  const c = 2 * Math.PI * r
  const used = pct === null ? 0 : Math.min(1, pct / 100)
  const over = pct !== null && pct > 100
  return (
    <span className="relative inline-flex h-16 w-16 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 60 60" aria-hidden>
        <circle cx="30" cy="30" r={r} fill="none" strokeWidth="4" className="stroke-slate-100 dark:stroke-slate-700" />
        {pct !== null ? (
          <circle cx="30" cy="30" r={r} fill="none" strokeWidth="4" strokeLinecap="round" stroke={over ? '#e11d48' : color} strokeDasharray={`${used * c} ${c}`} />
        ) : null}
      </svg>
      {children}
    </span>
  )
}

const CpitlOperating: React.FC = () => {
  const invalidate = useInvalidateCpitl()
  const [offset, setOffset] = useState(0)
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [sheet, setSheet] = useState<{ open: boolean; expense?: CapitalExpense | null }>({ open: false })
  const [managerOpen, setManagerOpen] = useState(false)
  const { from, to, label } = monthBounds(offset)

  const { data: categories = [] } = useExpenseCategories()
  const { data, isLoading } = useExpenses({ kind: 'operating', from, to, limit: 1000 })
  const { data: budgetData } = useBudgets()
  const expenses = data?.items || []

  const catById = useMemo(() => new Map(categories.map((c) => [c._id, c])), [categories])
  const rootOf = (id: string | null): ExpenseCategory | undefined => {
    const c = id ? catById.get(id) : undefined
    return c?.parentId ? catById.get(c.parentId) || c : c
  }

  const spentByRoot = useMemo(() => {
    const map = new Map<string, number>()
    expenses.forEach((e) => {
      const root = rootOf(e.categoryId)
      const key = root?._id || 'none'
      map.set(key, (map.get(key) || 0) + e.amount)
    })
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, catById])

  // Session budgets are yearly; the ring shows this month against a twelfth of it.
  const monthlyBudget = useMemo(() => {
    const map = new Map<string, number>()
    budgetData?.rows.filter((r) => r.kind === 'operating' && r.targetKey !== 'all').forEach((r) => map.set(r.targetKey, r.budget / 12))
    return map
  }, [budgetData])

  const total = expenses.reduce((s, e) => s + e.amount, 0)
  const roots = categories.filter((c) => !c.parentId)
  const tiles = roots
    .map((c) => ({ cat: c, spent: spentByRoot.get(c._id) || 0, budget: monthlyBudget.get(c._id) || 0 }))
    .sort((a, b) => b.spent - a.spent || (a.cat.sortOrder || 0) - (b.cat.sortOrder || 0))

  const visible = activeCat ? expenses.filter((e) => rootOf(e.categoryId)?._id === activeCat) : expenses
  const byDay = useMemo(() => {
    const groups = new Map<string, CapitalExpense[]>()
    visible.forEach((e) => {
      const key = e.date.slice(0, 10)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(e)
    })
    return [...groups.entries()]
  }, [visible])

  const voidExpense = async (e: CapitalExpense) => {
    const reason = window.prompt(`Void ${inr(e.amount)} "${e.title}"? Reason:`)
    if (!reason?.trim()) return
    try {
      await cpitlService.voidExpense(e._id, reason)
      toast.success('Expense voided.')
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  return (
    <CpitlPageShell
      title="Operating Costs"
      subtitle="Day-to-day school spending by category"
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => setManagerOpen(true)}>
            <Settings2 className="h-4 w-4" /> Categories
          </button>
          <button type="button" className={btnPrimary} onClick={() => setSheet({ open: true, expense: null })}>
            <Plus className="h-4 w-4" /> Add expense
          </button>
        </>
      }
    >
      <CpitlCard>
        <div className="flex items-center justify-between">
          <button type="button" className={btnGhost} aria-label="Previous month" onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-white">{inr(total)}</p>
            <p className="text-xs text-slate-400">{expenses.length} expense(s)</p>
          </div>
          <button type="button" className={btnGhost} aria-label="Next month" disabled={offset >= 0} onClick={() => setOffset((o) => Math.min(0, o + 1))}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-3">
          {tiles.map(({ cat, spent, budget }) => {
            const pct = budget > 0 ? (spent / budget) * 100 : null
            const on = activeCat === cat._id
            return (
              <button
                key={cat._id}
                type="button"
                onClick={() => setActiveCat(on ? null : cat._id)}
                className={`flex flex-col items-center gap-1 rounded-2xl p-2 text-center transition ${on ? 'ring-2' : 'hover:bg-slate-50 dark:hover:bg-slate-700/40'} ${
                  spent ? '' : 'opacity-60'
                }`}
                style={on ? { ['--tw-ring-color' as string]: cat.color, backgroundColor: `${cat.color}10` } : undefined}
                title={pct !== null ? `${Math.round(pct)}% of monthly budget` : 'No budget set'}
              >
                <BudgetRing pct={pct} color={cat.color}>
                  <CategoryIcon icon={cat.icon} color={cat.color} />
                </BudgetRing>
                <span className="line-clamp-1 text-xs font-medium text-slate-700 dark:text-slate-200">{cat.name}</span>
                <span className="text-xs tabular-nums text-slate-500">{spent ? inr(spent) : '—'}</span>
              </button>
            )
          })}
        </div>
      </CpitlCard>

      <CpitlCard
        title={activeCat ? `${catById.get(activeCat)?.name} — ${label}` : `All expenses — ${label}`}
        actions={activeCat ? <button type="button" className={btnGhost} onClick={() => setActiveCat(null)}>Show all</button> : null}
      >
        {isLoading ? (
          <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />
        ) : byDay.length ? (
          <div className="space-y-5">
            {byDay.map(([day, items]) => (
              <div key={day}>
                <div className="mb-1.5 flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>{new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                  <span className="tabular-nums">{inr(items.reduce((s, e) => s + e.amount, 0))}</span>
                </div>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-700 dark:border-slate-700">
                  {items.map((e) => {
                    const cat = e.categoryId ? catById.get(e.categoryId) : undefined
                    return (
                      <li key={e._id} className="group flex items-center gap-3 px-3 py-2.5">
                        <CategoryIcon icon={cat?.icon} color={cat?.color} size="sm" />
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSheet({ open: true, expense: e })}>
                          <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{e.title || cat?.name}</div>
                          <div className="truncate text-xs text-slate-500">
                            {[cat?.parentId ? cat.name : null, e.payee, MODE_LABELS[e.mode] || e.mode, e.createdBy?.name].filter(Boolean).join(' · ')}
                          </div>
                        </button>
                        {e.attachments?.length ? (
                          <a href={e.attachments[0].url} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-indigo-600" aria-label="Open attachment">
                            <Paperclip className="h-4 w-4" />
                          </a>
                        ) : null}
                        <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{inr(e.amount)}</span>
                        <button type="button" className={`${btnGhost} invisible text-rose-600 group-hover:visible`} onClick={() => voidExpense(e)}>
                          Void
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <CpitlEmpty
            message={`No operating expenses in ${label}.`}
            action={
              <button type="button" className={btnPrimary} onClick={() => setSheet({ open: true, expense: null })}>
                <Plus className="h-4 w-4" /> Add expense
              </button>
            }
          />
        )}
      </CpitlCard>

      <button
        type="button"
        aria-label="Add expense"
        onClick={() => setSheet({ open: true, expense: null })}
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg transition hover:bg-indigo-700 sm:hidden"
      >
        <Plus className="h-6 w-6" />
      </button>

      <QuickExpenseSheet
        isOpen={sheet.open}
        onClose={() => setSheet({ open: false })}
        categories={categories}
        expense={sheet.expense}
        defaultCategoryId={activeCat}
        onSaved={invalidate}
      />
      <CategoryManager isOpen={managerOpen} onClose={() => setManagerOpen(false)} categories={categories} onChanged={invalidate} />
    </CpitlPageShell>
  )
}

export default CpitlOperating
