import React, { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Ban, ChevronLeft, ChevronRight, Download, Paperclip, Pencil, Plus, Receipt, Settings2, Shapes, Target, Wallet } from 'lucide-react'
import { useBudgets, useExpenseCategories, useExpenses, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { CapitalExpense, ExpenseCategory } from '@/services/cpitlService'
import cpitlBulkService from '@/services/cpitlBulkService'
import {
  BulkBar,
  BulkResultDialog,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  FilterBar,
  Icon,
  Menu,
  Page,
  StatCard,
  TextArea,
  TextField,
  cx,
  useRowSelection,
  type BulkResult,
} from '@/components/ui'
import QuickExpenseSheet from '@/components/cpitl/QuickExpenseSheet'
import CategoryManager from '@/components/cpitl/CategoryManager'
import { CategoryIcon, catStyle } from '@/components/cpitl/IconPicker'
import { MODE_LABELS, MONTHS, errorMessage, inr, inrShort } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/expenses.css'

const monthBounds = (offset: number) => {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: iso(start), to: iso(end), label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}` }
}

// Ledger rows owned by the fuel, electricity or payroll pages can only be voided there.
const MANAGED_SOURCES = new Set(['FuelLog', 'ElectricityBill', 'PayrollRun'])
const isVoidable = (e: CapitalExpense) => e.status !== 'void' && !MANAGED_SOURCES.has(e.sourceRef?.model || '')
const expenseId = (e: CapitalExpense) => e._id

const csvCell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Builds a CSV in the browser and saves it (with a BOM so Excel reads ₹ and Hindi text). */
const downloadCsv = (filename: string, header: string[], rows: unknown[][]) => {
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Budget ring around a category icon: stroke = share of the monthly budget used (user colour; red when over). */
const BudgetRing: React.FC<{ pct: number | null; children: React.ReactNode }> = ({ pct, children }) => {
  const r = 26
  const c = 2 * Math.PI * r
  const used = pct === null ? 0 : Math.min(1, pct / 100)
  return (
    <span className="ce-ring">
      <svg viewBox="0 0 60 60" aria-hidden="true">
        <circle className="ce-ring__track" cx="30" cy="30" r={r} fill="none" strokeWidth="4" />
        {pct !== null ? (
          <circle className={cx('ce-ring__fill', pct > 100 && 'is-over')} cx="30" cy="30" r={r} fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${used * c} ${c}`} />
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
  const [search, setSearch] = useState('')
  const [sheet, setSheet] = useState<{ open: boolean; expense?: CapitalExpense | null }>({ open: false })
  const [managerOpen, setManagerOpen] = useState(false)
  const [voiding, setVoiding] = useState<CapitalExpense | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidTried, setVoidTried] = useState(false)
  const [voidBusy, setVoidBusy] = useState(false)
  const [bulkVoidOpen, setBulkVoidOpen] = useState(false)
  const [bulkReason, setBulkReason] = useState('')
  const [bulkTried, setBulkTried] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkResult, setBulkResult] = useState<(BulkResult & { action: string; noun: string }) | null>(null)
  const { from, to, label } = monthBounds(offset)

  const { data: categories = [] } = useExpenseCategories()
  const { data, isLoading } = useExpenses({ kind: 'operating', from, to, limit: 1000 })
  const { data: budgetData } = useBudgets()
  const expenses = useMemo(() => data?.items || [], [data])

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
  const budgetedTiles = tiles.filter((t) => t.budget > 0)
  const monthBudget = budgetedTiles.reduce((s, t) => s + t.budget, 0)
  const budgetedSpent = budgetedTiles.reduce((s, t) => s + t.spent, 0)
  const overCount = budgetedTiles.filter((t) => t.spent > t.budget).length
  const top = tiles[0]?.spent ? tiles[0] : null

  const needle = search.trim().toLowerCase()
  const visible = useMemo(
    () =>
      expenses.filter((e) => {
        if (activeCat && rootOf(e.categoryId)?._id !== activeCat) return false
        if (!needle) return true
        const cat = e.categoryId ? catById.get(e.categoryId) : undefined
        return [e.title, e.payee, e.reference, e.notes, cat?.name].some((v) => String(v || '').toLowerCase().includes(needle))
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, activeCat, needle, catById]
  )
  // Selection covers the rows on screen and clears when the month, category or search changes.
  const bulk = useRowSelection(visible, expenseId, { resetKey: `${from}|${activeCat || ''}|${needle}`, isSelectable: isVoidable })
  const selectableCount = useMemo(() => visible.filter(isVoidable).length, [visible])
  const selectedTotal = bulk.selectedRows.reduce((s, e) => s + e.amount, 0)
  const byDay = useMemo(() => {
    const groups = new Map<string, CapitalExpense[]>()
    visible.forEach((e) => {
      const key = e.date.slice(0, 10)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(e)
    })
    return [...groups.entries()]
  }, [visible])

  const openVoid = (e: CapitalExpense) => {
    setVoidReason('')
    setVoidTried(false)
    setVoiding(e)
  }

  const voidExpense = async () => {
    if (!voiding) return
    setVoidTried(true)
    if (!voidReason.trim()) return
    setVoidBusy(true)
    try {
      await cpitlService.voidExpense(voiding._id, voidReason.trim())
      toast.success('Expense voided.')
      setVoiding(null)
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setVoidBusy(false)
    }
  }

  const exportSelected = () => {
    const rows = [...bulk.selectedRows].sort((a, b) => a.date.localeCompare(b.date))
    downloadCsv(
      `operating-expenses_${from.slice(0, 7)}.csv`,
      ['Date', 'Description', 'Category', 'Payee', 'Mode', 'Amount', 'Reference'],
      rows.map((e) => {
        const cat = e.categoryId ? catById.get(e.categoryId) : undefined
        const root = rootOf(e.categoryId)
        return [
          e.date.slice(0, 10),
          e.title || cat?.name || 'Expense',
          cat && root && root._id !== cat._id ? `${root.name} › ${cat.name}` : cat?.name || '',
          e.payee,
          MODE_LABELS[e.mode] || e.mode,
          e.amount,
          e.reference,
        ]
      })
    )
  }

  const openBulkVoid = () => {
    setBulkReason('')
    setBulkTried(false)
    setBulkVoidOpen(true)
  }

  const runBulkVoid = async () => {
    setBulkTried(true)
    const reason = bulkReason.trim()
    if (!reason || !bulk.count) return
    setBulkBusy(true)
    try {
      const result = await cpitlBulkService.voidExpenses(bulk.selectedIds, reason)
      setBulkVoidOpen(false)
      bulk.clear()
      if (result.failed.length) setBulkResult({ ...result, action: 'Void expenses', noun: 'expenses' })
      else toast.success(`${result.succeeded} ${result.succeeded === 1 ? 'expense' : 'expenses'} voided.`)
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBulkBusy(false)
    }
  }

  const openAdd = () => setSheet({ open: true, expense: null })
  const activeName = activeCat ? catById.get(activeCat)?.name : null
  const filtered = Boolean(activeCat || needle)

  const spentTiles = [...tiles].filter((t) => t.spent > 0).sort((x, y) => y.spent - x.spent)
  const monthTotal = spentTiles.reduce((sum, t) => sum + t.spent, 0)

  return (
    <Page>
      <div className="ce-toolbar">
        <div className="ce-month" role="group" aria-label="Month">
          <Button variant="tertiary" size="sm" icon={ChevronLeft} aria-label="Previous month" onClick={() => setOffset((o) => o - 1)} />
          <span className="ce-month__label" aria-live="polite">
            {label}
          </span>
          <Button
            variant="tertiary"
            size="sm"
            icon={ChevronRight}
            aria-label="Next month"
            disabled={offset >= 0}
            onClick={() => setOffset((o) => Math.min(0, o + 1))}
          />
          {offset < 0 ? (
            <Button variant="tertiary" size="sm" onClick={() => setOffset(0)}>
              This month
            </Button>
          ) : null}
        </div>
        <div className="ce-toolbar__actions">
          <Button icon={Settings2} onClick={() => setManagerOpen(true)}>
            Manage categories
          </Button>
          <Button variant="primary" icon={Plus} onClick={openAdd}>
            Add expense
          </Button>
        </div>
      </div>

      <div className="cb-stats">
        <StatCard label={`Spent in ${label}`} value={inrShort(total)} icon={Wallet} hint={isLoading ? 'Loading…' : undefined} />
        <StatCard label="Expenses" value={expenses.length} icon={Receipt} hint={expenses.length ? `Avg ${inrShort(total / expenses.length)}` : undefined} />
        <StatCard label="Top category" value={top ? top.cat.name : '—'} icon={Shapes} hint={top ? inr(top.spent) : 'Nothing spent yet'} />
        <StatCard
          label="Monthly budget used"
          value={monthBudget > 0 ? `${Math.round((budgetedSpent / monthBudget) * 100)}%` : '—'}
          icon={Target}
          hint={monthBudget > 0 ? (overCount ? `${overCount} categor${overCount === 1 ? 'y' : 'ies'} over budget` : `of ${inrShort(monthBudget)}`) : 'No category budgets set'}
          progress={monthBudget > 0 ? Math.min(100, (budgetedSpent / monthBudget) * 100) : undefined}
          progressTone={budgetedSpent > monthBudget ? 'danger' : budgetedSpent >= monthBudget * 0.85 ? 'warning' : 'success'}
        />
      </div>

      <Card
        title="By category"
        subtitle={
          spentTiles.length
            ? 'Highest spending first. Rings show the share of each monthly budget used. Select a category to see only its expenses.'
            : 'Spending by category shows here once expenses are recorded this month.'
        }
      >
        {tiles.length === 0 ? (
          <EmptyState compact icon={Settings2} title="No categories yet" body="Use Manage categories to add the heads you spend on, like Stationery or Repairs." />
        ) : spentTiles.length === 0 ? (
          <EmptyState compact icon={Settings2} title={`Nothing spent in ${label}`} body="Add an expense and its category will show here." />
        ) : (
          <div className="ce-tiles" role="group" aria-label="Filter by category">
            {tiles.map(({ cat, spent, budget }) => {
              const pct = budget > 0 ? (spent / budget) * 100 : null
              const on = activeCat === cat._id
              const share = monthTotal > 0 ? (spent / monthTotal) * 100 : 0
              return (
                <button
                  key={cat._id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setActiveCat(on ? null : cat._id)}
                  className={cx('ce-tile', on && 'is-active', !spent && 'is-zero')}
                  style={catStyle(cat.color)}
                >
                  <BudgetRing pct={pct}>
                    <CategoryIcon icon={cat.icon} color={cat.color} />
                  </BudgetRing>
                  <span className="ce-tile__name">{cat.name}</span>
                  <span className="ce-tile__amt">{spent ? inr(spent) : '—'}</span>
                  <span className={cx('ce-tile__meta', pct !== null && pct > 100 && 'is-over')}>
                    {pct !== null ? (pct > 100 ? `Over · ${Math.round(pct)}% of budget` : `${Math.round(pct)}% of budget`) : spent ? `${Math.round(share)}% of month` : 'No spending'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      <Card
        title={activeName ? `${activeName} · ${label}` : `All expenses · ${label}`}
        subtitle={filtered ? `${visible.length} of ${expenses.length} shown · ${inr(visible.reduce((s, e) => s + e.amount, 0))}` : undefined}
        action={
          activeCat ? (
            <Button variant="tertiary" size="sm" onClick={() => setActiveCat(null)}>
              Show all categories
            </Button>
          ) : null
        }
      >
        <div className="cb-stack">
          {expenses.length ? (
            <FilterBar search={{ placeholder: 'Search description, payee or reference', value: search, onChange: setSearch, label: 'Search expenses' }} />
          ) : null}
          {!isLoading && selectableCount > 0 ? (
            <div className="ce-selectall">
              <Checkbox
                label={`Select all shown (${selectableCount})`}
                checked={bulk.allSelected}
                indeterminate={!bulk.allSelected && bulk.count > 0}
                onChange={() => bulk.toggleAll()}
                disabled={bulkBusy}
              />
            </div>
          ) : null}
          <BulkBar count={bulk.count} noun="expense" onClear={bulk.clear} busy={bulkBusy}>
            <Button size="sm" icon={Download} onClick={exportSelected} disabled={bulkBusy}>
              Export CSV
            </Button>
            <Button size="sm" variant="danger" icon={Ban} onClick={openBulkVoid} loading={bulkBusy}>
              Void
            </Button>
          </BulkBar>
          {isLoading ? (
            <div className="cb-table-state" role="status">
              <span className="cb-spinner" aria-hidden="true" />
              Loading expenses…
            </div>
          ) : byDay.length ? (
            <div className="ce-days">
              {byDay.map(([day, items]) => (
                <section key={day} className="ce-day" aria-label={day}>
                  <div className="ce-day__head">
                    <span>{new Date(`${day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    <span className="ce-day__total">{inr(items.reduce((s, e) => s + e.amount, 0))}</span>
                  </div>
                  <ul className="ce-day__list">
                    {items.map((e) => {
                      const cat = e.categoryId ? catById.get(e.categoryId) : undefined
                      const meta = [cat?.parentId ? cat.name : null, e.payee, MODE_LABELS[e.mode] || e.mode, e.createdBy?.name].filter(Boolean).join(' · ')
                      const voidable = isVoidable(e)
                      const selected = bulk.selection.isSelected(e)
                      return (
                        <li key={e._id} className={cx('ce-exp', selected && 'is-selected')}>
                          <span className="ce-exp__select" title={voidable ? undefined : `Managed from the ${e.kind} page`}>
                            <Checkbox
                              aria-label={voidable ? `Select ${e.title || cat?.name || 'expense'}` : `${e.title || 'Expense'} is managed from the ${e.kind} page`}
                              checked={selected}
                              disabled={!voidable || bulkBusy}
                              onChange={() => bulk.toggle(e)}
                            />
                          </span>
                          <CategoryIcon icon={cat?.icon} color={cat?.color} size="sm" />
                          <button type="button" className="ce-exp__main" onClick={() => setSheet({ open: true, expense: e })}>
                            <span className="ce-exp__title">{e.title || cat?.name || 'Expense'}</span>
                            {meta ? <span className="ce-exp__meta">{meta}</span> : null}
                          </button>
                          {e.attachments?.length ? (
                            <a href={e.attachments[0].url} target="_blank" rel="noreferrer" className="ce-exp__clip" aria-label={`Open attachment ${e.attachments[0].name}`}>
                              <Icon icon={Paperclip} size={16} />
                            </a>
                          ) : null}
                          <span className="ce-exp__amt">{inr(e.amount)}</span>
                          <Menu
                            label={`Actions for ${e.title || 'expense'}`}
                            items={[
                              { label: 'Edit expense', icon: Pencil, onSelect: () => setSheet({ open: true, expense: e }) },
                              { divider: true },
                              { label: 'Void expense', icon: Ban, tone: 'danger', onSelect: () => openVoid(e) },
                            ]}
                          />
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ))}
            </div>
          ) : filtered ? (
            <EmptyState
              compact
              icon={Receipt}
              title="No expenses match"
              body="Try another search, or show every category."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    setSearch('')
                    setActiveCat(null)
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState icon={Receipt} title={`No operating expenses in ${label}`} body="Use Add expense to record a bill; it takes a few seconds." />
          )}
        </div>
      </Card>

      <QuickExpenseSheet
        isOpen={sheet.open}
        onClose={() => setSheet({ open: false })}
        categories={categories}
        expense={sheet.expense}
        defaultCategoryId={activeCat}
        onSaved={invalidate}
      />
      <CategoryManager isOpen={managerOpen} onClose={() => setManagerOpen(false)} categories={categories} onChanged={invalidate} />

      <Dialog
        open={bulkVoidOpen}
        onClose={() => !bulkBusy && setBulkVoidOpen(false)}
        tone="danger"
        size="sm"
        title={`Void ${bulk.count} ${bulk.count === 1 ? 'expense' : 'expenses'}?`}
        description={`${inr(selectedTotal)} stops counting towards totals and budgets. The records are kept with your reason.`}
        footer={
          <>
            <Button onClick={() => setBulkVoidOpen(false)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button variant="danger" icon={Ban} loading={bulkBusy} disabled={!bulk.count} onClick={() => void runBulkVoid()}>
              Void {bulk.count} {bulk.count === 1 ? 'expense' : 'expenses'}
            </Button>
          </>
        }
      >
        <TextArea
          label="Reason"
          required
          autoFocus
          rows={2}
          hint="Saved on every voided expense."
          value={bulkReason}
          onChange={(e) => setBulkReason(e.target.value)}
          error={bulkTried && !bulkReason.trim() ? 'Say why these are being voided.' : undefined}
        />
      </Dialog>
      <BulkResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />

      <Dialog
        open={Boolean(voiding)}
        onClose={() => !voidBusy && setVoiding(null)}
        tone="danger"
        size="sm"
        title="Void this expense?"
        description={voiding ? `${inr(voiding.amount)} “${voiding.title || 'Expense'}” stops counting towards totals. The record is kept with your reason.` : undefined}
        footer={
          <>
            <Button onClick={() => setVoiding(null)} disabled={voidBusy}>
              Cancel
            </Button>
            <Button variant="danger" icon={Ban} loading={voidBusy} onClick={() => void voidExpense()}>
              Void expense
            </Button>
          </>
        }
      >
        <TextField
          label="Reason"
          required
          autoFocus
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void voidExpense()
          }}
          error={voidTried && !voidReason.trim() ? 'Say why it is being voided.' : undefined}
        />
      </Dialog>
    </Page>
  )
}

export default CpitlOperating
