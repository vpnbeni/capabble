import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Archive, Check, Copy, History, RefreshCw, Save, Users } from 'lucide-react'
import Modal from '@/components/common/Modal'
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
  CpitlBadge,
  CpitlCard,
  CpitlEmpty,
  CpitlPageShell,
  FREQUENCY_LABELS,
  Field,
  MONTHS,
  btnGhost,
  btnPrimary,
  btnSecondary,
  errorMessage,
  fmtDate,
  inputClass,
  inr,
  tableHead,
} from '@/components/cpitl/CpitlUi'
import { DEFAULT_PLAN, annualFor, schedulePreview, sessionYearFor } from '@/utils/cpitlFees'

type Tab = 'components' | 'schedule' | 'assign' | 'history'

const FREQUENCIES: FeeFrequency[] = ['one_time', 'monthly', 'quarterly', 'half_yearly', 'annual']
const DEFAULT_LATE_FEE: LateFeeRule = { type: 'none', amount: 0, graceDays: 0, cap: 0 }

const MonthSelect: React.FC<{ value: number; onChange: (m: number) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <select className={inputClass} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))}>
    {[4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map((m) => (
      <option key={m} value={m}>
        {MONTHS[m - 1]}
      </option>
    ))}
  </select>
)

const formatChangeValue = (field: string, value: unknown) => {
  if (field === 'amount') return inr(Number(value))
  if (field === 'frequency') return FREQUENCY_LABELS[String(value)] || String(value)
  if (field === 'isOptional') return value ? 'optional' : 'mandatory'
  return String(value)
}

