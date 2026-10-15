import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Ban, CalendarCheck, Copy, BookOpenText, Pencil, Plus, RotateCcw, SearchX, Send, Trash2 } from 'lucide-react'
import {
  Button,
  Card,
  CardToolbar,
  DataTable,
  Dialog,
  EmptyState,
  Entity,
  FilterBar,
  Menu,
  Page,
  Pagination,
  Select,
  Sheet,
  TextArea,
  TextField,
  type DataTableColumn,
  type MenuItem,
} from '@/components/ui'
import {
  useAcdmcOptions,
  useDeleteLessonPlan,
  useLessonPlanStatus,
  useLessonPlans,
  useSaveLessonPlan,
} from '@/hooks/useAcdmc'
import acdmcService, { type LessonPlan, type LessonPlanStatus } from '@/services/acdmcService'
import {
  ClassContextFields,
  StatusBadge,
  TopicPicker,
  allSubjectNames,
  classLabel,
  classSelectOptions,
  errorMessage,
  sectionSelectOptions,
  shortDate,
  todayKey,
  useIsAdmin,
  type ClassContextErrors,
} from '@/components/acdmc/AcdmcUi'
import '@/components/acdmc/acdmc.css'

type Draft = {
  _id?: string
  status: LessonPlanStatus
  title: string
  teacherId: string
  teacherName: string
  className: string
  section: string
  subjectName: string
  curriculumId: string
  topicIds: string[]
  topic: string
  date: string
  periods: number
  objectives: string
  activities: string
  resources: string
  assessment: string
}

const emptyDraft = (): Draft => ({
  status: 'draft',
  title: '',
  teacherId: '',
  teacherName: '',
  className: '',
  section: '',
  subjectName: '',
  curriculumId: '',
  topicIds: [],
  topic: '',
  date: todayKey(),
  periods: 1,
  objectives: '',
  activities: '',
  resources: '',
  assessment: '',
})

const toDraft = (plan: LessonPlan): Draft => ({
  _id: plan._id,
  status: plan.status,
  title: plan.title || '',
  teacherId: plan.teacherId || '',
  teacherName: plan.teacherName || '',
  className: plan.className || '',
  section: plan.section || '',
  subjectName: plan.subjectName || '',
  curriculumId: plan.curriculumId || '',
  topicIds: plan.topicIds || [],
  topic: plan.topic || '',
  date: plan.date || todayKey(),
  periods: plan.periods || 1,
  objectives: plan.objectives || '',
  activities: plan.activities || '',
  resources: plan.resources || '',
  assessment: plan.assessment || '',
})

type When = '' | 'today' | 'week' | 'upcoming' | 'past'

