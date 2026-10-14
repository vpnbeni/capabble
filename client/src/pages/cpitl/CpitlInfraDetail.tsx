import React, { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Ban, FileText, HardHat, MapPin, Paperclip, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import { useInfraProject, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { Attachment, CapitalExpense, InfraProject, PaymentMode } from '@/services/cpitlService'
import { Badge, Button, Card, Checkbox, Dialog, EmptyState, Icon, Page, Progress, Select, Sheet, TextField } from '@/components/ui'
import AttachmentInput from '@/components/cpitl/AttachmentInput'
import { todayIso } from '@/components/cpitl/QuickExpenseSheet'
import { INFRA_TYPES, InfraStatusBadge, ProjectFormModal } from './CpitlInfra'
import { MODE_LABELS, errorMessage, fmtDate, inr } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/expenses.css'

const PAYMENT_MODES: PaymentMode[] = ['bank_transfer', 'cheque', 'upi', 'cash', 'dd']

const PaymentSheet: React.FC<{ isOpen: boolean; onClose: () => void; project: InfraProject; onSaved: () => void }> = ({ isOpen, onClose, project, onSaved }) => {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayIso())
  const [mode, setMode] = useState<PaymentMode>('bank_transfer')
  const [payee, setPayee] = useState(project.vendor || '')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [saving, setSaving] = useState(false)
  const valid = Number(amount) > 0
  const save = async () => {
    if (!valid) return
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
    <Sheet
      open={isOpen}
      onClose={onClose}
      title="Record payment"
      description={project.title}
      icon={Receipt}
      onSubmit={(event) => {
        event.preventDefault()
        if (!saving) void save()
      }}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving} disabled={!valid}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="cb-form-grid">
        <TextField
          label="Amount"
          required
          type="number"
          inputMode="decimal"
          min={0}
          prefix="₹"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <TextField label="Date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        <TextField label="Paid to" value={payee} onChange={(e) => setPayee(e.target.value)} />
        <Select label="Mode" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)} options={PAYMENT_MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))} />
        <TextField className="is-wide" label="Reference or cheque no." value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextField
          className="is-wide"
          label="What was this for?"
          value={notes}
          placeholder="e.g. 2nd running bill — plinth work"
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="is-wide">
          <AttachmentInput value={attachments} onChange={setAttachments} label="Attach invoice or RA bill" />
        </div>
      </div>
    </Sheet>
  )
}

