import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Archive,
  ArrowDown,
  ArrowUp,
  CheckCheck,
  ListChecks,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Send,
  Trash2,
  Users,
} from 'lucide-react'
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
  Menu,
  MetricTile,
  MetricTiles,
  Page,
  Paper,
  PaperStage,
  Select,
  Sheet,
  Tabs,
  TextArea,
  TextField,
  type DataTableColumn,
  type MenuItem,
} from '@/components/ui'
import {
  useClassWork,
  useClassWorkStatus,
  useDeleteClassWork,
  useRoster,
  useSaveClassWork,
  useSaveSubmissions,
} from '@/hooks/useAcdmc'
import type { ClassWork, ClassWorkKind, ClassWorkStatus, Question, QuestionType, RosterRow, SubmissionStatus } from '@/services/acdmcService'
import {
  KIND_META,
  StatusBadge,
  classLabel,
  errorMessage,
  printElement,
  shortDate,
  useIsAdmin,
} from '@/components/acdmc/AcdmcUi'
import {
  ClassWorkFields,
  classWorkPayload,
  toClassWorkDraft,
  validateClassWork,
  type ClassWorkDraft,
} from '@/components/acdmc/ClassWorkList'
import '@/components/acdmc/acdmc.css'

const STATUS_OPTIONS: Record<ClassWorkKind, Array<{ value: SubmissionStatus; label: string }>> = {
  homework: [
    { value: 'pending', label: 'Pending' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'late', label: 'Late' },
    { value: 'missing', label: 'Missing' },
    { value: 'excused', label: 'Excused' },
  ],
  assignment: [
    { value: 'pending', label: 'Pending' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'late', label: 'Late' },
    { value: 'missing', label: 'Missing' },
    { value: 'excused', label: 'Excused' },
  ],
  quiz: [
    { value: 'pending', label: 'Not marked' },
    { value: 'submitted', label: 'Attempted' },
    { value: 'missing', label: 'Absent' },
    { value: 'excused', label: 'Excused' },
  ],
}

const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'short', label: 'Short answer' },
  { value: 'long', label: 'Long answer' },
]

const newQuestion = (type: QuestionType = 'mcq'): Question => ({
  type,
  text: '',
  options: type === 'mcq' ? ['', '', '', ''] : [],
  answer: '',
  marks: type === 'long' ? 5 : type === 'short' ? 2 : 1,
})

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

type Tab = 'students' | 'questions' | 'paper'

