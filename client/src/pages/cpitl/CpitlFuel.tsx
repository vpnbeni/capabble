import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Download, Fuel, Gauge, Plus, Route, Wallet } from 'lucide-react'
import Modal from '@/components/common/Modal'
import { useFuelAnalytics, useFuelLogs, useFuelVehicles, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { Attachment, FuelLog, FuelVehicle, PaymentMode } from '@/services/cpitlService'
import AttachmentInput from '@/components/cpitl/AttachmentInput'
import { todayIso } from '@/components/cpitl/QuickExpenseSheet'
import {
  CpitlCard,
  CpitlEmpty,
  CpitlPageShell,
  Field,
  MODE_LABELS,
  MONTHS,
  StatCard,
  btnGhost,
  btnPrimary,
  btnSecondary,
  errorMessage,
  fmtDate,
  inputClass,
  inr,
  inrShort,
  tableHead,
} from '@/components/cpitl/CpitlUi'

type Tab = 'log' | 'vehicles' | 'projection'

const vehicleLabel = (v?: { busNo?: string; registrationNumber?: string }) =>
  [v?.busNo && `Bus ${v.busNo}`, v?.registrationNumber].filter(Boolean).join(' · ') || 'Vehicle'

const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  if (values.length < 2) return <span className="text-xs text-slate-400">—</span>
  const max = Math.max(...values, 1)
  const w = 80
  const h = 24
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`).join(' ')
  return (
    <svg width={w} height={h} aria-hidden className="text-indigo-500">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

type Draft = {
  _id?: string
  vehicleKey: string
  manualReg: string
  manualBus: string
  date: string
  fuelType: FuelLog['fuelType']
  litres: string
  ratePerLitre: string
  amount: string
  odometer: string
  fullTank: boolean
  station: string
  billNo: string
  filledBy: string
  mode: PaymentMode
  notes: string
  attachments: Attachment[]
}

const emptyDraft = (): Draft => ({
  vehicleKey: '',
  manualReg: '',
  manualBus: '',
  date: todayIso(),
  fuelType: 'diesel',
  litres: '',
  ratePerLitre: '',
  amount: '',
  odometer: '',
  fullTank: true,
  station: '',
  billNo: '',
  filledBy: '',
  mode: 'cash',
  notes: '',
  attachments: [],
})

const FuelEntryModal: React.FC<{ isOpen: boolean; onClose: () => void; vehicles: FuelVehicle[]; log?: FuelLog | null; onSaved: () => void }> = ({
  isOpen,
  onClose,
  vehicles,
  log,
  onSaved,
}) => {
  const [d, setD] = useState<Draft>(emptyDraft())
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }))

  useEffect(() => {
    if (!isOpen) return
    if (!log) {
      setD(emptyDraft())
      return
    }
    setD({
      _id: log._id,
      vehicleKey: log.vehicleId || '',
      manualReg: log.vehicleId ? '' : log.vehicleSnapshot.registrationNumber || '',
      manualBus: log.vehicleId ? '' : log.vehicleSnapshot.busNo || '',
      date: log.date.slice(0, 10),
      fuelType: log.fuelType,
      litres: String(log.litres),
      ratePerLitre: String(log.ratePerLitre || ''),
      amount: String(log.amount),
      odometer: log.odometer !== null && log.odometer !== undefined ? String(log.odometer) : '',
      fullTank: log.fullTank,
      station: log.station,
      billNo: log.billNo,
      filledBy: log.filledBy,
      mode: (log.mode as PaymentMode) || 'cash',
      notes: log.notes,
      attachments: log.attachments || [],
    })
  }, [isOpen, log])

  const vehicle = vehicles.find((v) => v._id === d.vehicleKey)
  const computed = Number(d.litres) * Number(d.ratePerLitre)
  const amount = d.amount !== '' ? Number(d.amount) : computed

  const save = async () => {
    if (!d.vehicleKey && !d.manualReg.trim()) {
      toast.error('Pick a vehicle or enter its registration number.')
      return
    }
    setSaving(true)
    try {
      await cpitlService.saveFuelLog({
        _id: d._id,
        vehicleId: d.vehicleKey || null,
        vehicleSnapshot: d.vehicleKey ? undefined : { registrationNumber: d.manualReg.trim().toUpperCase(), busNo: d.manualBus.trim() },
        date: d.date,
        fuelType: d.fuelType,
        litres: Number(d.litres),
        ratePerLitre: Number(d.ratePerLitre) || 0,
        amount: amount || undefined,
        odometer: d.odometer === '' ? null : Number(d.odometer),
        fullTank: d.fullTank,
        station: d.station,
        billNo: d.billNo,
        filledBy: d.filledBy,
        mode: d.mode,
        notes: d.notes,
        attachments: d.attachments,
      } as Partial<FuelLog>)
      toast.success(d._id ? 'Fuel entry updated.' : 'Fuel entry saved.')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={d._id ? 'Edit fuel entry' : 'Log fuel'} size="lg">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Vehicle" className="col-span-2">
          <select className={inputClass} value={d.vehicleKey} onChange={(e) => set({ vehicleKey: e.target.value })}>
            <option value="">{vehicles.length ? 'Select vehicle…' : 'Enter vehicle below'}</option>
            {vehicles
              .filter((v) => v._id)
              .map((v) => (
                <option key={v._id as string} value={v._id as string}>
                  {vehicleLabel(v)}
                  {v.lastOdometer ? ` · last odo ${v.lastOdometer.toLocaleString('en-IN')}` : ''}
                </option>
              ))}
          </select>
        </Field>
        {!d.vehicleKey ? (
          <>
            <Field label="Registration number">
              <input className={`${inputClass} uppercase`} value={d.manualReg} onChange={(e) => set({ manualReg: e.target.value })} placeholder="HR26AB1234" />
            </Field>
            <Field label="Bus no. (optional)">
              <input className={inputClass} value={d.manualBus} onChange={(e) => set({ manualBus: e.target.value })} />
            </Field>
          </>
        ) : null}
        <Field label="Date">
          <input type="date" className={inputClass} value={d.date} max={todayIso()} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Fuel">
          <select className={inputClass} value={d.fuelType} onChange={(e) => set({ fuelType: e.target.value as Draft['fuelType'] })}>
            <option value="diesel">Diesel</option>
            <option value="petrol">Petrol</option>
            <option value="cng">CNG</option>
            <option value="ev">EV charging</option>
          </select>
        </Field>
        <Field label={d.fuelType === 'ev' ? 'Units (kWh)' : d.fuelType === 'cng' ? 'Quantity (kg)' : 'Litres'}>
          <input type="number" min={0} step="0.01" className={inputClass} value={d.litres} onChange={(e) => set({ litres: e.target.value })} />
        </Field>
        <Field label="Rate (₹ per unit)">
          <input type="number" min={0} step="0.01" className={inputClass} value={d.ratePerLitre} onChange={(e) => set({ ratePerLitre: e.target.value, amount: '' })} />
        </Field>
        <Field label="Amount (₹)" hint={d.amount === '' && computed > 0 ? `Litres × rate = ${inr(computed, { decimals: true })}` : undefined}>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            value={d.amount !== '' ? d.amount : computed > 0 ? computed.toFixed(2) : ''}
            onChange={(e) => set({ amount: e.target.value })}
          />
        </Field>
        <Field label="Odometer (km)" hint={vehicle?.lastOdometer ? `Last recorded ${vehicle.lastOdometer.toLocaleString('en-IN')} km` : 'Needed for km/litre'}>
          <input type="number" min={0} className={inputClass} value={d.odometer} onChange={(e) => set({ odometer: e.target.value })} />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" className="h-4 w-4 rounded" checked={d.fullTank} onChange={(e) => set({ fullTank: e.target.checked })} />
          Tank filled to full (gives the most accurate mileage)
        </label>
        <Field label="Fuel station">
          <input className={inputClass} value={d.station} onChange={(e) => set({ station: e.target.value })} />
        </Field>
        <Field label="Bill no.">
          <input className={inputClass} value={d.billNo} onChange={(e) => set({ billNo: e.target.value })} />
        </Field>
        <Field label="Filled by">
          <input className={inputClass} value={d.filledBy} placeholder="Driver name" onChange={(e) => set({ filledBy: e.target.value })} />
        </Field>
        <Field label="Paid by">
          <select className={inputClass} value={d.mode} onChange={(e) => set({ mode: e.target.value as PaymentMode })}>
            {(['cash', 'upi', 'card', 'bank_transfer', 'cheque'] as PaymentMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <div className="col-span-2">
          <AttachmentInput value={d.attachments} onChange={(attachments) => set({ attachments })} label="Attach fuel bill" />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={btnPrimary} disabled={saving} onClick={save}>
          {saving ? 'Saving…' : `Save ${amount > 0 ? inr(amount) : ''}`}
        </button>
      </div>
    </Modal>
  )
}

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${String(y).slice(2)}`
}