const rangeFor = (when: When) => {
  const today = todayKey()
  if (when === 'today') return { from: today, to: today }
  if (when === 'upcoming') return { from: today, to: '' }
  if (when === 'past') {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const y = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { from: '', to: y }
  }
  if (when === 'week') {
    const d = new Date()
    const start = new Date(d)
    start.setDate(d.getDate() - ((d.getDay() + 6) % 7))
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    const key = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    return { from: key(start), to: key(end) }
  }
  return { from: '', to: '' }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const AcdmcLessonPlan: React.FC = () => {
  const isAdmin = useIsAdmin()
  const [searchParams, setSearchParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<LessonPlanStatus | ''>('')
  const [className, setClassName] = useState('')
  const [section, setSection] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [when, setWhen] = useState<When>('')
  const [page, setPage] = useState(1)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [errors, setErrors] = useState<ClassContextErrors & { title?: string; date?: string }>({})
  const [deliverTarget, setDeliverTarget] = useState<LessonPlan | null>(null)
  const [deliveryNote, setDeliveryNote] = useState('')
  const [deliveredOn, setDeliveredOn] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<LessonPlan | null>(null)

  const { data: options } = useAcdmcOptions()
  const range = rangeFor(when)
  const params = { q, status, className, section, subjectName, teacherId, from: range.from, to: range.to, page, limit: 25 }
  const { data, isLoading, isFetching } = useLessonPlans(params)
  const save = useSaveLessonPlan()
  const setPlanStatus = useLessonPlanStatus()
  const remove = useDeleteLessonPlan()

  useEffect(() => setPage(1), [q, status, className, section, subjectName, teacherId, when])

  useEffect(() => {
    const openId = searchParams.get('open')
    const isNew = searchParams.get('new') === '1'
    if (!openId && !isNew) return
    searchParams.delete('open')
    searchParams.delete('new')
    setSearchParams(searchParams, { replace: true })
    if (isNew) {
      setDraft(emptyDraft())
      setErrors({})
      setSheetOpen(true)
      return
    }
    acdmcService
      .getLessonPlan(openId as string)
      .then((plan) => {
        setDraft(toDraft(plan))
        setErrors({})
        setSheetOpen(true)
      })
      .catch((error) => toast.error(errorMessage(error, "Couldn't open that lesson plan.")))
  }, [searchParams, setSearchParams])

  const openCreate = () => {
    setDraft({ ...emptyDraft(), className, section, subjectName })
    setErrors({})
    setSheetOpen(true)
  }
  const openEdit = (plan: LessonPlan) => {
    setDraft(toDraft(plan))
    setErrors({})
    setSheetOpen(true)
  }
  const openDuplicate = (plan: LessonPlan) => {
    const copy = toDraft(plan)
    setDraft({ ...copy, _id: undefined, status: 'draft', section: '', teacherId: '', teacherName: '' })
    setErrors({})
    setSheetOpen(true)
    toast('Choose the section for the copy.')
  }

  const changeStatus = async (plan: LessonPlan, next: LessonPlanStatus, message: string) => {
    try {
      await setPlanStatus.mutateAsync({ id: plan._id, status: next })
      toast.success(message)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const submit = async (nextStatus?: LessonPlanStatus) => {
    const next: typeof errors = {}
    if (!draft.title.trim()) next.title = 'Add a title'
    if (!draft.className) next.className = 'Choose a class'
    if (!draft.section) next.section = 'Choose a section'
    if (!draft.subjectName.trim()) next.subjectName = 'Choose a subject'
    if (!draft.date) next.date = 'Choose the date of the lesson'
    setErrors(next)
    if (Object.keys(next).length) {
      toast.error(Object.values(next)[0] as string)
      return
    }
    const { _id, status: current, ...payload } = draft
    const status = nextStatus || (current === 'draft' || current === 'planned' ? current : undefined)
    try {
      await save.mutateAsync({ id: _id, payload: { ...payload, subjectName: payload.subjectName.trim(), ...(status ? { status } : {}) } })
      toast.success(_id ? 'Lesson plan updated.' : status === 'planned' ? 'Lesson plan saved as planned.' : 'Lesson plan saved as a draft.')
      setSheetOpen(false)
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't save the lesson plan."))
    }
  }

  const markDelivered = async () => {
    if (!deliverTarget) return
    try {
      await setPlanStatus.mutateAsync({ id: deliverTarget._id, status: 'delivered', deliveryNote, deliveredOn })
      toast.success('Marked as delivered.')
      setDeliverTarget(null)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const runDelete = async () => {
    if (!deleteTarget) return
    try {
      await remove.mutateAsync(deleteTarget._id)
      toast.success('Lesson plan deleted.')
      setDeleteTarget(null)
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't delete the lesson plan."))
    }
  }

  const rowMenu = (plan: LessonPlan): MenuItem[] => {
    const items: MenuItem[] = [{ label: 'Edit', icon: Pencil, onSelect: () => openEdit(plan) }]
    if (plan.status === 'draft' || plan.status === 'planned') {
      items.push({
        label: 'Mark as delivered',
        icon: CalendarCheck,
        onSelect: () => {
          setDeliveryNote('')
          setDeliveredOn(plan.date && plan.date <= todayKey() ? plan.date : todayKey())
          setDeliverTarget(plan)
        },
      })
    }
    if (plan.status === 'draft') items.push({ label: 'Mark as planned', icon: Send, onSelect: () => changeStatus(plan, 'planned', 'Marked as planned.') })
    if (plan.status === 'delivered') items.push({ label: 'Undo delivered', icon: RotateCcw, onSelect: () => changeStatus(plan, 'planned', 'Moved back to planned.') })
    if (plan.status === 'cancelled') items.push({ label: 'Restore as planned', icon: RotateCcw, onSelect: () => changeStatus(plan, 'planned', 'Lesson plan restored.') })
    if (plan.status === 'draft' || plan.status === 'planned') {
      items.push({ label: 'Cancel lesson', icon: Ban, onSelect: () => changeStatus(plan, 'cancelled', 'Lesson cancelled.') })
    }
    items.push({ label: 'Duplicate for another section', icon: Copy, onSelect: () => openDuplicate(plan) })
    if (isAdmin) items.push({ divider: true }, { label: 'Delete', icon: Trash2, tone: 'danger', onSelect: () => setDeleteTarget(plan) })
    return items
  }

  const columns = useMemo<DataTableColumn<LessonPlan>[]>(
    () => [
      {
        key: 'date',
        header: 'Date',
        width: 110,
        mobile: 'subtitle',
        render: (p) => (
          <Entity
            primary={shortDate(p.date)}
            secondary={p.date ? `${WEEKDAYS[new Date(`${p.date}T00:00:00`).getDay()]} · ${p.periods} ${p.periods === 1 ? 'period' : 'periods'}` : undefined}
          />
        ),
      },
      {
        key: 'title',
        header: 'Lesson',
        mobile: 'title',
        wrap: true,
        render: (p) => (
          <Entity
            primary={p.title}
            secondary={
              p.topicIds.length
                ? `${p.topicIds.length} syllabus ${p.topicIds.length === 1 ? 'topic' : 'topics'}${p.topic ? ` · ${p.topic}` : ''}`
                : p.topic || undefined
            }
          />
        ),
      },
      { key: 'class', header: 'Class', render: (p) => classLabel(p.className, p.section) },
      { key: 'subject', header: 'Subject', render: (p) => p.subjectName || '—' },
      { key: 'teacher', header: 'Teacher', mobile: 'hidden', render: (p) => p.teacherName || '—' },
      { key: 'status', header: 'Status', mobile: 'aside', render: (p) => <StatusBadge status={p.status} /> },
      {
        key: 'actions',
        header: '',
        headerLabel: 'Actions',
        interactive: true,
        width: 48,
        render: (p) => <Menu items={rowMenu(p)} label={`Actions for ${p.title}`} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAdmin]
  )

  const counts = data?.counts || { draft: 0, planned: 0, delivered: 0, cancelled: 0 }
  const total = counts.draft + counts.planned + counts.delivered + counts.cancelled
  const items = data?.items || []
  const pagination = data?.pagination
  const hasFilters = Boolean(q || status || className || section || subjectName || teacherId || when)
  const editingDelivered = draft._id && (draft.status === 'delivered' || draft.status === 'cancelled')

  return (
    <Page>
      <Card flush>
        <CardToolbar>
          <FilterBar
            search={{ value: q, onChange: setQ, placeholder: 'Search lesson, topic or teacher' }}
            chips={[
              { id: '', label: 'All', count: total, active: !status },
              { id: 'planned', label: 'Planned', count: counts.planned, active: status === 'planned' },
              { id: 'delivered', label: 'Delivered', count: counts.delivered, active: status === 'delivered' },
              { id: 'draft', label: 'Draft', count: counts.draft, active: status === 'draft' },
              { id: 'cancelled', label: 'Cancelled', count: counts.cancelled, active: status === 'cancelled' },
            ]}
            onChipClick={(id) => setStatus(id as LessonPlanStatus | '')}
            filters={
              <div className="ac-filters">
                <Select
                  size="sm"
                  aria-label="When"
                  options={[
                    { value: '', label: 'Any date' },
                    { value: 'today', label: 'Today' },
                    { value: 'week', label: 'This week' },
                    { value: 'upcoming', label: 'Upcoming' },
                    { value: 'past', label: 'Past' },
                  ]}
                  value={when}
                  onChange={(e) => setWhen(e.target.value as When)}
                />
                <Select
                  size="sm"
                  aria-label="Class"
                  placeholder="All classes"
                  options={classSelectOptions(options)}
                  value={className}
                  onChange={(e) => {
                    setClassName(e.target.value)
                    setSection('')
                  }}
                />
                {className ? (
                  <Select
                    size="sm"
                    aria-label="Section"
                    placeholder="All sections"
                    options={sectionSelectOptions(options, className)}
                    value={section}
                    onChange={(e) => setSection(e.target.value)}
                  />
                ) : null}
                <Select
                  size="sm"
                  aria-label="Subject"
                  placeholder="All subjects"
                  options={allSubjectNames(options)}
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                />
                {options?.teachers.length ? (
                  <Select
                    size="sm"
                    aria-label="Teacher"
                    placeholder="All teachers"
                    options={options.teachers.map((t) => ({ value: t._id, label: t.name }))}
                    value={teacherId}
                    onChange={(e) => setTeacherId(e.target.value)}
                  />
                ) : null}
              </div>
            }
            actions={
              <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
                Write lesson plan
              </Button>
            }
          />
        </CardToolbar>
        <DataTable
          caption="Lesson plans"
          columns={columns}
          rows={items}
          getRowKey={(p) => p._id}
          onRowClick={openEdit}
          loading={isLoading || (isFetching && !items.length)}
          loadingLabel="Loading lesson plans"
          empty={
            hasFilters ? (
              <EmptyState icon={SearchX} title="No lesson plans match these filters" body="Clear a filter or search for something else." />
            ) : (
              <EmptyState
                icon={BookOpenText}
                title="No lesson plans yet"
                body="Plan each lesson against the syllabus. Marking it delivered updates the section's syllabus coverage."
                action={
                  <Button variant="primary" icon={Plus} onClick={openCreate}>
                    Write lesson plan
                  </Button>
                }
              />
            )
          }
          footer={
            pagination && pagination.total > 0 ? (
              <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPageChange={setPage} />
            ) : undefined
          }
        />
      </Card>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        size="lg"
        icon={BookOpenText}
        title={draft._id ? 'Edit lesson plan' : 'Write lesson plan'}
        description={draft._id ? undefined : 'Save as a draft while you work, or as planned when it is ready.'}
        onSubmit={(event) => {
          event.preventDefault()
          submit(draft._id ? undefined : 'planned')
        }}
        footer={
          <>
            <Button onClick={() => setSheetOpen(false)}>Cancel</Button>
            {!draft._id || draft.status === 'draft' ? (
              <Button loading={save.isPending && !draft._id} onClick={() => submit('draft')}>
                Save as draft
              </Button>
            ) : null}
            {draft._id && draft.status === 'draft' ? (
              <Button variant="primary" loading={save.isPending} onClick={() => submit('planned')}>
                Save as planned
              </Button>
            ) : (
              <Button type="submit" variant="primary" loading={save.isPending}>
                {draft._id ? 'Save changes' : 'Save as planned'}
              </Button>
            )}
          </>
        }
      >
        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Class and subject</h3>
          <ClassContextFields
            value={draft}
            errors={errors}
            onChange={(patch) =>
              setDraft((d) => ({
                ...d,
                ...patch,
                ...(patch.className !== undefined || patch.subjectName !== undefined ? { curriculumId: '', topicIds: [] } : {}),
              }))
            }
          />
        </div>

        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Lesson</h3>
          <div className="cb-form-grid cb-form-grid--3">
            <TextField
              className="is-wide"
              label="Title"
              required
              placeholder="e.g. Adding fractions with unlike denominators"
              value={draft.title}
              error={errors.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <TextField
              label="Date"
              type="date"
              required
              value={draft.date}
              error={errors.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
            <TextField
              label="Periods"
              type="number"
              min={1}
              max={20}
              value={String(draft.periods)}
              onChange={(e) => setDraft({ ...draft, periods: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })}
            />
          </div>
        </div>

        <div className="cb-form-section">
          <h3 className="cb-form-section__title">What's covered</h3>
          <TopicPicker
            className={draft.className}
            section={draft.section}
            subjectName={draft.subjectName}
            curriculumId={draft.curriculumId}
            topicIds={draft.topicIds}
            onChange={(value) => setDraft((d) => ({ ...d, ...value }))}
          />
          <TextField
            label="Other topic"
            hint="Anything not in the syllabus, or the topic in your own words."
            value={draft.topic}
            onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
          />
        </div>

        <div className="cb-form-section">
          <h3 className="cb-form-section__title">Plan</h3>
          <TextArea label="Learning objectives" rows={3} value={draft.objectives} onChange={(e) => setDraft({ ...draft, objectives: e.target.value })} />
          <TextArea label="Classroom activities" rows={4} value={draft.activities} onChange={(e) => setDraft({ ...draft, activities: e.target.value })} />
          <TextArea label="Resources" rows={2} hint="Books, pages, worksheets, links." value={draft.resources} onChange={(e) => setDraft({ ...draft, resources: e.target.value })} />
          <TextArea label="How you'll check learning" rows={2} value={draft.assessment} onChange={(e) => setDraft({ ...draft, assessment: e.target.value })} />
        </div>

        {editingDelivered ? (
          <p className="cb-muted ac-note">
            This lesson is {draft.status}. Use the row's actions to change its status.
          </p>
        ) : null}
      </Sheet>

      <Dialog
        open={Boolean(deliverTarget)}
        onClose={() => setDeliverTarget(null)}
        title="Mark lesson as delivered"
        description={deliverTarget ? `${deliverTarget.title} · ${classLabel(deliverTarget.className, deliverTarget.section)}` : undefined}
        footer={
          <>
            <Button onClick={() => setDeliverTarget(null)}>Cancel</Button>
            <Button variant="primary" icon={CalendarCheck} loading={setPlanStatus.isPending} onClick={markDelivered}>
              Mark as delivered
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <TextField label="Delivered on" type="date" max={todayKey()} value={deliveredOn} onChange={(e) => setDeliveredOn(e.target.value)} />
          <TextArea
            label="How it went"
            hint="Optional. What was finished, what carries over."
            rows={3}
            value={deliveryNote}
            onChange={(e) => setDeliveryNote(e.target.value)}
          />
        </div>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        tone="danger"
        title="Delete this lesson plan?"
        description={deleteTarget ? `${deleteTarget.title} will be removed and no longer count towards syllabus coverage.` : undefined}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={remove.isPending} onClick={runDelete}>
              Delete lesson plan
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default AcdmcLessonPlan
