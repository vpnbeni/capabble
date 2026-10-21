import { useCallback, useEffect, useState } from 'react'
import { billingApi, errorMessage } from '../services/billingApi'
import type { Addon, AdminCatalog, BillingInterval, Bundle, CatalogModule, Coupon, ModulePrice } from '../types/billing'
import { DataTable } from '../components/DataTable'
import { Dialog, Sheet } from '../components/Dialog'
import { StatusBadge } from '../components/StatusBadge'
import { Banner, Checkbox, RadioGroup, Select, Tabs, TextField } from '../components/kit'
import { Plus } from '../components/icons'
import { formatDate, formatINR, paiseToRupeesInput, rupeesToPaise } from '../utils/money'
import './billing.css'

const priceSummary = (price: ModulePrice | null, unit: string) => {
  if (!price) return <span className="cb-subtle">Not set</span>
  return (
    <span className="cb-entity">
      <span className="cb-entity__primary">{formatINR(price.basePaise)} a {unit}</span>
      <span className="cb-entity__secondary">
        up to {price.includedStudents} students{price.perStudentPaise ? `, then ${formatINR(price.perStudentPaise, { paiseAlways: price.perStudentPaise % 100 !== 0 })} each` : ''}
      </span>
    </span>
  )
}

const couponValue = (c: Coupon) => (c.percentBps ? `${c.percentBps / 100}% off` : `${formatINR(c.fixedPaise)} off`)
const couponDuration = (c: Coupon) => (c.duration === 'once' ? 'First invoice' : c.duration === 'forever' ? 'Every invoice' : `${c.durationCycles} invoices`)
const CYCLE_WORDS = { month: 'Monthly', year: 'Yearly', one_time: 'One-time' } as const

type Editing =
  | null
  | { kind: 'price'; module: CatalogModule }
  | { kind: 'bundle'; bundle: Bundle | null }
  | { kind: 'coupon'; coupon: Coupon | null }
  | { kind: 'addon'; addon: Addon | null }

