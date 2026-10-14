import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { ArrowLeft, Calculator, Eye, IndianRupee, Plus, Save, Trash2, TrendingUp, Users, Wallet } from 'lucide-react'
import { useInvalidateCpitl, usePayrollSettings, useSalaryComponents, useStaffSalaries, useStaffSalary } from '@/hooks/useCpitl'
import cpitlBulkService, { type SalaryRevisionResult } from '@/services/cpitlBulkService'
import cpitlService, { PayrollSettings, PayslipCalc, SalaryCalc, SalaryComponent, SalaryLine, SalaryOptions, StaffSalaryRow } from '@/services/cpitlService'
import { todayIso } from '@/components/cpitl/QuickExpenseSheet'
import {
  Avatar,
  Badge,
  Banner,
  BulkBar,
  BulkResultDialog,
  Button,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Page,
  Select,
  Sheet,
  StatCard,
  Tabs,
  TextField,
  useRowSelection,
  type BulkResult,
  type DataTableColumn,
} from '@/components/ui'
import { errorMessage, fmtDate, inr } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/payroll.css'

type Tab = 'staff' | 'components'
type SetFilter = 'all' | 'set' | 'missing'

const CALC_LABELS: Record<SalaryCalc, string> = { fixed: '₹ per month', percent_of_basic: '% of Basic', percent_of_gross: '% of other earnings' }
const CALC_OPTIONS = (Object.keys(CALC_LABELS) as SalaryCalc[]).map((k) => ({ value: k, label: CALC_LABELS[k] }))
const DEFAULT_OPTIONS: SalaryOptions = { pf: true, pfWageCap: true, esi: 'auto', tdsMonthly: 0 }

