import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CheckCircle2, HardHat, IndianRupee, Plus, Wallet } from 'lucide-react'
import { useAssetLocations, useInfraProjects, useInvalidateCpitl } from '@/hooks/useCpitl'
import cpitlService, { InfraProject } from '@/services/cpitlService'
import { Button, Card, DataTable, EmptyState, FilterBar, Page, Select, Sheet, StatCard, TextArea, TextField, orDash, type DataTableColumn } from '@/components/ui'
import { CpitlBadge, UsageBar, errorMessage, fmtDate, inr, inrShort } from '@/components/cpitl/CpitlUi'
import '@/components/cpitl/expenses.css'

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

export const InfraStatusBadge: React.FC<{ status: InfraProject['status'] }> = ({ status }) => (
  <CpitlBadge status={INFRA_STATUS[status]?.badge} label={INFRA_STATUS[status]?.label || status} />
)

/** Budget used: "₹x of ₹y" over a usage bar, with words when over. */
export const InfraUsage: React.FC<{ spent: number; budget: number }> = ({ spent, budget }) => {
  const pct = budget > 0 ? (spent / budget) * 100 : null
  return (
    <div className="ce-usage">
      <div className="ce-usage__text">
        <strong>{inr(spent)}</strong>
        <span>{budget ? (pct !== null && pct > 100 ? `Over ${inr(budget)}` : `of ${inr(budget)}`) : 'No budget set'}</span>
      </div>
      {pct !== null ? <UsageBar pct={pct} /> : null}
    </div>
  )
}

/** Add or edit an infrastructure project. Name kept for existing imports; renders a kit Sheet. */
export const ProjectFormModal: React.FC<{ isOpen: boolean; onClose: () => void; project?: Partial<InfraProject> | null; onSaved: (id: string) => void }> = ({
  isOpen,
  onClose,
  project,
  onSaved,
}) => {
  const { data: locations = [] } = useAssetLocations()
  const [form, setForm] = useState<Partial<InfraProject>>({})
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (isOpen) {
      setForm(project || { title: '', type: 'construction', status: 'planned', sanctionedBudget: 0, vendor: '', locationText: '', description: '' })
      setTried(false)
    }
  }, [isOpen, project])
  const set = (patch: Partial<InfraProject>) => setForm((p) => ({ ...p, ...patch }))
  const save = async () => {
    setTried(true)
    if (!form.title?.trim()) {
      toast.error('Give the project a title.')
      return
    }
    setSaving(true)
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
    } finally {
      setSaving(false)
    }
  }
  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      title={form._id ? 'Edit project' : 'Add project'}
      description="Budget, contractor, dates and where the work is happening."
      icon={HardHat}
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
            Save project
          </Button>
        </>
      }
    >
      <div className="cb-form-grid">
        <TextField
          className="is-wide"
          label="Title"
          required
          autoFocus
          value={form.title || ''}
          placeholder="e.g. New science lab block"
          onChange={(e) => set({ title: e.target.value })}
          error={tried && !form.title?.trim() ? 'Give the project a title.' : undefined}
        />
        <Select
          label="Type"
          value={form.type || 'construction'}
          onChange={(e) => set({ type: e.target.value as InfraProject['type'] })}
          options={Object.entries(INFRA_TYPES).map(([value, label]) => ({ value, label }))}
        />
        <Select
          label="Status"
          value={form.status || 'planned'}
          onChange={(e) => set({ status: e.target.value as InfraProject['status'] })}
          options={Object.entries(INFRA_STATUS).map(([value, v]) => ({ value, label: v.label }))}
        />
        <TextField
          label="Sanctioned budget"
          type="number"
          inputMode="decimal"
          min={0}
          prefix="₹"
          value={form.sanctionedBudget || ''}
          onChange={(e) => set({ sanctionedBudget: Number(e.target.value) })}
        />
        <TextField label="Contractor or vendor" value={form.vendor || ''} onChange={(e) => set({ vendor: e.target.value })} />
        <TextField label="Start date" type="date" value={form.startDate?.slice(0, 10) || ''} onChange={(e) => set({ startDate: e.target.value || null })} />
        <TextField label="Target completion" type="date" value={form.targetDate?.slice(0, 10) || ''} onChange={(e) => set({ targetDate: e.target.value || null })} />
        {locations.length ? (
          <Select
            className="is-wide"
            label="Location from Assets"
            value={form.locationId || ''}
            onChange={(e) => set({ locationId: e.target.value || null })}
            placeholder="Not linked"
            options={locations.map((l) => ({ value: l._id, label: `${l.path || l.name} (${l.type})` }))}
          />
        ) : null}
        <TextField
          className="is-wide"
          label="Location or area"
          value={form.locationText || ''}
          placeholder="e.g. Behind Block B"
          onChange={(e) => set({ locationText: e.target.value })}
        />
        <TextArea className="is-wide" label="Scope" rows={3} value={form.description || ''} onChange={(e) => set({ description: e.target.value })} />
      </div>
    </Sheet>
  )
}

