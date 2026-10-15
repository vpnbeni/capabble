import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Archive, Copy, Pencil, Plus, RotateCcw, SearchX, Send, Trash2, type LucideIcon } from 'lucide-react'
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
  Progress,
  Select,
  Sheet,
  TextArea,
  TextField,
  type DataTableColumn,
  type MenuItem,
} from '@/components/ui'
import {
  useAcdmcOptions,
  useClassWorkList,
  useClassWorkStatus,
  useDeleteClassWork,
  useSaveClassWork,
} from '@/hooks/useAcdmc'
import type { ClassWork, ClassWorkKind, ClassWorkStatus } from '@/services/acdmcService'
import {
  ClassContextFields,
  KIND_META,
  StatusBadge,
  TopicPicker,
  allSubjectNames,
  classLabel,
  classSelectOptions,
  errorMessage,
  sectionSelectOptions,
  shortDate,
  todayKey,
  useCanDeleteAcademics,
  type ClassContextErrors,
} from './AcdmcUi'
import './acdmc.css'

export type ClassWorkDraft = {
  _id?: string
  status: ClassWorkStatus
  title: string
  teacherId: string
  teacherName: string
  className: string
  section: string
  subjectName: string
  curriculumId: string
  topicIds: string[]
  assignedDate: string
  dueDate: string
  instructions: string
  maxMarks: number
  date: string
  topic: string
  durationMinutes: number
}

const inDays = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const emptyClassWork = (kind: ClassWorkKind): ClassWorkDraft => ({
  status: 'draft',
  title: '',
  teacherId: '',
  teacherName: '',
  className: '',
  section: '',
  subjectName: '',
  curriculumId: '',
  topicIds: [],
  assignedDate: todayKey(),
  dueDate: kind === 'homework' ? inDays(1) : kind === 'assignment' ? inDays(7) : '',
  instructions: '',
  maxMarks: 20,
  date: kind === 'quiz' ? inDays(1) : '',
  topic: '',
  durationMinutes: 15,
})

export const toClassWorkDraft = (work: ClassWork): ClassWorkDraft => ({
  _id: work._id,
  status: work.status,
  title: work.title || '',
  teacherId: work.teacherId || '',
  teacherName: work.teacherName || '',
  className: work.className || '',
  section: work.section || '',
  subjectName: work.subjectName || '',
  curriculumId: work.curriculumId || '',
  topicIds: work.topicIds || [],
  assignedDate: work.assignedDate || '',
  dueDate: work.dueDate || '',
  instructions: work.instructions || '',
  maxMarks: work.maxMarks || 20,
  date: work.date || work.dueDate || '',
  topic: work.topic || '',
  durationMinutes: work.durationMinutes || 15,
})

/** Builds the API payload for one kind of class work from the shared draft. */
export const classWorkPayload = (kind: ClassWorkKind, draft: ClassWorkDraft, questions?: ClassWork['questions']) => {
  const base: Partial<ClassWork> = {
    title: draft.title.trim(),
    teacherId: draft.teacherId,
    teacherName: draft.teacherName,
    className: draft.className,
    section: draft.section,
    subjectName: draft.subjectName.trim(),
    curriculumId: draft.curriculumId,
    topicIds: draft.topicIds,
    assignedDate: draft.assignedDate,
    instructions: draft.instructions,
  }
  if (kind === 'homework') return { ...base, dueDate: draft.dueDate }
  if (kind === 'assignment') return { ...base, dueDate: draft.dueDate, maxMarks: Number(draft.maxMarks) }
  return {
    ...base,
    date: draft.date,
    topic: draft.topic,
    durationMinutes: Number(draft.durationMinutes) || 15,
    questions: questions || [],
  }
}

type Errors = ClassContextErrors & { title?: string; dueDate?: string; date?: string; maxMarks?: string }

export const validateClassWork = (kind: ClassWorkKind, draft: ClassWorkDraft): Errors => {
  const next: Errors = {}
  if (!draft.title.trim()) next.title = 'Add a title'
  if (!draft.className) next.className = 'Choose a class'
  if (!draft.section) next.section = 'Choose a section'
  if (!draft.subjectName.trim()) next.subjectName = 'Choose a subject'
  if (kind === 'quiz') {
    if (!draft.date) next.date = 'Choose the quiz date'
  } else {
    if (!draft.dueDate) next.dueDate = 'Choose a due date'
    else if (draft.assignedDate && draft.dueDate < draft.assignedDate) next.dueDate = "Due date can't be before the date it was set"
  }
  if (kind === 'assignment' && (!Number(draft.maxMarks) || Number(draft.maxMarks) < 1)) next.maxMarks = 'Maximum marks must be at least 1'
  return next
}