const PayslipPreview: React.FC<{ calc: PayslipCalc | null; loading: boolean }> = ({ calc, loading }) => (
  <div className={`cp-slip${loading ? ' is-loading' : ''}`} aria-busy={loading || undefined}>
    <h3 className="cp-slip__title">Monthly payslip preview</h3>
    {calc ? (
      <>
        <ul className="cp-slip__group" aria-label="Earnings">
          {calc.earnings.map((e) => (
            <li key={e.code} className="cp-slip__row">
              <span>{e.name}</span>
              <span>{inr(e.amount)}</span>
            </li>
          ))}
          <li className="cp-slip__row is-sum">
            <span>Gross</span>
            <span>{inr(calc.gross)}</span>
          </li>
        </ul>
        <ul className="cp-slip__group" aria-label="Deductions">
          {calc.deductions.map((d) => (
            <li key={d.code} className="cp-slip__row is-neg">
              <span>{d.name}</span>
              <span>−{inr(d.amount)}</span>
            </li>
          ))}
          {!calc.deductions.length ? <li className="cp-slip__empty">No deductions</li> : null}
        </ul>
        <div className="cp-slip__net" aria-live="polite">
          <span>Net pay</span>
          <strong>{inr(calc.net)}</strong>
        </div>
        <p className="cp-slip__note">
          Cost to school {inr(calc.employerCost)}
          {calc.employerPf ? ` · employer PF ${inr(calc.employerPf)}` : ''}
          {calc.employerEsi ? ` · employer ESI ${inr(calc.employerEsi)}` : ''}
        </p>
      </>
    ) : (
      <p className="cp-slip__empty">Enter Basic pay to see the payslip.</p>
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
  const setValue = (code: string, value: string) => setValues((p) => ({ ...p, [code]: value }))

  return (
    <Sheet
      open={Boolean(staff)}
      onClose={onClose}
      size="xl"
      icon={IndianRupee}
      title={staff ? `Salary for ${staff.name}` : 'Salary'}
      description={staff ? [staff.designation, staff.department, staff.employeeId && `Emp ID ${staff.employeeId}`].filter(Boolean).join(' · ') || undefined : undefined}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Save} loading={saving} disabled={!preview} onClick={save}>
            {saving ? 'Saving…' : 'Save salary'}
          </Button>
        </>
      }
    >
      {staff && isLoading ? (
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading salary…
        </div>
      ) : staff ? (
        <div className="cp-editor">
          <div className="cp-editor__form">
            {!staff.employeeId ? (
              <Banner tone="warning" title="No employee ID">
                Salary is linked to this session's staff record. Add an employee ID in Staff to carry it across sessions.
              </Banner>
            ) : null}

            <div className="cb-form-section">
              <h3 className="cb-form-section__title">Earnings</h3>
              <div className="cp-lines">
                {earnings.map((c) => {
                  const calc = calcs[c.code] || c.calc
                  return (
                    <div key={c._id} className="cp-line">
                      <span className="cp-line__name">{c.name}</span>
                      <Select
                        size="sm"
                        aria-label={`${c.name} calculation`}
                        value={calc}
                        disabled={c.code === 'BASIC'}
                        onChange={(e) => setCalcs((p) => ({ ...p, [c.code]: e.target.value as SalaryCalc }))}
                        options={CALC_OPTIONS}
                      />
                      <TextField
                        size="sm"
                        type="number"
                        min={0}
                        aria-label={`${c.name} value`}
                        prefix={calc === 'fixed' ? '₹' : undefined}
                        suffix={calc === 'fixed' ? undefined : '%'}
                        value={values[c.code] ?? ''}
                        placeholder="0"
                        onChange={(e) => setValue(c.code, e.target.value)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {deductions.length ? (
              <div className="cb-form-section">
                <h3 className="cb-form-section__title">Fixed deductions</h3>
                <div className="cp-lines">
                  {deductions.map((c) => (
                    <div key={c._id} className="cp-line cp-line--2">
                      <span className="cp-line__name">{c.name} (₹ per month)</span>
                      <TextField
                        size="sm"
                        type="number"
                        min={0}
                        aria-label={`${c.name} value`}
                        prefix="₹"
                        value={values[c.code] ?? ''}
                        placeholder="0"
                        onChange={(e) => setValue(c.code, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="cb-form-section">
              <h3 className="cb-form-section__title">Statutory</h3>
              <div className="cp-checks">
                <Checkbox label="Provident Fund (12%)" checked={options.pf} onChange={(checked) => setOptions({ ...options, pf: checked })} />
                <Checkbox
                  label="Cap PF wage at ₹15,000"
                  checked={options.pfWageCap}
                  disabled={!options.pf}
                  onChange={(checked) => setOptions({ ...options, pfWageCap: checked })}
                />
                <Checkbox
                  label="ESI when gross ≤ ₹21,000"
                  checked={options.esi === 'auto'}
                  onChange={(checked) => setOptions({ ...options, esi: checked ? 'auto' : 'off' })}
                />
                <TextField
                  label="TDS per month"
                  type="number"
                  min={0}
                  prefix="₹"
                  value={options.tdsMonthly || ''}
                  onChange={(e) => setOptions({ ...options, tdsMonthly: Number(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div className="cb-form-section">
              <h3 className="cb-form-section__title">Revision</h3>
              <div className="cb-form-grid">
                <TextField label="Effective from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
                <TextField label="Note" hint="Shown in salary history" value={note} placeholder="e.g. Annual increment 6%" onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          </div>

          <aside className="cp-editor__aside" aria-label="Net pay summary">
            <PayslipPreview calc={preview} loading={previewing} />
            {data?.structure?.revisions?.length ? (
              <div className="cb-form-section">
                <h3 className="cb-form-section__title">Salary history</h3>
                <ul className="cp-history">
                  {[...data.structure.revisions].reverse().map((r, i) => (
                    <li key={i} className="cp-history__item">
                      <div className="cp-history__top">
                        <span>{fmtDate(r.effectiveFrom)}</span>
                        <span>
                          {r.fromGross ? `${inr(r.fromGross)} → ` : ''}
                          {inr(r.toGross)}
                        </span>
                      </div>
                      <div>
                        {r.note}
                        {r.by?.name ? ` · ${r.by.name}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}
    </Sheet>
  )
}

type RevisionMode = 'percent' | 'amount'
type RevisionRow = SalaryRevisionResult['rows'][number]
type BulkOutcome = BulkResult & { action: string; noun: string }

const REVISION_LIMITS: Record<RevisionMode, { min: number; max: number; message: string }> = {
  percent: { min: -50, max: 100, message: 'Enter a % between −50 and 100.' },
  amount: { min: -1000000, max: 1000000, message: 'Enter an amount within ±₹10,00,000.' },
}

const signedInr = (value: number) => (value > 0 ? `+${inr(value)}` : value < 0 ? `−${inr(Math.abs(value))}` : inr(0))

const getStaffId = (s: StaffSalaryRow) => s.teacherId
const staffRowLabel = (s: StaffSalaryRow) => `Select ${s.name}`

/**
 * Bulk salary revision: a % or ₹ change to the monthly gross of the selected staff. The
 * preview step is the confirmation — nothing is saved until "Apply to N staff".
 */
const RevisionSheet: React.FC<{
  staff: StaffSalaryRow[]
  open: boolean
  onClose: () => void
  onDone: (outcome: BulkOutcome | null) => void
}> = ({ staff, open, onClose, onDone }) => {
  const [mode, setMode] = useState<RevisionMode>('percent')
  const [value, setValue] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso())
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<SalaryRevisionResult | null>(null)
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null)

  useEffect(() => {
    if (!open) return
    setMode('percent')
    setValue('')
    setEffectiveFrom(todayIso())
    setNote('')
    setPreview(null)
  }, [open])

  // Any change to the inputs or the selection makes the preview stale (a background refetch does not).
  const staffKey = staff.map((s) => s.teacherId).join(',')
  useEffect(() => setPreview(null), [mode, value, effectiveFrom, note, staffKey])

  const num = Number(value)
  const limits = REVISION_LIMITS[mode]
  const valueError =
    value.trim() === ''
      ? undefined
      : !Number.isFinite(num) || num === 0
        ? 'Enter a change other than zero.'
        : num < limits.min || num > limits.max
          ? limits.message
          : undefined
  const canPreview = value.trim() !== '' && !valueError && Boolean(effectiveFrom) && staff.length > 0

  const body = () => ({
    teacherIds: staff.map((s) => s.teacherId),
    mode,
    value: num,
    effectiveFrom,
    note: note.trim() || undefined,
  })

  const runPreview = async () => {
    if (!canPreview) return
    setBusy('preview')
    try {
      setPreview(await cpitlBulkService.reviseSalaries({ ...body(), preview: true }))
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const apply = async () => {
    setBusy('apply')
    try {
      const result = await cpitlBulkService.reviseSalaries({ ...body(), preview: false })
      onDone(result.failed.length ? { ...result, action: 'Revise salaries', noun: 'salaries' } : null)
      if (!result.failed.length) toast.success(`Salary revised for ${result.succeeded} staff from ${fmtDate(effectiveFrom)}.`)
    } catch (error: any) {
      // 422: every record was skipped — still a result worth showing.
      const data = error?.response?.status === 422 ? (error.response.data?.data as SalaryRevisionResult | undefined) : undefined
      if (data) onDone({ ...data, action: 'Revise salaries', noun: 'salaries' })
      else toast.error(await errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const ready = preview?.rows.filter((r) => !r.error) || []
  const skipped = preview?.rows.filter((r) => r.error) || []
  const beforeTotal = ready.reduce((sum, r) => sum + r.beforeGross, 0)
  const afterTotal = ready.reduce((sum, r) => sum + r.afterGross, 0)

  const previewColumns: DataTableColumn<RevisionRow>[] = [
    { key: 'name', header: 'Staff', mobile: 'title', render: (r) => r.name },
    {
      key: 'gross',
      header: 'Gross / month',
      align: 'right',
      numeric: true,
      mobile: 'subtitle',
      render: (r) =>
        r.error ? (
          <span className="cp-sub is-warn">{r.error}</span>
        ) : (
          <span className="cp-nowrap">
            {inr(r.beforeGross)} → <span className="cp-strong">{inr(r.afterGross)}</span>
          </span>
        ),
    },
    {
      key: 'net',
      header: 'Net change',
      align: 'right',
      numeric: true,
      mobile: 'aside',
      render: (r) => (r.error ? 'Skipped' : signedInr((r.afterNet ?? 0) - (r.beforeNet ?? 0))),
    },
  ]

  const busyNow = busy !== null
  return (
    <Sheet
      open={open}
      onClose={busyNow ? undefined : onClose}
      size="lg"
      icon={TrendingUp}
      title={`Revise salary for ${staff.length} staff`}
      description="Changes the monthly gross. Deductions and PF/ESI/TDS settings stay as they are; statutory amounts are recalculated."
      onSubmit={(e) => {
        e.preventDefault()
        if (!preview) runPreview()
      }}
      footer={
        preview ? (
          <>
            <Button icon={ArrowLeft} disabled={busyNow} onClick={() => setPreview(null)}>
              Back
            </Button>
            <Button variant="primary" icon={Save} loading={busy === 'apply'} disabled={!ready.length || busyNow} onClick={apply}>
              {`Apply to ${ready.length} staff`}
            </Button>
          </>
        ) : (
          <>
            <Button disabled={busyNow} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={Eye} loading={busy === 'preview'} disabled={!canPreview || busyNow}>
              Preview changes
            </Button>
          </>
        )
      }
    >
      {!preview ? (
        <div className="cb-form-section">
          <div className="cb-form-grid">
            <Select
              label="Change"
              value={mode}
              onChange={(e) => setMode(e.target.value as RevisionMode)}
              options={[
                { value: 'percent', label: 'Increase by %' },
                { value: 'amount', label: 'Change by ₹' },
              ]}
            />
            <TextField
              label={mode === 'percent' ? 'Percent' : 'Amount per month'}
              type="number"
              step={mode === 'percent' ? '0.1' : '1'}
              inputMode="decimal"
              prefix={mode === 'amount' ? '₹' : undefined}
              suffix={mode === 'percent' ? '%' : undefined}
              value={value}
              placeholder={mode === 'percent' ? 'e.g. 6' : 'e.g. 1000'}
              hint={mode === 'percent' ? 'Use a minus sign to reduce, e.g. −5.' : 'Use a minus sign to reduce. Spread across earnings in proportion.'}
              error={valueError}
              onChange={(e) => setValue(e.target.value)}
              required
            />
            <TextField label="Effective from" type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} required />
            <TextField label="Note" hint="Shown in salary history" value={note} maxLength={200} placeholder="e.g. Annual increment 2026" onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="cp-slip__note">
            Every fixed earning is scaled by the same ratio, so Basic and allowances keep their share. You'll see each person's new salary before anything is saved.
          </p>
        </div>
      ) : (
        <div className="cb-form-section">
          <Banner tone="info" title={`Effective from ${fmtDate(effectiveFrom)}`}>
            {ready.length
              ? `${ready.length} staff · monthly gross ${inr(beforeTotal)} → ${inr(afterTotal)} (${signedInr(afterTotal - beforeTotal)}). Used from the next payroll you run or edit; finalized and paid payroll stays as it is.`
              : 'None of the selected staff can be revised.'}
          </Banner>
          {skipped.length ? (
            <Banner tone="warning" title={`${skipped.length} will be skipped`}>
              {skipped.slice(0, 4).map((r) => `${r.name} (${r.error})`).join(', ')}
              {skipped.length > 4 ? '…' : ''}
            </Banner>
          ) : null}
          <DataTable<RevisionRow>
            columns={previewColumns}
            rows={preview.rows}
            getRowKey={(r) => r.teacherId}
            caption="Salary revision preview"
            maxHeight="50vh"
          />
        </div>
      )}
    </Sheet>
  )
}

const ComponentsTab: React.FC<{ components: SalaryComponent[]; settings?: PayrollSettings; onChanged: () => void }> = ({ components, settings, onChanged }) => {
  const [draft, setDraft] = useState<Partial<SalaryComponent> | null>(null)
  const [form, setForm] = useState<PayrollSettings | null>(null)
  const [removing, setRemoving] = useState<SalaryComponent | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    if (settings) setForm(settings)
  }, [settings])

  const saveComponent = async () => {
    if (!draft) return
    setBusy('component')
    try {
      await cpitlService.saveSalaryComponent(draft)
      toast.success('Component saved.')
      setDraft(null)
      onChanged()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const removeComponent = async () => {
    if (!removing) return
    setBusy('remove')
    try {
      await cpitlService.archiveSalaryComponent(removing._id)
      setRemoving(null)
      onChanged()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const saveSettings = async () => {
    if (!form) return
    setBusy('settings')
    try {
      await cpitlService.savePayrollSettings(form)
      toast.success('Statutory settings saved.')
      onChanged()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const setSlab = (i: number, patch: Partial<PayrollSettings['ptSlabs'][number]>) =>
    form && setForm({ ...form, ptSlabs: form.ptSlabs.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) })

  return (
    <div className="cb-grid-6-6">
      <Card
        title="Salary components"
        subtitle="Earnings and fixed deductions that make up a salary."
        action={
          <Button size="sm" icon={Plus} onClick={() => setDraft({ name: '', code: '', type: 'earning', calc: 'fixed', defaultValue: 0, sortOrder: 10 })}>
            Add component
          </Button>
        }
      >
        {components.length ? (
          <ul className="cp-comps">
            {components.map((c) => (
              <li key={c._id} className="cp-comp">
                <span className="cp-comp__code">{c.code}</span>
                <span className="cp-comp__main">
                  <span className="cp-comp__name">{c.name}</span>
                  <span className="cp-comp__meta">
                    {c.type === 'deduction' ? 'Deduction · ' : ''}
                    {CALC_LABELS[c.calc]}
                    {c.defaultValue ? ` · default ${c.defaultValue}` : ''}
                  </span>
                </span>
                <Button variant="tertiary" size="sm" onClick={() => setDraft(c)}>
                  Edit
                </Button>
                {c.code !== 'BASIC' ? (
                  <Button variant="tertiary" size="sm" icon={Trash2} aria-label={`Remove ${c.name}`} onClick={() => setRemoving(c)} />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={Calculator} title="No salary components" body="Add Basic pay first, then allowances such as HRA or DA." />
        )}
        <p className="cp-footnote">PF, ESI, Professional Tax and TDS are calculated automatically and don't need components.</p>
      </Card>

      {form ? (
        <Card
          title="Statutory rates"
          subtitle="Used for every staff salary and payroll run."
          action={
            <Button variant="primary" size="sm" icon={Save} loading={busy === 'settings'} onClick={saveSettings}>
              Save rates
            </Button>
          }
        >
          <div className="cb-form-section">
            <div className="cb-form-grid">
              <TextField label="PF rate" suffix="%" type="number" value={form.pfRate} onChange={(e) => setForm({ ...form, pfRate: Number(e.target.value) })} />
              <TextField
                label="PF wage ceiling"
                prefix="₹"
                type="number"
                value={form.pfWageCeiling}
                onChange={(e) => setForm({ ...form, pfWageCeiling: Number(e.target.value) })}
              />
              <TextField
                label="ESI employee"
                suffix="%"
                type="number"
                step="0.01"
                value={form.esiEmployee}
                onChange={(e) => setForm({ ...form, esiEmployee: Number(e.target.value) })}
              />
              <TextField
                label="ESI employer"
                suffix="%"
                type="number"
                step="0.01"
                value={form.esiEmployer}
                onChange={(e) => setForm({ ...form, esiEmployer: Number(e.target.value) })}
              />
              <TextField
                label="ESI applies up to gross"
                prefix="₹"
                type="number"
                value={form.esiGrossLimit}
                onChange={(e) => setForm({ ...form, esiGrossLimit: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="cb-form-section">
            <div className="cp-slabs">
              <div className="cp-slabs__head">
                <h3 className="cb-form-section__title">Professional Tax slabs (monthly gross)</h3>
                <Button
                  variant="tertiary"
                  size="sm"
                  icon={Plus}
                  onClick={() => setForm({ ...form, ptSlabs: [...form.ptSlabs, { min: 0, max: null, amount: 0 }] })}
                >
                  Add slab
                </Button>
              </div>
              {form.ptSlabs.length ? (
                <>
                  {form.ptSlabs.map((slab, i) => (
                    <div key={i} className="cp-slab">
                      <TextField size="sm" type="number" aria-label={`Slab ${i + 1} from`} prefix="₹" value={slab.min} onChange={(e) => setSlab(i, { min: Number(e.target.value) })} />
                      <TextField
                        size="sm"
                        type="number"
                        aria-label={`Slab ${i + 1} to`}
                        prefix="₹"
                        placeholder="and above"
                        value={slab.max ?? ''}
                        onChange={(e) => setSlab(i, { max: e.target.value === '' ? null : Number(e.target.value) })}
                      />
                      <TextField size="sm" type="number" aria-label={`Slab ${i + 1} tax`} prefix="₹" value={slab.amount} onChange={(e) => setSlab(i, { amount: Number(e.target.value) })} />
                      <Button
                        variant="tertiary"
                        size="sm"
                        icon={Trash2}
                        aria-label={`Remove slab ${i + 1}`}
                        onClick={() => setForm({ ...form, ptSlabs: form.ptSlabs.filter((_, idx) => idx !== i) })}
                      />
                    </div>
                  ))}
                  <p className="cp-slip__note">From · To (blank = no upper limit) · Tax per month</p>
                </>
              ) : (
                <p className="cp-slip__note">No Professional Tax. Add your state's slabs if it levies PT (e.g. Maharashtra, Karnataka, West Bengal).</p>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      <Sheet
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        size="md"
        icon={Calculator}
        title={draft?._id ? `Edit ${draft.name || 'component'}` : 'Add salary component'}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" icon={Save} loading={busy === 'component'} onClick={saveComponent}>
              Save component
            </Button>
          </>
        }
      >
        {draft ? (
          <div className="cb-form-section">
            <TextField label="Name" value={draft.name || ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <TextField
              label="Code"
              hint="Capitals, no spaces — e.g. HRA"
              value={draft.code || ''}
              disabled={draft.code === 'BASIC' && Boolean(draft._id)}
              onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
            />
            <Select
              label="Type"
              value={draft.type}
              onChange={(e) => setDraft({ ...draft, type: e.target.value as SalaryComponent['type'], calc: e.target.value === 'deduction' ? 'fixed' : draft.calc })}
              options={[
                { value: 'earning', label: 'Earning' },
                { value: 'deduction', label: 'Deduction (fixed)' },
              ]}
            />
            <Select
              label="Calculated as"
              value={draft.calc}
              disabled={draft.type === 'deduction'}
              onChange={(e) => setDraft({ ...draft, calc: e.target.value as SalaryCalc })}
              options={CALC_OPTIONS}
            />
            <TextField label="Default value" type="number" min={0} value={draft.defaultValue ?? 0} onChange={(e) => setDraft({ ...draft, defaultValue: Number(e.target.value) })} />
          </div>
        ) : null}
      </Sheet>

      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        tone="danger"
        size="sm"
        title={`Remove ${removing?.name || 'component'}?`}
        description="It is no longer offered for new salaries. Salaries already saved keep their amounts."
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" icon={Trash2} loading={busy === 'remove'} onClick={removeComponent}>
              Remove component
            </Button>
          </>
        }
      />
    </div>
  )
}

const CpitlSalary: React.FC = () => {
  const invalidate = useInvalidateCpitl()
  const [tab, setTab] = useState<Tab>('staff')
  const [q, setQ] = useState('')
  const [setFilter, setSetFilter] = useState<SetFilter>('all')
  const [department, setDepartment] = useState('')
  const [editing, setEditing] = useState<StaffSalaryRow | null>(null)
  const [revising, setRevising] = useState(false)
  const [outcome, setOutcome] = useState<BulkOutcome | null>(null)
  const { data: staff = [], isLoading } = useStaffSalaries()
  const { data: components = [] } = useSalaryComponents()
  const { data: settings } = usePayrollSettings()

  const departments = useMemo(
    () => Array.from(new Set(staff.map((s) => (s.department || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [staff]
  )

  const filtered = useMemo(
    () =>
      staff.filter((s) => {
        if (setFilter === 'missing' && s.salary) return false
        if (setFilter === 'set' && !s.salary) return false
        if (department && (s.department || '').trim() !== department) return false
        const needle = q.trim().toLowerCase()
        return !needle || [s.name, s.designation, s.employeeId, s.department].some((v) => String(v || '').toLowerCase().includes(needle))
      }),
    [staff, setFilter, department, q]
  )
  const { selection, selectedRows, count, clear } = useRowSelection(filtered, getStaffId, {
    resetKey: `${tab}|${q}|${setFilter}|${department}`,
    rowLabel: staffRowLabel,
  })
  const selectedWithoutSalary = selectedRows.filter((s) => !s.salary).length
  const withSalary = staff.filter((s) => s.salary)
  const monthlyGross = withSalary.reduce((sum, s) => sum + (s.salary?.gross || 0), 0)
  const monthlyNet = withSalary.reduce((sum, s) => sum + (s.salary?.net || 0), 0)
  const monthlyCost = withSalary.reduce((sum, s) => sum + (s.salary?.employerCost || 0), 0)
  const hasFilters = Boolean(q.trim() || department || setFilter !== 'all')

  const columns: DataTableColumn<StaffSalaryRow>[] = [
    {
      key: 'name',
      header: 'Staff',
      mobile: 'title',
      render: (s) => (
        <span className="cp-person">
          <Avatar name={s.name} size="sm" />
          <span className="cp-person__text">
            <span className="cp-person__name">{s.name}</span>
            <span className="cp-person__meta">{s.employeeId ? `Emp ID ${s.employeeId}` : 'No employee ID'}</span>
          </span>
        </span>
      ),
    },
    { key: 'designation', header: 'Designation', mobile: 'subtitle', render: (s) => s.designation || s.dutyType || '—' },
    { key: 'gross', header: 'Gross / month', align: 'right', numeric: true, render: (s) => (s.salary ? inr(s.salary.gross) : '—') },
    {
      key: 'deductions',
      header: 'Deductions',
      align: 'right',
      numeric: true,
      render: (s) => (s.salary ? <span className={s.salary.deductions ? 'cp-neg' : undefined}>{inr(s.salary.deductions)}</span> : '—'),
    },
    { key: 'net', header: 'Net / month', align: 'right', numeric: true, render: (s) => (s.salary ? <span className="cp-strong">{inr(s.salary.net)}</span> : '—') },
    { key: 'effectiveFrom', header: 'Effective from', render: (s) => (s.salary ? fmtDate(s.salary.effectiveFrom) : '—') },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (s) => (s.salary ? <Badge tone="success">Salary set</Badge> : <Badge tone="warning">Not set</Badge>),
    },
    {
      key: 'action',
      header: '',
      headerLabel: 'Action',
      interactive: true,
      render: (s) => (
        <span className="cp-actions">
          <Button variant="tertiary" size="sm" onClick={() => setEditing(s)}>
            {s.salary ? 'Edit salary' : 'Set salary'}
          </Button>
        </span>
      ),
    },
  ]

  return (
    <Page>
      <section className="cb-stats" aria-label="Salary summary">
        <StatCard
          label="Staff with a salary"
          value={`${withSalary.length} of ${staff.length}`}
          icon={Users}
          progress={staff.length ? (withSalary.length / staff.length) * 100 : 0}
          progressTone={withSalary.length === staff.length ? 'success' : 'warning'}
          hint={staff.length - withSalary.length ? `${staff.length - withSalary.length} not set` : 'Everyone is set'}
        />
        <StatCard label="Monthly gross" value={inr(monthlyGross)} icon={IndianRupee} />
        <StatCard label="Monthly net pay" value={inr(monthlyNet)} icon={Wallet} />
        <StatCard label="Cost to school" value={inr(monthlyCost)} icon={Calculator} hint="Per month, incl. employer PF/ESI" />
      </section>

      <Tabs
        label="Salary sections"
        value={tab}
        onChange={(id) => setTab(id as Tab)}
        items={[
          { id: 'staff', label: 'Staff salaries', count: staff.length },
          { id: 'components', label: 'Components & statutory' },
        ]}
      />

      {tab === 'staff' ? (
        <Card flush className="cp-card">
          <div className="cp-toolbar">
            <FilterBar
              search={{ placeholder: 'Search name, designation or employee ID', value: q, onChange: setQ, label: 'Search staff' }}
              chips={[
                { id: 'all', label: 'All', count: staff.length, active: setFilter === 'all' },
                { id: 'set', label: 'Salary set', count: withSalary.length, active: setFilter === 'set' },
                { id: 'missing', label: 'Not set', count: staff.length - withSalary.length, active: setFilter === 'missing' },
              ]}
              chipsLabel="Salary status"
              onChipClick={(id) => setSetFilter(id as SetFilter)}
              filters={
                departments.length || hasFilters ? (
                  <>
                    {departments.length ? (
                      <Select
                        aria-label="Department"
                        size="sm"
                        className="cp-filter"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        placeholder="All departments"
                        options={departments}
                      />
                    ) : null}
                    {hasFilters ? (
                      <Button
                        variant="tertiary"
                        size="sm"
                        onClick={() => {
                          setQ('')
                          setDepartment('')
                          setSetFilter('all')
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : null}
                  </>
                ) : undefined
              }
            />
            <BulkBar count={count} noun="staff member" nounPlural="staff" onClear={clear} busy={revising}>
              {selectedWithoutSalary ? <span className="cp-sub">{selectedWithoutSalary} without a salary will be skipped</span> : null}
              <Button size="sm" icon={TrendingUp} onClick={() => setRevising(true)}>
                Revise salary
              </Button>
            </BulkBar>
          </div>
          <DataTable<StaffSalaryRow>
            columns={columns}
            rows={filtered}
            selection={selection}
            getRowKey={(s) => s.teacherId}
            onRowClick={setEditing}
            loading={isLoading}
            loadingLabel="Loading staff salaries…"
            caption="Staff salaries"
            empty={
              staff.length ? (
                <EmptyState icon={Users} title="No staff match these filters" body="Try another search or clear the filters." compact />
              ) : (
                <EmptyState icon={Users} title="No active staff in this session" body="Add staff in the Staff module first, then set their salaries here." />
              )
            }
          />
        </Card>
      ) : (
        <ComponentsTab components={components} settings={settings} onChanged={invalidate} />
      )}

      <SalaryEditor staff={editing} components={components} onClose={() => setEditing(null)} onSaved={invalidate} />
      <RevisionSheet
        staff={selectedRows}
        open={revising}
        onClose={() => setRevising(false)}
        onDone={(result) => {
          setRevising(false)
          clear()
          invalidate()
          if (result) setOutcome(result)
        }}
      />
      <BulkResultDialog result={outcome} onClose={() => setOutcome(null)} />
    </Page>
  )
}

export default CpitlSalary