const CLOSED: InfraProject['status'][] = ['completed', 'cancelled']

const CpitlInfra: React.FC = () => {
  const navigate = useNavigate()
  const invalidate = useInvalidateCpitl()
  const { data: projects = [], isLoading } = useInfraProjects()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'open' | 'closed' | 'all'>('all')
  const [type, setType] = useState('')

  const active = projects.filter((p) => !CLOSED.includes(p.status))
  const closed = projects.filter((p) => CLOSED.includes(p.status))
  const totalBudget = active.reduce((s, p) => s + p.sanctionedBudget, 0)
  const totalSpent = projects.reduce((s, p) => s + (p.spent || 0), 0)
  const completed = projects.filter((p) => p.status === 'completed').length

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    // Open projects first, then completed and cancelled — as the old two-section layout did.
    const ordered = [...active, ...closed]
    return ordered.filter((p) => {
      if (view === 'open' && CLOSED.includes(p.status)) return false
      if (view === 'closed' && !CLOSED.includes(p.status)) return false
      if (type && p.type !== type) return false
      if (!needle) return true
      return [p.title, p.vendor, p.locationText].some((v) => String(v || '').toLowerCase().includes(needle))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, search, view, type])

  const columns: DataTableColumn<InfraProject>[] = [
    {
      key: 'title',
      header: 'Project',
      mobile: 'title',
      render: (p) => (
        <div className="ce-entity">
          <span className="ce-entity__primary">{p.title}</span>
          <span className="ce-entity__secondary">{[INFRA_TYPES[p.type], p.vendor].filter(Boolean).join(' · ')}</span>
        </div>
      ),
    },
    { key: 'status', header: 'Status', mobile: 'aside', render: (p) => <InfraStatusBadge status={p.status} /> },
    { key: 'location', header: 'Location', render: (p) => orDash(p.locationText) },
    { key: 'spent', header: 'Budget used', headerLabel: 'Budget used', render: (p) => <InfraUsage spent={p.spent || 0} budget={p.sanctionedBudget} /> },
    {
      key: 'progress',
      header: 'Progress',
      render: (p) => {
        const done = p.milestones?.filter((m) => m.done).length || 0
        return p.milestones?.length ? `${done} of ${p.milestones.length} milestones` : `${typeof p.payments === 'number' ? p.payments : 0} payment(s)`
      },
    },
    { key: 'target', header: 'Target', numeric: true, render: (p) => fmtDate(p.targetDate) },
  ]

  const filtered = Boolean(search.trim() || type || view !== 'all')

  return (
    <Page>
      <div className="cb-stats">
        <StatCard label="Open projects" value={active.length} icon={HardHat} hint={closed.length ? `${closed.length} closed` : undefined} />
        <StatCard label="Sanctioned (open)" value={inrShort(totalBudget)} icon={IndianRupee} />
        <StatCard
          label="Spent to date"
          value={inrShort(totalSpent)}
          icon={Wallet}
          hint="Across all projects"
        />
        <StatCard label="Completed" value={completed} icon={CheckCircle2} />
      </div>

      <Card flush className="ce-records">
        <div className="ce-records__toolbar">
          <FilterBar
            search={{ placeholder: 'Search title, contractor or location', value: search, onChange: setSearch, label: 'Search projects' }}
            chips={[
              { id: 'all', label: 'All', count: projects.length, active: view === 'all' },
              { id: 'open', label: 'Open', count: active.length, active: view === 'open' },
              { id: 'closed', label: 'Completed & cancelled', count: closed.length, active: view === 'closed' },
            ]}
            onChipClick={(id) => setView(id as typeof view)}
            chipsLabel="Project status"
            filters={
              <Select
                size="sm"
                aria-label="Project type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="All types"
                options={Object.entries(INFRA_TYPES).map(([value, label]) => ({ value, label }))}
              />
            }
            actions={
              <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
                Add project
              </Button>
            }
          />
        </div>
        <DataTable
          caption="Infrastructure projects"
          columns={columns}
          rows={rows}
          getRowKey={(p) => p._id}
          onRowClick={(p) => navigate(`/cpitl/infra/${p._id}`)}
          loading={isLoading}
          loadingLabel="Loading projects…"
          empty={
            projects.length === 0 ? (
              <EmptyState
                icon={HardHat}
                title="No infrastructure projects yet"
                body="Track each construction, renovation or major repair as a project: its budget, contractor, milestones and every payment. Use Add project to start."
              />
            ) : (
              <EmptyState
                compact
                icon={HardHat}
                title="No projects match these filters"
                body="Try another search or status."
                action={
                  filtered ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSearch('')
                        setType('')
                        setView('all')
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            )
          }
        />
      </Card>

      <ProjectFormModal
        isOpen={open}
        onClose={() => setOpen(false)}
        onSaved={(id) => {
          invalidate()
          if (id) navigate(`/cpitl/infra/${id}`)
        }}
      />
    </Page>
  )
}

export default CpitlInfra
