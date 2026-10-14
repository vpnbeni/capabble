import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  CalendarDays,
  Copy,
  FileStack,
  GraduationCap,
  History,
  IndianRupee,
  Layers,
  ListChecks,
  Pencil,
  RefreshCw,
  Save,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react'
import StructureArchiveDialog from '@/components/cpitl/StructureArchiveDialog'
import {
  useCpitlClasses,
  useFeeHeads,
  useFeeStructure,
  useInvalidateCpitl,
  useSaveStructure,
  useStructureRevisions,
} from '@/hooks/useCpitl'
import cpitlService, { FeeFrequency, InstallmentPlan, LateFeeRule, StructureComponent, StructureRevision } from '@/services/cpitlService'
import { useAcademicSession } from '@/contexts/AcademicSessionContext'
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  DataTable,
  DetailList,
  Dialog,
  EmptyState,
  Icon,
  Menu,
  Page,
  Select,
  Sheet,
  Tabs,
  TextField,
  cx,
  type DataTableColumn,
} from '@/components/ui'
import { CpitlBadge, FREQUENCY_LABELS, MONTHS, errorMessage, fmtDate, inr } from '@/components/cpitl/CpitlUi'
import { DEFAULT_PLAN, annualFor, schedulePreview, sessionYearFor } from '@/utils/cpitlFees'
import '@/components/cpitl/fees.css'

type Tab = 'components' | 'schedule' | 'assign' | 'history'

const FREQUENCIES: FeeFrequency[] = ['one_time', 'monthly', 'quarterly', 'half_yearly', 'annual']
const FREQUENCY_OPTIONS = FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))
const DEFAULT_LATE_FEE: LateFeeRule = { type: 'none', amount: 0, graceDays: 0, cap: 0 }
const MONTH_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map((m) => ({ value: String(m), label: MONTHS[m - 1] }))
const LATE_FEE_OPTIONS = [
  { value: 'none', label: 'No late fee' },
  { value: 'flat', label: 'Flat fine per installment' },
  { value: 'per_day', label: 'Per day after due date' },
]

const MonthSelect: React.FC<{ label?: string; value: number; onChange: (m: number) => void; disabled?: boolean; 'aria-label'?: string }> = ({
  label,
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}) => (
  <Select
    label={label}
    aria-label={label ? undefined : ariaLabel}
    options={MONTH_OPTIONS}
    value={String(value)}
    disabled={disabled}
    onChange={(e) => onChange(Number(e.target.value))}
  />
)

const formatChangeValue = (field: string, value: unknown) => {
  if (field === 'amount') return inr(Number(value))
  if (field === 'frequency') return FREQUENCY_LABELS[String(value)] || String(value)
  if (field === 'isOptional') return value ? 'optional' : 'mandatory'
  return String(value)
}

const revisionWhen = (revision: StructureRevision) =>
  `${fmtDate(revision.createdAt)} · ${new Date(revision.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}${
    revision.changedBy?.name ? ` · ${revision.changedBy.name}` : ''
  }`

const RevisionItem: React.FC<{ revision: StructureRevision; isLatest: boolean; onView: () => void }> = ({ revision, isLatest, onView }) => {
  const { diff } = revision
  if (revision.event === 'archived' || revision.event === 'restored') {
    const archived = revision.event === 'archived'
    return (
      <li className="cf-timeline__item">
        <span className={cx('cf-timeline__marker', 'is-event', !archived && 'is-restored')} aria-hidden="true">
          <Icon icon={archived ? Archive : ArchiveRestore} size={12} />
        </span>
        <div className="cf-timeline__head">
          <div>
            <span className="cf-timeline__title">{archived ? 'Archived' : 'Restored'}</span>
            <span className="cf-timeline__meta"> at version {revision.version}</span>
            <p className="cf-timeline__meta">{revisionWhen(revision)}</p>
          </div>
        </div>
        {revision.changeNote ? <p className="cf-timeline__note">“{revision.changeNote}”</p> : null}
      </li>
    )
  }
  return (
    <li className="cf-timeline__item">
      <span className={cx('cf-timeline__marker', isLatest && 'is-current')} aria-hidden="true" />
      <div className="cf-timeline__head">
        <div>
          <span className="cf-timeline__title">Version {revision.version}</span>
          {isLatest ? (
            <Badge tone="accent" className="cf-timeline__badge">
              Current
            </Badge>
          ) : null}
          <p className="cf-timeline__meta">{revisionWhen(revision)}</p>
        </div>
        <Button variant="tertiary" size="sm" icon={History} onClick={onView}>
          View snapshot
        </Button>
      </div>
      {revision.changeNote ? <p className="cf-timeline__note">“{revision.changeNote}”</p> : null}
      {diff && !diff.isEmpty ? (
        <ul className="cf-diff">
          {diff.added.map((c) => (
            <li key={`a-${c.feeHead}`} className="cf-diff__item is-added">
              <span aria-hidden="true">+</span>
              <span className="cb-visually-hidden">Added </span>
              {c.name}: {inr(c.amount)} {FREQUENCY_LABELS[c.frequency]?.toLowerCase()}
            </li>
          ))}
          {diff.removed.map((c) => (
            <li key={`r-${c.feeHead}`} className="cf-diff__item is-removed">
              <span aria-hidden="true">−</span> {c.name} removed
            </li>
          ))}
          {diff.changed.map((c) => (
            <li key={`c-${c.feeHead}`} className="cf-diff__item is-changed">
              <span aria-hidden="true">~</span>
              <span className="cb-visually-hidden">Changed </span>
              {c.name}: {c.changes.map((ch) => `${formatChangeValue(ch.field, ch.from)} → ${formatChangeValue(ch.field, ch.to)}`).join(', ')}
            </li>
          ))}
        </ul>
      ) : (
        <p className="cf-timeline__meta">No fee amount changes.</p>
      )}
    </li>
  )
}

