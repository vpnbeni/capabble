import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarClock, Copy, Save, Target, TrendingUp, Wallet } from 'lucide-react'
import { useBudgets, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { BudgetRow, ExpenseKind } from '@/services/cpitlService'
import { Badge, Button, Card, DataTable, Dialog, Page, StatCard, TextField, cx, type DataTableColumn } from '@/components/ui'
import { CategoryIcon } from '@/components/cpitl/IconPicker'
import { UsageBar, errorMessage, inr, inrShort } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/expenses.css'

const GROUPS: Array<{ kind: ExpenseKind; title: string; hint: string }> = [
  { kind: 'salary', title: 'Salary', hint: 'Net pay plus employer PF and ESI' },
  { kind: 'operating', title: 'Operating costs', hint: 'Set per category, or one total' },
  { kind: 'fuel', title: 'Fuel', hint: 'Per vehicle, from the fuel log' },
  { kind: 'electricity', title: 'Electricity', hint: 'Per connection' },
  { kind: 'infra', title: 'Infrastructure', hint: 'Development works this session' },
]

const keyOf = (r: BudgetRow) => `${r.kind}:${r.targetKey}`

const CpitlBudgets: React.FC = () => {
  const [growthPct, setGrowthPct] = useState(8)
  const { data, isLoading } = useBudgets(growthPct)
  const invalidate = useInvalidateCpitl()
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [confirmCopy, setConfirmCopy] = useState(false)
  const [copying, setCopying] = useState(false)

  useEffect(() => setEdits({}), [data])

  const rows = useMemo(() => data?.rows || [], [data])
  const valueOf = (r: BudgetRow) => (edits[keyOf(r)] !== undefined ? edits[keyOf(r)] : r.budget ? String(r.budget) : '')
  const dirtyCount = Object.keys(edits).length
  const dirty = dirtyCount > 0

  const totals = useMemo(() => {
    const all = rows.filter((r) => r.targetKey === 'all')
    return {
      budget: all.reduce((s, r) => s + (r.budget || 0), 0),
      actual: all.reduce((s, r) => s + (r.actual || 0), 0),
      projected: all.reduce((s, r) => s + (r.projectedYearEnd || 0), 0),
      nextYear: all.reduce((s, r) => s + (r.nextYear || 0), 0),
    }
  }, [rows])
  const usedPct = totals.budget > 0 ? (totals.actual / totals.budget) * 100 : null

  const save = async () => {
    setSaving(true)
    try {
      const payload = rows
        .filter((r) => edits[keyOf(r)] !== undefined)
        .map((r) => ({ kind: r.kind, targetKey: r.targetKey, targetLabel: r.targetLabel, amount: Number(edits[keyOf(r)]) || 0 }))
      await cpitlService.saveBudgets(payload)
      toast.success('Budgets saved.')
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const copyFromActuals = async () => {
    setCopying(true)
    try {
      const res = await cpitlService.copyBudgetsFromActuals(growthPct)
      toast.success(res?.message || 'Budgets updated.')
      setConfirmCopy(false)
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setCopying(false)
    }
  }

  const columnsFor = (groupTitle: string): DataTableColumn<BudgetRow>[] => [
    {
      key: 'head',
      header: 'Budget head',
      mobile: 'title',
      render: (r) =>
        r.targetKey === 'all' ? (
          <span className="ce-total-label">
            {groupTitle} total
            <Badge tone="neutral" dot={false}>
              Total
            </Badge>
          </span>
        ) : (
          <span className="ce-inline">
            {r.icon ? <CategoryIcon icon={r.icon} color={r.color} size="sm" /> : null}
            <span>{r.targetLabel}</span>
          </span>
        ),
    },
    {
      key: 'budget',
      header: 'Session budget',
      headerLabel: 'Session budget',
      interactive: true,
      render: (r) => (
        <TextField
          className="ce-budget-input"
          size="sm"
          type="number"
          inputMode="decimal"
          min={0}
          prefix="₹"
          aria-label={`Budget for ${r.targetKey === 'all' ? `${groupTitle} total` : r.targetLabel}`}
          value={valueOf(r)}
          placeholder="0"
          onChange={(e) => setEdits((prev) => ({ ...prev, [keyOf(r)]: e.target.value }))}
        />
      ),
    },
    { key: 'actual', header: 'Spent', align: 'right', numeric: true, mobile: 'aside', render: (r) => inr(r.actual) },
    {
      key: 'used',
      header: 'Used',
      headerLabel: 'Used',
      render: (r) => {
        const budget = Number(valueOf(r)) || 0
        const pct = budget > 0 ? (r.actual / budget) * 100 : null
        if (pct === null) return <span className="cb-subtle">No budget</span>
        return (
          <div className="ce-used">
            <UsageBar pct={pct} />
            <span className={cx('ce-used__pct', pct > 100 && 'is-over')}>{pct > 100 ? `Over · ${Math.round(pct)}%` : `${Math.round(pct)}%`}</span>
          </div>
        )
      },
    },
    {
      key: 'projected',
      header: 'Year-end estimate',
      headerLabel: 'Year-end estimate',
      align: 'right',
      numeric: true,
      render: (r) => (
        <span className="ce-stack-num">
          {inr(r.projectedYearEnd)}
          {r.monthsRecorded ? <small>from {r.monthsRecorded} mo of data</small> : null}
        </span>
      ),
    },
    { key: 'next', header: 'Next year', align: 'right', numeric: true, render: (r) => <span className="cb-strong">{inr(r.nextYear)}</span> },
  ]

  return (
    <Page>
      <div className="ce-toolbar">
        <p className="ce-toolbar__lede">
          Session budget vs actual spend{data ? ` · ${data.meta.monthsElapsed} of 12 months elapsed` : ''}
        </p>
        <div className="ce-toolbar__actions">
          {dirty ? (
            <span className="ce-dirty" role="status">
              {dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}
            </span>
          ) : null}
          <Button icon={Copy} onClick={() => setConfirmCopy(true)}>
            Copy last session + {growthPct}%
          </Button>
          <Button variant="primary" icon={Save} disabled={!dirty} loading={saving} onClick={() => void save()}>
            Save budgets
          </Button>
        </div>
      </div>

      <div className="cb-stats">
        <StatCard
          label="Session budget"
          value={totals.budget ? inrShort(totals.budget) : '—'}
          icon={Target}
          hint={totals.budget ? undefined : 'No budgets set yet'}
        />
        <StatCard
          label="Spent so far"
          value={inrShort(totals.actual)}
          icon={Wallet}
          hint={usedPct !== null ? (usedPct > 100 ? `Over budget · ${Math.round(usedPct)}%` : `${Math.round(usedPct)}% of budget`) : undefined}
          progress={usedPct !== null ? Math.min(100, usedPct) : undefined}
          progressTone={usedPct !== null && usedPct > 100 ? 'danger' : usedPct !== null && usedPct >= 85 ? 'warning' : 'success'}
        />
        <StatCard label="Year-end estimate" value={inrShort(totals.projected)} icon={CalendarClock} />
        <StatCard label="Next year" value={inrShort(totals.nextYear)} icon={TrendingUp} hint={`With ${growthPct}% increase`} />
      </div>

      <Card>
        <div className="ce-intro">
          <p className="ce-intro__text">
            “Year-end estimate” scales each head’s spend to 12 months, counting from when it was first recorded this session. “Next year” adds the expected increase,
            which helps when preparing next session’s budget.
          </p>
          <TextField
            className="ce-intro__field"
            label="Expected increase next year"
            type="number"
            inputMode="decimal"
            suffix="%"
            value={growthPct}
            onChange={(e) => setGrowthPct(Number(e.target.value) || 0)}
          />
        </div>
      </Card>

      {isLoading ? (
        <Card>
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading budgets…
          </div>
        </Card>
      ) : (
        GROUPS.map((g) => {
          const groupRows = rows.filter((r) => r.kind === g.kind)
          if (!groupRows.length) return null
          return (
            <Card key={g.kind} flush title={g.title} subtitle={g.hint} className="ce-records">
              <DataTable caption={`${g.title} budgets`} columns={columnsFor(g.title)} rows={groupRows} getRowKey={keyOf} />
            </Card>
          )
        })
      )}

      <Dialog
        open={confirmCopy}
        onClose={() => !copying && setConfirmCopy(false)}
        tone="danger"
        size="sm"
        title="Overwrite budgets from last session?"
        description={`Every budget is set from last session’s actual spend plus ${growthPct}%. Existing budgets are overwritten.`}
        footer={
          <>
            <Button onClick={() => setConfirmCopy(false)} disabled={copying}>
              Cancel
            </Button>
            <Button variant="danger" icon={Copy} loading={copying} onClick={() => void copyFromActuals()}>
              Overwrite budgets
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default CpitlBudgets
