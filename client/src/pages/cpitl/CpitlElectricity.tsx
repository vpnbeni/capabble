import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CheckCircle2, Pencil, Plus, Zap } from 'lucide-react'
import Modal from '@/components/common/Modal'
import { useAssetLocations, useElectricityAnalytics, useElectricityBills, useElectricityConnections, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { Attachment, ElectricityBill, ElectricityConnection, PaymentMode } from '@/services/cpitlService'
import AttachmentInput from '@/components/cpitl/AttachmentInput'
import { todayIso } from '@/components/cpitl/QuickExpenseSheet'
import { INCOME_COLOR, EXPENSE_COLOR } from './CpitlExpenses'
import {
  CpitlBadge,
  CpitlCard,
  CpitlEmpty,
  CpitlPageShell,
  Field,
  MODE_LABELS,
  MONTHS,
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

const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${MONTHS[(m || 1) - 1]} ${y}`
}
const currentMonth = () => todayIso().slice(0, 7)

const ConnectionModal: React.FC<{ isOpen: boolean; onClose: () => void; connection?: ElectricityConnection | null; onSaved: () => void }> = ({
  isOpen,
  onClose,
  connection,
  onSaved,
}) => {
  const { data: locations = [] } = useAssetLocations()
  const [form, setForm] = useState<Partial<ElectricityConnection>>({})
  useEffect(() => {
    if (isOpen) setForm(connection || { name: '', consumerNo: '', meterNo: '', provider: '', locationId: null, locationText: '', sanctionedLoadKw: 0 })
  }, [isOpen, connection])
  const save = async () => {
    if (!form.name?.trim()) {
      toast.error('Name the connection, e.g. "Main Block".')
      return
    }
    try {
      await cpitlService.saveElectricityConnection(form)
      toast.success('Connection saved.')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={form._id ? 'Edit connection' : 'New electricity connection'}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Name" className="col-span-2">
          <input className={inputClass} value={form.name || ''} placeholder="Main Block / Hostel / Sports complex" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Consumer / account no.">
          <input className={inputClass} value={form.consumerNo || ''} onChange={(e) => setForm({ ...form, consumerNo: e.target.value })} />
        </Field>
        <Field label="Meter no.">
          <input className={inputClass} value={form.meterNo || ''} onChange={(e) => setForm({ ...form, meterNo: e.target.value })} />
        </Field>
        <Field label="Provider">
          <input className={inputClass} value={form.provider || ''} placeholder="e.g. DHBVN" onChange={(e) => setForm({ ...form, provider: e.target.value })} />
        </Field>
        <Field label="Sanctioned load (kW)">
          <input type="number" min={0} className={inputClass} value={form.sanctionedLoadKw || ''} onChange={(e) => setForm({ ...form, sanctionedLoadKw: Number(e.target.value) })} />
        </Field>
        {locations.length ? (
          <Field label="Location (from Assets)" className="col-span-2">
            <select className={inputClass} value={form.locationId || ''} onChange={(e) => setForm({ ...form, locationId: e.target.value || null })}>
              <option value="">— Not linked —</option>
              {locations.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.path || l.name} ({l.type})
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Location / area served" className="col-span-2">
          <input className={inputClass} value={form.locationText || ''} onChange={(e) => setForm({ ...form, locationText: e.target.value })} />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={btnPrimary} onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  )
}

type BillDraft = {
  _id?: string
  connectionId: string
  billMonth: string
  billNo: string
  prevReading: string
  currReading: string
  units: string
  amount: string
  dueDate: string
  notes: string
  attachments: Attachment[]
  markPaid: boolean
  paidOn: string
  mode: PaymentMode
  reference: string
}

const BillModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  connections: ElectricityConnection[]
  bill?: ElectricityBill | null
  lastReading: (connectionId: string) => number | null
  onSaved: () => void
}> = ({ isOpen, onClose, connections, bill, lastReading, onSaved }) => {
  const [d, setD] = useState<BillDraft | null>(null)
  const set = (patch: Partial<BillDraft>) => setD((prev) => (prev ? { ...prev, ...patch } : prev))

  useEffect(() => {
    if (!isOpen) return
    const connectionId = bill?.connectionId || connections[0]?._id || ''
    setD({
      _id: bill?._id,
      connectionId,
      billMonth: bill?.billMonth || currentMonth(),
      billNo: bill?.billNo || '',
      prevReading: bill?.prevReading !== null && bill?.prevReading !== undefined ? String(bill.prevReading) : String(lastReading(connectionId) ?? ''),
      currReading: bill?.currReading !== null && bill?.currReading !== undefined ? String(bill.currReading) : '',
      units: bill ? String(bill.units || '') : '',
      amount: bill ? String(bill.amount) : '',
      dueDate: bill?.dueDate ? bill.dueDate.slice(0, 10) : '',
      notes: bill?.notes || '',
      attachments: bill?.attachments || [],
      markPaid: false,
      paidOn: todayIso(),
      mode: 'bank_transfer',
      reference: '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, bill])

  if (!d) return null
  const readingUnits = d.prevReading !== '' && d.currReading !== '' ? Number(d.currReading) - Number(d.prevReading) : null

  const save = async () => {
    try {
      await cpitlService.saveElectricityBill({
        _id: d._id,
        connectionId: d.connectionId,
        billMonth: d.billMonth,
        billNo: d.billNo,
        prevReading: d.prevReading === '' ? null : Number(d.prevReading),
        currReading: d.currReading === '' ? null : Number(d.currReading),
        units: readingUnits !== null ? readingUnits : Number(d.units) || 0,
        amount: Number(d.amount),
        dueDate: d.dueDate || null,
        notes: d.notes,
        attachments: d.attachments,
        ...(d._id ? {} : { markPaid: d.markPaid, paidOn: d.paidOn, mode: d.mode, reference: d.reference }),
      })
      toast.success('Bill saved.')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={d._id ? 'Edit bill' : 'Add electricity bill'} size="lg">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Connection">
          <select
            className={inputClass}
            value={d.connectionId}
            onChange={(e) => set({ connectionId: e.target.value, prevReading: d._id ? d.prevReading : String(lastReading(e.target.value) ?? '') })}
          >
            {connections.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bill month">
          <input type="month" className={inputClass} value={d.billMonth} onChange={(e) => set({ billMonth: e.target.value })} />
        </Field>
        <Field label="Previous reading">
          <input type="number" min={0} className={inputClass} value={d.prevReading} onChange={(e) => set({ prevReading: e.target.value })} />
        </Field>
        <Field label="Current reading">
          <input type="number" min={0} className={inputClass} value={d.currReading} onChange={(e) => set({ currReading: e.target.value })} />
        </Field>
        <Field label="Units consumed" hint={readingUnits !== null ? 'Calculated from readings' : undefined}>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={readingUnits !== null ? readingUnits : d.units}
            disabled={readingUnits !== null}
            onChange={(e) => set({ units: e.target.value })}
          />
        </Field>
        <Field label="Bill amount (₹)">
          <input type="number" min={0} step="0.01" className={inputClass} value={d.amount} onChange={(e) => set({ amount: e.target.value })} />
        </Field>
        <Field label="Bill no.">
          <input className={inputClass} value={d.billNo} onChange={(e) => set({ billNo: e.target.value })} />
        </Field>
        <Field label="Due date">
          <input type="date" className={inputClass} value={d.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </Field>
        <div className="col-span-2">
          <AttachmentInput value={d.attachments} onChange={(attachments) => set({ attachments })} label="Attach bill" />
        </div>
        {!d._id ? (
          <div className="col-span-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <input type="checkbox" className="h-4 w-4 rounded" checked={d.markPaid} onChange={(e) => set({ markPaid: e.target.checked })} />
              Already paid
            </label>
            {d.markPaid ? (
              <div className="mt-3 grid grid-cols-3 gap-3">
                <Field label="Paid on">
                  <input type="date" className={inputClass} value={d.paidOn} onChange={(e) => set({ paidOn: e.target.value })} />
                </Field>
                <Field label="Mode">
                  <select className={inputClass} value={d.mode} onChange={(e) => set({ mode: e.target.value as PaymentMode })}>
                    {(['bank_transfer', 'upi', 'cheque', 'cash', 'card'] as PaymentMode[]).map((m) => (
                      <option key={m} value={m}>
                        {MODE_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Reference">
                  <input className={inputClass} value={d.reference} onChange={(e) => set({ reference: e.target.value })} />
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={btnPrimary} onClick={save}>
          Save bill
        </button>
      </div>
    </Modal>
  )
}

const PayModal: React.FC<{ bill: ElectricityBill | null; onClose: () => void; onSaved: () => void }> = ({ bill, onClose, onSaved }) => {
  const [paidOn, setPaidOn] = useState(todayIso())
  const [mode, setMode] = useState<PaymentMode>('bank_transfer')
  const [reference, setReference] = useState('')
  const pay = async () => {
    if (!bill) return
    try {
      await cpitlService.payElectricityBill(bill._id, { paidOn, mode, reference })
      toast.success('Bill marked paid.')
      onSaved()
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }
  return (
    <Modal isOpen={Boolean(bill)} onClose={onClose} title={`Pay ${bill ? inr(bill.amount) : ''} — ${bill?.connectionSnapshot.name || ''}`} size="sm">
      <div className="space-y-4">
        <Field label="Paid on">
          <input type="date" className={inputClass} value={paidOn} max={todayIso()} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <Field label="Mode">
          <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {(['bank_transfer', 'upi', 'cheque', 'cash', 'card'] as PaymentMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference / UTR">
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} onClick={pay}>
            Mark paid
          </button>
        </div>
      </div>
    </Modal>
  )
}

const CpitlElectricity: React.FC = () => {
  const invalidate = useInvalidateCpitl()
  const { data: connections = [] } = useElectricityConnections()
  const { data: bills = [], isLoading } = useElectricityBills()
  const { data: series = [] } = useElectricityAnalytics()
  const [selected, setSelected] = useState<string>('')
  const [connModal, setConnModal] = useState<{ open: boolean; connection?: ElectricityConnection | null }>({ open: false })
  const [billModal, setBillModal] = useState<{ open: boolean; bill?: ElectricityBill | null }>({ open: false })
  const [payBill, setPayBill] = useState<ElectricityBill | null>(null)

  const activeConn = selected || connections[0]?._id || ''
  const unpaid = bills.filter((b) => b.status === 'unpaid')
  const sessionTotal = bills.reduce((s, b) => s + b.amount, 0)
  const sessionUnits = bills.reduce((s, b) => s + (b.units || 0), 0)

  const lastReading = (connectionId: string) => {
    const latest = bills.filter((b) => b.connectionId === connectionId && b.currReading !== null).sort((a, b) => b.billMonth.localeCompare(a.billMonth))[0]
    return latest?.currReading ?? null
  }

  const chartRows = useMemo(() => {
    const s = series.find((x) => x.connectionId === activeConn)
    return (s?.months || []).slice(-12).map((m) => ({ ...m, label: monthLabel(m.month).replace(/ \d{2}(\d{2})$/, " '$1") }))
  }, [series, activeConn])
  const hasLastYear = chartRows.some((r) => r.lastYearUnits !== null)

  const remove = async (b: ElectricityBill) => {
    const reason = window.prompt('Remove this bill? Reason:')
    if (!reason?.trim()) return
    try {
      await cpitlService.removeElectricityBill(b._id, reason)
      toast.success('Bill removed.')
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  return (
    <CpitlPageShell
      title="Electricity"
      subtitle="Bills, units and cost per connection"
      actions={
        <>
          <button type="button" className={btnSecondary} onClick={() => setConnModal({ open: true, connection: null })}>
            <Plus className="h-4 w-4" /> Connection
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={!connections.length}
            title={connections.length ? undefined : 'Add a connection first'}
            onClick={() => setBillModal({ open: true, bill: null })}
          >
            <Plus className="h-4 w-4" /> Add bill
          </button>
        </>
      }
    >
      {!connections.length ? (
        <CpitlEmpty
          message="Add each electricity connection (meter) the school pays for, then log its monthly bills."
          action={
            <button type="button" className={btnPrimary} onClick={() => setConnModal({ open: true, connection: null })}>
              <Plus className="h-4 w-4" /> Add connection
            </button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Billed this session', value: inrShort(sessionTotal) },
              { label: 'Units consumed', value: `${sessionUnits.toLocaleString('en-IN')} kWh` },
              { label: 'Avg ₹ / unit', value: sessionUnits ? `₹${(sessionTotal / sessionUnits).toFixed(2)}` : '—' },
              { label: 'Unpaid bills', value: `${unpaid.length} · ${inrShort(unpaid.reduce((s, b) => s + b.amount, 0))}` },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.label}</p>
                <p className="mt-1.5 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-5">
            <CpitlCard title="Connections" className="lg:col-span-2">
              <ul className="space-y-2">
                {connections.map((c) => {
                  const cBills = bills.filter((b) => b.connectionId === c._id)
                  const on = c._id === activeConn
                  return (
                    <li key={c._id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelected(c._id)}
                        onKeyDown={(e) => e.key === 'Enter' && setSelected(c._id)}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                          on ? 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-500 dark:bg-indigo-900/20' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/40'
                        }`}
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-900/30">
                          <Zap className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{c.name}</div>
                          <div className="truncate text-xs text-slate-500">{[c.consumerNo && `Consumer ${c.consumerNo}`, c.provider, c.locationText].filter(Boolean).join(' · ')}</div>
                        </div>
                        <div className="text-right text-xs">
                          <div className="font-semibold tabular-nums text-slate-900 dark:text-white">{inr(cBills.reduce((s, b) => s + b.amount, 0))}</div>
                          <div className="text-slate-400">{cBills.length} bill(s)</div>
                        </div>
                        <button
                          type="button"
                          className={btnGhost}
                          aria-label={`Edit ${c.name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setConnModal({ open: true, connection: c })
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CpitlCard>

            <CpitlCard title={`Units per month — ${connections.find((c) => c._id === activeConn)?.name || ''}`} className="lg:col-span-3">
              {chartRows.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                      <CartesianGrid vertical={false} strokeOpacity={0.15} />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
                      <Tooltip
                        cursor={{ fillOpacity: 0.06 }}
                        formatter={(value: number, name: string, item) =>
                          name === 'This year' ? [`${value} kWh · ${inr(item?.payload?.amount)}`, name] : [`${value} kWh`, name]
                        }
                      />
                      {hasLastYear ? <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} /> : null}
                      {hasLastYear ? <Bar dataKey="lastYearUnits" name="Last year" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={22} /> : null}
                      <Bar dataKey="units" name="This year" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <CpitlEmpty message="No bills for this connection yet." />
              )}
            </CpitlCard>
          </div>

          <CpitlCard title="Bills this session">
            {isLoading ? (
              <div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700" />
            ) : bills.length ? (
              <div className="-mx-5 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className={tableHead}>
                    <tr>
                      <th className="px-5 py-2.5">Month</th>
                      <th className="px-3 py-2.5">Connection</th>
                      <th className="px-3 py-2.5 text-right">Units</th>
                      <th className="px-3 py-2.5 text-right">Amount</th>
                      <th className="px-3 py-2.5 text-right">₹ / unit</th>
                      <th className="px-3 py-2.5">Due</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-5 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {bills.map((b) => {
                      const overdue = b.status === 'unpaid' && b.dueDate && new Date(b.dueDate) < new Date()
                      return (
                        <tr key={b._id}>
                          <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-white">{monthLabel(b.billMonth)}</td>
                          <td className="px-3 py-2.5">{b.connectionSnapshot.name}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{b.units ? b.units.toLocaleString('en-IN') : '—'}</td>
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{inr(b.amount)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{b.units ? `₹${(b.amount / b.units).toFixed(2)}` : '—'}</td>
                          <td className={`px-3 py-2.5 ${overdue ? 'text-rose-600' : ''}`}>{fmtDate(b.dueDate)}</td>
                          <td className="px-3 py-2.5">
                            <CpitlBadge status={b.status === 'paid' ? 'paid' : overdue ? 'overdue' : 'due'} label={b.status === 'paid' ? `Paid ${fmtDate(b.paidOn)}` : overdue ? 'Overdue' : 'Unpaid'} />
                          </td>
                          <td className="px-5 py-2.5 text-right whitespace-nowrap">
                            {b.attachments?.length ? (
                              <a href={b.attachments[0].url} target="_blank" rel="noreferrer" className={btnGhost}>
                                Bill
                              </a>
                            ) : null}
                            {b.status === 'unpaid' ? (
                              <button type="button" className={`${btnGhost} text-emerald-700`} onClick={() => setPayBill(b)}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Pay
                              </button>
                            ) : null}
                            <button type="button" className={btnGhost} onClick={() => setBillModal({ open: true, bill: b })}>
                              Edit
                            </button>
                            <button type="button" className={`${btnGhost} text-rose-600`} onClick={() => remove(b)}>
                              Remove
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <CpitlEmpty message="No bills logged this session." />
            )}
          </CpitlCard>
        </>
      )}

      <ConnectionModal isOpen={connModal.open} onClose={() => setConnModal({ open: false })} connection={connModal.connection} onSaved={invalidate} />
      <BillModal
        isOpen={billModal.open}
        onClose={() => setBillModal({ open: false })}
        connections={connections}
        bill={billModal.bill}
        lastReading={lastReading}
        onSaved={invalidate}
      />
      <PayModal bill={payBill} onClose={() => setPayBill(null)} onSaved={invalidate} />
    </CpitlPageShell>
  )
}

export default CpitlElectricity