/** The class-work form body (class, details, topics), shared by the list Sheet and the quiz page. */
export const ClassWorkFields: React.FC<{
  kind: ClassWorkKind
  draft: ClassWorkDraft
  setDraft: React.Dispatch<React.SetStateAction<ClassWorkDraft>>
  errors: Errors
}> = ({ kind, draft, setDraft, errors }) => {
  const set = (patch: Partial<ClassWorkDraft>) => setDraft((d) => ({ ...d, ...patch }))
  return (
    <>
      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Class and subject</h3>
        <ClassContextFields
          value={draft}
          errors={errors}
          onChange={(patch) =>
            set({
              ...patch,
              ...(patch.className !== undefined || patch.subjectName !== undefined ? { curriculumId: '', topicIds: [] } : {}),
            })
          }
        />
      </div>

      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Details</h3>
        <div className="cb-form-grid">
          <TextField
            className="is-wide"
            label="Title"
            required
            value={draft.title}
            error={errors.title}
            placeholder={kind === 'homework' ? 'e.g. Exercise 3.2, questions 1–10' : kind === 'quiz' ? 'e.g. Fractions check-in' : 'e.g. Project on local water sources'}
            onChange={(e) => set({ title: e.target.value })}
          />
          {kind === 'quiz' ? (
            <>
              <TextField label="Quiz date" type="date" required value={draft.date} error={errors.date} onChange={(e) => set({ date: e.target.value })} />
              <TextField
                label="Duration"
                type="number"
                min={1}
                max={600}
                suffix="min"
                value={String(draft.durationMinutes)}
                onChange={(e) => set({ durationMinutes: Math.max(1, Number(e.target.value) || 1) })}
              />
            </>
          ) : (
            <>
              <TextField label="Set on" type="date" value={draft.assignedDate} onChange={(e) => set({ assignedDate: e.target.value })} />
              <TextField label="Due date" type="date" required value={draft.dueDate} error={errors.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
            </>
          )}
          {kind === 'assignment' ? (
            <TextField
              label="Maximum marks"
              type="number"
              min={1}
              max={1000}
              required
              value={String(draft.maxMarks)}
              error={errors.maxMarks}
              onChange={(e) => set({ maxMarks: Number(e.target.value) })}
            />
          ) : null}
          <TextArea
            className="is-wide"
            label={kind === 'quiz' ? 'Instructions for students' : 'Instructions'}
            rows={kind === 'homework' ? 4 : 5}
            value={draft.instructions}
            onChange={(e) => set({ instructions: e.target.value })}
          />
        </div>
      </div>

      <div className="cb-form-section">
        <h3 className="cb-form-section__title">Syllabus topics</h3>
        <TopicPicker
          className={draft.className}
          section={draft.section}
          subjectName={draft.subjectName}
          curriculumId={draft.curriculumId}
          topicIds={draft.topicIds}
          onChange={(value) => set(value)}
        />
      </div>
    </>
  )
}

type Config = {
  kind: ClassWorkKind
  icon: LucideIcon
  emptyBody: string
}

const ClassWorkList: React.FC<Config> = ({ kind, icon, emptyBody }) => {
  const meta = KIND_META[kind]
  const navigate = useNavigate()
  const canDelete = useCanDeleteAcademics('classwork')
  const [searchParams, setSearchParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<ClassWorkStatus | ''>('')
  const [className, setClassName] = useState('')
  const [section, setSection] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [page, setPage] = useState(1)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<ClassWorkDraft>(() => emptyClassWork(kind))
  const [errors, setErrors] = useState<Errors>({})
  const [deleteTarget, setDeleteTarget] = useState<ClassWork | null>(null)

  const { data: options } = useAcdmcOptions()
  const { data, isLoading, isFetching } = useClassWorkList(kind, { q, status, className, section, subjectName, page, limit: 25 })
  const save = useSaveClassWork(kind)
  const setWorkStatus = useClassWorkStatus(kind)
  const remove = useDeleteClassWork(kind)

  useEffect(() => setPage(1), [q, status, className, section, subjectName])

  useEffect(() => {
    if (searchParams.get('new') !== '1') return
    searchParams.delete('new')
    setSearchParams(searchParams, { replace: true })
    setDraft(emptyClassWork(kind))
    setErrors({})
    setSheetOpen(true)
  }, [searchParams, setSearchParams, kind])

  const openCreate = () => {
    setDraft({ ...emptyClassWork(kind), className, section, subjectName })
    setErrors({})
    setSheetOpen(true)
  }
  const openEdit = (work: ClassWork) => {
    setDraft(toClassWorkDraft(work))
    setErrors({})
    setSheetOpen(true)
  }

  const changeStatus = async (work: ClassWork, next: ClassWorkStatus, message: string) => {
    try {
      await setWorkStatus.mutateAsync({ id: work._id, status: next })
      toast.success(message)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  }

  const submit = async (publish: boolean) => {
    const next = validateClassWork(kind, draft)
    setErrors(next)
    if (Object.keys(next).length) {
      toast.error(Object.values(next)[0] as string)
      return
    }
    try {
      // Quiz questions are edited on the quiz page, so this sheet never sends them.
      const { questions: _questions, ...payload } = classWorkPayload(kind, draft) as Partial<ClassWork>
      const status: ClassWorkStatus | undefined = !draft._id || draft.status === 'draft' ? (publish ? 'published' : 'draft') : undefined
      const saved = await save.mutateAsync({ id: draft._id, payload: { ...payload, ...(status ? { status } : {}) } })
      setSheetOpen(false)
      if (!draft._id) {
        toast.success(kind === 'quiz' ? 'Quiz saved. Add its questions.' : publish ? `${meta.label} published.` : `${meta.label} saved as a draft.`)
        if (kind === 'quiz') navigate(`${meta.path}/${saved._id}`)
      } else {
        toast.success(`${meta.label} updated.`)
      }
    } catch (error) {
      toast.error(errorMessage(error, `Couldn't save the ${meta.noun}.`))
    }
  }

  const runDelete = async () => {
    if (!deleteTarget) return
    try {
      await remove.mutateAsync(deleteTarget._id)
      toast.success(`${meta.label} deleted.`)
      setDeleteTarget(null)
    } catch (error) {
      toast.error(errorMessage(error, `Couldn't delete the ${meta.noun}.`))
    }
  }

  const rowMenu = (work: ClassWork): MenuItem[] => {
    const items: MenuItem[] = [{ label: 'Edit details', icon: Pencil, onSelect: () => openEdit(work) }]
    if (work.status === 'draft') items.push({ label: 'Publish', icon: Send, onSelect: () => changeStatus(work, 'published', `${meta.label} published.`) })
    if (work.status === 'published') {
      items.push({ label: 'Close', icon: Archive, hint: 'Stop expecting work', onSelect: () => changeStatus(work, 'closed', `${meta.label} closed.`) })
      items.push({ label: 'Move to draft', icon: RotateCcw, onSelect: () => changeStatus(work, 'draft', 'Moved to draft.') })
    }
    if (work.status === 'closed') items.push({ label: 'Reopen', icon: RotateCcw, onSelect: () => changeStatus(work, 'published', `${meta.label} reopened.`) })
    items.push({
      label: 'Set for another section',
      icon: Copy,
      onSelect: () => {
        setDraft({ ...toClassWorkDraft(work), _id: undefined, status: 'draft', section: '', teacherId: '', teacherName: '' })
        setErrors({})
        setSheetOpen(true)
        toast('Choose the section for the copy.')
      },
    })
    if (canDelete) items.push({ divider: true }, { label: 'Delete', icon: Trash2, tone: 'danger', onSelect: () => setDeleteTarget(work) })
    return items
  }

  const columns = useMemo<DataTableColumn<ClassWork>[]>(() => {
    const cols: DataTableColumn<ClassWork>[] = [
      {
        key: 'title',
        header: meta.label,
        mobile: 'title',
        wrap: true,
        render: (w) => (
          <Entity
            primary={w.title}
            secondary={[w.subjectName, w.teacherName].filter(Boolean).join(' · ') || undefined}
          />
        ),
      },
      { key: 'class', header: 'Class', mobile: 'subtitle', render: (w) => classLabel(w.className, w.section) },
      {
        key: 'date',
        header: kind === 'quiz' ? 'Quiz date' : 'Due',
        render: (w) => shortDate(kind === 'quiz' ? w.date || w.dueDate : w.dueDate),
      },
    ]
    if (kind === 'quiz') {
      cols.push({ key: 'questions', header: 'Questions', numeric: true, align: 'right', render: (w) => `${w.questionCount ?? 0} · ${w.maxMarks ?? 0} marks` })
      cols.push({
        key: 'marked',
        header: 'Marked',
        width: 160,
        mobile: 'hidden',
        render: (w) => (w.summary.total ? <Progress size="sm" value={w.summary.marked} max={w.summary.total} valueLabel={`${w.summary.marked}/${w.summary.total}`} /> : '—'),
      })
    } else {
      cols.push({
        key: 'submitted',
        header: 'Turned in',
        width: 160,
        mobile: 'hidden',
        render: (w) =>
          w.summary.total ? (
            <Progress size="sm" value={w.summary.turnedIn} max={w.summary.total} valueLabel={`${w.summary.turnedIn}/${w.summary.total}`} />
          ) : (
            <span className="cb-subtle">{w.status === 'draft' ? 'Not published' : 'Not recorded'}</span>
          ),
      })
    }
    if (kind === 'assignment') {
      cols.push({
        key: 'avg',
        header: 'Average',
        numeric: true,
        align: 'right',
        mobile: 'hidden',
        render: (w) => (w.summary.average != null ? `${w.summary.average} / ${w.maxMarks}` : '—'),
      })
    }
    cols.push({ key: 'status', header: 'Status', mobile: 'aside', render: (w) => <StatusBadge status={w.status} /> })
    cols.push({
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      interactive: true,
      width: 48,
      render: (w) => <Menu items={rowMenu(w)} label={`Actions for ${w.title}`} />,
    })
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, canDelete])

  const counts = data?.counts || { draft: 0, published: 0, closed: 0 }
  const items = data?.items || []
  const pagination = data?.pagination
  const hasFilters = Boolean(q || status || className || section || subjectName)
  const isNew = !draft._id
  const canPublish = isNew || draft.status === 'draft'

  return (
    <Page>
      <Card flush>
        <CardToolbar>
          <FilterBar
            search={{ value: q, onChange: setQ, placeholder: `Search ${meta.noun}` }}
            chips={[
              { id: '', label: 'All', count: counts.draft + counts.published + counts.closed, active: !status },
              { id: 'published', label: 'Published', count: counts.published, active: status === 'published' },
              { id: 'draft', label: 'Draft', count: counts.draft, active: status === 'draft' },
              { id: 'closed', label: 'Closed', count: counts.closed, active: status === 'closed' },
            ]}
            onChipClick={(id) => setStatus(id as ClassWorkStatus | '')}
            filters={
              <div className="ac-filters">
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
              </div>
            }
            actions={
              <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
                {kind === 'homework' ? 'Set homework' : kind === 'quiz' ? 'Create quiz' : 'Set assignment'}
              </Button>
            }
          />
        </CardToolbar>
        <DataTable
          caption={meta.plural}
          columns={columns}
          rows={items}
          getRowKey={(w) => w._id}
          onRowClick={(w) => navigate(`${meta.path}/${w._id}`)}
          loading={isLoading || (isFetching && !items.length)}
          loadingLabel={`Loading ${meta.plural.toLowerCase()}`}
          empty={
            hasFilters ? (
              <EmptyState icon={SearchX} title={`No ${meta.plural.toLowerCase()} match these filters`} body="Clear a filter or search for something else." />
            ) : (
              <EmptyState
                icon={icon}
                title={`No ${meta.plural.toLowerCase()} yet`}
                body={emptyBody}
                action={
                  <Button variant="primary" icon={Plus} onClick={openCreate}>
                    {kind === 'homework' ? 'Set homework' : kind === 'quiz' ? 'Create quiz' : 'Set assignment'}
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
        icon={icon}
        title={isNew ? (kind === 'homework' ? 'Set homework' : kind === 'quiz' ? 'Create quiz' : 'Set assignment') : `Edit ${meta.noun}`}
        description={
          isNew
            ? kind === 'quiz'
              ? 'You will add the questions on the next page.'
              : 'Publish when it is ready to record who turns it in.'
            : undefined
        }
        onSubmit={(event) => {
          event.preventDefault()
          submit(kind !== 'quiz' && canPublish)
        }}
        footer={
          <>
            <Button onClick={() => setSheetOpen(false)}>Cancel</Button>
            {canPublish && kind !== 'quiz' ? (
              <Button loading={save.isPending} onClick={() => submit(false)}>
                Save as draft
              </Button>
            ) : null}
            <Button type="submit" variant="primary" loading={save.isPending}>
              {kind === 'quiz'
                ? isNew
                  ? 'Create and add questions'
                  : 'Save changes'
                : canPublish
                  ? `Publish ${meta.noun}`
                  : 'Save changes'}
            </Button>
          </>
        }
      >
        <ClassWorkFields kind={kind} draft={draft} setDraft={setDraft} errors={errors} />
        {!isNew && draft.status !== 'draft' ? (
          <p className="cb-muted ac-note">Changing the class or section clears the submissions recorded so far.</p>
        ) : null}
      </Sheet>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        tone="danger"
        title={`Delete this ${meta.noun}?`}
        description={deleteTarget ? `${deleteTarget.title} and its recorded submissions and marks will be removed.` : undefined}
        footer={
          <>
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={remove.isPending} onClick={runDelete}>
              Delete {meta.noun}
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default ClassWorkList
