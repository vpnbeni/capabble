import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Receipt } from 'lucide-react'
import cpitlService, { Attachment, CapitalExpense, ExpenseCategory, PaymentMode } from '@/services/cpitlService'
import { Button, Sheet, TextField, cx } from '@/components/ui'
import { CategoryIcon, catStyle } from './IconPicker'
import AttachmentInput from './AttachmentInput'
import { MODE_LABELS, errorMessage, inr } from './CpitlUi'
import './expenses.css'

export const todayIso = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const MODES: PaymentMode[] = ['cash', 'upi', 'bank_transfer', 'card', 'cheque']

/** Quick add: big amount, tap a category, done. A kit Sheet (portalled, scroll-locked, Escape closes). */
const QuickExpenseSheet: React.FC<{
  isOpen: boolean
  onClose: () => void
  categories: ExpenseCategory[]
  expense?: CapitalExpense | null
  defaultCategoryId?: string | null
  onSaved: () => void
}> = ({ isOpen, onClose, categories, expense, defaultCategoryId, onSaved }) => {
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [date, setDate] = useState(todayIso())
  const [payee, setPayee] = useState('')
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<PaymentMode>('cash')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setAmount(expense ? String(expense.amount) : '')
    setCategoryId(expense?.categoryId || defaultCategoryId || null)
    setDate(expense ? expense.date.slice(0, 10) : todayIso())
    setPayee(expense?.payee || '')
    setTitle(expense?.title || '')
    setMode((expense?.mode as PaymentMode) || 'cash')
    setReference(expense?.reference || '')
    setNotes(expense?.notes || '')
    setAttachments(expense?.attachments || [])
    setTried(false)
  }, [isOpen, expense, defaultCategoryId])

  const parents = useMemo(() => categories.filter((c) => !c.parentId), [categories])
  const selected = categories.find((c) => c._id === categoryId)
  const selectedParentId = selected?.parentId || selected?._id
  const children = useMemo(() => categories.filter((c) => c.parentId && c.parentId === selectedParentId), [categories, selectedParentId])
  const numeric = Number(amount)

  const save = async () => {
    setTried(true)
    if (!(numeric > 0)) {
      toast.error('Enter an amount.')
      return
    }
    if (!categoryId) {
      toast.error('Pick a category.')
      return
    }
    setSaving(true)
    try {
      await cpitlService.saveExpense({
        _id: expense?._id,
        amount: numeric,
        categoryId,
        date,
        payee,
        title: title || selected?.name || '',
        mode,
        reference,
        notes,
        attachments,
      })
      toast.success(expense ? 'Expense updated.' : `${inr(numeric)} added to ${selected?.name}.`)
      onSaved()
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const amountError = tried && !(numeric > 0)
  const categoryError = tried && !categoryId

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      title={expense ? 'Edit expense' : 'Add expense'}
      description={expense ? 'Changes update the operating costs ledger.' : 'Enter the amount, pick a category and save.'}
      icon={Receipt}
      size="lg"
      onSubmit={(event) => {
        event.preventDefault()
        if (!saving) void save()
      }}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {expense ? 'Save changes' : `Add ${numeric > 0 ? inr(numeric) : 'expense'}`}
          </Button>
        </>
      }
    >
      <div className="ce-amount" style={catStyle(selected?.color)}>
        <div className="ce-amount__row">
          <span className="ce-amount__currency" aria-hidden="true">
            ₹
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            autoFocus
            aria-label="Amount in rupees"
            aria-invalid={amountError || undefined}
            className="ce-amount__input"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <p className={cx('ce-amount__hint', amountError && 'is-error')}>
          {amountError ? 'Enter an amount above ₹0.' : selected ? selected.name : 'Pick a category below'}
        </p>
      </div>

      <fieldset className="ce-group">
        <legend className="ce-group__label">
          Category<span className="ce-req" aria-hidden="true"> *</span>
        </legend>
        <div className="ce-cats">
          {parents.map((c) => {
            const on = c._id === selectedParentId
            return (
              <button
                key={c._id}
                type="button"
                aria-pressed={on}
                onClick={() => setCategoryId(c._id)}
                className={cx('ce-cat', on && 'is-active')}
                style={catStyle(c.color)}
              >
                <CategoryIcon icon={c.icon} color={c.color} />
                <span className="ce-cat__name">{c.name}</span>
              </button>
            )
          })}
        </div>
        {categoryError ? <p className="ce-amount__hint is-error">Pick a category.</p> : null}
        {!parents.length ? <p className="ce-hint">No categories yet. Add them from Manage categories.</p> : null}
      </fieldset>

      {children.length ? (
        <fieldset className="ce-group">
          <legend className="ce-group__label">Sub-category</legend>
          <div className="ce-chips">
            {children.map((c) => {
              const on = c._id === categoryId
              return (
                <button
                  key={c._id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setCategoryId(on ? (selectedParentId as string) : c._id)}
                  className={cx('cb-chip', on && 'is-active')}
                >
                  <span className="ce-chip-dot" style={catStyle(c.color)} aria-hidden="true" />
                  {c.name}
                </button>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="cb-form-grid">
        <TextField label="Date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        <TextField label="Paid to" value={payee} placeholder="Vendor or shop" onChange={(e) => setPayee(e.target.value)} />
        <TextField
          className="is-wide"
          label="Description"
          value={title}
          placeholder={selected?.name || 'What was it for?'}
          onChange={(e) => setTitle(e.target.value)}
        />
        <fieldset className="ce-group is-wide">
          <legend className="ce-group__label">Paid by</legend>
          <div className="ce-chips">
            {MODES.map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={cx('cb-chip', mode === m && 'is-active')}>
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </fieldset>
        {mode !== 'cash' ? (
          <TextField className="is-wide" label="Reference, UTR or cheque no." value={reference} onChange={(e) => setReference(e.target.value)} />
        ) : null}
        <TextField className="is-wide" label="Notes" value={notes} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} />
        <div className="is-wide">
          <AttachmentInput value={attachments} onChange={setAttachments} />
        </div>
      </div>
    </Sheet>
  )
}

export default QuickExpenseSheet
