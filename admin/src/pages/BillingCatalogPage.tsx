import { FormEvent, ReactNode, useState } from 'react'
import { billingAdminApi } from '../services/platformApi'

const defaultPlan = {
  code: '',
  name: '',
  billingCycle: 'monthly' as 'monthly' | 'yearly',
  amountMinor: 0,
  description: '',
  trialDays: 14,
}

const defaultCoupon = {
  code: '',
  discountType: 'percentage' as 'percentage' | 'fixed_minor',
  discountValue: 0,
  durationType: 'one_time' as 'one_time' | 'forever' | 'repeating',
}

const defaultAddon = {
  code: '',
  name: '',
  amountMinor: 0,
  cycle: 'monthly' as 'monthly' | 'yearly' | 'one_time',
}

export function BillingCatalogPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [plan, setPlan] = useState(defaultPlan)
  const [coupon, setCoupon] = useState(defaultCoupon)
  const [addon, setAddon] = useState(defaultAddon)

  const handlePlanSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      await billingAdminApi.createPlan({
        ...plan,
        code: plan.code.trim().toLowerCase(),
        name: plan.name.trim(),
        amountMinor: Number(plan.amountMinor),
        trialDays: Number(plan.trialDays),
      })
      setSuccess('Plan saved successfully')
      setPlan(defaultPlan)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save plan')
    } finally {
      setLoading(false)
    }
  }

  const handleCouponSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      await billingAdminApi.createCoupon({
        ...coupon,
        code: coupon.code.trim().toUpperCase(),
        discountValue: Number(coupon.discountValue),
      })
      setSuccess('Coupon saved successfully')
      setCoupon(defaultCoupon)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save coupon')
    } finally {
      setLoading(false)
    }
  }

  const handleAddonSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      await billingAdminApi.createAddon({
        ...addon,
        code: addon.code.trim().toLowerCase(),
        name: addon.name.trim(),
        amountMinor: Number(addon.amountMinor),
      })
      setSuccess('Addon saved successfully')
      setAddon(defaultAddon)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save addon')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid" style={{ gap: 24 }}>
      <header className="page-header">
        <h1 className="section-title">Billing catalog</h1>
        <p className="page-subtitle">Plans, coupons and add-ons schools can be billed for. Saving a code that exists updates it.</p>
      </header>

      {error && <div className="error-text">{error}</div>}
      {success && <div className="success-text">{success}</div>}

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <form className="card" onSubmit={handlePlanSubmit}>
          <h2 className="card-title">Plan</h2>
          <div className="form-grid">
            <Field label="Code" hint="For example, core_monthly">
              <input value={plan.code} onChange={(e) => setPlan((p) => ({ ...p, code: e.target.value }))} required />
            </Field>
            <Field label="Name">
              <input value={plan.name} onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))} required />
            </Field>
            <Field label="Billing cycle">
              <select value={plan.billingCycle} onChange={(e) => setPlan((p) => ({ ...p, billingCycle: e.target.value as 'monthly' | 'yearly' }))}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </Field>
            <Field label="Amount (paise)" hint="₹1 = 100 paise">
              <input type="number" min={0} value={plan.amountMinor} onChange={(e) => setPlan((p) => ({ ...p, amountMinor: Number(e.target.value) }))} required />
            </Field>
            <Field label="Trial days">
              <input type="number" min={0} value={plan.trialDays} onChange={(e) => setPlan((p) => ({ ...p, trialDays: Number(e.target.value) }))} />
            </Field>
            <Field label="Description" wide>
              <input value={plan.description} onChange={(e) => setPlan((p) => ({ ...p, description: e.target.value }))} />
            </Field>
          </div>
          <div className="form-actions">
            <button className="primary" type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save plan'}</button>
          </div>
        </form>

        <form className="card" onSubmit={handleCouponSubmit}>
          <h2 className="card-title">Coupon</h2>
          <div className="form-grid">
            <Field label="Code" hint="For example, NEWYEAR25">
              <input value={coupon.code} onChange={(e) => setCoupon((p) => ({ ...p, code: e.target.value }))} required />
            </Field>
            <Field label="Discount type">
              <select value={coupon.discountType} onChange={(e) => setCoupon((p) => ({ ...p, discountType: e.target.value as 'percentage' | 'fixed_minor' }))}>
                <option value="percentage">Percentage</option>
                <option value="fixed_minor">Fixed amount (paise)</option>
              </select>
            </Field>
            <Field label={coupon.discountType === 'percentage' ? 'Discount (%)' : 'Discount (paise)'}>
              <input type="number" min={0} value={coupon.discountValue} onChange={(e) => setCoupon((p) => ({ ...p, discountValue: Number(e.target.value) }))} required />
            </Field>
            <Field label="Applies">
              <select value={coupon.durationType} onChange={(e) => setCoupon((p) => ({ ...p, durationType: e.target.value as 'one_time' | 'forever' | 'repeating' }))}>
                <option value="one_time">Once</option>
                <option value="forever">Forever</option>
                <option value="repeating">Repeating</option>
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <button className="primary" type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save coupon'}</button>
          </div>
        </form>

        <form className="card" onSubmit={handleAddonSubmit}>
          <h2 className="card-title">Add-on</h2>
          <div className="form-grid">
            <Field label="Code">
              <input value={addon.code} onChange={(e) => setAddon((p) => ({ ...p, code: e.target.value }))} required />
            </Field>
            <Field label="Name">
              <input value={addon.name} onChange={(e) => setAddon((p) => ({ ...p, name: e.target.value }))} required />
            </Field>
            <Field label="Amount (paise)" hint="₹1 = 100 paise">
              <input type="number" min={0} value={addon.amountMinor} onChange={(e) => setAddon((p) => ({ ...p, amountMinor: Number(e.target.value) }))} required />
            </Field>
            <Field label="Billing cycle">
              <select value={addon.cycle} onChange={(e) => setAddon((p) => ({ ...p, cycle: e.target.value as 'monthly' | 'yearly' | 'one_time' }))}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="one_time">One time</option>
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <button className="primary" type="submit" disabled={loading}>{loading ? 'Saving…' : 'Save add-on'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/** Labelled field: the label wraps the control so it is always announced. */
function Field({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={`input-group${wide ? ' is-wide' : ''}`} style={{ marginBottom: 0 }}>
      <span className="input-label">{label}</span>
      {children}
      {hint ? <span className="input-hint">{hint}</span> : null}
    </label>
  )
}
