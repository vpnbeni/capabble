import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { HardHat, MapPin, Plus } from 'lucide-react'
import Modal from '@/components/common/Modal'
import { useAssetLocations, useInfraProjects, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { InfraProject } from '@/services/cpitlService'
import { CpitlBadge, CpitlEmpty, CpitlPageShell, Field, UsageBar, btnPrimary, btnSecondary, errorMessage, fmtDate, inputClass, inr, inrShort } from '@/components/cpitl/CpitlUi'

export const INFRA_TYPES: Record<InfraProject['type'], string> = {
  construction: 'New construction',
  renovation: 'Renovation',
  repair: 'Major repair',
  furniture: 'Furniture & fixtures',
  it_infra: 'IT infrastructure',
  landscaping: 'Landscaping',
  other: 'Other',
}

export const INFRA_STATUS: Record<InfraProject['status'], { label: string; badge: string }> = {
  planned: { label: 'Planned', badge: 'draft' },
  in_progress: { label: 'In progress', badge: 'due' },
  on_hold: { label: 'On hold', badge: 'pending' },
  completed: { label: 'Completed', badge: 'paid' },
  cancelled: { label: 'Cancelled', badge: 'cancelled' },
}

export const ProjectFormModal: React.FC<{ isOpen: boolean; onClose: () => void; project?: Partial<InfraProject> | null; onSaved: (id: string) => void }> = ({
  isOpen,
  onClose,
  project,
  onSaved,
}) => {
  const { data: locations = [] } = useAssetLocations()
  const [form, setForm] = useState<Partial<InfraProject>>({})
  useEffect(() => {
    if (isOpen) setForm(project || { title: '', type: 'construction', status: 'planned', sanctionedBudget: 0, vendor: '', locationText: '', description: '' })
  }, [isOpen, project])
  const set = (patch: Partial<InfraProject>) => setForm((p) => ({ ...p, ...patch }))
  const save = async () => {
    if (!form.title?.trim()) {
      toast.error('Give the project a title.')
      return
    }
    try {
      const res = await cpitlService.saveInfraProject({
        _id: form._id,
        title: form.title,
        type: form.type,
        status: form.status,
        description: form.description,
        vendor: form.vendor,
        sanctionedBudget: Number(form.sanctionedBudget) || 0,
        startDate: form.startDate || null,
        targetDate: form.targetDate || null,
        locationId: form.locationId || null,
        locationText: form.locationText,
      })
      toast.success('Project saved.')
      onSaved(res?.data?._id || form._id)
      onClose()
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={form._id ? 'Edit project' : 'New infrastructure project'} size="lg">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Title" className="col-span-2">
          <input className={inputClass} value={form.title || ''} placeholder="e.g. New science lab block" onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={form.type} onChange={(e) => set({ type: e.target.value as InfraProject['type'] })}>
            {Object.entries(INFRA_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={(e) => set({ status: e.target.value as InfraProject['status'] })}>
            {Object.entries(INFRA_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sanctioned budget (₹)">
          <input type="number" min={0} className={inputClass} value={form.sanctionedBudget || ''} onChange={(e) => set({ sanctionedBudget: Number(e.target.value) })} />
        </Field>
        <Field label="Contractor / vendor">
          <input className={inputClass} value={form.vendor || ''} onChange={(e) => set({ vendor: e.target.value })} />
        </Field>
        <Field label="Start date">
          <input type="date" className={inputClass} value={form.startDate?.slice(0, 10) || ''} onChange={(e) => set({ startDate: e.target.value || null })} />
        </Field>
        <Field label="Target completion">
          <input type="date" className={inputClass} value={form.targetDate?.slice(0, 10) || ''} onChange={(e) => set({ targetDate: e.target.value || null })} />
        </Field>
        {locations.length ? (
          <Field label="Location (from Assets)" className="col-span-2">
            <select className={inputClass} value={form.locationId || ''} onChange={(e) => set({ locationId: e.target.value || null })}>
              <option value="">— Not linked —</option>
              {locations.map((l) => (
                <option key={l._id} value={l._id}>
                  {l.path || l.name} ({l.type})
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Location / area" className="col-span-2">
          <input className={inputClass} value={form.locationText || ''} placeholder="e.g. Behind Block B" onChange={(e) => set({ locationText: e.target.value })} />
        </Field>
        <Field label="Scope / description" className="col-span-2">
          <textarea rows={3} className={inputClass} value={form.description || ''} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={btnPrimary} onClick={save}>
          Save project
        </button>
      </div>
    </Modal>
  )
}

const CpitlInfra: React.FC = () => {
  const navigate = useNavigate()
  const invalidate = useInvalidateCpitl()
  const { data: projects = [], isLoading } = useInfraProjects()
  const [open, setOpen] = useState(false)

  const active = projects.filter((p) => !['completed', 'cancelled'].includes(p.status))
  const closed = projects.filter((p) => ['completed', 'cancelled'].includes(p.status))
  const totalBudget = active.reduce((s, p) => s + p.sanctionedBudget, 0)
  const totalSpent = projects.reduce((s, p) => s + (p.spent || 0), 0)

  const Card = ({ p }: { p: InfraProject }) => {
    const pct = p.sanctionedBudget > 0 ? (p.spent / p.sanctionedBudget) * 100 : null
    const done = p.milestones?.filter((m) => m.done).length || 0
    return (
      <Link
        to={`/cpitl/infra/${p._id}`}
        className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-900 dark:text-white">{p.title}</h3>
            <p className="text-xs text-slate-500">{INFRA_TYPES[p.type]}</p>
          </div>
          <CpitlBadge status={INFRA_STATUS[p.status].badge} label={INFRA_STATUS[p.status].label} />
        </div>
        {p.locationText ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3 w-3" /> {p.locationText}
          </p>
        ) : null}
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{inr(p.spent)}</span>
            <span className="text-xs text-slate-500">{p.sanctionedBudget ? `of ${inr(p.sanctionedBudget)}` : 'No budget set'}</span>
          </div>
          {pct !== null ? <UsageBar pct={pct} className="mt-1.5" /> : null}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-700">
          <span>{p.milestones?.length ? `${done}/${p.milestones.length} milestones` : `${p.payments || 0} payment(s)`}</span>
          <span>{p.targetDate ? `Target ${fmtDate(p.targetDate)}` : p.vendor || ''}</span>
        </div>
      </Link>
    )
  }

  return (
    <CpitlPageShell
      title="Infrastructure Development"
      subtitle={`${active.length} open project(s) · ${inrShort(totalSpent)} spent against ${inrShort(totalBudget)} sanctioned`}
      actions={
        <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New project
        </button>
      }
    >
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : projects.length ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((p) => (
              <Card key={p._id} p={p} />
            ))}
          </div>
          {closed.length ? (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-slate-500">Completed & cancelled</h3>
              <div className="grid gap-4 opacity-80 md:grid-cols-2 xl:grid-cols-3">
                {closed.map((p) => (
                  <Card key={p._id} p={p} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <CpitlEmpty
          message="Track every construction, renovation or major repair as a project: its budget, contractor, milestones and every payment made."
          action={
            <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>
              <HardHat className="h-4 w-4" /> Create first project
            </button>
          }
        />
      )}
      <ProjectFormModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onSaved={(id) => {
          invalidate()
          if (id) navigate(`/cpitl/infra/${id}`)
        }}
      />
    </CpitlPageShell>
  )
}

export default CpitlInfra
