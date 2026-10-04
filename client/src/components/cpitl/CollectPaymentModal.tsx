import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { IndianRupee } from 'lucide-react'
import Modal from '@/components/common/Modal'
import cpitlService, { FeeDemand, PaymentMode, StudentAccount } from '@/services/cpitlService'
import { Field, MODE_LABELS, btnPrimary, btnSecondary, errorMessage, fmtDate, inputClass, inr } from './CpitlUi'

const MODES: PaymentMode[] = ['cash', 'upi', 'cheque', 'dd', 'bank_transfer', 'card']

const todayIso = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Preview of oldest-first allocation, mirroring the server's allocatePayment. */
const previewAllocation = (demands: FeeDemand[], amount: number) => {
  let left = amount
  return demands.map((d) => {
    const take = Math.max(0, Math.min(d.balance, left))
    left = Math.round((left - take) * 100) / 100
    return { demand: d, amount: take }
  })
}

const CollectPaymentModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  data: StudentAccount
  onCollected: () => void
}> = ({ isOpen, onClose, data, onCollected }) => {
  const openDemands = useMemo(
    () => data.demands.filter((d) => (d.status === 'due' || d.status === 'partial') && d.balance > 0),
    [data.demands]
  )
  const overdue = useMemo(() => openDemands.filter((d) => d.isOverdue), [openDemands])
  const outstanding = openDemands.reduce((s, d) => s + d.balance, 0)
  const overdueTotal = overdue.reduce((s, d) => s + d.balance, 0)
  const suggestedLateFee = openDemands.reduce((s, d) => s + (d.lateFeeDue || 0), 0)

  const [amount, setAmount] = useState(0)
  const [lateFee, setLateFee] = useState(0)
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [date, setDate] = useState(todayIso())
  const [reference, setReference] = useState('')
  const [chequeNo, setChequeNo] = useState('')
  const [chequeBank, setChequeBank] = useState('')
  const [remarks, setRemarks] = useState('')
  const [printReceipt, setPrintReceipt] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const firstDue = openDemands[0]?.balance || 0
    setAmount(overdueTotal > 0 ? overdueTotal : firstDue)
    setLateFee(suggestedLateFee)
    setMode('cash')
    setDate(todayIso())
    setReference('')
    setChequeNo('')
    setChequeBank('')
    setRemarks('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const allocation = useMemo(() => previewAllocation(openDemands, amount || 0), [openDemands, amount])
  const quickPicks = useMemo(() => {
    const picks: Array<{ label: string; value: number }> = []
    if (overdueTotal > 0) picks.push({ label: 'Overdue', value: overdueTotal })
    let running = 0
    openDemands.slice(0, 4).forEach((d) => {
      running += d.balance
      picks.push({ label: `Till ${d.label}`, value: Math.round(running * 100) / 100 })
    })
    if (outstanding > running) picks.push({ label: 'Full session', value: Math.round(outstanding * 100) / 100 })
    const seen = new Set<number>()
    return picks.filter((p) => (seen.has(p.value) ? false : (seen.add(p.value), true)))
  }, [openDemands, overdueTotal, outstanding])

  const needsRef = mode === 'upi' || mode === 'bank_transfer' || mode === 'card'
  const isCheque = mode === 'cheque' || mode === 'dd'
  const invalid = amount < 0 || amount > outstanding + 0.001 || amount + lateFee <= 0 || (isCheque && !chequeNo.trim())

  const submit = async () => {
    if (invalid) return
    setSaving(true)
    try {
      const payment = await cpitlService.collectPayment(data.student._id, {
        amount,
        lateFee,
        mode,
        date,
        reference: isCheque ? chequeNo : reference,
        remarks,
        ...(isCheque ? { cheque: { number: chequeNo, bank: chequeBank } } : {}),
      })
      toast.success(`Receipt ${payment.receiptNo} generated.`)
      onCollected()
      onClose()
      if (printReceipt) {
        cpitlService.openReceipt(payment).catch(async (error) => toast.error(await errorMessage(error, 'Could not open receipt.')))
      }
    } catch (error) {
      toast.error(await errorMessage(error, 'Payment could not be recorded.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Collect fee — ${data.student.name}`} size="xl">
      <div className="grid gap-6 md:grid-cols-5">
        <div className="space-y-4 md:col-span-3">
          <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900/40">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Amount towards fees</label>
            <div className="mt-1 flex items-center gap-2">
              <IndianRupee className="h-7 w-7 text-slate-400" />
              <input
                type="number"
                min={0}
                step="0.01"
                autoFocus
                className="w-full bg-transparent text-4xl font-semibold tabular-nums text-slate-900 outline-none dark:text-white"
                value={amount || ''}
                placeholder="0"
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {quickPicks.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setAmount(p.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    amount === p.value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {p.label} · {inr(p.value)}
                </button>
              ))}
            </div>
            {amount > outstanding + 0.001 ? (
              <p className="mt-2 text-xs text-rose-600">Amount is more than the outstanding {inr(outstanding)}.</p>
            ) : null}
          </div>

          <div>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Payment mode</span>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                    mode === m
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:text-slate-300'
                  }`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Payment date">
              <input type="date" className={inputClass} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Late fee / fine (₹)" hint={suggestedLateFee > 0 ? `Suggested ${inr(suggestedLateFee)}` : undefined}>
              <input type="number" min={0} className={inputClass} value={lateFee} onChange={(e) => setLateFee(Number(e.target.value))} />
            </Field>
            {isCheque ? (
              <>
                <Field label={mode === 'dd' ? 'DD number' : 'Cheque number'}>
                  <input className={inputClass} value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
                </Field>
                <Field label="Bank">
                  <input className={inputClass} value={chequeBank} onChange={(e) => setChequeBank(e.target.value)} />
                </Field>
              </>
            ) : needsRef ? (
              <Field label="Transaction / UTR reference" className="col-span-2">
                <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            ) : null}
            <Field label="Remarks" className="col-span-2">
              <input className={inputClass} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional" />
            </Field>
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Applied to</h4>
            <ul className="mt-3 space-y-2 text-sm">
              {allocation.map(({ demand, amount: applied }) => (
                <li key={demand._id} className={`flex items-center justify-between gap-2 ${applied > 0 ? '' : 'opacity-40'}`}>
                  <div>
                    <div className="font-medium text-slate-800 dark:text-slate-100">{demand.label}</div>
                    <div className={`text-xs ${demand.isOverdue ? 'text-rose-600' : 'text-slate-500'}`}>
                      Due {fmtDate(demand.dueDate)} · {inr(demand.balance)} open
                    </div>
                  </div>
                  <span className="tabular-nums">{applied > 0 ? inr(applied) : '—'}</span>
                </li>
              ))}
              {!allocation.length ? <li className="text-slate-500">No open installments.</li> : null}
            </ul>
            <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-700">
              <div className="flex justify-between text-slate-500">
                <span>Fees</span>
                <span className="tabular-nums">{inr(amount, { decimals: true })}</span>
              </div>
              {lateFee > 0 ? (
                <div className="flex justify-between text-slate-500">
                  <span>Late fee</span>
                  <span className="tabular-nums">{inr(lateFee, { decimals: true })}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-semibold text-slate-900 dark:text-white">
                <span>Total received</span>
                <span className="tabular-nums">{inr((amount || 0) + (lateFee || 0), { decimals: true })}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Balance after</span>
                <span className="tabular-nums">{inr(Math.max(0, outstanding - (amount || 0)))}</span>
              </div>
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600" checked={printReceipt} onChange={(e) => setPrintReceipt(e.target.checked)} />
            Open receipt after saving
          </label>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={btnPrimary} disabled={invalid || saving} onClick={submit}>
          {saving ? 'Saving…' : `Receive ${inr((amount || 0) + (lateFee || 0))}`}
        </button>
      </div>
    </Modal>
  )
}

export default CollectPaymentModal