const CpitlInfraDetail: React.FC = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const invalidate = useInvalidateCpitl()
  const { data: project, isLoading } = useInfraProject(id)
  const [editOpen, setEditOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [milestone, setMilestone] = useState('')
  const [milestoneDue, setMilestoneDue] = useState('')
  const [voiding, setVoiding] = useState<CapitalExpense | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidTried, setVoidTried] = useState(false)
  const [voidBusy, setVoidBusy] = useState(false)

  if (isLoading) {
    return (
      <Page>
        <Card>
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading project…
          </div>
        </Card>
      </Page>
    )
  }
  if (!project) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={HardHat}
            title="This project isn’t available"
            body="It may have been removed, or the link is wrong. Find it in the projects list instead."
            action={
              <Button variant="primary" onClick={() => navigate('/cpitl/infra')}>
                Open projects
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  const payments: CapitalExpense[] = Array.isArray(project.payments) ? project.payments : []
  const pct = project.sanctionedBudget > 0 ? (project.spent / project.sanctionedBudget) * 100 : null
  const over = Boolean(project.sanctionedBudget) && project.spent > project.sanctionedBudget
  const doneCount = project.milestones.filter((m) => m.done).length

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

  const openVoid = (p: CapitalExpense) => {
    setVoidReason('')
    setVoidTried(false)
    setVoiding(p)
  }

  const voidPayment = async () => {
    if (!voiding) return
    setVoidTried(true)
    if (!voidReason.trim()) return
    setVoidBusy(true)
    try {
      await cpitlService.voidExpense(voiding._id, voidReason.trim())
      toast.success('Payment voided.')
      setVoiding(null)
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setVoidBusy(false)
    }
  }

  return (
    <Page>
      <Card className="ce-hero-card">
        <div className="ce-hero">
          <span className="ce-hero__tile" aria-hidden="true">
            <Icon icon={HardHat} size={24} />
          </span>
          <div className="ce-hero__main">
            <div className="ce-hero__name">
              <h2>{project.title}</h2>
              <InfraStatusBadge status={project.status} />
              {over ? <Badge tone="danger">Over budget</Badge> : null}
            </div>
            <div className="ce-hero__tags">
              <span>{INFRA_TYPES[project.type]}</span>
              {project.vendor ? (
                <>
                  <span className="ce-hero__sep" aria-hidden="true">·</span>
                  <span>{project.vendor}</span>
                </>
              ) : null}
              {project.locationText ? (
                <>
                  <span className="ce-hero__sep" aria-hidden="true">·</span>
                  <span className="ce-inline">
                    <Icon icon={MapPin} size={14} />
                    {project.locationText}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div className="ce-hero__actions">
            <Button icon={Pencil} onClick={() => setEditOpen(true)}>
              Edit project
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setPayOpen(true)}>
              Record payment
            </Button>
          </div>
        </div>

        <div className="ce-facts">
          <div className="ce-fact">
            <span className="ce-fact__label">Sanctioned</span>
            <span className="ce-fact__value">{project.sanctionedBudget ? inr(project.sanctionedBudget) : '—'}</span>
          </div>
          <div className="ce-fact">
            <span className="ce-fact__label">Spent</span>
            <span className="ce-fact__value">{inr(project.spent)}</span>
          </div>
          <div className="ce-fact">
            <span className="ce-fact__label">{over ? 'Over by' : 'Remaining'}</span>
            <span className={`ce-fact__value${over ? ' ce-neg' : ''}`}>
              {project.sanctionedBudget ? inr(Math.abs(project.sanctionedBudget - project.spent)) : '—'}
            </span>
          </div>
          <div className="ce-fact">
            <span className="ce-fact__label">Timeline</span>
            <span className="ce-fact__value ce-fact__value--sm">
              {fmtDate(project.startDate)} → {fmtDate(project.completedDate || project.targetDate)}
            </span>
          </div>
        </div>

        {pct !== null ? (
          <Progress
            label="Budget used"
            value={Math.min(100, pct)}
            valueLabel={`${Math.round(pct)}%${pct > 100 ? ' · over budget' : ''}`}
            tone={pct > 100 ? 'danger' : pct >= 85 ? 'warning' : 'success'}
          />
        ) : null}
        {project.description ? <p className="ce-hero__desc">{project.description}</p> : null}
      </Card>

      <div className="cb-grid-8-4">
        <Card title="Payments" subtitle={payments.length ? `${payments.length} recorded` : undefined}>
          {payments.length ? (
            <ol className="ce-timeline">
              {payments.map((p) => {
                const isVoid = p.status === 'void'
                return (
                  <li key={p._id} className={isVoid ? 'is-void' : undefined}>
                    <span className="ce-timeline__dot" aria-hidden="true" />
                    <div className="ce-timeline__body">
                      <div className="ce-timeline__top">
                        <span className="ce-inline">
                          <span className="ce-timeline__amt">{inr(p.amount)}</span>
                          {isVoid ? <Badge tone="neutral">Void</Badge> : null}
                        </span>
                        <span className="ce-hint">{fmtDate(p.date)}</span>
                      </div>
                      <p className="ce-timeline__what">{p.notes || 'Payment'}</p>
                      <p className="ce-timeline__meta">
                        {[p.payee, MODE_LABELS[p.mode] || p.mode, p.reference].filter(Boolean).join(' · ')}
                        {isVoid && p.voidReason ? ` · Reason: ${p.voidReason}` : ''}
                      </p>
                      {p.attachments?.length || p.status === 'valid' ? (
                        <div className="ce-timeline__links">
                          {p.attachments?.map((a) => (
                            <a key={a.url} href={a.url} target="_blank" rel="noreferrer" title={a.name}>
                              <Icon icon={Paperclip} size={12} />
                              {a.name}
                            </a>
                          ))}
                          {p.status === 'valid' ? (
                            <Button variant="tertiary" size="sm" icon={Ban} onClick={() => openVoid(p)}>
                              Void
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : (
            <EmptyState compact icon={Receipt} title="No payments yet" body="Use Record payment each time a bill is paid to the contractor." />
          )}
        </Card>

        <div className="cb-stack">
          <Card title="Milestones" subtitle={project.milestones.length ? `${doneCount} of ${project.milestones.length} done` : undefined}>
            {project.milestones.length ? (
              <ul className="ce-milestones">
                {project.milestones.map((m, i) => (
                  <li key={m._id || i} className={`ce-ms${m.done ? ' is-done' : ''}`}>
                    <Checkbox
                      label={m.title}
                      checked={m.done}
                      onChange={() => patch({ milestones: project.milestones.map((x, idx) => (idx === i ? { ...x, done: !x.done } : x)) })}
                    />
                    {m.dueDate ? <span className="ce-ms__due">{fmtDate(m.dueDate)}</span> : null}
                    <Button
                      variant="tertiary"
                      size="sm"
                      icon={Trash2}
                      aria-label={`Remove milestone ${m.title}`}
                      onClick={() => patch({ milestones: project.milestones.filter((_, idx) => idx !== i) })}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ce-hint">No milestones yet. Add the stages you want to tick off.</p>
            )}
            <form
              className="ce-ms-add"
              onSubmit={(e) => {
                e.preventDefault()
                addMilestone()
              }}
            >
              <TextField label="New milestone" size="sm" placeholder="e.g. Plinth complete" value={milestone} onChange={(e) => setMilestone(e.target.value)} />
              <div className="ce-ms-add__row">
                <TextField label="Due" size="sm" type="date" value={milestoneDue} onChange={(e) => setMilestoneDue(e.target.value)} />
                <Button type="submit" size="sm" icon={Plus} disabled={!milestone.trim()}>
                  Add milestone
                </Button>
              </div>
            </form>
          </Card>

          <Card title="Documents" subtitle="Sanction letter, drawings, estimates, completion certificate">
            <AttachmentInput value={project.documents || []} onChange={(documents) => patch({ documents }, 'Documents updated.')} label="Add document" />
            {!project.documents?.length ? (
              <p className="ce-hint ce-inline">
                <Icon icon={FileText} size={14} />
                No documents yet.
              </p>
            ) : null}
          </Card>
        </div>
      </div>

      <ProjectFormModal isOpen={editOpen} onClose={() => setEditOpen(false)} project={project} onSaved={invalidate} />
      <PaymentSheet isOpen={payOpen} onClose={() => setPayOpen(false)} project={project} onSaved={invalidate} />

      <Dialog
        open={Boolean(voiding)}
        onClose={() => !voidBusy && setVoiding(null)}
        tone="danger"
        size="sm"
        title="Void this payment?"
        description={voiding ? `${inr(voiding.amount)} paid on ${fmtDate(voiding.date)} stops counting towards the project spend. The record is kept with your reason.` : undefined}
        footer={
          <>
            <Button onClick={() => setVoiding(null)} disabled={voidBusy}>
              Cancel
            </Button>
            <Button variant="danger" icon={Ban} loading={voidBusy} onClick={() => void voidPayment()}>
              Void payment
            </Button>
          </>
        }
      >
        <TextField
          label="Reason"
          required
          autoFocus
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void voidPayment()
          }}
          error={voidTried && !voidReason.trim() ? 'Say why it is being voided.' : undefined}
        />
      </Dialog>
    </Page>
  )
}

export default CpitlInfraDetail
