import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertCircle, CheckCircle2, IndianRupee, Printer } from 'lucide-react'
import { Button, Checkbox, Icon, Sheet, TextField, cx } from '@/components/ui'
import cpitlService, { FeeDemand, FeePayment, PaymentMode, StudentAccount } from '@/services/cpitlService'
import { MODE_LABELS, errorMessage, fmtDate, inr } from './CpitlUi'
import './collection.css'

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

/** "Collect fee" form, shown as a kit Sheet. Keeps its historical name so callers don't change. */
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
  const [saved, setSaved] = useState<FeePayment | null>(null)
  const [printing, setPrinting] = useState(false)

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
    setSaved(null)
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
  const overLimit = amount > outstanding + 0.001
  const invalid = amount < 0 || overLimit || amount + lateFee <= 0 || (isCheque && !chequeNo.trim())
  const total = (amount || 0) + (lateFee || 0)

  const openReceipt = async (payment: FeePayment) => {
    setPrinting(true)
    try {
      await cpitlService.openReceipt(payment)
    } catch (error) {
      toast.error(await errorMessage(error, 'Could not open receipt.'))
    } finally {
      setPrinting(false)
    }
  }

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault()
    if (invalid || saving) return
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
      setSaved(payment)
      if (printReceipt) void openReceipt(payment)
    } catch (error) {
      toast.error(await errorMessage(error, 'Payment could not be recorded.'))
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    return (
      <Sheet
        open={isOpen}
        onClose={onClose}
        icon={IndianRupee}
        size="lg"
        title="Payment recorded"
        description={data.student.name}
        footer={
          <>
            <Button onClick={onClose}>Done</Button>
            <Button variant="primary" icon={Printer} loading={printing} onClick={() => openReceipt(saved)}>
              Print receipt
            </Button>
          </>
        }
      >
        <div className="cc-done" role="status">
          <span className="cc-done__icon" aria-hidden="true">
            <Icon icon={CheckCircle2} size={24} />
          </span>
          <p className="cc-done__amount">{inr(saved.total, { decimals: true })}</p>
          <p className="cc-done__text">
            Receipt <strong className="cc-code">{saved.receiptNo}</strong> · {MODE_LABELS[saved.mode]} · {fmtDate(saved.date)}
          </p>
          {printReceipt ? <p className="cc-done__text">The receipt opens in a new tab. Print it again any time from here or from Receipts.</p> : null}
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      icon={IndianRupee}
      size="lg"
      title="Collect fee"
      description={`${data.student.name} · Class ${data.student.class}${data.student.section ? `-${data.student.section}` : ''} · Roll ${data.student.rollNumber}`}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" icon={IndianRupee} disabled={invalid} loading={saving}>
            {`Receive ${inr(total)}`}
          </Button>
        </>
      }
    >
      <dl className="cc-pay__summary">
        <div className="cc-pay__metric">
          <dt>Outstanding</dt>
          <dd>{inr(outstanding)}</dd>
        </div>
        <div className={cx('cc-pay__metric', overdueTotal > 0 && 'is-danger')}>
          <dt>Overdue</dt>
          <dd>{inr(overdueTotal)}</dd>
        </div>
        <div className="cc-pay__metric">
          <dt>Late fee due</dt>
          <dd>{inr(suggestedLateFee)}</dd>
        </div>
      </dl>

      <div className={cx('cc-amount', overLimit && 'is-invalid')}>
        <label className="cc-amount__label" htmlFor="cc-amount-input">
          Amount towards fees
        </label>
        <div className="cc-amount__row">
          <span className="cc-amount__currency" aria-hidden="true">
            ₹
          </span>
          <input
            id="cc-amount-input"
            className="cc-amount__input"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            autoFocus
            value={amount || ''}
            placeholder="0"
            aria-invalid={overLimit || undefined}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </div>
        {quickPicks.length ? (
          <div className="cc-picks" role="group" aria-label="Quick amounts">
            {quickPicks.map((p) => (
              <button
                key={p.label}
                type="button"
                className={cx('cb-chip', amount === p.value && 'is-active')}
                aria-pressed={amount === p.value}
                onClick={() => setAmount(p.value)}
              >
                {p.label} · <span className="is-num">{inr(p.value)}</span>
              </button>
            ))}
          </div>
        ) : null}
        {overLimit ? (
          <p className="cc-amount__error" role="alert">
            <Icon icon={AlertCircle} size={14} />
            Amount is more than the outstanding {inr(outstanding)}.
          </p>
        ) : null}
      </div>

      <fieldset className="cc-group">
        <legend>Payment mode</legend>
        <div className="cc-modes" role="radiogroup" aria-label="Payment mode">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              className={cx('cc-mode', mode === m && 'is-on')}
              onClick={() => setMode(m)}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="cb-form-grid">
        <TextField label="Payment date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        <TextField
          label="Late fee or fine"
          type="number"
          min={0}
          prefix="₹"
          value={lateFee}
          hint={suggestedLateFee > 0 ? `Suggested ${inr(suggestedLateFee)}` : undefined}
          onChange={(e) => setLateFee(Number(e.target.value))}
        />
        {isCheque ? (
          <>
            <TextField
              label={mode === 'dd' ? 'DD number' : 'Cheque number'}
              required
              value={chequeNo}
              hint={!chequeNo.trim() ? 'Required for cheque and DD payments' : undefined}
              onChange={(e) => setChequeNo(e.target.value)}
            />
            <TextField label="Bank" value={chequeBank} onChange={(e) => setChequeBank(e.target.value)} />
          </>
        ) : needsRef ? (
          <TextField
            label="Transaction or UTR reference"
            className="is-wide"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        ) : null}
        <TextField label="Remarks" className="is-wide" value={remarks} placeholder="Optional" onChange={(e) => setRemarks(e.target.value)} />
      </div>

      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Applied to (oldest first)</h3>
        <ul className="cc-alloc">
          {allocation.map(({ demand, amount: applied }) => (
            <li key={demand._id} className={applied > 0 ? undefined : 'is-skipped'}>
              <div className="cc-cell">
                <span className="cc-alloc__label">{demand.label}</span>
                <span className={cx('cc-alloc__due', demand.isOverdue && 'is-overdue')}>
                  {demand.isOverdue ? 'Overdue · ' : ''}Due {fmtDate(demand.dueDate)} · {inr(demand.balance)} open
                </span>
              </div>
              <span className="cc-alloc__amount">{applied > 0 ? inr(applied) : '—'}</span>
            </li>
          ))}
          {!allocation.length ? <li className="cc-alloc__empty">No open installments.</li> : null}
        </ul>
      </div>

      <div className="cc-total" aria-live="polite">
        <div className="cc-total__row">
          <span>Fees</span>
          <span>{inr(amount, { decimals: true })}</span>
        </div>
        {lateFee > 0 ? (
          <div className="cc-total__row">
            <span>Late fee</span>
            <span>{inr(lateFee, { decimals: true })}</span>
          </div>
        ) : null}
        <div className="cc-total__row is-grand">
          <span>Total received</span>
          <span>{inr(total, { decimals: true })}</span>
        </div>
        <div className="cc-total__row">
          <span>Balance after</span>
          <span>{inr(Math.max(0, outstanding - (amount || 0)))}</span>
        </div>
      </div>

      <Checkbox label="Open receipt after saving" checked={printReceipt} onChange={setPrintReceipt} />
    </Sheet>
  )
}

export default CollectPaymentModal