const RevisionItem: React.FC<{ revision: StructureRevision; isLatest: boolean; onView: () => void }> = ({ revision, isLatest, onView }) => {
  const { diff } = revision
  return (
    <li className="relative pb-6 pl-8 last:pb-0">
      <span className="absolute left-[7px] top-5 h-full w-px bg-slate-200 dark:bg-slate-700" aria-hidden />
      <span
        className={`absolute left-0 top-1 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white dark:ring-slate-800 ${
          isLatest ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-semibold text-slate-900 dark:text-white">Version {revision.version}</span>
          {isLatest ? <span className="ml-2 text-xs font-medium text-indigo-600">current</span> : null}
          <p className="text-xs text-slate-500">
            {fmtDate(revision.createdAt)} · {new Date(revision.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            {revision.changedBy?.name ? ` · ${revision.changedBy.name}` : ''}
          </p>
        </div>
        <button type="button" className={btnGhost} onClick={onView}>
          View snapshot
        </button>
      </div>
      {revision.changeNote ? <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">“{revision.changeNote}”</p> : null}
      {diff && !diff.isEmpty ? (
        <ul className="mt-2 space-y-1 text-xs">
          {diff.added.map((c) => (
            <li key={`a-${c.feeHead}`} className="text-emerald-700 dark:text-emerald-400">
              + {c.name}: {inr(c.amount)} {FREQUENCY_LABELS[c.frequency]?.toLowerCase()}
            </li>
          ))}
          {diff.removed.map((c) => (
            <li key={`r-${c.feeHead}`} className="text-rose-700 dark:text-rose-400">
              − {c.name} removed
            </li>
          ))}
          {diff.changed.map((c) => (
            <li key={`c-${c.feeHead}`} className="text-amber-700 dark:text-amber-400">
              ~ {c.name}:{' '}
              {c.changes.map((ch) => `${formatChangeValue(ch.field, ch.from)} → ${formatChangeValue(ch.field, ch.to)}`).join(', ')}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-slate-400">No fee amount changes.</p>
      )}
    </li>
  )
}

const CpitlFeeStructureDetail: React.FC = () => {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const invalidate = useInvalidateCpitl()
  const { currentSession } = useAcademicSession()

  const { data: structure, isLoading } = useFeeStructure(isNew ? undefined : id)
  const { data: heads = [] } = useFeeHeads()
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

  const componentByHead = useMemo(() => new Map(components.map((c) => [c.feeHead, c])), [components])
  const annual = useMemo(() => components.filter((c) => !c.isOptional).reduce((s, c) => s + annualFor(c, plan), 0), [components, plan])
  const annualOptional = useMemo(() => components.filter((c) => c.isOptional).reduce((s, c) => s + annualFor(c, plan), 0), [components, plan])
  const preview = useMemo(() => schedulePreview(components, plan), [components, plan])

  const toggleHead = (headId: string) => {
    const head = heads.find((h) => h._id === headId)
    if (!head) return
    setComponents((prev) =>
      prev.some((c) => c.feeHead === headId)
        ? prev.filter((c) => c.feeHead !== headId)
        : [...prev, { feeHead: head._id, name: head.name, code: head.code, amount: 0, frequency: head.frequency, isOptional: Boolean(head.isOptional) }]
    )
    touch()
  }

  const updateComponent = (headId: string, patch: Partial<StructureComponent>) => {
    setComponents((prev) => prev.map((c) => (c.feeHead === headId ? { ...c, ...patch } : c)))
    touch()
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
      <CpitlPageShell>
        <div className="h-96 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </CpitlPageShell>
    )
  }
  if (!isNew && !structure) {
    return (
      <CpitlPageShell>
        <CpitlEmpty message="Fee structure not found." />
      </CpitlPageShell>
    )
  }

  const tabs: Array<{ key: Tab; label: string; disabled?: boolean }> = [
    { key: 'components', label: 'Fee heads' },
    { key: 'schedule', label: 'Installments & late fee' },
    { key: 'assign', label: 'Assign to classes', disabled: isNew },
    { key: 'history', label: `History${revisions.length ? ` (${revisions.length})` : ''}`, disabled: isNew },
  ]

  return (
    <CpitlPageShell
      title={isNew ? 'New fee structure' : structure?.name}
      subtitle={
        isNew
          ? `Session ${currentSession || ''}`
          : `Version ${structure?.version} · ${structure?.assignedCount || 0} students assigned · Session ${structure?.academicSession || currentSession || ''}`
      }
      actions={
        <>
          {!isNew && structure ? <CpitlBadge status={structure.status} /> : null}
          {!isNew && !readOnly ? (
            <button
              type="button"
              className={btnSecondary}
              disabled={busy === 'archive'}
              onClick={() => {
                if (window.confirm('Archive this structure? Existing student dues stay unchanged.')) {
                  run('archive', () => cpitlService.archiveStructure(id as string))
                }
              }}
            >
              <Archive className="h-4 w-4" /> Archive
            </button>
          ) : null}
          {!isNew ? (
            <button
              type="button"
              className={btnSecondary}
              onClick={async () => {
                try {
                  const copy = await cpitlService.duplicateStructure(id as string)
                  invalidate()
                  toast.success('Duplicated as draft.')
                  navigate(`/cpitl/fee-structures/${copy._id}`)
                } catch (error) {
                  toast.error(await errorMessage(error))
                }
              }}
            >
              <Copy className="h-4 w-4" /> Duplicate
            </button>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              className={btnPrimary}
              disabled={saveMutation.isPending || (!isNew && !dirty)}
              onClick={() => (isNew ? save() : setNoteOpen(true))}
            >
              <Save className="h-4 w-4" /> {isNew ? 'Create structure' : 'Save new version'}
            </button>
          ) : null}
        </>
      }
    >
      {readOnly ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          This structure is archived and read-only. Duplicate it to make changes.
        </div>
      ) : null}

      <CpitlCard>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Structure name">
            <input
              className={inputClass}
              value={name}
              disabled={readOnly}
              placeholder="e.g. Primary (Class I–V) — Day Scholar"
              onChange={(e) => {
                setName(e.target.value)
                touch()
              }}
            />
          </Field>
          <Field label="Description">
            <input
              className={inputClass}
              value={description}
              disabled={readOnly}
              placeholder="Optional notes"
              onChange={(e) => {
                setDescription(e.target.value)
                touch()
              }}
            />
          </Field>
        </div>
        <div className="mt-4">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Applies to classes</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {classes.length ? (
              classes.map((c) => {
                const on = applicableClasses.includes(c.class)
                return (
                  <button
                    key={c.class}
                    type="button"
                    disabled={readOnly}
                    onClick={() => toggleClass(c.class)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                      on
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {on ? <Check className="h-3.5 w-3.5" /> : null}
                    {c.class}
                    <span className="text-xs text-slate-400">{c.count}</span>
                  </button>
                )
              })
            ) : (
              <span className="text-sm text-slate-400">No students found in this session. Add students first.</span>
            )}
          </div>
        </div>
      </CpitlCard>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={t.disabled}
            onClick={() => setTab(t.key)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'components' && (
        <CpitlCard>
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className="w-10 px-5 py-2.5" />
                  <th className="px-3 py-2.5">Fee head</th>
                  <th className="w-40 px-3 py-2.5">Frequency</th>
                  <th className="w-40 px-3 py-2.5">Amount / installment</th>
                  <th className="w-24 px-3 py-2.5 text-center">Optional</th>
                  <th className="w-36 px-5 py-2.5 text-right">Per year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {heads.map((head) => {
                  const component = componentByHead.get(head._id)
                  const included = Boolean(component)
                  return (
                    <tr key={head._id} className={included ? '' : 'text-slate-400'}>
                      <td className="px-5 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                          checked={included}
                          disabled={readOnly}
                          onChange={() => toggleHead(head._id)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className={`font-medium ${included ? 'text-slate-900 dark:text-white' : ''}`}>{head.name}</div>
                        <div className="text-xs text-slate-400">
                          {head.code}
                          {head.isRefundable ? ' · refundable' : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {component ? (
                          <select
                            className={`${inputClass} mt-0`}
                            value={component.frequency}
                            disabled={readOnly}
                            onChange={(e) => updateComponent(head._id, { frequency: e.target.value as FeeFrequency })}
                          >
                            {FREQUENCIES.map((f) => (
                              <option key={f} value={f}>
                                {FREQUENCY_LABELS[f]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs">{FREQUENCY_LABELS[head.frequency]}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {component ? (
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span>
                            <input
                              type="number"
                              min={0}
                              className={`${inputClass} mt-0 pl-7 tabular-nums`}
                              value={component.amount || ''}
                              disabled={readOnly}
                              placeholder="0"
                              onChange={(e) => updateComponent(head._id, { amount: Number(e.target.value) })}
                            />
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {component ? (
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                            checked={Boolean(component.isOptional)}
                            disabled={readOnly}
                            onChange={(e) => updateComponent(head._id, { isOptional: e.target.checked })}
                          />
                        ) : null}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums">
                        {component ? (
                          <span className={component.isOptional ? 'text-slate-400' : 'text-slate-900 dark:text-white'}>{inr(annualFor(component, plan))}</span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 dark:border-slate-600">
                <tr>
                  <td colSpan={5} className="px-5 py-3 text-right text-sm font-medium text-slate-600 dark:text-slate-300">
                    Annual total per student
                    {annualOptional > 0 ? <span className="block text-xs font-normal text-slate-400">+ {inr(annualOptional)} for students opting into optional heads</span> : null}
                  </td>
                  <td className="px-5 py-3 text-right text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{inr(annual)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          {!heads.length ? <p className="mt-3 text-sm text-slate-500">Loading fee heads…</p> : null}
        </CpitlCard>
      )}

      {tab === 'schedule' && (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-2">
            <CpitlCard title="Installment months">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Due day of month" hint="1–28">
                  <input
                    type="number"
                    min={1}
                    max={28}
                    className={inputClass}
                    value={plan.dueDay}
                    disabled={readOnly}
                    onChange={(e) => {
                      setPlan({ ...plan, dueDay: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })
                      touch()
                    }}
                  />
                </Field>
                <Field label="One-time heads due in">
                  <MonthSelect value={plan.oneTimeMonth} disabled={readOnly} onChange={(m) => { setPlan({ ...plan, oneTimeMonth: m }); touch() }} />
                </Field>
                <Field label="Annual heads due in">
                  <MonthSelect value={plan.annualMonth} disabled={readOnly} onChange={(m) => { setPlan({ ...plan, annualMonth: m }); touch() }} />
                </Field>
              </div>
              <div className="mt-4">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Half-yearly</span>
                <div className="grid grid-cols-2 gap-3">
                  {plan.halfYearlyMonths.map((m, i) => (
                    <MonthSelect
                      key={i}
                      value={m}
                      disabled={readOnly}
                      onChange={(v) => {
                        const next = [...plan.halfYearlyMonths]
                        next[i] = v
                        setPlan({ ...plan, halfYearlyMonths: next })
                        touch()
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Quarterly</span>
                <div className="grid grid-cols-4 gap-2">
                  {plan.quarterlyMonths.map((m, i) => (
                    <MonthSelect
                      key={i}
                      value={m}
                      disabled={readOnly}
                      onChange={(v) => {
                        const next = [...plan.quarterlyMonths]
                        next[i] = v
                        setPlan({ ...plan, quarterlyMonths: next })
                        touch()
                      }}
                    />
                  ))}
                </div>
              </div>
            </CpitlCard>

            <CpitlCard title="Late fee">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Rule">
                  <select
                    className={inputClass}
                    value={lateFee.type}
                    disabled={readOnly}
                    onChange={(e) => {
                      setLateFee({ ...lateFee, type: e.target.value as LateFeeRule['type'] })
                      touch()
                    }}
                  >
                    <option value="none">No late fee</option>
                    <option value="flat">Flat fine per installment</option>
                    <option value="per_day">Per day after due date</option>
                  </select>
                </Field>
                {lateFee.type !== 'none' ? (
                  <>
                    <Field label={lateFee.type === 'per_day' ? 'Amount per day (₹)' : 'Fine amount (₹)'}>
                      <input
                        type="number"
                        min={0}
                        className={inputClass}
                        value={lateFee.amount}
                        disabled={readOnly}
                        onChange={(e) => { setLateFee({ ...lateFee, amount: Number(e.target.value) }); touch() }}
                      />
                    </Field>
                    <Field label="Grace days">
                      <input
                        type="number"
                        min={0}
                        className={inputClass}
                        value={lateFee.graceDays}
                        disabled={readOnly}
                        onChange={(e) => { setLateFee({ ...lateFee, graceDays: Number(e.target.value) }); touch() }}
                      />
                    </Field>
                    <Field label="Maximum fine (₹)" hint="0 = no cap">
                      <input
                        type="number"
                        min={0}
                        className={inputClass}
                        value={lateFee.cap}
                        disabled={readOnly}
                        onChange={(e) => { setLateFee({ ...lateFee, cap: Number(e.target.value) }); touch() }}
                      />
                    </Field>
                  </>
                ) : null}
              </div>
            </CpitlCard>
          </div>

          <CpitlCard title="Payment calendar (per student, mandatory heads)" className="lg:col-span-3">
            {preview.length ? (
              <ul className="divide-y divide-slate-100 dark:divide-slate-700">
                {preview.map((row) => (
                  <li key={row.month} className="flex items-start justify-between gap-4 py-2.5">
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">
                        {plan.dueDay} {MONTHS[row.month - 1]} {sessionYearFor(row.month, structure?.academicSession || currentSession || undefined)}
                      </div>
                      <div className="text-xs text-slate-500">{row.heads.map((h) => h.name).join(', ')}</div>
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{inr(row.amount)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <CpitlEmpty message="Add fee heads with amounts to see the payment calendar." />
            )}
          </CpitlCard>
        </div>
      )}

      {tab === 'assign' && !isNew && (
        <div className="space-y-6">
          {dirty ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              You have unsaved changes. Save a new version before assigning so students get the latest amounts.
            </div>
          ) : null}
          <CpitlCard
            title="Assign to students"
            actions={
              <button type="button" className={btnPrimary} disabled={Boolean(busy) || readOnly || dirty} onClick={() => assign()}>
                <Users className="h-4 w-4" /> Assign to all selected classes
              </button>
            }
          >
            <p className="mb-4 text-sm text-slate-500">
              Assigning creates each student's fee account and installments for this session. Students who already have a
              structure are moved to this one; installments that already have payments are kept as they are.
            </p>
            {applicableClasses.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {applicableClasses.map((cls) => {
                  const info = classes.find((c) => c.class === cls)
                  const picked = assignSections[cls] || []
                  return (
                    <div key={cls} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900 dark:text-white">Class {cls}</span>
                        <span className="text-xs text-slate-500">{info?.count || 0} students</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(info?.sections || []).map((s) => {
                          const on = picked.includes(s.section)
                          return (
                            <button
                              key={s.section}
                              type="button"
                              onClick={() =>
                                setAssignSections((prev) => ({
                                  ...prev,
                                  [cls]: on ? picked.filter((x) => x !== s.section) : [...picked, s.section],
                                }))
                              }
                              className={`rounded-md border px-2 py-0.5 text-xs ${
                                on ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200' : 'border-slate-200 text-slate-600 dark:border-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {s.section || '—'} ({s.count})
                            </button>
                          )
                        })}
                      </div>
                      <button
                        type="button"
                        className={`${btnSecondary} mt-3 w-full`}
                        disabled={Boolean(busy) || readOnly || dirty}
                        onClick={() => assign(cls)}
                      >
                        {busy === `assign-${cls}` ? 'Assigning…' : picked.length ? `Assign to section ${picked.join(', ')}` : 'Assign to whole class'}
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <CpitlEmpty message="Select the classes this structure applies to (above), save, then assign." />
            )}
          </CpitlCard>

          {structure && structure.assignedCount > 0 ? (
            <CpitlCard title="Apply latest version to assigned students">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Saving a new version does not change dues already issued. Use this to recalculate the unpaid installments of all{' '}
                  {structure.assignedCount} assigned students with version {structure.version}.
                </p>
                <button
                  type="button"
                  className={btnSecondary}
                  disabled={Boolean(busy) || readOnly || dirty}
                  onClick={() => {
                    if (window.confirm('Recalculate unpaid installments for all assigned students?')) {
                      run('reapply', () => cpitlService.reapplyStructure(structure._id))
                    }
                  }}
                >
                  <RefreshCw className={`h-4 w-4 ${busy === 'reapply' ? 'animate-spin' : ''}`} /> Re-apply to unpaid dues
                </button>
              </div>
            </CpitlCard>
          ) : null}
        </div>
      )}

      {tab === 'history' && !isNew && (
        <CpitlCard title="Change history">
          {revisions.length ? (
            <ol className="mt-2">
              {revisions.map((r, i) => (
                <RevisionItem key={r._id} revision={r} isLatest={i === 0} onView={() => viewSnapshot(r.version)} />
              ))}
            </ol>
          ) : (
            <CpitlEmpty message="No history yet." />
          )}
        </CpitlCard>
      )}

      <Modal isOpen={noteOpen} onClose={() => setNoteOpen(false)} title="Save new version">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This will be saved as version {(structure?.version || 0) + 1}. Already-issued dues won't change until you re-apply.
          </p>
          <Field label="What changed? (shown in history)">
            <input
              autoFocus
              className={inputClass}
              value={changeNote}
              placeholder="e.g. Tuition increased by 8% as per management decision"
              onChange={(e) => setChangeNote(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save(changeNote)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnSecondary} onClick={() => setNoteOpen(false)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} disabled={saveMutation.isPending} onClick={() => save(changeNote)}>
              <Save className="h-4 w-4" /> Save version
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(snapshot)} onClose={() => setSnapshot(null)} title={`Version ${snapshot?.version} snapshot`} size="lg">
        {snapshot?.snapshot ? (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <History className="h-4 w-4" /> {fmtDate(snapshot.createdAt)} {snapshot.changedBy?.name ? `by ${snapshot.changedBy.name}` : ''}
            </div>
            <p>
              <span className="text-slate-500">Classes:</span> {(snapshot.snapshot.applicableClasses || []).join(', ') || '—'}
            </p>
            <table className="min-w-full text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className="px-3 py-2">Fee head</th>
                  <th className="px-3 py-2">Frequency</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Per year</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {(snapshot.snapshot.components || []).map((c) => (
                  <tr key={c.feeHead}>
                    <td className="px-3 py-2">
                      {c.name}
                      {c.isOptional ? <span className="ml-1 text-xs text-slate-400">(optional)</span> : null}
                    </td>
                    <td className="px-3 py-2">{FREQUENCY_LABELS[c.frequency]}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(c.amount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{inr(annualFor(c, { ...DEFAULT_PLAN, ...(snapshot.snapshot?.installmentPlan || {}) }))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Modal>
    </CpitlPageShell>
  )
}

export default CpitlFeeStructureDetail