export function BillingCatalogPage() {
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null)
  const [tab, setTab] = useState('modules')
  const [editing, setEditing] = useState<Editing>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(() => {
    billingApi.catalog()
      .then((res) => { setCatalog(res.data); setError('') })
      .catch((err) => setError(errorMessage(err, "Couldn't load the catalog.")))
  }, [])
  useEffect(() => { load() }, [load])

  const done = (message: string) => {
    setEditing(null)
    setNotice(message)
    window.setTimeout(() => setNotice(''), 4000)
    load()
  }

  const sellable = (catalog?.modules || []).filter((m) => !m.isCore)
  const moduleName = (code: string) => catalog?.modules.find((m) => m.code === code)?.name || code
  const newAction = {
    bundles: { label: 'New bundle', open: () => setEditing({ kind: 'bundle', bundle: null }) },
    coupons: { label: 'New coupon', open: () => setEditing({ kind: 'coupon', coupon: null }) },
    addons: { label: 'New add-on', open: () => setEditing({ kind: 'addon', addon: null }) },
  }[tab as 'bundles' | 'coupons' | 'addons']

  return (
    <div className="grid" style={{ gap: 24 }}>
      <header className="page-head-row">
        <div>
          <h1 className="section-title">Prices and plans</h1>
          <p className="page-subtitle">Each module is priced for up to a number of students, with a rate for every student above it. Prices exclude GST.</p>
        </div>
        {newAction ? (
          <button type="button" className="primary" onClick={newAction.open}><Plus size={16} /> {newAction.label}</button>
        ) : null}
      </header>

      {notice ? <Banner tone="success" title={notice} onDismiss={() => setNotice('')} /> : null}
      {error ? <Banner tone="danger" title={error} onDismiss={() => setError('')} /> : null}

      <section className="card admin-list-card">
        <Tabs
          label="Catalog"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'modules', label: 'Module prices', count: sellable.length },
            { id: 'bundles', label: 'Bundles', count: catalog?.bundles.length },
            { id: 'coupons', label: 'Coupons', count: catalog?.coupons.length },
            { id: 'addons', label: 'Add-ons', count: catalog?.addons.length },
          ]}
        />
        {!catalog ? <p className="cb-muted bl-pad">Loading…</p> : null}
        {catalog && tab === 'modules' ? (
          <DataTable
            data={sellable}
            rowKey={(row) => row.code}
            onRowClick={(row) => setEditing({ kind: 'price', module: row })}
            emptyMessage="No modules yet. Run the billing seed to add the module list."
            columns={[
              { header: 'Module', accessor: (row) => row.name },
              { header: 'Monthly', accessor: (row) => priceSummary(row.prices.month, 'month') },
              { header: 'Yearly', accessor: (row) => priceSummary(row.prices.year, 'year') },
              { header: 'Status', accessor: (row) => (row.active ? <StatusBadge status="active" size="sm" label="On sale" /> : <StatusBadge status="void" size="sm" label="Not on sale" />) },
            ]}
          />
        ) : null}
        {catalog && tab === 'bundles' ? (
          <DataTable
            data={catalog.bundles}
            rowKey={(row) => row.code}
            onRowClick={(row) => setEditing({ kind: 'bundle', bundle: row })}
            emptyMessage="No bundles yet. A bundle discounts a set of modules bought together."
            columns={[
              { header: 'Bundle', accessor: (row) => <span className="cb-entity"><span className="cb-entity__primary">{row.name}</span><span className="cb-entity__secondary">{row.code}</span></span> },
              { header: 'Modules', accessor: (row) => row.moduleCodes.map(moduleName).join(', ') },
              { header: 'Discount', className: 'bl-num', accessor: (row) => `${row.discountBps / 100}%` },
              { header: 'Status', accessor: (row) => <StatusBadge status={row.active ? 'active' : 'void'} size="sm" label={row.active ? 'On sale' : 'Not on sale'} /> },
            ]}
          />
        ) : null}
        {catalog && tab === 'coupons' ? (
          <DataTable
            data={catalog.coupons}
            rowKey={(row) => row.code}
            onRowClick={(row) => setEditing({ kind: 'coupon', coupon: row })}
            emptyMessage="No coupons yet."
            columns={[
              { header: 'Code', accessor: (row) => <span className="cb-entity"><span className="cb-entity__primary">{row.code}</span><span className="cb-entity__secondary">{row.description || couponDuration(row)}</span></span> },
              { header: 'Discount', accessor: (row) => couponValue(row) },
              { header: 'Applies to', accessor: (row) => (row.moduleCodes?.length ? row.moduleCodes.map(moduleName).join(', ') : 'All modules') },
              { header: 'Used', className: 'bl-num', accessor: (row) => `${row.redeemedCount}${row.maxRedemptions ? ` of ${row.maxRedemptions}` : ''}` },
              { header: 'Expires', accessor: (row) => (row.expiresAt ? formatDate(row.expiresAt) : 'Never') },
              {
                header: 'Status',
                accessor: (row) => {
                  const expired = row.expiresAt && new Date(row.expiresAt) < new Date()
                  if (!row.active) return <StatusBadge status="void" size="sm" label="Off" />
                  return expired ? <StatusBadge status="void" size="sm" label="Expired" /> : <StatusBadge status="active" size="sm" />
                },
              },
            ]}
          />
        ) : null}
        {catalog && tab === 'addons' ? (
          <DataTable
            data={catalog.addons}
            rowKey={(row) => row.code}
            onRowClick={(row) => setEditing({ kind: 'addon', addon: row })}
            emptyMessage="No add-ons yet. Add-ons are extras such as onboarding or an SMS pack."
            columns={[
              { header: 'Add-on', accessor: (row) => <span className="cb-entity"><span className="cb-entity__primary">{row.name}</span><span className="cb-entity__secondary">{row.code}</span></span> },
              { header: 'Price', className: 'bl-num', accessor: (row) => formatINR(row.amountPaise) },
              { header: 'Billed', accessor: (row) => CYCLE_WORDS[row.cycle] },
              { header: 'Status', accessor: (row) => <StatusBadge status={row.active ? 'active' : 'void'} size="sm" label={row.active ? 'On sale' : 'Not on sale'} /> },
            ]}
          />
        ) : null}
      </section>

      {editing?.kind === 'price' ? <PriceSheet module={editing.module} onClose={() => setEditing(null)} onDone={done} /> : null}
      {editing?.kind === 'bundle' && catalog ? <BundleSheet bundle={editing.bundle} modules={sellable} onClose={() => setEditing(null)} onDone={done} /> : null}
      {editing?.kind === 'coupon' && catalog ? <CouponSheet coupon={editing.coupon} modules={sellable} onClose={() => setEditing(null)} onDone={done} /> : null}
      {editing?.kind === 'addon' ? <AddonDialog addon={editing.addon} onClose={() => setEditing(null)} onDone={done} /> : null}
    </div>
  )
}