const AcdmcWorkDetail: React.FC<{ kind: ClassWorkKind }> = ({ kind }) => {
  const meta = KIND_META[kind]
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const { data: work, isLoading, isError, error, refetch } = useClassWork(kind, id)
  const { data: roster, isLoading: rosterLoading } = useRoster(kind, id, Boolean(work))
  const saveWork = useSaveClassWork(kind)
  const setStatus = useClassWorkStatus(kind)
  const saveSubs = useSaveSubmissions(kind)
  const remove = useDeleteClassWork(kind)

  const [tab, setTab] = useState<Tab>(kind === 'quiz' ? 'questions' : 'students')
  const [rows, setRows] = useState<RosterRow[]>([])
  const [rowsDirty, setRowsDirty] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [questionsDirty, setQuestionsDirty] = useState(false)
  const [withKey, setWithKey] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [draft, setDraft] = useState<ClassWorkDraft | null>(null)
  const [draftErrors, setDraftErrors] = useState<ReturnType<typeof validateClassWork>>({})
  const [deleteOpen, setDeleteOpen] = useState(false)
  const paperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (roster && !rowsDirty) setRows(roster.rows.map((r) => ({ ...r })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster])

  useEffect(() => {
    if (work && !questionsDirty) setQuestions((work.questions || []).map((q) => ({ ...q, options: [...q.options] })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work])

  const marked = kind !== 'homework'
  const maxMarks = roster?.maxMarks ?? (kind === 'assignment' ? work?.maxMarks ?? null : work?.maxMarks || null)
  const questionTotal = useMemo(() => questions.reduce((t, q) => t + (Number(q.marks) || 0), 0), [questions])

  const live = useMemo(() => {
    const counts = { submitted: 0, late: 0, missing: 0, pending: 0, excused: 0 }
    rows.forEach((r) => { counts[r.status] += 1 })
    const marks = rows.map((r) => r.marks).filter((m): m is number => m !== null && m !== undefined && !Number.isNaN(m))
    const average = marks.length ? Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 10) / 10 : null
    return { ...counts, turnedIn: counts.submitted + counts.late, marks, average, highest: marks.length ? Math.max(...marks) : null }
  }, [rows])

  if (isLoading) {
    return (
      <Page>
        <Card>
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading {meta.noun}
          </div>
        </Card>
      </Page>
    )
  }

  if (isError || !work) {
    return (
      <Page>
        <Card>
          <EmptyState
            title={`Couldn't open this ${meta.noun}`}
            body={errorMessage(error, 'It may have been deleted.')}
            action={[
              <Button key="back" onClick={() => navigate(meta.path)}>Back to {meta.plural.toLowerCase()}</Button>,
              <Button key="retry" icon={RefreshCw} onClick={() => refetch()}>Try again</Button>,
            ]}
          />
        </Card>
      </Page>
    )
  }

  const changeStatus = async (next: ClassWorkStatus, message: string) => {
    if (questionsDirty && next === 'published') {
      toast.error('Save your question changes first.')
      return
    }
    try {
      await setStatus.mutateAsync({ id: work._id, status: next })
      toast.success(message)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const updateRow = (studentId: string, patch: Partial<RosterRow>) => {
    setRows((list) => list.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)))
    setRowsDirty(true)
  }

  const saveRows = async () => {
    const over = maxMarks != null ? rows.find((r) => r.marks != null && r.marks > maxMarks) : undefined
    if (over) {
      toast.error(`Marks can't be more than ${maxMarks} (${over.studentName} has ${over.marks}).`)
      return
    }
    try {
      await saveSubs.mutateAsync({
        id: work._id,
        rows: rows.map((r) => ({
          studentId: r.studentId,
          studentName: r.studentName,
          rollNo: r.rollNo,
          status: r.status,
          marks: marked ? r.marks : null,
          remark: r.remark,
        })),
      })
      setRowsDirty(false)
      toast.success(marked ? 'Marks saved.' : 'Submissions saved.')
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save."))
    }
  }

  const saveQuestions = async () => {
    const problem = questions.findIndex((q) => !q.text.trim())
    if (problem >= 0) {
      toast.error(`Question ${problem + 1} needs some text.`)
      return
    }
    const mcqProblem = questions.findIndex((q) => q.type === 'mcq' && q.options.filter((o) => o.trim()).length < 2)
    if (mcqProblem >= 0) {
      toast.error(`Question ${mcqProblem + 1} needs at least two options.`)
      return
    }
    try {
      const cleaned = questions.map((q) => ({
        ...q,
        options: q.type === 'mcq' ? q.options.map((o) => o.trim()).filter(Boolean) : [],
        answer: q.type === 'mcq' && !q.options.map((o) => o.trim()).includes(q.answer.trim()) ? '' : q.answer.trim(),
      }))
      const saved = await saveWork.mutateAsync({ id: work._id, payload: classWorkPayload(kind, toClassWorkDraft(work), cleaned) })
      setQuestions((saved.questions || []).map((q) => ({ ...q, options: [...q.options] })))
      setQuestionsDirty(false)
      toast.success('Questions saved.')
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the questions."))
    }
  }

  const editQuestion = (index: number, patch: Partial<Question>) => {
    setQuestions((list) => list.map((q, i) => (i === index ? { ...q, ...patch } : q)))
    setQuestionsDirty(true)
  }
  const moveQuestion = (index: number, step: number) => {
    setQuestions((list) => {
      const next = [...list]
      const [item] = next.splice(index, 1)
      next.splice(index + step, 0, item)
      return next
    })
    setQuestionsDirty(true)
  }

  const submitEdit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!draft) return
    const next = validateClassWork(kind, draft)
    setDraftErrors(next)
    if (Object.keys(next).length) {
      toast.error(Object.values(next)[0] as string)
      return
    }
    try {
      const { questions: _questions, ...payload } = classWorkPayload(kind, draft) as Partial<ClassWork>
      await saveWork.mutateAsync({ id: work._id, payload })
      setRowsDirty(false)
      setEditOpen(false)
      toast.success(`${meta.label} updated.`)
    } catch (err) {
      toast.error(errorMessage(err, `Couldn't save the ${meta.noun}.`))
    }
  }

  const runDelete = async () => {
    try {
      await remove.mutateAsync(work._id)
      toast.success(`${meta.label} deleted.`)
      navigate(meta.path)
    } catch (err) {
      toast.error(errorMessage(err, `Couldn't delete the ${meta.noun}.`))
    }
  }

  const primaryAction =
    work.status === 'draft' ? (
      <Button size="sm" variant="primary" icon={Send} loading={setStatus.isPending} onClick={() => changeStatus('published', `${meta.label} published.`)}>
        Publish {meta.noun}
      </Button>
    ) : work.status === 'published' ? (
      <Button size="sm" icon={Archive} loading={setStatus.isPending} onClick={() => changeStatus('closed', `${meta.label} closed.`)}>
        Close {meta.noun}
      </Button>
    ) : (
      <Button size="sm" icon={RotateCcw} loading={setStatus.isPending} onClick={() => changeStatus('published', `${meta.label} reopened.`)}>
        Reopen
      </Button>
    )

  const menuItems: MenuItem[] = [
    {
      label: 'Edit details',
      icon: Pencil,
      onSelect: () => {
        setDraft(toClassWorkDraft(work))
        setDraftErrors({})
        setEditOpen(true)
      },
    },
    ...(work.status === 'published' ? [{ label: 'Move to draft', icon: RotateCcw, onSelect: () => changeStatus('draft', 'Moved to draft.') }] : []),
    ...(isAdmin ? [{ divider: true } as const, { label: `Delete ${meta.noun}`, icon: Trash2, tone: 'danger' as const, onSelect: () => setDeleteOpen(true) }] : []),
  ]

  const rosterColumns: DataTableColumn<RosterRow>[] = [
    { key: 'roll', header: 'Roll no.', width: 80, numeric: true, mobile: 'hidden', render: (r) => r.rollNo || '—' },
    {
      key: 'name',
      header: 'Student',
      mobile: 'title',
      render: (r) => (
        <span className="cb-entity">
          <span className="cb-entity__primary">{r.studentName}</span>
          {!r.enrolled ? <span className="cb-entity__secondary">No longer in this class</span> : null}
        </span>
      ),
    },
    {
      key: 'status',
      header: kind === 'quiz' ? 'Attempt' : 'Status',
      interactive: true,
      width: 160,
      mobile: 'aside',
      render: (r) => (
        <Select
          size="sm"
          aria-label={`Status for ${r.studentName}`}
          options={STATUS_OPTIONS[kind]}
          value={r.status}
          disabled={work.status === 'draft'}
          onChange={(e) => updateRow(r.studentId, { status: e.target.value as SubmissionStatus })}
        />
      ),
    },
    ...(marked
      ? [
          {
            key: 'marks',
            header: `Marks${maxMarks ? ` / ${maxMarks}` : ''}`,
            interactive: true,
            width: 120,
            render: (r: RosterRow) => (
              <TextField
                size="sm"
                type="number"
                min={0}
                max={maxMarks ?? undefined}
                step="0.5"
                className="ac-roster-marks"
                aria-label={`Marks for ${r.studentName}`}
                disabled={work.status === 'draft' || !maxMarks}
                value={r.marks ?? ''}
                error={maxMarks != null && r.marks != null && r.marks > maxMarks ? `Max ${maxMarks}` : undefined}
                onChange={(e) => {
                  const raw = e.target.value
                  const value = raw === '' ? null : Number(raw)
                  updateRow(r.studentId, {
                    marks: value,
                    ...(value !== null && r.status === 'pending' ? { status: 'submitted' as SubmissionStatus } : {}),
                  })
                }}
              />
            ),
          } as DataTableColumn<RosterRow>,
        ]
      : []),
    {
      key: 'remark',
      header: 'Remark',
      interactive: true,
      mobile: 'hidden',
      render: (r) => (
        <TextField
          size="sm"
          className="ac-roster-remark"
          aria-label={`Remark for ${r.studentName}`}
          disabled={work.status === 'draft'}
          value={r.remark}
          onChange={(e) => updateRow(r.studentId, { remark: e.target.value })}
        />
      ),
    },
  ]

  const dateLabel = kind === 'quiz' ? 'Quiz date' : 'Due'
  const dateValue = kind === 'quiz' ? work.date || work.dueDate : work.dueDate

  const studentsCard = (
    <Card
      flush
      title={marked ? 'Marks' : 'Submissions'}
      subtitle={
        rows.length
          ? kind === 'quiz'
            ? `${live.marks.length} of ${rows.length} marked`
            : `${live.turnedIn} of ${rows.length} turned in`
          : undefined
      }
      action={
        rows.length && work.status !== 'draft' ? (
          <div className="cb-card-actions">
            {kind !== 'quiz' ? (
              <Button
                size="sm"
                variant="tertiary"
                icon={CheckCheck}
                onClick={() => {
                  setRows((list) => list.map((r) => (r.status === 'pending' ? { ...r, status: 'submitted' } : r)))
                  setRowsDirty(true)
                }}
              >
                Mark pending as submitted
              </Button>
            ) : null}
            <Button size="sm" variant="primary" disabled={!rowsDirty} loading={saveSubs.isPending} onClick={saveRows}>
              {marked ? 'Save marks' : 'Save submissions'}
            </Button>
          </div>
        ) : undefined
      }
    >
      {work.status === 'draft' ? (
        <div className="cb-card-toolbar">
          <Banner tone="info" title={`Publish this ${meta.noun} to record ${marked ? 'marks' : 'submissions'}`}>
            {kind === 'quiz' ? 'Add the questions first; a quiz needs at least one to be published.' : 'Drafts are only visible to staff.'}
          </Banner>
        </div>
      ) : null}
      {rows.length ? (
        <div className="cb-card-toolbar">
          <MetricTiles>
            {kind !== 'quiz' ? (
              <>
                <MetricTile label="Turned in" value={`${live.turnedIn} / ${rows.length}`} hint={live.late ? `${live.late} late` : undefined} />
                <MetricTile label="Missing" value={live.missing} tone={live.missing ? 'danger' : 'neutral'} />
                <MetricTile label="Pending" value={live.pending} tone={live.pending ? 'warning' : 'neutral'} />
              </>
            ) : (
              <>
                <MetricTile label="Marked" value={`${live.marks.length} / ${rows.length}`} />
                <MetricTile label="Absent" value={live.missing} tone={live.missing ? 'warning' : 'neutral'} />
              </>
            )}
            {marked ? (
              <MetricTile
                label="Average"
                value={live.average != null ? `${live.average}${maxMarks ? ` / ${maxMarks}` : ''}` : '—'}
                hint={live.highest != null ? `Highest ${live.highest}` : undefined}
              />
            ) : null}
          </MetricTiles>
        </div>
      ) : null}
      <DataTable
        caption={`${meta.label} ${marked ? 'marks' : 'submissions'}`}
        columns={rosterColumns}
        rows={rows}
        getRowKey={(r) => r.studentId}
        loading={rosterLoading}
        loadingLabel="Loading students"
        empty={
          <EmptyState
            icon={Users}
            title={`No students found in ${classLabel(work.className, work.section)}`}
            body={
              roster && !roster.studentsAvailable
                ? 'Student records are kept in the Students module. Turn it on to record work for each student.'
                : 'Add students to this class and section under Students, then come back here.'
            }
          />
        }
      />
    </Card>
  )

  const questionsCard = (
    <Card
      title="Questions"
      subtitle={`${questions.length} ${questions.length === 1 ? 'question' : 'questions'} · ${questionTotal} ${questionTotal === 1 ? 'mark' : 'marks'}`}
      action={
        <Button size="sm" variant="primary" disabled={!questionsDirty} loading={saveWork.isPending} onClick={saveQuestions}>
          Save questions
        </Button>
      }
    >
      {questions.length ? (
        <div className="ac-questions">
          {questions.map((q, qi) => (
            <section key={q._id || `new-${qi}`} className="ac-question" aria-label={`Question ${qi + 1}`}>
              <div className="ac-question__head">
                <span className="cb-subhead">Question {qi + 1}</span>
                <span className="ac-row-actions">
                  <Button variant="tertiary" size="sm" icon={ArrowUp} aria-label="Move question up" disabled={qi === 0} onClick={() => moveQuestion(qi, -1)} />
                  <Button variant="tertiary" size="sm" icon={ArrowDown} aria-label="Move question down" disabled={qi === questions.length - 1} onClick={() => moveQuestion(qi, 1)} />
                  <Button
                    variant="tertiary"
                    size="sm"
                    icon={Trash2}
                    aria-label="Remove question"
                    onClick={() => {
                      setQuestions((list) => list.filter((_, i) => i !== qi))
                      setQuestionsDirty(true)
                    }}
                  />
                </span>
              </div>
              <div className="ac-question__grid">
                <Select
                  label="Type"
                  size="sm"
                  options={QUESTION_TYPES}
                  value={q.type}
                  onChange={(e) => {
                    const type = e.target.value as QuestionType
                    editQuestion(qi, { type, options: type === 'mcq' ? (q.options.length ? q.options : ['', '', '', '']) : [], answer: '' })
                  }}
                />
                <TextField
                  label="Marks"
                  size="sm"
                  type="number"
                  min={0}
                  max={100}
                  value={String(q.marks)}
                  onChange={(e) => editQuestion(qi, { marks: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
              <TextArea label="Question" rows={2} value={q.text} onChange={(e) => editQuestion(qi, { text: e.target.value })} />
              {q.type === 'mcq' ? (
                <div className="ac-options" role="group" aria-label="Options">
                  <span className="cb-field__label">Options · tick the correct one</span>
                  {q.options.map((option, oi) => (
                    <div key={oi} className="ac-option">
                      <Checkbox
                        aria-label={`Option ${OPTION_LETTERS[oi]} is correct`}
                        checked={Boolean(option.trim()) && q.answer === option}
                        disabled={!option.trim()}
                        onChange={(on) => editQuestion(qi, { answer: on ? option : '' })}
                      />
                      <TextField
                        size="sm"
                        aria-label={`Option ${OPTION_LETTERS[oi]}`}
                        prefix={OPTION_LETTERS[oi]}
                        value={option}
                        onChange={(e) => {
                          const options = q.options.map((o, i) => (i === oi ? e.target.value : o))
                          editQuestion(qi, { options, answer: q.answer === option ? e.target.value : q.answer })
                        }}
                      />
                      <Button
                        variant="tertiary"
                        size="sm"
                        icon={Trash2}
                        aria-label={`Remove option ${OPTION_LETTERS[oi]}`}
                        disabled={q.options.length <= 2}
                        onClick={() =>
                          editQuestion(qi, { options: q.options.filter((_, i) => i !== oi), answer: q.answer === option ? '' : q.answer })
                        }
                      />
                    </div>
                  ))}
                  {q.options.length < 8 ? (
                    <div>
                      <Button size="sm" variant="tertiary" icon={Plus} onClick={() => editQuestion(qi, { options: [...q.options, ''] })}>
                        Add option
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <TextArea
                  label="Model answer"
                  hint="Optional. Printed only on the answer key."
                  rows={2}
                  value={q.answer}
                  onChange={(e) => editQuestion(qi, { answer: e.target.value })}
                />
              )}
            </section>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={ListChecks}
          title="No questions yet"
          body="Add multiple-choice or written questions. The total marks update as you go."
        />
      )}
      <div className="cb-card-actions ac-question-add">
        {QUESTION_TYPES.map((t) => (
          <Button
            key={t.value}
            size="sm"
            icon={Plus}
            onClick={() => {
              setQuestions((list) => [...list, newQuestion(t.value)])
              setQuestionsDirty(true)
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>
    </Card>
  )

  const paperCard = (
    <Card
      flush
      title="Question paper"
      subtitle={questionsDirty ? 'Shows your unsaved questions' : undefined}
      action={
        <div className="cb-card-actions">
          <Checkbox label="Include answer key" checked={withKey} onChange={setWithKey} />
          <Button size="sm" icon={Printer} disabled={!questions.length} onClick={() => printElement(paperRef.current, work.title)}>
            Print paper
          </Button>
        </div>
      }
    >
      <PaperStage flush state={questions.length ? undefined : <EmptyState compact icon={ListChecks} title="Add questions to see the paper" />}>
        <Paper pageSize="A4">
          <div className="ac-paper" ref={paperRef}>
            <h1>{work.title}</h1>
            <p className="ac-paper__school">
              {classLabel(work.className, work.section)} · {work.subjectName}
            </p>
            <div className="ac-paper__meta">
              <span>Date: {shortDate(dateValue)}</span>
              <span>Time: {work.durationMinutes || 15} min</span>
              <span>Maximum marks: {questionTotal}</span>
            </div>
            <div className="ac-paper__meta">
              <span>Name: ____________________________</span>
              <span>Roll no.: ________</span>
            </div>
            {work.instructions ? <p className="ac-paper__instructions">{work.instructions}</p> : null}
            <ol>
              {questions.map((q, qi) => (
                <li key={q._id || qi}>
                  <div className="ac-paper__q">
                    <span>{q.text || '—'}</span>
                    <span className="ac-paper__marks">
                      [{q.marks} {q.marks === 1 ? 'mark' : 'marks'}]
                    </span>
                  </div>
                  {q.type === 'mcq' ? (
                    <ol className="ac-paper__options">
                      {q.options.filter((o) => o.trim()).map((o, oi) => (
                        <li key={oi}>
                          ({OPTION_LETTERS[oi].toLowerCase()}) {o}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    Array.from({ length: q.type === 'long' ? 6 : 2 }).map((_, li) => <div key={li} className="ac-paper__lines" />)
                  )}
                </li>
              ))}
            </ol>
            {withKey ? (
              <div className="ac-paper__key">
                <h1>Answer key</h1>
                <ol>
                  {questions.map((q, qi) => {
                    const options = q.options.filter((o) => o.trim())
                    const index = options.indexOf(q.answer)
                    return (
                      <li key={q._id || qi}>
                        {q.type === 'mcq'
                          ? index >= 0
                            ? `(${OPTION_LETTERS[index].toLowerCase()}) ${q.answer}`
                            : 'No answer set'
                          : q.answer || 'No model answer'}
                      </li>
                    )
                  })}
                </ol>
              </div>
            ) : null}
          </div>
        </Paper>
      </PaperStage>
    </Card>
  )

  return (
    <Page>
      <div className="cb-stack">
        <Card
          title={work.title}
          subtitle={[classLabel(work.className, work.section), work.subjectName, work.teacherName].filter(Boolean).join(' · ')}
          action={
            <div className="cb-card-actions">
              <StatusBadge status={work.status} />
              {primaryAction}
              <Menu items={menuItems} label={`${meta.label} actions`} />
            </div>
          }
        >
          <DetailList
            columns={3}
            items={[
              ...(kind !== 'quiz' ? [{ label: 'Set on', value: shortDate(work.assignedDate) }] : []),
              { label: dateLabel, value: shortDate(dateValue) },
              ...(kind === 'quiz' ? [{ label: 'Duration', value: `${work.durationMinutes || 15} min` }] : []),
              ...(marked ? [{ label: 'Maximum marks', value: kind === 'quiz' ? work.maxMarks || 0 : work.maxMarks }] : []),
              {
                label: 'Syllabus topics',
                value: work.topicIds.length ? (
                  <Badge tone="neutral" dot={false}>
                    {work.topicIds.length} {work.topicIds.length === 1 ? 'topic' : 'topics'}
                  </Badge>
                ) : (
                  '—'
                ),
              },
              ...(work.instructions ? [{ label: 'Instructions', value: <span className="ac-prewrap">{work.instructions}</span>, wide: true }] : []),
            ]}
          />
        </Card>

        {kind === 'quiz' ? (
          <>
            <Tabs
              label="Quiz sections"
              value={tab}
              onChange={(next) => setTab(next as Tab)}
              items={[
                { id: 'questions', label: 'Questions', count: questions.length },
                { id: 'paper', label: 'Paper' },
                { id: 'students', label: 'Marks', count: live.marks.length },
              ]}
            />
            {tab === 'questions' ? questionsCard : tab === 'paper' ? paperCard : studentsCard}
          </>
        ) : (
          studentsCard
        )}
      </div>

      <Sheet
        open={editOpen && Boolean(draft)}
        onClose={() => setEditOpen(false)}
        size="lg"
        title={`Edit ${meta.noun}`}
        onSubmit={submitEdit}
        footer={
          <>
            <Button onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saveWork.isPending}>
              Save changes
            </Button>
          </>
        }
      >
        {draft ? (
          <ClassWorkFields kind={kind} draft={draft} setDraft={setDraft as React.Dispatch<React.SetStateAction<ClassWorkDraft>>} errors={draftErrors} />
        ) : null}
        {draft && (draft.className !== work.className || draft.section !== work.section) && rows.some((r) => r.status !== 'pending' || r.marks != null) ? (
          <Banner tone="warning" title="Recorded work will be cleared">
            Moving this {meta.noun} to another class or section clears the submissions and marks recorded so far.
          </Banner>
        ) : null}
      </Sheet>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        tone="danger"
        title={`Delete this ${meta.noun}?`}
        description={`${work.title} and its recorded ${marked ? 'marks' : 'submissions'} will be removed.`}
        footer={
          <>
            <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={remove.isPending} onClick={runDelete}>
              Delete {meta.noun}
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default AcdmcWorkDetail