const Fact: React.FC<{ icon: LucideIcon; label: string; value: React.ReactNode; hint?: React.ReactNode }> = ({ icon, label, value, hint }) => (
  <div className="cf-fact">
    <Icon icon={icon} size={16} className="cf-fact__icon" />
    <div className="cf-fact__text">
      <span className="cf-fact__label">{label}</span>
      <span className="cf-fact__value">{value}</span>
      {hint ? <span className="cf-fact__hint">{hint}</span> : null}
    </div>
  </div>
)

const CpitlFeeStructureDetail: React.FC = () => {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const invalidate = useInvalidateCpitl()
  const { currentSession } = useAcademicSession()

  const { data: structure, isLoading } = useFeeStructure(isNew ? undefined : id)
  const { data: heads = [], isLoading: headsLoading } = useFeeHeads()
  const { data: classes = [] } = useCpitlClasses()
  const { data: revisions = [] } = useStructureRevisions(isNew ? undefined : id)
  const saveMutation = useSaveStructure()

  const [tab, setTab] = useState<Tab>('components')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [applicableClasses, setApplicableClasses] = useState<string[]>([])
  const [components, setComponents] = useState<StructureComponent[]>([])
  const [plan, setPlan] = useState<InstallmentPlan>(DEFAULT_PLAN)
  const [lateFee, setLateFee] = useState<LateFeeRule>(DEFAULT_LATE_FEE)
  const [dirty, setDirty] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [changeNote, setChangeNote] = useState('')
  const [assignSections, setAssignSections] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<StructureRevision | null>(null)
  const [archiveMode, setArchiveMode] = useState<'archive' | 'restore' | null>(null)
  const [reapplyOpen, setReapplyOpen] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  // Sheets edit a draft copy; "Apply" writes it back into the structure being edited.
  const [headsDraft, setHeadsDraft] = useState<StructureComponent[] | null>(null)
  const [planDraft, setPlanDraft] = useState<InstallmentPlan | null>(null)
  const [lateFeeDraft, setLateFeeDraft] = useState<LateFeeRule | null>(null)

  useEffect(() => {
    if (!structure) return
    setName(structure.name)
    setDescription(structure.description || '')
    setApplicableClasses(structure.applicableClasses || [])
    setComponents(structure.components || [])
    setPlan({ ...DEFAULT_PLAN, ...(structure.installmentPlan || {}) })
    setLateFee({ ...DEFAULT_LATE_FEE, ...(structure.lateFee || {}) })
    setDirty(false)
  }, [structure])

  const readOnly = structure?.status === 'archived'
  const touch = () => setDirty(true)

  const annual = useMemo(() => components.filter((c) => !c.isOptional).reduce((s, c) => s + annualFor(c, plan), 0), [components, plan])
  const annualOptional = useMemo(() => components.filter((c) => c.isOptional).reduce((s, c) => s + annualFor(c, plan), 0), [components, plan])
  const preview = useMemo(() => schedulePreview(components, plan), [components, plan])
  const headById = useMemo(() => new Map(heads.map((h) => [h._id, h])), [heads])
  const draftByHead = useMemo(() => new Map((headsDraft || []).map((c) => [c.feeHead, c])), [headsDraft])
  const draftAnnual = useMemo(
    () => (headsDraft || []).filter((c) => !c.isOptional).reduce((s, c) => s + annualFor(c, plan), 0),
    [headsDraft, plan]
  )
  const latestContentRevisionId = revisions.find((r) => !r.event || r.event === 'content')?._id

  const toggleDraftHead = (headId: string) => {
    const head = heads.find((h) => h._id === headId)
    if (!head) return
    setHeadsDraft((prev) => {
      const list = prev || []
      return list.some((c) => c.feeHead === headId)
        ? list.filter((c) => c.feeHead !== headId)
        : [...list, { feeHead: head._id, name: head.name, code: head.code, amount: 0, frequency: head.frequency, isOptional: Boolean(head.isOptional) }]
    })
  }

  const updateDraftHead = (headId: string, patch: Partial<StructureComponent>) => {
    setHeadsDraft((prev) => (prev || []).map((c) => (c.feeHead === headId ? { ...c, ...patch } : c)))
  }

  const applyHeads = (event?: React.FormEvent) => {
    event?.preventDefault()
    if (headsDraft) {
      setComponents(headsDraft)
      touch()
    }
    setHeadsDraft(null)
  }

  const applyPlan = (event?: React.FormEvent) => {
    event?.preventDefault()
    if (planDraft) {
      setPlan(planDraft)
      touch()
    }
    setPlanDraft(null)
  }

  const applyLateFee = (event?: React.FormEvent) => {
    event?.preventDefault()
    if (lateFeeDraft) {
      setLateFee(lateFeeDraft)
      touch()
    }
    setLateFeeDraft(null)
  }

  const toggleClass = (cls: string) => {
    setApplicableClasses((prev) => (prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]))
    touch()
  }

  const validate = () => {
    if (!name.trim()) return 'Give the structure a name.'
    if (!components.length) return 'Select at least one fee head.'
    const zero = components.find((c) => !(Number(c.amount) > 0))
    if (zero) return `Enter an amount for ${zero.name}.`
    return null
  }

  const save = async (note?: string) => {
    const problem = validate()
    if (problem) {
      toast.error(problem)
      setTab('components')
      return
    }
    const payload = {
      name: name.trim(),
      description,
      applicableClasses,
      components: components.map((c) => ({ ...c, amount: Number(c.amount) })),
      installmentPlan: plan,
      lateFee,
      ...(note ? { changeNote: note } : {}),
    }
    try {
      if (isNew) {
        const created = (await saveMutation.mutateAsync({ payload })) as { _id: string }
        toast.success('Fee structure created.')
        navigate(`/cpitl/fee-structures/${created._id}`, { replace: true })
      } else {
        const res = await saveMutation.mutateAsync({ id, payload })
        toast.success((res as { message?: string })?.message || 'Saved.')
        setNoteOpen(false)
        setChangeNote('')
        setDirty(false)
      }
    } catch (error) {
      toast.error(await errorMessage(error, 'Could not save the structure.'))
    }
  }

  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key)
    try {
      const res = (await fn()) as { message?: string } | undefined
      toast.success(res?.message || success || 'Done.')
      invalidate()
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const assign = (cls?: string) => {
    if (!id || isNew) return
    const targetClasses = cls ? [cls] : applicableClasses
    if (!targetClasses.length) {
      toast.error('Select the classes this structure applies to first.')
      return
    }
    const sections = cls ? assignSections[cls] || [] : []
    return run(`assign-${cls || 'all'}`, () => cpitlService.assignStructure(id, { classes: targetClasses, sections }))
  }

  const duplicate = async () => {
    setDuplicating(true)
    try {
      const copy = await cpitlService.duplicateStructure(id as string)
      invalidate()
      toast.success('Duplicated as draft.')
      navigate(`/cpitl/fee-structures/${copy._id}`)
    } catch (error) {
      toast.error(await errorMessage(error))
    } finally {
      setDuplicating(false)
    }
  }

  const viewSnapshot = async (version: number) => {
    if (!id) return
    try {
      setSnapshot(await cpitlService.getRevision(id, version))
    } catch (error) {
      toast.error(await errorMessage(error))
    }
  }

  if (!isNew && isLoading) {
    return (
      <Page>
        <Card>
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading fee structure…
          </div>
        </Card>
      </Page>
    )
  }
  if (!isNew && !structure) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={FileStack}
            title="Fee structure not found"
            body="It may have been removed, or the link is from another session."
            action={<Button onClick={() => navigate('/cpitl/fee-structures')}>Go to fee structures</Button>}
          />
        </Card>
      </Page>
    )
  }

  const session = structure?.academicSession || currentSession || ''
  const tabs = [
    { id: 'components', label: 'Fee heads', count: components.length },
    { id: 'schedule', label: 'Installments & late fee' },
    ...(isNew
      ? []
      : [
          { id: 'assign', label: 'Assign to classes' },
          { id: 'history', label: 'History', count: revisions.length || undefined },
        ]),
  ]

  const componentColumns: DataTableColumn<StructureComponent>[] = [
    {
      key: 'name',
      header: 'Fee head',
      mobile: 'title',
      render: (c) => {
        const head = headById.get(c.feeHead)
        return (
          <div className="cf-name">
            <span className="cf-name__primary">{c.name}</span>
            <span className="cf-name__secondary">
              {c.code}
              {head?.isRefundable ? ' · refundable' : ''}
            </span>
          </div>
        )
      },
    },
    { key: 'frequency', header: 'Frequency', mobile: 'subtitle', render: (c) => FREQUENCY_LABELS[c.frequency] || c.frequency },
    {
      key: 'amount',
      header: 'Amount per installment',
      headerLabel: 'Amount per installment',
      align: 'right',
      numeric: true,
      render: (c) => (Number(c.amount) > 0 ? inr(c.amount) : <Badge tone="warning">Amount needed</Badge>),
    },
    {
      key: 'type',
      header: 'Type',
      render: (c) => (c.isOptional ? <Badge tone="info">Optional</Badge> : <Badge tone="neutral">Mandatory</Badge>),
    },
    {
      key: 'annual',
      header: 'Per year',
      align: 'right',
      numeric: true,
      mobile: 'aside',
      render: (c) => <span className={c.isOptional ? 'cb-muted' : 'cb-strong'}>{inr(annualFor(c, plan))}</span>,
    },
  ]

  const previewColumns: DataTableColumn<(typeof preview)[number]>[] = [
    {
      key: 'due',
      header: 'Due date',
      mobile: 'title',
      render: (row) => (
        <span className="cb-strong">
          {plan.dueDay} {MONTHS[row.month - 1]} {sessionYearFor(row.month, session || undefined)}
        </span>
      ),
    },
    {
      key: 'heads',
      header: 'Fee heads',
      mobile: 'subtitle',
      render: (row) => <span className="cf-wrap">{row.heads.map((h) => h.name).join(', ')}</span>,
    },
    { key: 'amount', header: 'Amount', align: 'right', numeric: true, mobile: 'aside', render: (row) => inr(row.amount) },
  ]

  const snapshotPlan = { ...DEFAULT_PLAN, ...(snapshot?.snapshot?.installmentPlan || {}) }
  const snapshotColumns: DataTableColumn<StructureComponent>[] = [
    {
      key: 'name',
      header: 'Fee head',
      mobile: 'title',
      render: (c) => (
        <span>
          {c.name}
          {c.isOptional ? <span className="cb-muted"> (optional)</span> : null}
        </span>
      ),
    },
    { key: 'frequency', header: 'Frequency', mobile: 'subtitle', render: (c) => FREQUENCY_LABELS[c.frequency] },
    { key: 'amount', header: 'Amount', align: 'right', numeric: true, render: (c) => inr(c.amount) },
    { key: 'annual', header: 'Per year', align: 'right', numeric: true, mobile: 'aside', render: (c) => inr(annualFor(c, snapshotPlan)) },
  ]

  const lateFeeLabel = LATE_FEE_OPTIONS.find((o) => o.value === lateFee.type)?.label || lateFee.type
  const monthList = (months: number[]) => months.map((m) => MONTHS[m - 1]).join(', ')

  const openHeadsSheet = () => setHeadsDraft(components.map((c) => ({ ...c })))

  return (
    <Page>

      <Card className="cf-hero-card">
        <div className="cf-hero">
          <span className="cf-hero__tile" aria-hidden="true">
            <Icon icon={Layers} size={24} />
          </span>
          <div className="cf-hero__main">
            <div className="cf-hero__name">
              <h2>{isNew ? name.trim() || 'New fee structure' : structure?.name}</h2>
              {!isNew && structure ? <CpitlBadge status={structure.status} /> : <Badge tone="neutral">Not saved</Badge>}
              {!isNew && dirty ? <Badge tone="warning">Unsaved changes</Badge> : null}
            </div>
            <div className="cf-hero__tags">
              {!isNew ? (
                <>
                  <span>Version {structure?.version}</span>
                  <span className="cf-hero__sep" aria-hidden="true">·</span>
                </>
              ) : null}
              <span>Session {session || '—'}</span>
              {!isNew && structure?.updatedAt ? (
                <>
                  <span className="cf-hero__sep" aria-hidden="true">·</span>
                  <span>Updated {fmtDate(structure.updatedAt)}</span>
                </>
              ) : null}
            </div>
          </div>
          <div className="cf-hero__actions">
            {readOnly ? (
              <Button variant="primary" icon={ArchiveRestore} onClick={() => setArchiveMode('restore')}>
                Restore structure
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={Save}
                loading={isNew && saveMutation.isPending}
                disabled={saveMutation.isPending || (!isNew && !dirty)}
                onClick={() => (isNew ? save() : setNoteOpen(true))}
              >
                {isNew ? 'Create structure' : 'Save new version'}
              </Button>
            )}
            {!isNew ? (
              <Menu
                label="More structure actions"
                items={[
                  { label: duplicating ? 'Duplicating…' : 'Duplicate as draft', icon: Copy, disabled: duplicating, onSelect: () => void duplicate() },
                  ...(readOnly
                    ? []
                    : [
                        { divider: true as const },
                        {
                          label: 'Archive structure',
                          icon: Archive,
                          tone: 'danger' as const,
                          disabled: dirty,
                          hint: dirty ? 'Save first' : undefined,
                          onSelect: () => setArchiveMode('archive'),
                        },
                      ]),
                ]}
              />
            ) : null}
          </div>
        </div>

        <div className="cf-facts">
          <Fact
            icon={IndianRupee}
            label="Annual per student"
            value={inr(annual)}
            hint={annualOptional > 0 ? `+ ${inr(annualOptional)} optional` : 'Mandatory heads'}
          />
          <Fact icon={ListChecks} label="Fee heads" value={components.length} hint={`${components.filter((c) => c.isOptional).length} optional`} />
          <Fact
            icon={GraduationCap}
            label="Classes"
            value={applicableClasses.length || 'None'}
            hint={applicableClasses.length ? applicableClasses.slice(0, 6).join(', ') + (applicableClasses.length > 6 ? '…' : '') : 'Pick below'}
          />
          <Fact icon={Users} label="Students assigned" value={(structure?.assignedCount || 0).toLocaleString('en-IN')} hint={isNew ? 'Assign after creating' : undefined} />
        </div>
      </Card>

      {readOnly ? (
        <Banner tone="neutral" title="This structure is archived and read-only">
          {structure?.assignedCount ? `Its ${structure.assignedCount} assigned students keep their dues. ` : ''}
          Restore it to edit or assign again, or duplicate it to start fresh.
        </Banner>
      ) : null}

      <Card title="Details" subtitle="Name the structure and pick the classes it applies to.">
        <div className="cb-form-section">
          <div className="cb-form-grid">
            <TextField
              label="Structure name"
              required
              value={name}
              disabled={readOnly}
              placeholder="e.g. Primary (Class I–V) — Day Scholar"
              onChange={(e) => {
                setName(e.target.value)
                touch()
              }}
            />
            <TextField
              label="Description"
              value={description}
              disabled={readOnly}
              placeholder="Optional notes"
              onChange={(e) => {
                setDescription(e.target.value)
                touch()
              }}
            />
          </div>
          <div className="cf-field" role="group" aria-labelledby="cf-classes-label">
            <span id="cf-classes-label" className="cb-field__label">
              Applies to classes
            </span>
            {classes.length ? (
              <div className="cf-chips">
                {classes.map((c) => {
                  const on = applicableClasses.includes(c.class)
                  return (
                    <button
                      key={c.class}
                      type="button"
                      disabled={readOnly}
                      aria-pressed={on}
                      onClick={() => toggleClass(c.class)}
                      className={cx('cb-chip', on && 'is-active')}
                    >
                      {c.class}
                      <span className="cb-chip__count">{c.count}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="cb-muted cf-help">No students found in this session. Add students first.</p>
            )}
          </div>
        </div>
      </Card>

      <Card className="cf-tabs-card">
        <Tabs items={tabs} value={tab} onChange={(t) => setTab(t as Tab)} label="Fee structure sections" className="cf-tabs" />

        {tab === 'components' ? (
          <div className="cf-section">
            <div className="cf-section__head">
              <div>
                <h3 className="cf-section__title">Fee heads</h3>
                <p className="cf-section__desc">Amounts are per installment; the per-year column follows the installment months.</p>
              </div>
              {!readOnly && components.length ? (
                <Button icon={Pencil} onClick={openHeadsSheet} disabled={!heads.length}>
                  Edit fee heads
                </Button>
              ) : null}
            </div>
            {components.length ? (
              <DataTable
                columns={componentColumns}
                rows={components}
                getRowKey={(c) => c.feeHead}
                onRowClick={readOnly || !heads.length ? undefined : openHeadsSheet}
                caption="Fee heads in this structure"
                footer={
                  <div className="cf-total">
                    <div>
                      <span className="cf-total__label">Annual total per student</span>
                      {annualOptional > 0 ? (
                        <span className="cf-total__hint">+ {inr(annualOptional)} for students opting into optional heads</span>
                      ) : null}
                    </div>
                    <span className="cf-total__value">{inr(annual)}</span>
                  </div>
                }
              />
            ) : headsLoading ? (
              <div className="cb-table-state" role="status">
                <span className="cb-spinner" aria-hidden="true" />
                Loading fee heads…
              </div>
            ) : heads.length ? (
              <EmptyState
                icon={ListChecks}
                title="No fee heads in this structure"
                body={readOnly ? 'This archived structure has no fee heads.' : 'Choose the fee heads students pay and enter an amount for each.'}
                action={
                  readOnly ? undefined : (
                    <Button icon={Pencil} onClick={openHeadsSheet}>
                      Choose fee heads
                    </Button>
                  )
                }
              />
            ) : (
              <EmptyState
                icon={ListChecks}
                title="No fee heads set up yet"
                body="Add fee heads such as Tuition or Transport in fee settings, then come back to build this structure."
                action={<Button onClick={() => navigate('/cpitl/settings')}>Open fee settings</Button>}
              />
            )}
          </div>
        ) : null}

        {tab === 'schedule' ? (
          <div className="cb-grid-8-4">
            <div className="cf-section">
              <div className="cf-section__head">
                <div>
                  <h3 className="cf-section__title">Payment calendar</h3>
                  <p className="cf-section__desc">Per student, mandatory heads only.</p>
                </div>
              </div>
              <DataTable
                columns={previewColumns}
                rows={preview}
                getRowKey={(row) => String(row.month)}
                caption="Payment calendar"
                empty={
                  <EmptyState
                    icon={CalendarDays}
                    title="No installments yet"
                    body="Add fee heads with amounts to see the payment calendar."
                    compact
                  />
                }
              />
            </div>

            <div className="cb-stack">
              <section className="cf-panel" aria-labelledby="cf-plan-title">
                <div className="cf-section__head">
                  <h3 id="cf-plan-title" className="cf-section__title">
                    Installment months
                  </h3>
                  {!readOnly ? (
                    <Button size="sm" variant="tertiary" icon={Pencil} onClick={() => setPlanDraft({ ...plan })}>
                      Edit
                    </Button>
                  ) : null}
                </div>
                <DetailList
                  columns={1}
                  items={[
                    { label: 'Due day of month', value: plan.dueDay },
                    { label: 'One-time heads due in', value: MONTHS[plan.oneTimeMonth - 1] },
                    { label: 'Annual heads due in', value: MONTHS[plan.annualMonth - 1] },
                    { label: 'Half-yearly', value: monthList(plan.halfYearlyMonths) },
                    { label: 'Quarterly', value: monthList(plan.quarterlyMonths) },
                  ]}
                />
              </section>

              <section className="cf-panel" aria-labelledby="cf-late-title">
                <div className="cf-section__head">
                  <h3 id="cf-late-title" className="cf-section__title">
                    Late fee
                  </h3>
                  {!readOnly ? (
                    <Button size="sm" variant="tertiary" icon={Pencil} onClick={() => setLateFeeDraft({ ...lateFee })}>
                      Edit
                    </Button>
                  ) : null}
                </div>
                <DetailList
                  columns={1}
                  items={[
                    { label: 'Rule', value: lateFeeLabel },
                    ...(lateFee.type !== 'none'
                      ? [
                          { label: lateFee.type === 'per_day' ? 'Amount per day' : 'Fine amount', value: inr(lateFee.amount) },
                          { label: 'Grace days', value: lateFee.graceDays },
                          { label: 'Maximum fine', value: lateFee.cap ? inr(lateFee.cap) : 'No cap' },
                        ]
                      : []),
                  ]}
                />
              </section>
            </div>
          </div>
        ) : null}

        {tab === 'assign' && !isNew ? (
          <div className="cf-section">
            {dirty ? (
              <Banner tone="warning" title="You have unsaved changes">
                Save a new version before assigning so students get the latest amounts.
              </Banner>
            ) : null}
            <div className="cf-section__head">
              <div>
                <h3 className="cf-section__title">Assign to students</h3>
                <p className="cf-section__desc">
                  Assigning creates each student's fee account and installments for this session. Students who already have a
                  structure are moved to this one; installments that already have payments are kept as they are.
                </p>
              </div>
              {applicableClasses.length ? (
                <Button
                  icon={Users}
                  loading={busy === 'assign-all'}
                  disabled={Boolean(busy) || readOnly || dirty}
                  onClick={() => assign()}
                >
                  Assign to all selected classes
                </Button>
              ) : null}
            </div>
            {applicableClasses.length ? (
              <ul className="cf-assign">
                {applicableClasses.map((cls) => {
                  const info = classes.find((c) => c.class === cls)
                  const picked = assignSections[cls] || []
                  return (
                    <li key={cls} className="cf-assign__card">
                      <div className="cf-assign__head">
                        <span className="cf-assign__title">Class {cls}</span>
                        <span className="cf-assign__meta">{info?.count || 0} students</span>
                      </div>
                      {info?.sections?.length ? (
                        <div className="cf-chips" role="group" aria-label={`Sections of class ${cls}`}>
                          {info.sections.map((s) => {
                            const on = picked.includes(s.section)
                            return (
                              <button
                                key={s.section}
                                type="button"
                                aria-pressed={on}
                                className={cx('cb-chip', on && 'is-active')}
                                onClick={() =>
                                  setAssignSections((prev) => ({
                                    ...prev,
                                    [cls]: on ? picked.filter((x) => x !== s.section) : [...picked, s.section],
                                  }))
                                }
                              >
                                {s.section || '—'}
                                <span className="cb-chip__count">{s.count}</span>
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                      <Button
                        size="sm"
                        fullWidth
                        loading={busy === `assign-${cls}`}
                        disabled={Boolean(busy) || readOnly || dirty}
                        onClick={() => assign(cls)}
                      >
                        {picked.length ? `Assign to section ${picked.join(', ')}` : 'Assign to whole class'}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState
                icon={GraduationCap}
                title="No classes selected"
                body="Pick the classes this structure applies to in Details above, save, then assign."
                compact
              />
            )}

            {structure && structure.assignedCount > 0 ? (
              <div className="cf-reapply">
                <div>
                  <h3 className="cf-section__title">Apply latest version to assigned students</h3>
                  <p className="cf-section__desc">
                    Saving a new version does not change dues already issued. Use this to recalculate the unpaid installments of all{' '}
                    {structure.assignedCount} assigned students with version {structure.version}.
                  </p>
                </div>
                <Button
                  icon={RefreshCw}
                  loading={busy === 'reapply'}
                  disabled={Boolean(busy) || readOnly || dirty}
                  onClick={() => setReapplyOpen(true)}
                >
                  Re-apply to unpaid dues
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'history' && !isNew ? (
          <div className="cf-section">
            <h3 className="cf-section__title">Change history</h3>
            {revisions.length ? (
              <ol className="cf-timeline">
                {revisions.map((r) => (
                  <RevisionItem key={r._id} revision={r} isLatest={r._id === latestContentRevisionId} onView={() => viewSnapshot(r.version)} />
                ))}
              </ol>
            ) : (
              <EmptyState icon={History} title="No history yet" body="Each saved version and archive appears here." compact />
            )}
          </div>
        ) : null}
      </Card>

      <StructureArchiveDialog
        structure={archiveMode && structure ? structure : null}
        mode={archiveMode || 'archive'}
        onClose={() => setArchiveMode(null)}
      />

      {/* Edit fee heads */}
      <Sheet
        open={Boolean(headsDraft)}
        onClose={() => setHeadsDraft(null)}
        title="Edit fee heads"
        description="Tick the heads this structure charges and set the amount per installment."
        icon={ListChecks}
        size="xl"
        onSubmit={applyHeads}
        footer={
          <>
            <span className="cf-sheet-total">
              Annual total <strong className="is-num">{inr(draftAnnual)}</strong>
            </span>
            <Button variant="secondary" onClick={() => setHeadsDraft(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Apply changes
            </Button>
          </>
        }
      >
        <ul className="cf-heads">
          {heads.map((head) => {
            const component = draftByHead.get(head._id)
            return (
              <li key={head._id} className={cx('cf-head', component && 'is-on')}>
                <Checkbox
                  className="cf-head__check"
                  checked={Boolean(component)}
                  onChange={() => toggleDraftHead(head._id)}
                  label={head.name}
                  description={`${head.code}${head.isRefundable ? ' · refundable' : ''}${component ? '' : ` · ${FREQUENCY_LABELS[head.frequency]}`}`}
                />
                {component ? (
                  <div className="cf-head__fields">
                    <Select
                      size="sm"
                      label="Frequency"
                      options={FREQUENCY_OPTIONS}
                      value={component.frequency}
                      onChange={(e) => updateDraftHead(head._id, { frequency: e.target.value as FeeFrequency })}
                    />
                    <TextField
                      size="sm"
                      type="number"
                      min={0}
                      inputMode="decimal"
                      label="Amount per installment"
                      prefix="₹"
                      className="cf-head__amount"
                      value={component.amount || ''}
                      placeholder="0"
                      error={Number(component.amount) > 0 ? undefined : 'Enter an amount'}
                      onChange={(e) => updateDraftHead(head._id, { amount: Number(e.target.value) })}
                    />
                    <Checkbox
                      className="cf-head__optional"
                      label="Optional"
                      checked={Boolean(component.isOptional)}
                      onChange={(checked) => updateDraftHead(head._id, { isOptional: checked })}
                    />
                    <span className="cf-head__annual">
                      <span className="cf-head__annual-label">Per year</span>
                      <span className="is-num">{inr(annualFor(component, plan))}</span>
                    </span>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      </Sheet>

      {/* Installment months */}
      <Sheet
        open={Boolean(planDraft)}
        onClose={() => setPlanDraft(null)}
        title="Edit installment months"
        description="When each kind of fee head falls due in the session."
        icon={CalendarClock}
        onSubmit={applyPlan}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPlanDraft(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Apply changes
            </Button>
          </>
        }
      >
        {planDraft ? (
          <div className="cb-form-section">
            <div className="cb-form-grid">
              <TextField
                type="number"
                min={1}
                max={28}
                label="Due day of month"
                hint="1–28"
                value={planDraft.dueDay}
                onChange={(e) => setPlanDraft({ ...planDraft, dueDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })}
              />
              <MonthSelect label="One-time heads due in" value={planDraft.oneTimeMonth} onChange={(m) => setPlanDraft({ ...planDraft, oneTimeMonth: m })} />
              <MonthSelect label="Annual heads due in" value={planDraft.annualMonth} onChange={(m) => setPlanDraft({ ...planDraft, annualMonth: m })} />
            </div>
            <div className="cf-field" role="group" aria-labelledby="cf-half-label">
              <span id="cf-half-label" className="cb-field__label">
                Half-yearly
              </span>
              <div className="cf-months cf-months--2">
                {planDraft.halfYearlyMonths.map((m, i) => (
                  <MonthSelect
                    key={i}
                    aria-label={`Half-yearly installment ${i + 1}`}
                    value={m}
                    onChange={(v) => {
                      const next = [...planDraft.halfYearlyMonths]
                      next[i] = v
                      setPlanDraft({ ...planDraft, halfYearlyMonths: next })
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="cf-field" role="group" aria-labelledby="cf-quarter-label">
              <span id="cf-quarter-label" className="cb-field__label">
                Quarterly
              </span>
              <div className="cf-months cf-months--4">
                {planDraft.quarterlyMonths.map((m, i) => (
                  <MonthSelect
                    key={i}
                    aria-label={`Quarterly installment ${i + 1}`}
                    value={m}
                    onChange={(v) => {
                      const next = [...planDraft.quarterlyMonths]
                      next[i] = v
                      setPlanDraft({ ...planDraft, quarterlyMonths: next })
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Sheet>

      {/* Late fee */}
      <Sheet
        open={Boolean(lateFeeDraft)}
        onClose={() => setLateFeeDraft(null)}
        title="Edit late fee"
        description="The fine added when an installment is paid after its due date."
        icon={Timer}
        onSubmit={applyLateFee}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLateFeeDraft(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Apply changes
            </Button>
          </>
        }
      >
        {lateFeeDraft ? (
          <div className="cb-form-section">
            <Select
              label="Rule"
              options={LATE_FEE_OPTIONS}
              value={lateFeeDraft.type}
              onChange={(e) => setLateFeeDraft({ ...lateFeeDraft, type: e.target.value as LateFeeRule['type'] })}
            />
            {lateFeeDraft.type !== 'none' ? (
              <div className="cb-form-grid">
                <TextField
                  type="number"
                  min={0}
                  prefix="₹"
                  label={lateFeeDraft.type === 'per_day' ? 'Amount per day' : 'Fine amount'}
                  value={lateFeeDraft.amount}
                  onChange={(e) => setLateFeeDraft({ ...lateFeeDraft, amount: Number(e.target.value) })}
                />
                <TextField
                  type="number"
                  min={0}
                  label="Grace days"
                  value={lateFeeDraft.graceDays}
                  onChange={(e) => setLateFeeDraft({ ...lateFeeDraft, graceDays: Number(e.target.value) })}
                />
                <TextField
                  type="number"
                  min={0}
                  prefix="₹"
                  label="Maximum fine"
                  hint="0 means no cap"
                  value={lateFeeDraft.cap}
                  onChange={(e) => setLateFeeDraft({ ...lateFeeDraft, cap: Number(e.target.value) })}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </Sheet>

      {/* Save new version */}
      <Dialog
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title="Save new version"
        description={`This will be saved as version ${(structure?.version || 0) + 1}. Already-issued dues won't change until you re-apply.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Save} loading={saveMutation.isPending} onClick={() => save(changeNote)}>
              Save version
            </Button>
          </>
        }
      >
        <TextField
          autoFocus
          label="What changed?"
          hint="Shown in the change history."
          value={changeNote}
          placeholder="e.g. Tuition increased by 8% as per management decision"
          onChange={(e) => setChangeNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save(changeNote)}
        />
      </Dialog>

      {/* Re-apply confirmation (was window.confirm) */}
      <Dialog
        open={reapplyOpen}
        onClose={() => setReapplyOpen(false)}
        tone="danger"
        size="sm"
        title="Recalculate unpaid installments?"
        description={
          structure
            ? `Unpaid installments of all ${structure.assignedCount} assigned students will be recalculated with version ${structure.version}. Paid installments are not changed.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setReapplyOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={RefreshCw}
              onClick={() => {
                setReapplyOpen(false)
                if (structure) run('reapply', () => cpitlService.reapplyStructure(structure._id))
              }}
            >
              Re-apply to unpaid dues
            </Button>
          </>
        }
      />

      {/* Revision snapshot */}
      <Dialog open={Boolean(snapshot)} onClose={() => setSnapshot(null)} title={`Version ${snapshot?.version} snapshot`} size="lg">
        {snapshot?.snapshot ? (
          <div className="cf-snapshot">
            <DetailList
              items={[
                { label: 'Saved', value: `${fmtDate(snapshot.createdAt)}${snapshot.changedBy?.name ? ` by ${snapshot.changedBy.name}` : ''}` },
                { label: 'Classes', value: (snapshot.snapshot.applicableClasses || []).join(', ') || '—' },
              ]}
            />
            <DataTable
              columns={snapshotColumns}
              rows={snapshot.snapshot.components || []}
              getRowKey={(c) => c.feeHead}
              caption={`Fee heads in version ${snapshot.version}`}
            />
          </div>
        ) : null}
      </Dialog>
    </Page>
  )
}

export default CpitlFeeStructureDetail
