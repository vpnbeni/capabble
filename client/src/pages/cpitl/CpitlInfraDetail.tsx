import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Check, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import Modal from '@/components/common/Modal'
import { useInfraProject, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { Attachment, InfraProject, PaymentMode } from '@/services/cpitlService'
import AttachmentInput from '@/components/cpitl/AttachmentInput'
import { todayIso } from '@/components/cpitl/QuickExpenseSheet'
import { INFRA_STATUS, INFRA_TYPES, ProjectFormModal } from './CpitlInfra'
import {
  CpitlBadge,
  CpitlCard,
  CpitlEmpty,
  CpitlPageShell,
  Field,
  MODE_LABELS,
  UsageBar,
  btnGhost,
  btnPrimary,
  btnSecondary,
  errorMessage,
  fmtDate,
  inputClass,
  inr,
} from '@/components/cpitl/CpitlUi'

const PaymentModal: React.FC<{ isOpen: boolean; onClose: () => void; project: InfraProject; onSaved: () => void }> = ({ isOpen, onClose, project, onSaved }) => {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [mode, setMode] = useState<PaymentMode>('bank_transfer')
  const [payee, setPayee] = useState(project.vendor || '')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await cpitlService.addInfraPayment(project._id, { amount: Number(amount), date, mode, payee, reference, notes, attachments })
      toast.success('Payment recorded.')
      onSaved()
      onClose()
      setAmount('')
      setReference('')
      setNotes('')
      setAttachments([])
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Payment — ${project.title}`}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Amount (₹)">
          <input type="number" min={0} autoFocus className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Date">
          <input type="date" className={inputClass} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Paid to">
          <input className={inputClass} value={payee} onChange={(e) => setPayee(e.target.value)} />
        </Field>
        <Field label="Mode">
          <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)}>
            {(['bank_transfer', 'cheque', 'upi', 'cash', 'dd'] as PaymentMode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference / cheque no." className="col-span-2">
          <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
        <Field label="What was this for?" className="col-span-2">
          <input className={inputClass} value={notes} placeholder="e.g. 2nd running bill — plinth work" onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="col-span-2">
          <AttachmentInput value={attachments} onChange={setAttachments} label="Attach invoice / RA bill" />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={btnPrimary} disabled={saving || !(Number(amount) > 0)} onClick={save}>
          Record payment
        </button>
      </div>
    </Modal>
  )
}

const CpitlInfraDetail: React.FC = () => {
  const { id } = useParams()
  const invalidate = useInvalidateCpitl()
  const { data: project, isLoading } = useInfraProject(id)
  const [editOpen, setEditOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [milestone, setMilestone] = useState('')
  const [milestoneDue, setMilestoneDue] = useState('')

  if (isLoading) return <CpitlPageShell><div className="h-80 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" /></CpitlPageShell>
  if (!project) return <CpitlPageShell><CpitlEmpty message="Project not found." /></CpitlPageShell>

  const payments = project.payments || []
  const pct = project.sanctionedBudget > 0 ? (project.spent / project.sanctionedBudget) * 100 : null

  const patch = async (payload: Partial<InfraProject>, message = 'Saved.') => {
    try {
      await cpitlService.saveInfraProject({ _id: project._id, ...payload })
      toast.success(message)
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  const addMilestone = () => {
    if (!milestone.trim()) return
    patch({ milestones: [...project.milestones, { title: milestone.trim(), dueDate: milestoneDue || null, done: false }] }, 'Milestone added.')
    setMilestone('')
    setMilestoneDue('')
  }

  const voidPayment = async (paymentId: string) => {
    const reason = window.prompt('Void this payment? Reason:')
    if (!reason?.trim()) return
    try {
      await cpitlService.voidExpense(paymentId, reason)
      toast.success('Payment voided.')
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  return (
    <CpitlPageShell
      title={project.title}
      subtitle={`${INFRA_TYPES[project.type]}${project.vendor ? ` · ${project.vendor}` : ''}`}
      actions={
        <>
          <CpitlBadge status={INFRA_STATUS[project.status].badge} label={INFRA_STATUS[project.status].label} />
          <button type="button" className={btnSecondary} onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> Edit
          </button>
          <button type="button" className={btnPrimary} onClick={() => setPayOpen(true)}>
            <Plus className="h-4 w-4" /> Payment
          </button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <CpitlCard className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Sanctioned</p>
              <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{project.sanctionedBudget ? inr(project.sanctionedBudget) : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Spent</p>
              <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{inr(project.spent)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Remaining</p>
              <p className={`text-lg font-semibold tabular-nums ${project.spent > project.sanctionedBudget && project.sanctionedBudget ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                {project.sanctionedBudget ? inr(project.sanctionedBudget - project.spent) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Timeline</p>
              <p className="text-sm text-slate-900 dark:text-white">
                {fmtDate(project.startDate)} → {fmtDate(project.completedDate || project.targetDate)}
              </p>
            </div>
          </div>
          {pct !== null ? <UsageBar pct={pct} className="mt-4" /> : null}
          {project.locationText ? (
            <p className="mt-4 flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
              <MapPin className="h-4 w-4" /> {project.locationText}
            </p>
          ) : null}
          {project.description ? <p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{project.description}</p> : null}
        </CpitlCard>

        <CpitlCard title="Milestones">
          <ul className="space-y-2">
            {project.milestones.map((m, i) => (
              <li key={m._id || i} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={m.done ? 'Mark not done' : 'Mark done'}
                  onClick={() => patch({ milestones: project.milestones.map((x, idx) => (idx === i ? { ...x, done: !x.done } : x)) })}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${m.done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 dark:border-slate-500'}`}
                >
                  {m.done ? <Check className="h-3.5 w-3.5" /> : null}
                </button>
                <span className={`flex-1 text-sm ${m.done ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-slate-100'}`}>{m.title}</span>
                {m.dueDate ? <span className="text-xs text-slate-400">{fmtDate(m.dueDate)}</span> : null}
                <button
                  type="button"
                  aria-label="Remove milestone"
                  className="text-slate-300 hover:text-rose-600"
                  onClick={() => patch({ milestones: project.milestones.filter((_, idx) => idx !== i) })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-2">
            <input className={`${inputClass} mt-0`} placeholder="Add milestone" value={milestone} onChange={(e) => setMilestone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMilestone()} />
            <div className="flex gap-2">
              <input type="date" aria-label="Milestone due date" className={`${inputClass} mt-0 min-w-0 flex-1`} value={milestoneDue} onChange={(e) => setMilestoneDue(e.target.value)} />
              <button type="button" className={btnSecondary} onClick={addMilestone} disabled={!milestone.trim()}>
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
          </div>
        </CpitlCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <CpitlCard title="Payments" className="lg:col-span-2">
          {payments.length ? (
            <ol className="relative ml-2 border-l border-slate-200 dark:border-slate-700">
              {payments.map((p) => (
                <li key={p._id} className={`mb-5 ml-5 ${p.status === 'void' ? 'opacity-50' : ''}`}>
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-indigo-500 dark:border-slate-800" />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className={`font-semibold tabular-nums text-slate-900 dark:text-white ${p.status === 'void' ? 'line-through' : ''}`}>{inr(p.amount)}</span>
                    <span className="text-xs text-slate-500">{fmtDate(p.date)}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{p.notes || 'Payment'}</p>
                  <p className="text-xs text-slate-400">
                    {[p.payee, MODE_LABELS[p.mode] || p.mode, p.reference].filter(Boolean).join(' · ')}
                    {p.status === 'void' ? ` · Void: ${p.voidReason}` : ''}
                  </p>
                  <div className="mt-1 flex gap-1">
                    {p.attachments?.map((a) => (
                      <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className={btnGhost}>
                        {a.name}
                      </a>
                    ))}
                    {p.status === 'valid' ? (
                      <button type="button" className={`${btnGhost} text-rose-600`} onClick={() => voidPayment(p._id)}>
                        Void
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <CpitlEmpty message="No payments yet." />
          )}
        </CpitlCard>

        <CpitlCard title="Documents">
          <p className="mb-3 text-xs text-slate-500">Sanction letter, drawings, estimates, completion certificate…</p>
          <AttachmentInput value={project.documents || []} onChange={(documents) => patch({ documents }, 'Documents updated.')} label="Add document" />
        </CpitlCard>
      </div>

      <ProjectFormModal isOpen={editOpen} onClose={() => setEditOpen(false)} project={project} onSaved={invalidate} />
      <PaymentModal isOpen={payOpen} onClose={() => setPayOpen(false)} project={project} onSaved={invalidate} />
    </CpitlPageShell>
  )
}

export default CpitlInfraDetail
