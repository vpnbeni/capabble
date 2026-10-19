import React, { useEffect, useMemo, useState } from 'react'
import { Checkbox, RadioGroup, Select, TextField, formatINR } from '@/components/ui'
import { useBillingCatalog } from '@/hooks/useBilling'
import type { BillingInterval, BillingSubscription, Catalog, Selection } from '@/services/billingService'

/** Paise → "₹60,445.50" (whole rupees print without paise). */
export const rupees = (paise: number | null | undefined) =>
  paise == null ? '—' : formatINR(paise / 100, { decimals: paise % 100 ? 2 : 0 })
export const rupeesExact = (paise: number | null | undefined) => (paise == null ? '—' : formatINR(paise / 100, { decimals: 2 }))

/**
 * The modules (or bundle), billing interval, students and coupon a school is choosing.
 * Shared by Get started (opting in to the trial) and Billing (changing the plan).
 */
export function usePlanSelection(sub: BillingSubscription | null, liveStudents: number | null) {
  const catalog = useBillingCatalog()
  const [interval, setBillingInterval] = useState<BillingInterval>(sub?.interval || 'year')
  const [modules, setModules] = useState<string[]>(() => (sub?.items || []).filter((i) => !i.endsAtPeriodEnd).map((i) => i.moduleCode))
  const [bundleCode, setBundleCode] = useState(sub?.bundleCode || '')
  const [students, setStudents] = useState(String(sub?.declaredStudents || liveStudents || ''))
  const [coupon, setCoupon] = useState(sub?.couponCode || '')

  // The live count arrives after the first render on Get started.
  useEffect(() => {
    if (!students && liveStudents) setStudents(String(liveStudents))
  }, [liveStudents, students])

  const bundle = catalog.data?.bundles.find((b) => b.code === bundleCode) || null
  const chosen = useMemo(() => new Set([...modules, ...(bundle?.moduleCodes || [])]), [modules, bundle])

  const selection: Selection = useMemo(() => ({
    modules,
    interval,
    bundleCode: bundleCode || null,
    couponCode: coupon.trim() || null,
    ...(/^\d+$/.test(students) ? { declaredStudents: Number(students) } : {}),
  }), [modules, interval, bundleCode, coupon, students])

  // Quotes follow the form a moment after typing stops.
  const [debounced, setDebounced] = useState(selection)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(selection), 300)
    return () => window.clearTimeout(timer)
  }, [selection])

  return {
    catalog,
    interval,
    setBillingInterval,
    modules,
    setModules,
    bundleCode,
    setBundleCode,
    bundle,
    students,
    setStudents,
    coupon,
    setCoupon,
    chosen,
    selection,
    debounced,
    liveStudents,
  }
}

export type PlanSelectionState = ReturnType<typeof usePlanSelection>

const priceText = (catalog: Catalog | undefined, code: string, interval: BillingInterval) => {
  const price = catalog?.modules.find((m) => m.code === code)?.prices[interval]
  if (!price) return ''
  const per = price.perStudentPaise ? `, then ${rupees(price.perStudentPaise)} a student` : ''
  return `${rupees(price.basePaise)} a ${interval} for up to ${price.includedStudents} students${per}`
}

/**
 * The fields of a plan. `bundles="cards"` shows bundles as cards up front (Get started);
 * `"select"` keeps them in a dropdown next to the students (the Billing sheet).
 */
export const PlanFields: React.FC<{ plan: PlanSelectionState; bundles?: 'cards' | 'select' }> = ({ plan, bundles = 'select' }) => {
  const { catalog, interval, bundle } = plan
  const priced = (catalog.data?.modules || []).filter((m) => m.prices[interval])
  const bundleList = catalog.data?.bundles || []
  const studentHint = plan.liveStudents != null
    ? `${plan.liveStudents.toLocaleString('en-IN')} students are active in Students. We bill whichever is higher.`
    : 'Your total number of students. Each module covers a number of students; extra students are charged per student.'

  return (
    <>
      <div className="cb-form-section">
        <RadioGroup
          label="Pay"
          orientation="horizontal"
          value={interval}
          onChange={(value) => plan.setBillingInterval(value as BillingInterval)}
          options={[{ value: 'year', label: 'Yearly' }, { value: 'month', label: 'Monthly' }]}
        />
      </div>
      {bundles === 'cards' && bundleList.length ? (
        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Start from a bundle</h3>
          <RadioGroup
            label="Bundle"
            variant="cards"
            value={plan.bundleCode}
            onChange={plan.setBundleCode}
            options={[
              { value: '', label: 'Pick modules myself', description: 'Choose exactly the modules you need below.' },
              ...bundleList.map((b) => ({
                value: b.code,
                label: `${b.name} · ${b.discountBps / 100}% off`,
                description: (catalog.data?.modules || []).filter((m) => b.moduleCodes.includes(m.code)).map((m) => m.name).join(', '),
              })),
            ]}
          />
        </div>
      ) : null}
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">{bundle ? `Modules (${bundle.name} included)` : 'Modules'}</h3>
        {catalog.isLoading ? <p className="cb-muted">Loading prices…</p> : (
          <div className="cb-check-grid">
            {priced.map((m) => {
              const inBundle = Boolean(bundle?.moduleCodes.includes(m.code))
              return (
                <Checkbox
                  key={m.code}
                  label={m.name}
                  description={inBundle ? `In ${bundle?.name} · ${priceText(catalog.data, m.code, interval)}` : priceText(catalog.data, m.code, interval)}
                  checked={plan.chosen.has(m.code)}
                  disabled={inBundle}
                  onChange={(on) => plan.setModules((prev) => (on ? [...prev, m.code] : prev.filter((c) => c !== m.code)))}
                />
              )
            })}
          </div>
        )}
      </div>
      <div className="cb-form-section">
        <div className="cb-form-grid">
          {bundles === 'select' && bundleList.length ? (
            <Select
              label="Bundle"
              value={plan.bundleCode}
              onChange={(event) => plan.setBundleCode(event.target.value)}
              options={[{ value: '', label: 'No bundle' }, ...bundleList.map((b) => ({ value: b.code, label: `${b.name}, ${b.discountBps / 100}% off` }))]}
            />
          ) : null}
          <TextField
            label="Number of students"
            inputMode="numeric"
            value={plan.students}
            onChange={(event) => plan.setStudents(event.target.value.replace(/\D/g, ''))}
            hint={studentHint}
          />
          <TextField label="Coupon code" value={plan.coupon} onChange={(event) => plan.setCoupon(event.target.value.toUpperCase())} placeholder="Optional" />
        </div>
      </div>
    </>
  )
}
