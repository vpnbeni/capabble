import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Copy, Save } from 'lucide-react'
import { useBudgets, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { BudgetRow, ExpenseKind } from '@/services/cpitlService'
import { CategoryIcon } from '@/components/cpitl/IconPicker'
import { CpitlCard, CpitlPageShell, Field, UsageBar, btnPrimary, btnSecondary, errorMessage, inputClass, inr, tableHead } from '@/components/cpitl/CpitlUi'

const GROUPS: Array<{ kind: ExpenseKind; title: string; hint: string }> = [
  { kind: 'salary', title: 'Salary', hint: 'Net pay plus employer PF and ESI' },
  { kind: 'operating', title: 'Operating costs', hint: 'Set per category, or one total' },
  { kind: 'fuel', title: 'Fuel', hint: 'Per vehicle, from the fuel log' },
  { kind: 'electricity', title: 'Electricity', hint: 'Per connection' },
  { kind: 'infra', title: 'Infrastructure', hint: 'Development works this session' },
]

const CpitlBudgets: React.FC = () => {
  const [growthPct, setGrowthPct] = useState(8)
  const { data, isLoading } = useBudgets(growthPct)
  const invalidate = useInvalidateCpitl()
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => setEdits({}), [data])

  const rows = useMemo(() => data?.rows || [], [data])
  const keyOf = (r: BudgetRow) => `${r.kind}:${r.targetKey}`
  const valueOf = (r: BudgetRow) => (edits[keyOf(r)] !== undefined ? edits[keyOf(r)] : r.budget ? String(r.budget) : '')
  const dirty = Object.keys(edits).length > 0

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
    if (!window.confirm(`Set every budget from last session's actual spend + ${growthPct}%? Existing budgets will be overwritten.`)) return
    try {
      const res = await cpitlService.copyBudgetsFromActuals(growthPct)
      toast.success(res?.message || 'Budgets updated.')
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  return (
    <CpitlPageShell
      title="Budgets"
      subtitle={`Session budget vs actual spend${data ? ` · ${data.meta.monthsElapsed} of 12 months elapsed` : ''}`}
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={copyFromActuals}>
            <Copy className="h-4 w-4" /> Copy last session + {growthPct}%
          </button>
          <button type="button" className={btnPrimary} disabled={!dirty || saving} onClick={save}>
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save budgets'}
          </button>
        </>
      }
    >
      <CpitlCard>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-2xl text-sm text-slate-500">
            “Year-end estimate” scales each head's spend to 12 months, counting from when it was first recorded this session. “Next year” adds the expected increase, which is useful when preparing next
            session's budget.
          </p>
          <Field label="Expected increase next year (%)" className="w-56">
            <input type="number" className={inputClass} value={growthPct} onChange={(e) => setGrowthPct(Number(e.target.value) || 0)} />
          </Field>
        </div>
      </CpitlCard>

      {isLoading ? (
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      ) : (
        GROUPS.map((g) => {
          const groupRows = rows.filter((r) => r.kind === g.kind)
          if (!groupRows.length) return null
          return (
            <CpitlCard key={g.kind} title={g.title} actions={<span className="text-xs text-slate-400">{g.hint}</span>}>
              <div className="-mx-5 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className={tableHead}>
                    <tr>
                      <th className="px-5 py-2.5">Budget head</th>
                      <th className="w-44 px-3 py-2.5">Session budget</th>
                      <th className="px-3 py-2.5 text-right">Spent</th>
                      <th className="w-48 px-3 py-2.5">Used</th>
                      <th className="px-3 py-2.5 text-right">Year-end estimate</th>
                      <th className="px-5 py-2.5 text-right">Next year</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {groupRows.map((r) => {
                      const budget = Number(valueOf(r)) || 0
                      const pct = budget > 0 ? (r.actual / budget) * 100 : null
                      return (
                        <tr key={keyOf(r)} className={r.targetKey === 'all' ? 'bg-slate-50/60 font-medium dark:bg-slate-900/20' : ''}>
                          <td className="px-5 py-2">
                            <div className="flex items-center gap-2">
                              {r.icon ? <CategoryIcon icon={r.icon} color={r.color} size="sm" /> : null}
                              <span className="text-slate-800 dark:text-slate-100">{r.targetKey === 'all' ? `${g.title} — total` : r.targetLabel}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="relative">
                              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                              <input
                                type="number"
                                min={0}
                                aria-label={`Budget for ${r.targetLabel}`}
                                className={`${inputClass} mt-0 pl-7 tabular-nums`}
                                value={valueOf(r)}
                                placeholder="0"
                                onChange={(e) => setEdits((prev) => ({ ...prev, [keyOf(r)]: e.target.value }))}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{inr(r.actual)}</td>
                          <td className="px-3 py-2">
                            {pct !== null ? (
                              <div className="flex items-center gap-2">
                                <UsageBar pct={pct} />
                                <span className={`w-12 text-right text-xs tabular-nums ${pct > 100 ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{Math.round(pct)}%</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">
                            {inr(r.projectedYearEnd)}
                            {r.monthsRecorded ? <div className="text-[10px] text-slate-400">from {r.monthsRecorded} mo of data</div> : null}
                          </td>
                          <td className="px-5 py-2 text-right tabular-nums text-slate-900 dark:text-white">{inr(r.nextYear)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CpitlCard>
          )
        })
      )}
    </CpitlPageShell>
  )
}

export default CpitlBudgets
