import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Save, Search, Trash2 } from 'lucide-react'
import Modal from '@/components/common/Modal'
import { useInvalidateCpitl, usePayrollSettings, useSalaryComponents, useStaffSalaries, useStaffSalary } from '@/hooks/useCpitl'
import cpitlService, { PayrollSettings, PayslipCalc, SalaryCalc, SalaryComponent, SalaryLine, SalaryOptions, StaffSalaryRow } from '@/services/cpitlService'
import { todayIso } from '@/components/cpitl/QuickExpenseSheet'
import { CpitlCard, CpitlEmpty, CpitlPageShell, Field, btnGhost, btnPrimary, btnSecondary, errorMessage, fmtDate, inputClass, inr, tableHead } from '@/components/cpitl/CpitlUi'

type Tab = 'staff' | 'components'

const CALC_LABELS: Record<SalaryCalc, string> = { fixed: '₹ per month', percent_of_basic: '% of Basic', percent_of_gross: '% of other earnings' }
const DEFAULT_OPTIONS: SalaryOptions = { pf: true, pfWageCap: true, esi: 'auto', tdsMonthly: 0 }

const PayslipPreview: React.FC<{ calc: PayslipCalc | null; loading: boolean }> = ({ calc, loading }) => (
  <div className={`rounded-2xl border border-slate-200 p-4 text-sm dark:border-slate-700 ${loading ? 'opacity-60' : ''}`}>
    <h4 className="mb-3 font-semibold text-slate-900 dark:text-white">Monthly payslip preview</h4>
    {calc ? (
      <>
        <div className="space-y-1">
          {calc.earnings.map((e) => (
            <div key={e.code} className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>{e.name}</span>
              <span className="tabular-nums">{inr(e.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-100 pt-1 font-medium dark:border-slate-700">
            <span>Gross</span>
            <span className="tabular-nums">{inr(calc.gross)}</span>
          </div>
        </div>
        <div className="mt-3 space-y-1">
          {calc.deductions.map((d) => (
            <div key={d.code} className="flex justify-between text-rose-600 dark:text-rose-400">
              <span>{d.name}</span>
              <span className="tabular-nums">−{inr(d.amount)}</span>
            </div>
          ))}
          {!calc.deductions.length ? <p className="text-xs text-slate-400">No deductions</p> : null}
        </div>
        <div className="mt-3 flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-base font-semibold dark:bg-slate-900/40">
          <span>Net pay</span>
          <span className="tabular-nums">{inr(calc.net)}</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Cost to school {inr(calc.employerCost)}
          {calc.employerPf ? ` · employer PF ${inr(calc.employerPf)}` : ''}
          {calc.employerEsi ? ` · employer ESI ${inr(calc.employerEsi)}` : ''}
        </p>
      </>
    ) : (
      <p className="text-slate-400">Enter Basic pay to see the payslip.</p>
    )}
  </div>
)

const SalaryEditor: React.FC<{ staff: StaffSalaryRow | null; components: SalaryComponent[]; onClose: () => void; onSaved: () => void }> = ({
  staff,
  components,
  onClose,
  onSaved,
}) => {
  const { data, isLoading } = useStaffSalary(staff?.teacherId)
  const [values, setValues] = useState<Record<string, string>>({})
  const [calcs, setCalcs] = useState<Record<string, SalaryCalc>>({})
  const [options, setOptions] = useState<SalaryOptions>(DEFAULT_OPTIONS)
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso())
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<PayslipCalc | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!staff || isLoading) return
    const structure = data?.structure
    const v: Record<string, string> = {}
    const c: Record<string, SalaryCalc> = {}
    components.forEach((comp) => {
      const line = structure?.components.find((l) => l.code === comp.code)
      c[comp.code] = line?.calc || comp.calc
      v[comp.code] = line ? String(line.value) : structure ? '' : comp.defaultValue ? String(comp.defaultValue) : ''
    })
    setValues(v)
    setCalcs(c)
    setOptions({ ...DEFAULT_OPTIONS, ...(structure?.options || {}) })
    setEffectiveFrom(todayIso())
    setNote('')
  }, [staff, data, isLoading, components])

  const lines: SalaryLine[] = useMemo(
    () =>
      components
        .filter((c) => Number(values[c.code]) > 0)
        .map((c) => ({ componentId: c._id, code: c.code, name: c.name, type: c.type, calc: calcs[c.code] || c.calc, value: Number(values[c.code]) })),
    [components, values, calcs]
  )

  useEffect(() => {
    if (!staff) return
    if (!lines.some((l) => l.code === 'BASIC')) {
      setPreview(null)
      return
    }
    setPreviewing(true)
    const t = setTimeout(() => {
      cpitlService
        .previewSalary({ components: lines, options })
        .then(setPreview)
        .catch(() => setPreview(null))
        .finally(() => setPreviewing(false))
    }, 300)
    return () => clearTimeout(t)
  }, [lines, options, staff])

  const save = async () => {
    if (!staff) return
    setSaving(true)
    try {
      await cpitlService.saveStaffSalary(staff.teacherId, { components: lines, options, effectiveFrom, note })
      toast.success(`Salary saved for ${staff.name}.`)
      onSaved()
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const earnings = components.filter((c) => c.type === 'earning')
  const deductions = components.filter((c) => c.type === 'deduction')

  return (
    <Modal isOpen={Boolean(staff)} onClose={onClose} title={`Salary — ${staff?.name || ''}`} size="xl">
      {staff ? (
        <div className="grid gap-6 md:grid-cols-5">
          <div className="space-y-5 md:col-span-3">
            <p className="text-sm text-slate-500">
              {[staff.designation, staff.department, staff.employeeId && `Emp ID ${staff.employeeId}`].filter(Boolean).join(' · ')}
              {!staff.employeeId ? (
                <span className="mt-1 block text-xs text-amber-600">No employee ID — salary is linked to this session's staff record. Add an employee ID in Staff to carry it across sessions.</span>
              ) : null}
            </p>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Earnings</h4>
              <div className="space-y-2">
                {earnings.map((c) => (
                  <div key={c._id} className="grid grid-cols-12 items-center gap-2">
                    <span className="col-span-5 text-sm text-slate-700 dark:text-slate-200">{c.name}</span>
                    <select
                      aria-label={`${c.name} calculation`}
                      className={`${inputClass} col-span-4 mt-0`}
                      value={calcs[c.code] || c.calc}
                      disabled={c.code === 'BASIC'}
                      onChange={(e) => setCalcs((p) => ({ ...p, [c.code]: e.target.value as SalaryCalc }))}
                    >
                      {(Object.keys(CALC_LABELS) as SalaryCalc[]).map((k) => (
                        <option key={k} value={k}>
                          {CALC_LABELS[k]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      aria-label={`${c.name} value`}
                      className={`${inputClass} col-span-3 mt-0 tabular-nums`}
                      value={values[c.code] ?? ''}
                      placeholder="0"
                      onChange={(e) => setValues((p) => ({ ...p, [c.code]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
            {deductions.length ? (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Fixed deductions</h4>
                {deductions.map((c) => (
                  <div key={c._id} className="grid grid-cols-12 items-center gap-2">
                    <span className="col-span-9 text-sm text-slate-700 dark:text-slate-200">{c.name} (₹ per month)</span>
                    <input
                      type="number"
                      min={0}
                      aria-label={`${c.name} value`}
                      className={`${inputClass} col-span-3 mt-0 tabular-nums`}
                      value={values[c.code] ?? ''}
                      placeholder="0"
                      onChange={(e) => setValues((p) => ({ ...p, [c.code]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Statutory</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 rounded" checked={options.pf} onChange={(e) => setOptions({ ...options, pf: e.target.checked })} />
                  Provident Fund (12%)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded"
                    checked={options.pfWageCap}
                    disabled={!options.pf}
                    onChange={(e) => setOptions({ ...options, pfWageCap: e.target.checked })}
                  />
                  Cap PF wage at ₹15,000
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded"
                    checked={options.esi === 'auto'}
                    onChange={(e) => setOptions({ ...options, esi: e.target.checked ? 'auto' : 'off' })}
                  />
                  ESI when gross ≤ ₹21,000
                </label>
                <Field label="TDS per month (₹)">
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={options.tdsMonthly || ''}
                    onChange={(e) => setOptions({ ...options, tdsMonthly: Number(e.target.value) || 0 })}
                  />
                </Field>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Effective from">
                <input type="date" className={inputClass} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              </Field>
              <Field label="Note (shown in history)">
                <input className={inputClass} value={note} placeholder="e.g. Annual increment 6%" onChange={(e) => setNote(e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="space-y-4 md:col-span-2">
            <PayslipPreview calc={preview} loading={previewing} />
            {data?.structure?.revisions?.length ? (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Salary history</h4>
                <ul className="space-y-2 text-xs">
                  {[...data.structure.revisions].reverse().map((r, i) => (
                    <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/40">
                      <div className="flex justify-between font-medium text-slate-700 dark:text-slate-200">
                        <span>{fmtDate(r.effectiveFrom)}</span>
                        <span className="tabular-nums">
                          {r.fromGross ? `${inr(r.fromGross)} → ` : ''}
                          {inr(r.toGross)}
                        </span>
                      </div>
                      <div className="text-slate-500">
                        {r.note}
                        {r.by?.name ? ` · ${r.by.name}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 md:col-span-5">
            <button type="button" className={btnSecondary} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} disabled={saving || !preview} onClick={save}>
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save salary'}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}

const ComponentsTab: React.FC<{ components: SalaryComponent[]; settings?: PayrollSettings; onChanged: () => void }> = ({ components, settings, onChanged }) => {
  const [draft, setDraft] = useState<Partial<SalaryComponent> | null>(null)
  const [form, setForm] = useState<PayrollSettings | null>(null)
  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const saveComponent = async () => {
    if (!draft) return
    try {
      await cpitlService.saveSalaryComponent(draft)
      toast.success('Component saved.')
      setDraft(null)
      onChanged()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  const saveSettings = async () => {
    if (!form) return
    try {
      await cpitlService.savePayrollSettings(form)
      toast.success('Statutory settings saved.')
      onChanged()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CpitlCard
        title="Salary components"
        actions={
          <button type="button" className={btnGhost} onClick={() => setDraft({ name: '', code: '', type: 'earning', calc: 'fixed', defaultValue: 0, sortOrder: 10 })}>
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        }
      >
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {components.map((c) => (
            <li key={c._id} className="flex items-center gap-3 py-2 text-sm">
              <span className="w-20 font-mono text-xs text-slate-500">{c.code}</span>
              <span className="flex-1 text-slate-800 dark:text-slate-100">{c.name}</span>
              <span className="text-xs text-slate-500">
                {c.type === 'deduction' ? 'Deduction · ' : ''}
                {CALC_LABELS[c.calc]}
                {c.defaultValue ? ` · default ${c.defaultValue}` : ''}
              </span>
              <button type="button" className={btnGhost} onClick={() => setDraft(c)}>
                Edit
              </button>
              {c.code !== 'BASIC' ? (
                <button
                  type="button"
                  className="text-slate-300 hover:text-rose-600"
                  aria-label={`Remove ${c.name}`}
                  onClick={async () => {
                    if (!window.confirm(`Remove ${c.name}?`)) return
                    try {
                      await cpitlService.archiveSalaryComponent(c._id)
                      onChanged()
                    } catch (error) {
                      toast.error(await errorMessage(error))
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">PF, ESI, Professional Tax and TDS are calculated automatically and don't need components.</p>
        {draft ? (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <Field label="Name">
              <input className={inputClass} value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Code">
              <input
                className={`${inputClass} uppercase`}
                value={draft.code || ''}
                disabled={draft.code === 'BASIC' && Boolean(draft._id)}
                onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
              />
            </Field>
            <Field label="Type">
              <select className={inputClass} value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as SalaryComponent['type'], calc: e.target.value === 'deduction' ? 'fixed' : draft.calc })}>
                <option value="earning">Earning</option>
                <option value="deduction">Deduction (fixed)</option>
              </select>
            </Field>
            <Field label="Calculated as">
              <select className={inputClass} value={draft.calc} disabled={draft.type === 'deduction'} onChange={(e) => setDraft({ ...draft, calc: e.target.value as SalaryCalc })}>
                {(Object.keys(CALC_LABELS) as SalaryCalc[]).map((k) => (
                  <option key={k} value={k}>
                    {CALC_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default value">
              <input type="number" min={0} className={inputClass} value={draft.defaultValue ?? 0} onChange={(e) => setDraft({ ...draft, defaultValue: Number(e.target.value) })} />
            </Field>
            <div className="flex items-end justify-end gap-2">
              <button type="button" className={btnSecondary} onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button type="button" className={btnPrimary} onClick={saveComponent}>
                Save
              </button>
            </div>
          </div>
        ) : null}
      </CpitlCard>

      {form ? (
        <CpitlCard title="Statutory rates" actions={<button type="button" className={btnPrimary} onClick={saveSettings}><Save className="h-4 w-4" /> Save</button>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="PF rate (%)">
              <input type="number" className={inputClass} value={form.pfRate} onChange={(e) => setForm({ ...form, pfRate: Number(e.target.value) })} />
            </Field>
            <Field label="PF wage ceiling (₹)">
              <input type="number" className={inputClass} value={form.pfWageCeiling} onChange={(e) => setForm({ ...form, pfWageCeiling: Number(e.target.value) })} />
            </Field>
            <Field label="ESI employee (%)">
              <input type="number" step="0.01" className={inputClass} value={form.esiEmployee} onChange={(e) => setForm({ ...form, esiEmployee: Number(e.target.value) })} />
            </Field>
            <Field label="ESI employer (%)">
              <input type="number" step="0.01" className={inputClass} value={form.esiEmployer} onChange={(e) => setForm({ ...form, esiEmployer: Number(e.target.value) })} />
            </Field>
            <Field label="ESI applies up to gross (₹)">
              <input type="number" className={inputClass} value={form.esiGrossLimit} onChange={(e) => setForm({ ...form, esiGrossLimit: Number(e.target.value) })} />
            </Field>
          </div>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Professional Tax slabs (monthly gross)</h4>
              <button type="button" className={btnGhost} onClick={() => setForm({ ...form, ptSlabs: [...form.ptSlabs, { min: 0, max: null, amount: 0 }] })}>
                <Plus className="h-3.5 w-3.5" /> Slab
              </button>
            </div>
            {form.ptSlabs.length ? (
              <div className="space-y-2">
                {form.ptSlabs.map((slab, i) => (
                  <div key={i} className="grid grid-cols-12 items-center gap-2 text-sm">
                    <input
                      type="number"
                      aria-label="From"
                      className={`${inputClass} col-span-4 mt-0`}
                      value={slab.min}
                      onChange={(e) => setForm({ ...form, ptSlabs: form.ptSlabs.map((s, idx) => (idx === i ? { ...s, min: Number(e.target.value) } : s)) })}
                    />
                    <input
                      type="number"
                      aria-label="To"
                      placeholder="and above"
                      className={`${inputClass} col-span-4 mt-0`}
                      value={slab.max ?? ''}
                      onChange={(e) =>
                        setForm({ ...form, ptSlabs: form.ptSlabs.map((s, idx) => (idx === i ? { ...s, max: e.target.value === '' ? null : Number(e.target.value) } : s)) })
                      }
                    />
                    <input
                      type="number"
                      aria-label="Tax"
                      className={`${inputClass} col-span-3 mt-0`}
                      value={slab.amount}
                      onChange={(e) => setForm({ ...form, ptSlabs: form.ptSlabs.map((s, idx) => (idx === i ? { ...s, amount: Number(e.target.value) } : s)) })}
                    />
                    <button
                      type="button"
                      aria-label="Remove slab"
                      className="col-span-1 text-slate-300 hover:text-rose-600"
                      onClick={() => setForm({ ...form, ptSlabs: form.ptSlabs.filter((_, idx) => idx !== i) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <p className="text-xs text-slate-400">From ₹ · To ₹ (blank = no upper limit) · Tax ₹ per month</p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">No Professional Tax. Add your state's slabs if it levies PT (e.g. Maharashtra, Karnataka, West Bengal).</p>
            )}
          </div>
        </CpitlCard>
      ) : null}
    </div>
  )
}

const CpitlSalary: React.FC = () => {
  const invalidate = useInvalidateCpitl()
  const [tab, setTab] = useState<Tab>('staff')
  const [q, setQ] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [editing, setEditing] = useState<StaffSalaryRow | null>(null)
  const { data: staff = [], isLoading } = useStaffSalaries()
  const { data: components = [] } = useSalaryComponents()
  const { data: settings } = usePayrollSettings()

  const filtered = staff.filter((s) => {
    if (onlyMissing && s.salary) return false
    const needle = q.trim().toLowerCase()
    return !needle || [s.name, s.designation, s.employeeId, s.department].some((v) => String(v || '').toLowerCase().includes(needle))
  })
  const withSalary = staff.filter((s) => s.salary)
  const monthlyGross = withSalary.reduce((sum, s) => sum + (s.salary?.gross || 0), 0)
  const monthlyCost = withSalary.reduce((sum, s) => sum + (s.salary?.employerCost || 0), 0)

  return (
    <CpitlPageShell title="Salary" subtitle={`${withSalary.length} of ${staff.length} staff have a salary · monthly gross ${inr(monthlyGross)} · cost to school ${inr(monthlyCost)}`}>
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {([
          ['staff', 'Staff salaries'],
          ['components', 'Components & statutory'],
        ] as Array<[Tab, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${
              tab === key ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'staff' ? (
        <CpitlCard>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className={`${inputClass} mt-0 pl-9`} placeholder="Search staff" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" className="h-4 w-4 rounded" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
              Only staff without salary ({staff.length - withSalary.length})
            </label>
          </div>
          {isLoading ? (
            <div className="h-60 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />
          ) : filtered.length ? (
            <div className="-mx-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-5 py-2.5">Staff</th>
                    <th className="px-3 py-2.5">Designation</th>
                    <th className="px-3 py-2.5 text-right">Gross / month</th>
                    <th className="px-3 py-2.5 text-right">Net / month</th>
                    <th className="px-3 py-2.5">Effective from</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filtered.map((s) => (
                    <tr key={s.teacherId} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40" onClick={() => setEditing(s)}>
                      <td className="px-5 py-2.5">
                        <div className="font-medium text-slate-900 dark:text-white">{s.name}</div>
                        <div className="text-xs text-slate-500">{s.employeeId ? `Emp ID ${s.employeeId}` : 'No employee ID'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{s.designation || s.dutyType || '—'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.salary ? inr(s.salary.gross) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{s.salary ? inr(s.salary.net) : '—'}</td>
                      <td className="px-3 py-2.5 text-slate-500">{s.salary ? fmtDate(s.salary.effectiveFrom) : <span className="text-amber-600">Not set</span>}</td>
                      <td className="px-5 py-2.5 text-right">
                        <span className={btnGhost}>{s.salary ? 'Edit' : 'Set salary'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CpitlEmpty message={staff.length ? 'No staff match.' : 'No active staff in this session. Add staff in the Staff module first.'} />
          )}
        </CpitlCard>
      ) : (
        <ComponentsTab components={components} settings={settings} onChanged={invalidate} />
      )}

      <SalaryEditor staff={editing} components={components} onClose={() => setEditing(null)} onSaved={invalidate} />
    </CpitlPageShell>
  )
}

export default CpitlSalary