const CpitlFuel: React.FC = () => {
  const invalidate = useInvalidateCpitl()
  const [tab, setTab] = useState<Tab>('log')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [growthPct, setGrowthPct] = useState(8)
  const [modal, setModal] = useState<{ open: boolean; log?: FuelLog | null }>({ open: false })
  const { data: vehicleData } = useFuelVehicles()
  const { data: logs = [], isLoading } = useFuelLogs(vehicleFilter ? { vehicleId: vehicleFilter } : {})
  const { data: analytics } = useFuelAnalytics(growthPct)
  const vehicles = vehicleData?.vehicles || []

  const fleet = analytics?.fleet
  const monthsAll = useMemo(() => {
    const set = new Set<string>()
    analytics?.vehicles.forEach((v) => v.monthly.forEach((m) => set.add(m.month)))
    return [...set].sort()
  }, [analytics])

  const remove = async (log: FuelLog) => {
    const reason = window.prompt('Remove this fuel entry? Reason:')
    if (!reason?.trim()) return
    try {
      await cpitlService.removeFuelLog(log._id, reason)
      toast.success('Fuel entry removed.')
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  const download = async () => {
    try {
      await cpitlService.downloadFuelProjection(growthPct)
    } catch (error) {
      toast.error(await errorMessage(error, 'Export failed.'))
    }
  }

  return (
    <CpitlPageShell
      actions={
        <button type="button" className={btnPrimary} onClick={() => setModal({ open: true, log: null })}>
          <Plus className="h-4 w-4" /> Log fuel
        </button>
      }
    >
      {vehicleData && !vehicleData.trnstActive ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          Transport module is off — vehicles are entered by registration number.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Fuel cost (session)" value={inrShort(fleet?.cost)} hint={`${(fleet?.litres || 0).toLocaleString('en-IN')} litres`} icon={Wallet} tone="indigo" />
        <StatCard label="Distance" value={`${(fleet?.km || 0).toLocaleString('en-IN')} km`} hint="From odometer readings" icon={Route} tone="sky" />
        <StatCard label="Fleet ₹ / km" value={fleet?.costPerKm ? `₹${fleet.costPerKm}` : '—'} icon={Gauge} tone="amber" />
        <StatCard label={`Next year @ +${growthPct}%`} value={inrShort(fleet?.projected)} hint={`Full-year estimate ${inrShort(fleet?.annualised)}`} icon={Fuel} tone="violet" />
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
        {([
          ['log', 'Fuel log'],
          ['vehicles', 'Per vehicle'],
          ['projection', 'Next-year budget'],
        ] as Array<[Tab, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${
              tab === key ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'log' && (
        <CpitlCard
          actions={
            <select
              className={`${inputClass} !mt-0 !w-56 shrink-0`}
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              aria-label="Filter by vehicle"
            >
              <option value="">All vehicles</option>
              {vehicles
                .filter((v) => v._id)
                .map((v) => (
                  <option key={v._id as string} value={v._id as string}>
                    {vehicleLabel(v)}
                  </option>
                ))}
            </select>
          }
          title="Fuel entries"
        >
          {isLoading ? (
            <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />
          ) : logs.length ? (
            <div className="-mx-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-5 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Vehicle</th>
                    <th className="px-3 py-2.5 text-right">Litres</th>
                    <th className="px-3 py-2.5 text-right">Rate</th>
                    <th className="px-3 py-2.5 text-right">Amount</th>
                    <th className="px-3 py-2.5 text-right">Odometer</th>
                    <th className="px-3 py-2.5">Station / bill</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {logs.map((l) => (
                    <tr key={l._id}>
                      <td className="px-5 py-2.5 whitespace-nowrap">{fmtDate(l.date)}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900 dark:text-white">{vehicleLabel(l.vehicleSnapshot)}</div>
                        <div className="text-xs capitalize text-slate-500">
                          {l.fuelType}
                          {l.fullTank ? ' · full tank' : ' · partial'}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{l.litres}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">₹{l.ratePerLitre}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{inr(l.amount)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{l.odometer ? l.odometer.toLocaleString('en-IN') : '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {[l.station, l.billNo].filter(Boolean).join(' · ') || '—'}
                        {l.attachments?.length ? (
                          <a href={l.attachments[0].url} target="_blank" rel="noreferrer" className="ml-1 text-indigo-600 hover:underline">
                            bill
                          </a>
                        ) : null}
                      </td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        <button type="button" className={btnGhost} onClick={() => setModal({ open: true, log: l })}>
                          Edit
                        </button>
                        <button type="button" className={`${btnGhost} text-rose-600`} onClick={() => remove(l)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CpitlEmpty
              message="No fuel entries yet."
              action={
                <button type="button" className={btnPrimary} onClick={() => setModal({ open: true, log: null })}>
                  <Plus className="h-4 w-4" /> Log fuel
                </button>
              }
            />
          )}
        </CpitlCard>
      )}

      {tab === 'vehicles' && (
        <CpitlCard title="Cost per vehicle">
          {analytics?.vehicles.length ? (
            <div className="-mx-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-5 py-2.5">Vehicle</th>
                    <th className="px-3 py-2.5 text-right">Fills</th>
                    <th className="px-3 py-2.5 text-right">Litres</th>
                    <th className="px-3 py-2.5 text-right">Cost</th>
                    <th className="px-3 py-2.5 text-right">Km</th>
                    <th className="px-3 py-2.5 text-right">Km / litre</th>
                    <th className="px-3 py-2.5 text-right">₹ / km</th>
                    <th className="px-3 py-2.5">Monthly cost{monthsAll.length ? ` (${monthLabel(monthsAll[0])}–${monthLabel(monthsAll[monthsAll.length - 1])})` : ''}</th>
                    <th className="px-5 py-2.5">Last fill</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {analytics.vehicles.map((v) => {
                    const byMonth = new Map(v.monthly.map((m) => [m.month, m.amount]))
                    return (
                      <tr key={String(v.vehicleId || v.vehicle.registrationNumber)}>
                        <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-white">{vehicleLabel(v.vehicle)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{v.fills}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{v.litres.toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{inr(v.cost)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{v.km ? v.km.toLocaleString('en-IN') : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" title={v.mileageMethod === 'full_tank' ? 'Full tank to full tank' : 'Odometer span'}>
                          {v.kmpl ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{v.costPerKm ? `₹${v.costPerKm}` : '—'}</td>
                        <td className="px-3 py-2.5">
                          <Sparkline values={monthsAll.map((m) => byMonth.get(m) || 0)} />
                        </td>
                        <td className="px-5 py-2.5 whitespace-nowrap text-slate-500">{fmtDate(v.lastFill)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <CpitlEmpty message="Log fuel with odometer readings to see cost and mileage per vehicle." />
          )}
        </CpitlCard>
      )}

      {tab === 'projection' && (
        <CpitlCard
          title="Next-year fuel budget"
          actions={
            <div className="flex items-end gap-2">
              <Field label="Expected increase (%)" className="w-40">
                <input type="number" className={inputClass} value={growthPct} onChange={(e) => setGrowthPct(Number(e.target.value) || 0)} />
              </Field>
              <button type="button" className={btnSecondary} onClick={download}>
                <Download className="h-4 w-4" /> Excel
              </button>
            </div>
          }
        >
          <p className="mb-4 text-sm text-slate-500">
            Each vehicle's spend is scaled to a full year over the months it has been logged this session, then the expected increase in fuel price and
            usage is added.
          </p>
          {analytics?.vehicles.length ? (
            <div className="-mx-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-5 py-2.5">Vehicle</th>
                    <th className="px-3 py-2.5 text-right">Months logged</th>
                    <th className="px-3 py-2.5 text-right">Spent so far</th>
                    <th className="px-3 py-2.5 text-right">Full-year estimate</th>
                    <th className="px-5 py-2.5 text-right">Next year budget</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-700">
                  {analytics.vehicles.map((v) => (
                    <tr key={String(v.vehicleId || v.vehicle.registrationNumber)}>
                      <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-white">{vehicleLabel(v.vehicle)}</td>
                      <td className="px-3 py-2.5 text-right">{v.monthsLogged}</td>
                      <td className="px-3 py-2.5 text-right">{inr(v.cost)}</td>
                      <td className="px-3 py-2.5 text-right">{inr(v.annualised)}</td>
                      <td className="px-5 py-2.5 text-right font-semibold">{inr(v.projected)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 font-semibold tabular-nums dark:border-slate-600">
                  <tr>
                    <td className="px-5 py-2.5">Fleet</td>
                    <td />
                    <td className="px-3 py-2.5 text-right">{inr(fleet?.cost)}</td>
                    <td className="px-3 py-2.5 text-right">{inr(fleet?.annualised)}</td>
                    <td className="px-5 py-2.5 text-right">{inr(fleet?.projected)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <CpitlEmpty message="No fuel data yet." />
          )}
        </CpitlCard>
      )}

      <FuelEntryModal isOpen={modal.open} onClose={() => setModal({ open: false })} vehicles={vehicles} log={modal.log} onSaved={invalidate} />
    </CpitlPageShell>
  )
}

export default CpitlFuel
