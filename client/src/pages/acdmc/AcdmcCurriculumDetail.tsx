import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, BookOpen, Copy, Pencil, Plus, RefreshCw, Send, Trash2, Undo2 } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  Combobox,
  DetailList,
  Dialog,
  EmptyState,
  Menu,
  Page,
  Progress,
  Select,
  Sheet,
  Tabs,
  TextArea,
  TextField,
  type MenuItem,
} from '@/components/ui'
import {
  useAcdmcOptions,
  useCopyCurriculum,
  useCoverage,
  useCurriculum,
  useCurriculumStatus,
  useDeleteCurriculum,
  useSaveCurriculum,
} from '@/hooks/useAcdmc'
import type { Book, Curriculum, Unit } from '@/services/acdmcService'
import {
  StatusBadge,
  allSubjectNames,
  classLabel,
  classSelectOptions,
  classShort,
  errorMessage,
  shortDate,
  subjectNamesFor,
  useCanDeleteAcademics,
} from '@/components/acdmc/AcdmcUi'
import '@/components/acdmc/acdmc.css'

type Tab = 'syllabus' | 'coverage' | 'books'

const nextSession = (label: string) => {
  const match = /^(\d{4})-(\d{4})$/.exec(label || '')
  return match ? `${Number(match[1]) + 1}–${String(Number(match[2]) + 1).slice(2)}` : ''
}

const cloneUnits = (units: Unit[]) => units.map((u) => ({ ...u, topics: u.topics.map((t) => ({ ...t })) }))
const cloneBooks = (books: Book[]) => books.map((b) => ({ ...b }))

/** Find the first empty unit, topic or book title, so the save can say what to fix. */
const findProblem = (units: Unit[], books: Book[]) => {
  for (let u = 0; u < units.length; u += 1) {
    if (!units[u].title.trim()) return `Unit ${u + 1} needs a name.`
    for (let t = 0; t < units[u].topics.length; t += 1) {
      if (!units[u].topics[t].title.trim()) return `Topic ${t + 1} in "${units[u].title}" needs a name.`
    }
  }
  for (let b = 0; b < books.length; b += 1) {
    if (!books[b].title.trim()) return `Book ${b + 1} needs a title.`
  }
  return ''
}

const AcdmcCurriculumDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const canDelete = useCanDeleteAcademics('curriculum')
  const { data: curriculum, isLoading, isError, error, refetch } = useCurriculum(id)
  const { data: coverage } = useCoverage(id)
  const { data: options } = useAcdmcOptions()
  const save = useSaveCurriculum()
  const setStatus = useCurriculumStatus()
  const copy = useCopyCurriculum()
  const remove = useDeleteCurriculum()

  const [tab, setTab] = useState<Tab>('syllabus')
  const [units, setUnits] = useState<Unit[]>([])
  const [books, setBooks] = useState<Book[]>([])
  const [dirty, setDirty] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [details, setDetails] = useState({ className: '', subjectName: '', description: '' })
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyClasses, setCopyClasses] = useState<string[]>([])
  const [copyNext, setCopyNext] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (curriculum && !dirty) {
      setUnits(cloneUnits(curriculum.units))
      setBooks(cloneBooks(curriculum.books))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curriculum])

  const topicCount = useMemo(() => units.reduce((n, u) => n + u.topics.length, 0), [units])
  const periodCount = useMemo(() => units.reduce((n, u) => n + u.topics.reduce((p, t) => p + (Number(t.periods) || 0), 0), 0), [units])

  if (isLoading) {
    return (
      <Page>
        <Card>
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading syllabus
          </div>
        </Card>
      </Page>
    )
  }

  if (isError || !curriculum) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={BookOpen}
            title="Couldn't open this syllabus"
            body={errorMessage(error, 'It may have been deleted.')}
            action={[
              <Button key="back" onClick={() => navigate('/acdmc/curriculum')}>Back to syllabi</Button>,
              <Button key="retry" icon={RefreshCw} onClick={() => refetch()}>Try again</Button>,
            ]}
          />
        </Card>
      </Page>
    )
  }

  const edit = (fn: () => void) => {
    fn()
    setDirty(true)
  }

  const persist = async (payload: Partial<Curriculum>, success: string) => {
    const problem = findProblem(payload.units || units, payload.books || books)
    if (problem) {
      toast.error(problem)
      return false
    }
    try {
      const saved = await save.mutateAsync({
        id: curriculum._id,
        payload: {
          className: curriculum.className,
          subjectName: curriculum.subjectName,
          subjectId: curriculum.subjectId,
          description: curriculum.description,
          units,
          books,
          ...payload,
        },
      })
      // Take the saved copy so new units and topics carry their server ids
      // (lesson plans link to topics by id).
      setUnits(cloneUnits(saved.units || []))
      setBooks(cloneBooks(saved.books || []))
      setDirty(false)
      toast.success(success)
      return true
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the syllabus."))
      return false
    }
  }

  const discard = () => {
    setUnits(cloneUnits(curriculum.units))
    setBooks(cloneBooks(curriculum.books))
    setDirty(false)
  }

  const changeStatus = async () => {
    if (dirty) {
      toast.error('Save or discard your changes first.')
      return
    }
    const to = curriculum.status === 'published' ? 'draft' : 'published'
    try {
      await setStatus.mutateAsync({ id: curriculum._id, status: to })
      toast.success(to === 'published' ? 'Syllabus published.' : 'Syllabus moved to draft.')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const runCopy = async () => {
    try {
      const result = await copy.mutateAsync({ id: curriculum._id, classNames: copyClasses, toNextSession: copyNext })
      setCopyOpen(false)
      setCopyClasses([])
      setCopyNext(false)
      if (result.created.length) toast.success(`Copied to ${result.created.join(', ')} as drafts.`)
      if (result.skipped.length) toast(`Skipped ${result.skipped.join(', ')}: a ${curriculum.subjectName} syllabus already exists there.`)
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't copy the syllabus."))
    }
  }

  const runDelete = async () => {
    try {
      await remove.mutateAsync(curriculum._id)
      toast.success('Syllabus deleted.')
      navigate('/acdmc/curriculum')
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the syllabus."))
    }
  }

  const menuItems: MenuItem[] = [
    { label: 'Edit details', icon: Pencil, onSelect: () => {
      setDetails({ className: curriculum.className, subjectName: curriculum.subjectName, description: curriculum.description })
      setDetailsOpen(true)
    } },
    { label: 'Copy to other classes', icon: Copy, onSelect: () => setCopyOpen(true) },
    ...(canDelete ? [{ divider: true } as const, { label: 'Delete syllabus', icon: Trash2, tone: 'danger' as const, onSelect: () => setDeleteOpen(true) }] : []),
  ]

  // ── Unit and topic editing ──
  const updateUnit = (index: number, patch: Partial<Unit>) =>
    edit(() => setUnits((list) => list.map((u, i) => (i === index ? { ...u, ...patch } : u))))
  const moveUnit = (index: number, step: number) =>
    edit(() =>
      setUnits((list) => {
        const next = [...list]
        const [item] = next.splice(index, 1)
        next.splice(index + step, 0, item)
        return next
      })
    )
  const updateTopic = (unitIndex: number, topicIndex: number, patch: Partial<Unit['topics'][number]>) =>
    edit(() =>
      setUnits((list) =>
        list.map((u, i) =>
          i === unitIndex ? { ...u, topics: u.topics.map((t, j) => (j === topicIndex ? { ...t, ...patch } : t)) } : u
        )
      )
    )
  const addTopic = (unitIndex: number) =>
    edit(() =>
      setUnits((list) =>
        list.map((u, i) => (i === unitIndex ? { ...u, topics: [...u.topics, { title: '', periods: 1, targetMonth: '' }] } : u))
      )
    )
  const removeTopic = (unitIndex: number, topicIndex: number) =>
    edit(() =>
      setUnits((list) => list.map((u, i) => (i === unitIndex ? { ...u, topics: u.topics.filter((_, j) => j !== topicIndex) } : u)))
    )

  const sections = coverage?.sections || []
  const otherClasses = (options?.classOptions || []).filter((c) => c.className !== curriculum.className)
  const nextLabel = nextSession(options?.academicSession || '')
  const detailSubjects = details.className ? subjectNamesFor(options, details.className) : allSubjectNames(options)

  return (
    <Page>
      <div className="cb-stack">
        <Card
          title={`${curriculum.subjectName} · ${classLabel(curriculum.className)}`}
          subtitle={curriculum.description || undefined}
          action={
            <div className="cb-card-actions">
              <StatusBadge status={curriculum.status} />
              <Button
                size="sm"
                variant={curriculum.status === 'published' ? 'secondary' : 'primary'}
                icon={curriculum.status === 'published' ? Undo2 : Send}
                loading={setStatus.isPending}
                onClick={changeStatus}
              >
                {curriculum.status === 'published' ? 'Move to draft' : 'Publish syllabus'}
              </Button>
              <Menu items={menuItems} label="Syllabus actions" />
            </div>
          }
        >
          <DetailList
            columns={3}
            items={[
              { label: 'Units', value: units.length },
              { label: 'Topics', value: `${topicCount} · ${periodCount} periods` },
              {
                label: 'Covered on average',
                value: topicCount ? `${curriculum.coverage.percent}% across ${curriculum.coverage.sections} sections` : '—',
              },
            ]}
          />
        </Card>

        {dirty ? (
          <Banner tone="warning" title="Unsaved changes">
            <div className="cb-card-actions">
              <Button size="sm" variant="primary" loading={save.isPending} onClick={() => persist({}, 'Syllabus saved.')}>
                Save changes
              </Button>
              <Button size="sm" onClick={discard}>
                Discard
              </Button>
            </div>
          </Banner>
        ) : null}

        <Card flush>
          <div className="cb-card-toolbar">
            <Tabs
              label="Syllabus sections"
              value={tab}
              onChange={(next) => setTab(next as Tab)}
              items={[
                { id: 'syllabus', label: 'Units and topics', count: topicCount },
                { id: 'coverage', label: 'Coverage', count: sections.length },
                { id: 'books', label: 'Books', count: books.length },
              ]}
            />
          </div>

          {tab === 'syllabus' ? (
            <div className="ac-tab-body">
              {units.length ? (
                <div className="ac-units">
                  {units.map((unit, ui) => (
                    <section key={unit._id || `new-${ui}`} className="ac-unit" aria-label={unit.title || `Unit ${ui + 1}`}>
                      <div className="ac-unit__head">
                        <TextField
                          label={`Unit ${ui + 1}`}
                          value={unit.title}
                          placeholder="e.g. Rational numbers"
                          onChange={(e) => updateUnit(ui, { title: e.target.value })}
                        />
                        <span className="ac-row-actions">
                          <Button variant="tertiary" size="sm" icon={ArrowUp} aria-label="Move unit up" disabled={ui === 0} onClick={() => moveUnit(ui, -1)} />
                          <Button variant="tertiary" size="sm" icon={ArrowDown} aria-label="Move unit down" disabled={ui === units.length - 1} onClick={() => moveUnit(ui, 1)} />
                          <Button
                            variant="tertiary"
                            size="sm"
                            icon={Trash2}
                            aria-label="Remove unit"
                            onClick={() => edit(() => setUnits((list) => list.filter((_, i) => i !== ui)))}
                          />
                        </span>
                      </div>
                      <div className="ac-unit__body">
                        {unit.topics.length ? (
                          <div className="ac-topic-row__labels" aria-hidden="true">
                            <span>Topic</span>
                            <span>Periods</span>
                            <span>Target month</span>
                            <span />
                          </div>
                        ) : (
                          <p className="cb-muted ac-note">No topics in this unit yet.</p>
                        )}
                        {unit.topics.map((topic, ti) => (
                          <div key={topic._id || `new-${ti}`} className="ac-topic-row">
                            <TextField
                              aria-label={`Topic ${ti + 1}`}
                              size="sm"
                              value={topic.title}
                              placeholder="Topic name"
                              onChange={(e) => updateTopic(ui, ti, { title: e.target.value })}
                            />
                            <TextField
                              aria-label="Periods"
                              size="sm"
                              type="number"
                              min={0}
                              max={200}
                              value={String(topic.periods ?? '')}
                              onChange={(e) => updateTopic(ui, ti, { periods: Math.max(0, Number(e.target.value) || 0) })}
                            />
                            <TextField
                              aria-label="Target month"
                              size="sm"
                              type="month"
                              value={topic.targetMonth || ''}
                              onChange={(e) => updateTopic(ui, ti, { targetMonth: e.target.value })}
                            />
                            <Button variant="tertiary" size="sm" icon={Trash2} aria-label="Remove topic" onClick={() => removeTopic(ui, ti)} />
                          </div>
                        ))}
                        <div>
                          <Button size="sm" variant="tertiary" icon={Plus} onClick={() => addTopic(ui)}>
                            Add topic
                          </Button>
                        </div>
                      </div>
                    </section>
                  ))}
                  <div>
                    <Button
                      icon={Plus}
                      onClick={() => edit(() => setUnits((list) => [...list, { title: '', topics: [{ title: '', periods: 1, targetMonth: '' }] }]))}
                    >
                      Add unit
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={BookOpen}
                  title="No units yet"
                  body="Break the syllabus into units (chapters), then list each unit's topics with the periods they need."
                  action={
                    <Button
                      variant="primary"
                      icon={Plus}
                      onClick={() => edit(() => setUnits([{ title: '', topics: [{ title: '', periods: 1, targetMonth: '' }] }]))}
                    >
                      Add unit
                    </Button>
                  }
                />
              )}
            </div>
          ) : null}

          {tab === 'coverage' ? (
            <div className="ac-tab-body">
              {!curriculum.topicCount ? (
                <EmptyState compact icon={BookOpen} title="No topics to track yet" body="Add and save topics first. Coverage comes from lesson plans marked delivered." />
              ) : !sections.length ? (
                <EmptyState
                  compact
                  icon={BookOpen}
                  title={`No sections found for ${classLabel(curriculum.className)}`}
                  body="Sections come from the timetable's class list or from enrolled students."
                />
              ) : (
                <div className="cb-stack">
                  <div className="cb-progress-list cb-progress-list--grid">
                    {sections.map((s) => (
                      <Progress
                        key={s.section}
                        label={`Section ${s.section}`}
                        value={s.covered}
                        max={s.total || 1}
                        valueLabel={`${s.covered} of ${s.total} topics`}
                        tone={s.percent >= 100 ? 'success' : 'accent'}
                      />
                    ))}
                  </div>
                  <div className="ac-coverage-scroll">
                    <table className="ac-coverage">
                      <caption className="cb-visually-hidden">Topic coverage by section</caption>
                      <thead>
                        <tr>
                          <th scope="col">Topic</th>
                          {sections.map((s) => (
                            <th key={s.section} scope="col">
                              {classShort(curriculum.className)}-{s.section}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {curriculum.units.map((unit) => (
                          <React.Fragment key={unit._id}>
                            <tr className="ac-coverage__unit">
                              <th scope="rowgroup" colSpan={sections.length + 1}>
                                {unit.title}
                              </th>
                            </tr>
                            {unit.topics.map((topic) => (
                              <tr key={topic._id}>
                                <th scope="row">{topic.title}</th>
                                {sections.map((s) => {
                                  const cell = coverage?.detail[s.section]?.[topic._id as string]
                                  return (
                                    <td key={s.section}>
                                      {cell ? (
                                        <Badge tone={cell.status === 'delivered' ? 'success' : 'info'}>
                                          {cell.status === 'delivered' ? 'Delivered' : 'Planned'} {shortDate(cell.date)}
                                        </Badge>
                                      ) : (
                                        '—'
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {dirty ? <p className="cb-muted ac-note">Coverage shows the saved syllabus. Save your changes to include new topics.</p> : null}
                </div>
              )}
            </div>
          ) : null}

          {tab === 'books' ? (
            <div className="ac-tab-body">
              {books.length ? (
                <div className="ac-units">
                  {books.map((book, bi) => (
                    <section key={book._id || `new-${bi}`} className="ac-unit" aria-label={book.title || `Book ${bi + 1}`}>
                      <div className="ac-unit__body">
                        <div className="cb-form-grid">
                          <TextField
                            className="is-wide"
                            label="Title"
                            required
                            value={book.title}
                            onChange={(e) => edit(() => setBooks((list) => list.map((b, i) => (i === bi ? { ...b, title: e.target.value } : b))))}
                          />
                          <TextField
                            label="Author"
                            value={book.author}
                            onChange={(e) => edit(() => setBooks((list) => list.map((b, i) => (i === bi ? { ...b, author: e.target.value } : b))))}
                          />
                          <TextField
                            label="Publisher"
                            value={book.publisher}
                            onChange={(e) => edit(() => setBooks((list) => list.map((b, i) => (i === bi ? { ...b, publisher: e.target.value } : b))))}
                          />
                          <Select
                            label="For"
                            options={[
                              { value: 'current', label: 'This session' },
                              { value: 'next', label: 'Next session' },
                            ]}
                            value={book.sessionType}
                            onChange={(e) =>
                              edit(() => setBooks((list) => list.map((b, i) => (i === bi ? { ...b, sessionType: e.target.value as Book['sessionType'] } : b))))
                            }
                          />
                          <Select
                            label="Decision"
                            options={[
                              { value: 'proposed', label: 'Proposed' },
                              { value: 'selected', label: 'Selected' },
                            ]}
                            value={book.status}
                            onChange={(e) =>
                              edit(() => setBooks((list) => list.map((b, i) => (i === bi ? { ...b, status: e.target.value as Book['status'] } : b))))
                            }
                          />
                        </div>
                        <div>
                          <Button size="sm" variant="tertiary" icon={Trash2} onClick={() => edit(() => setBooks((list) => list.filter((_, i) => i !== bi)))}>
                            Remove book
                          </Button>
                        </div>
                      </div>
                    </section>
                  ))}
                  <div>
                    <Button
                      icon={Plus}
                      onClick={() => edit(() => setBooks((list) => [...list, { title: '', author: '', publisher: '', sessionType: 'current', status: 'proposed' }]))}
                    >
                      Add book
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon={BookOpen}
                  title="No books listed"
                  body="List the textbooks for this session and propose books for next session."
                  action={
                    <Button
                      variant="primary"
                      icon={Plus}
                      onClick={() => edit(() => setBooks([{ title: '', author: '', publisher: '', sessionType: 'current', status: 'proposed' }]))}
                    >
                      Add book
                    </Button>
                  }
                />
              )}
            </div>
          ) : null}
        </Card>
      </div>

      <Sheet
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        icon={BookOpen}
        title="Edit syllabus details"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!details.className || !details.subjectName.trim()) {
            toast.error('Choose a class and a subject.')
            return
          }
          const ok = await persist({ ...details, subjectName: details.subjectName.trim() }, 'Syllabus details updated.')
          if (ok) setDetailsOpen(false)
        }}
        footer={
          <>
            <Button onClick={() => setDetailsOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              Save details
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <div className="cb-form-grid">
            <Select
              label="Class"
              required
              options={classSelectOptions(options)}
              value={details.className}
              onChange={(e) => setDetails({ ...details, className: e.target.value })}
            />
            {detailSubjects.length ? (
              <Combobox
                label="Subject"
                required
                options={detailSubjects.map((s) => ({ value: s, label: s }))}
                value={details.subjectName}
                selectedLabel={details.subjectName}
                clearable={false}
                onChange={(value) => setDetails({ ...details, subjectName: value })}
              />
            ) : (
              <TextField
                label="Subject"
                required
                value={details.subjectName}
                onChange={(e) => setDetails({ ...details, subjectName: e.target.value })}
              />
            )}
            <TextArea
              className="is-wide"
              label="About this syllabus"
              value={details.description}
              onChange={(e) => setDetails({ ...details, description: e.target.value })}
            />
          </div>
          {dirty ? <p className="cb-muted ac-note">Saving also saves your unit, topic and book changes.</p> : null}
        </div>
      </Sheet>

      <Dialog
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        title="Copy syllabus"
        description={`Copies the units, topics and books as a draft. Classes that already have a ${curriculum.subjectName} syllabus are skipped.`}
        footer={
          <>
            <Button onClick={() => setCopyOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon={Copy}
              loading={copy.isPending}
              disabled={!copyClasses.length && !copyNext}
              onClick={runCopy}
            >
              Copy syllabus
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          {nextLabel ? (
            <Checkbox
              label={`${classLabel(curriculum.className)} in Session ${nextLabel}`}
              description="Start next session's syllabus from this one."
              checked={copyNext}
              onChange={setCopyNext}
            />
          ) : null}
          {otherClasses.length ? (
            <div className="cb-check-grid">
              {otherClasses.map((c) => (
                <Checkbox
                  key={c.className}
                  label={classLabel(c.className)}
                  checked={copyClasses.includes(c.className)}
                  onChange={(on) =>
                    setCopyClasses((list) => (on ? [...list, c.className] : list.filter((x) => x !== c.className)))
                  }
                />
              ))}
            </div>
          ) : null}
          {dirty ? <p className="cb-muted ac-note">Unsaved changes aren't copied.</p> : null}
        </div>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        tone="danger"
        title="Delete this syllabus?"
        description={`${curriculum.subjectName} for ${classLabel(curriculum.className)} will be removed. Lesson plans stay, but stop counting towards coverage.`}
        footer={
          <>
            <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={remove.isPending} onClick={runDelete}>
              Delete syllabus
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default AcdmcCurriculumDetail