type DoneFn = (message: string) => void

const today = () => new Date().toISOString().slice(0, 10)

function PriceSheet({ module, onClose, onDone }: { module: CatalogModule; onClose: () => void; onDone: DoneFn }) {
  const [interval, setBillingInterval] = useState<BillingInterval>('year')
  const current = module.prices[interval]
  const [base, setBase] = useState(paiseToRupeesInput(current?.basePaise))
  const [included, setIncluded] = useState(String(current?.includedStudents ?? 500))
  const [perStudent, setPerStudent] = useState(paiseToRupeesInput(current?.perStudentPaise ?? 0))
  const [from, setFrom] = useState(today())
  const [onSale, setOnSale] = useState(module.active)
  const [history, setHistory] = useState<ModulePrice[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    billingApi.priceHistory(module.code).then((res) => setHistory(res.data)).catch(() => setHistory([]))
  }, [module.code])

  useEffect(() => {
    const p = module.prices[interval]
    setBase(paiseToRupeesInput(p?.basePaise))
    setIncluded(String(p?.includedStudents ?? 500))
    setPerStudent(paiseToRupeesInput(p?.perStudentPaise ?? 0))
  }, [interval, module.prices])

  const basePaise = rupeesToPaise(base)
  const perPaise = rupeesToPaise(perStudent || '0')
  const includedOk = /^\d+$/.test(included)
  const unchanged = current && basePaise === current.basePaise && perPaise === current.perStudentPaise && Number(included) === current.includedStudents
  const priceValid = basePaise != null && perPaise != null && includedOk

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      if (onSale !== module.active) await billingApi.saveModule({ code: module.code, name: module.name, active: onSale })
      if (!unchanged) {
        if (!priceValid) throw new Error('Check the price fields')
        const startsToday = from === today()
        await billingApi.setPrice(module.code, {
          interval,
          basePaise: basePaise as number,
          includedStudents: Number(included),
          perStudentPaise: perPaise as number,
          ...(startsToday ? {} : { effectiveFrom: new Date(`${from}T00:00:00+05:30`).toISOString() }),
        })
      }
      onDone(`${module.name} saved`)
    } catch (err) {
      setError(errorMessage(err, (err as Error).message || "Couldn't save the price."))
    } finally {
      setSaving(false)
    }
  }

  const past = history.filter((p) => p.interval === interval)

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={module.name}
      description="A new price applies to invoices issued from its start date. Invoices already issued keep their price."
      onSubmit={save}
      footer={(
        <>
          <button type="button" className="ghost" onClick={onClose}>Keep as is</button>
          <button type="submit" className="primary" disabled={saving || (!unchanged && !priceValid)}>{saving ? 'Saving…' : 'Save price'}</button>
        </>
      )}
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      <div className="cb-form-section">
        <RadioGroup label="Price for" horizontal value={interval} onChange={setBillingInterval} options={[{ value: 'year', label: 'Yearly billing' }, { value: 'month', label: 'Monthly billing' }]} />
      </div>
      <div className="cb-form-section">
        <div className="form-grid">
          <TextField label={`Price a ${interval}`} prefix="₹" inputMode="decimal" value={base} onChange={setBase} required error={base && basePaise == null ? 'Enter an amount like 15000' : undefined} />
          <TextField label="Covers up to" suffix="students" inputMode="numeric" value={included} onChange={(v) => setIncluded(v.replace(/\D/g, ''))} required />
          <TextField label="Each extra student" prefix="₹" inputMode="decimal" value={perStudent} onChange={setPerStudent} hint={`Charged per student above ${included || 0}, per ${interval}`} error={perStudent && perPaise == null ? 'Enter an amount like 30 or 2.50' : undefined} />
          <TextField label="Starts on" type="date" value={from} min={today()} onChange={setFrom} />
          <div className="is-wide">
            <Checkbox label="On sale" description="Schools can choose this module. Schools that already have it keep it." checked={onSale} onChange={setOnSale} />
          </div>
        </div>
      </div>
      {past.length ? (
        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Price history</h3>
          <ul className="bl-history">
            {past.map((p) => (
              <li key={p.id}>
                <span>{formatINR(p.basePaise)} up to {p.includedStudents}{p.perStudentPaise ? `, then ${formatINR(p.perStudentPaise, { paiseAlways: p.perStudentPaise % 100 !== 0 })}` : ''}</span>
                <span className="cb-muted">{formatDate(p.effectiveFrom)} – {p.effectiveTo ? formatDate(p.effectiveTo) : 'now'}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Sheet>
  )
}

const codeFrom = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'b_$1').slice(0, 32)

function BundleSheet({ bundle, modules, onClose, onDone }: { bundle: Bundle | null; modules: CatalogModule[]; onClose: () => void; onDone: DoneFn }) {
  const [name, setName] = useState(bundle?.name || '')
  const [discount, setDiscount] = useState(bundle ? String(bundle.discountBps / 100) : '10')
  const [chosen, setChosen] = useState<string[]>(bundle?.moduleCodes || [])
  const [active, setActive] = useState(bundle?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pct = Number(discount)
  const discountOk = /^\d+(\.\d{1,2})?$/.test(discount) && pct >= 0 && pct <= 100
  const valid = name.trim().length >= 2 && discountOk && chosen.length >= 2

  const save = async () => {
    if (!valid) return
    setSaving(true)
    setError('')
    try {
      await billingApi.saveBundle({ code: bundle?.code || codeFrom(name), name: name.trim(), discountBps: Math.round(pct * 100), moduleCodes: chosen, active })
      onDone(`${name.trim()} saved`)
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the bundle."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={bundle ? bundle.name : 'New bundle'}
      description="Schools that pick a bundle get every module in it, with the discount on those modules."
      onSubmit={save}
      footer={(
        <>
          <button type="button" className="ghost" onClick={onClose}>Keep as is</button>
          <button type="submit" className="primary" disabled={!valid || saving}>{saving ? 'Saving…' : bundle ? 'Save bundle' : 'Create bundle'}</button>
        </>
      )}
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      <div className="cb-form-section">
        <div className="form-grid">
          <TextField label="Name" value={name} onChange={setName} placeholder="Front office" required />
          <TextField label="Discount" suffix="%" inputMode="decimal" value={discount} onChange={setDiscount} error={discount && !discountOk ? 'Enter 0 to 100' : undefined} required />
        </div>
      </div>
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Modules in the bundle</h3>
        <div className="bl-module-list">
          {modules.map((m) => (
            <Checkbox key={m.code} label={m.name} checked={chosen.includes(m.code)} onChange={(on) => setChosen((prev) => (on ? [...prev, m.code] : prev.filter((c) => c !== m.code)))} />
          ))}
        </div>
        {chosen.length < 2 ? <p className="cb-field__hint">Choose at least two modules.</p> : null}
      </div>
      <Checkbox label="On sale" checked={active} onChange={setActive} />
    </Sheet>
  )
}

function CouponSheet({ coupon, modules, onClose, onDone }: { coupon: Coupon | null; modules: CatalogModule[]; onClose: () => void; onDone: DoneFn }) {
  const [code, setCode] = useState(coupon?.code || '')
  const [kind, setKind] = useState<'percent' | 'fixed'>(coupon?.fixedPaise ? 'fixed' : 'percent')
  const [value, setValue] = useState(coupon ? (coupon.percentBps ? String(coupon.percentBps / 100) : paiseToRupeesInput(coupon.fixedPaise)) : '')
  const [duration, setDuration] = useState<Coupon['duration']>(coupon?.duration || 'once')
  const [cycles, setCycles] = useState(String(coupon?.durationCycles || 3))
  const [maxUses, setMaxUses] = useState(coupon?.maxRedemptions ? String(coupon.maxRedemptions) : '')
  const [expires, setExpires] = useState(coupon?.expiresAt ? coupon.expiresAt.slice(0, 10) : '')
  const [onlyFor, setOnlyFor] = useState<string[]>(coupon?.moduleCodes || [])
  const [active, setActive] = useState(coupon?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const used = Boolean(coupon && coupon.redeemedCount > 0)

  const codeOk = /^[A-Z0-9_-]{3,32}$/.test(code)
  const pct = Number(value)
  const fixed = rupeesToPaise(value)
  const valueOk = kind === 'percent' ? /^\d+(\.\d{1,2})?$/.test(value) && pct > 0 && pct <= 100 : fixed != null && fixed > 0
  const cyclesOk = duration !== 'repeating' || (/^\d+$/.test(cycles) && Number(cycles) >= 1)
  const valid = codeOk && valueOk && cyclesOk && (!maxUses || /^\d+$/.test(maxUses))

  const save = async () => {
    if (!valid) return
    setSaving(true)
    setError('')
    try {
      await billingApi.saveCoupon({
        code,
        ...(kind === 'percent' ? { percentBps: Math.round(pct * 100) } : { fixedPaise: fixed as number }),
        duration,
        ...(duration === 'repeating' ? { durationCycles: Number(cycles) } : {}),
        maxRedemptions: maxUses ? Number(maxUses) : null,
        expiresAt: expires ? new Date(`${expires}T23:59:59+05:30`).toISOString() : null,
        moduleCodes: onlyFor,
        active,
      })
      onDone(`Coupon ${code} saved`)
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the coupon."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={coupon ? `Coupon ${coupon.code}` : 'New coupon'}
      description="The discount comes off before GST, after any bundle discount."
      onSubmit={save}
      footer={(
        <>
          <button type="button" className="ghost" onClick={onClose}>Keep as is</button>
          <button type="submit" className="primary" disabled={!valid || saving}>{saving ? 'Saving…' : coupon ? 'Save coupon' : 'Create coupon'}</button>
        </>
      )}
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      {used ? <Banner tone="info" title={`Used by ${coupon?.redeemedCount} ${coupon?.redeemedCount === 1 ? 'school' : 'schools'}`}>Its discount can't change; create a new code instead.</Banner> : null}
      <div className="cb-form-section">
        <div className="form-grid">
          <TextField label="Code" value={code} onChange={(v) => setCode(v.toUpperCase().replace(/\s/g, ''))} disabled={Boolean(coupon)} placeholder="WELCOME10" required error={code && !codeOk ? '3 to 32 letters, numbers, - or _' : undefined} />
          <Select label="Discount type" value={kind} onChange={(v) => setKind(v as 'percent' | 'fixed')} disabled={used} options={[{ value: 'percent', label: 'Percentage' }, { value: 'fixed', label: 'Fixed amount' }]} />
          <TextField
            label="Discount"
            prefix={kind === 'fixed' ? '₹' : undefined}
            suffix={kind === 'percent' ? '%' : undefined}
            inputMode="decimal"
            value={value}
            onChange={setValue}
            disabled={used}
            required
            error={value && !valueOk ? (kind === 'percent' ? 'Enter 1 to 100' : 'Enter an amount above zero') : undefined}
          />
          <Select
            label="Applies to"
            value={duration}
            onChange={(v) => setDuration(v as Coupon['duration'])}
            options={[{ value: 'once', label: 'First invoice only' }, { value: 'repeating', label: 'A number of invoices' }, { value: 'forever', label: 'Every invoice' }]}
          />
          {duration === 'repeating' ? (
            <TextField label="Number of invoices" inputMode="numeric" value={cycles} onChange={(v) => setCycles(v.replace(/\D/g, ''))} error={!cyclesOk ? 'Enter at least 1' : undefined} />
          ) : null}
          <TextField label="Schools that can use it" inputMode="numeric" value={maxUses} onChange={(v) => setMaxUses(v.replace(/\D/g, ''))} placeholder="No limit" />
          <TextField label="Expires on" type="date" value={expires} min={today()} onChange={setExpires} hint="Leave empty to keep it running" />
        </div>
      </div>
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Only for these modules</h3>
        <p className="cb-field__hint">Leave all unticked to discount every module.</p>
        <div className="bl-module-list">
          {modules.map((m) => (
            <Checkbox key={m.code} label={m.name} checked={onlyFor.includes(m.code)} onChange={(on) => setOnlyFor((prev) => (on ? [...prev, m.code] : prev.filter((c) => c !== m.code)))} />
          ))}
        </div>
      </div>
      <Checkbox label="Active" description="Schools can enter this code." checked={active} onChange={setActive} />
    </Sheet>
  )
}

function AddonDialog({ addon, onClose, onDone }: { addon: Addon | null; onClose: () => void; onDone: DoneFn }) {
  const [name, setName] = useState(addon?.name || '')
  const [amount, setAmount] = useState(paiseToRupeesInput(addon?.amountPaise))
  const [cycle, setCycle] = useState<Addon['cycle']>(addon?.cycle || 'year')
  const [active, setActive] = useState(addon?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const paise = rupeesToPaise(amount)
  const valid = name.trim().length >= 2 && paise != null

  const save = async () => {
    if (!valid) return
    setSaving(true)
    setError('')
    try {
      await billingApi.saveAddon({ code: addon?.code || codeFrom(name), name: name.trim(), amountPaise: paise as number, cycle, active })
      onDone(`${name.trim()} saved`)
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the add-on."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      isOpen
      onClose={onClose}
      size="md"
      title={addon ? addon.name : 'New add-on'}
      footer={(
        <>
          <button type="button" className="ghost" onClick={onClose}>Keep as is</button>
          <button type="button" className="primary" disabled={!valid || saving} onClick={save}>{saving ? 'Saving…' : addon ? 'Save add-on' : 'Create add-on'}</button>
        </>
      )}
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      <div className="form-grid">
        <TextField label="Name" value={name} onChange={setName} placeholder="Onboarding and training" required />
        <TextField label="Price" prefix="₹" inputMode="decimal" value={amount} onChange={setAmount} required error={amount && paise == null ? 'Enter an amount like 5000' : undefined} />
        <Select label="Billed" value={cycle} onChange={(v) => setCycle(v as Addon['cycle'])} options={[{ value: 'year', label: 'Yearly' }, { value: 'month', label: 'Monthly' }, { value: 'one_time', label: 'Once' }]} />
        <div className="bl-check-cell">
          <Checkbox label="On sale" checked={active} onChange={setActive} />
        </div>
      </div>
    </Dialog>
  )
}
