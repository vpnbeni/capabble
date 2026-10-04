import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { IndianRupee } from 'lucide-react'
import Modal from '@/components/common/Modal'
import cpitlService, { Attachment, CapitalExpense, ExpenseCategory, PaymentMode } from '@/services/cpitlService'
import { CategoryIcon } from './IconPicker'
import AttachmentInput from './AttachmentInput'
import { Field, MODE_LABELS, btnPrimary, btnSecondary, errorMessage, inputClass, inr } from './CpitlUi'

export const todayIso = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const MODES: PaymentMode[] = ['cash', 'upi', 'bank_transfer', 'card', 'cheque']

/** Quanto-style quick add: big amount, tap a category, done. */
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
  }, [isOpen, expense, defaultCategoryId])

  const parents = useMemo(() => categories.filter((c) => !c.parentId), [categories])
  const selected = categories.find((c) => c._id === categoryId)
  const selectedParentId = selected?.parentId || selected?._id
  const children = useMemo(() => categories.filter((c) => c.parentId && c.parentId === selectedParentId), [categories, selectedParentId])
  const numeric = Number(amount)

  const save = async () => {
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={expense ? 'Edit expense' : 'Add expense'} size="lg">
      <div className="space-y-5">
        <div className="rounded-2xl p-4 text-center transition-colors" style={{ backgroundColor: `${selected?.color || '#6366f1'}14` }}>
          <div className="flex items-center justify-center gap-1">
            <IndianRupee className="h-8 w-8 text-slate-400" />
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              autoFocus
              aria-label="Amount"
              className="w-56 bg-transparent text-center text-5xl font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-300 dark:text-white"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">{selected ? selected.name : 'Pick a category below'}</p>
        </div>

        <div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2">
            {parents.map((c) => {
              const on = c._id === selectedParentId
              return (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => setCategoryId(c._id)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition ${
                    on ? 'border-transparent ring-2' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/40'
                  }`}
                  style={on ? { backgroundColor: `${c.color}14`, ['--tw-ring-color' as string]: c.color } : undefined}
                >
                  <CategoryIcon icon={c.icon} color={c.color} />
                  <span className="line-clamp-2 text-[11px] font-medium leading-tight text-slate-700 dark:text-slate-200">{c.name}</span>
                </button>
              )
            })}
          </div>
          {children.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="self-center text-xs text-slate-500">Sub-category:</span>
              {children.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => setCategoryId(c._id === categoryId ? (selectedParentId as string) : c._id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                    c._id === categoryId ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                  }`}
                  style={c._id === categoryId ? { backgroundColor: c.color } : undefined}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            <input type="date" className={inputClass} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Paid to">
            <input className={inputClass} value={payee} placeholder="Vendor / shop" onChange={(e) => setPayee(e.target.value)} />
          </Field>
          <Field label="Description" className="col-span-2">
            <input className={inputClass} value={title} placeholder={selected?.name || 'What was it for?'} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="col-span-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Paid by</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    mode === m ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200' : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                  }`}
                >
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
          {mode !== 'cash' ? (
            <Field label="Reference / UTR / cheque no." className="col-span-2">
              <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
          ) : null}
          <Field label="Notes" className="col-span-2">
            <input className={inputClass} value={notes} placeholder="Optional" onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <div className="col-span-2">
            <AttachmentInput value={attachments} onChange={setAttachments} />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} disabled={saving} onClick={save}>
            {saving ? 'Saving…' : expense ? 'Save changes' : `Add ${numeric > 0 ? inr(numeric) : 'expense'}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default QuickExpenseSheet
