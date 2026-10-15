import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { BookOpen, Plus, SearchX } from 'lucide-react'
import {
  Button,
  Card,
  CardToolbar,
  Combobox,
  DataTable,
  EmptyState,
  Entity,
  FilterBar,
  Page,
  Progress,
  Select,
  Sheet,
  TextArea,
  TextField,
  type DataTableColumn,
} from '@/components/ui'
import { useAcdmcOptions, useCurriculumList, useSaveCurriculum } from '@/hooks/useAcdmc'
import type { CurriculumListItem, CurriculumStatus } from '@/services/acdmcService'
import {
  StatusBadge,
  allSubjectNames,
  classLabel,
  classSelectOptions,
  errorMessage,
  subjectNamesFor,
} from '@/components/acdmc/AcdmcUi'
import '@/components/acdmc/acdmc.css'

type Draft = { className: string; subjectName: string; description: string }
const EMPTY: Draft = { className: '', subjectName: '', description: '' }

const AcdmcCurriculum: React.FC = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [className, setClassName] = useState('')
  const [subjectName, setSubjectName] = useState('')
  const [status, setStatus] = useState<CurriculumStatus | ''>('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})

  const { data: options } = useAcdmcOptions()
  const { data, isLoading, isFetching } = useCurriculumList({ q, className, subjectName, status })
  const save = useSaveCurriculum()

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setDraft(EMPTY)
      setSheetOpen(true)
      searchParams.delete('new')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const items = data?.items || []
  const counts = data?.counts || { draft: 0, published: 0 }
  const hasFilters = Boolean(q || className || subjectName || status)

  const columns = useMemo<DataTableColumn<CurriculumListItem>[]>(
    () => [
      {
        key: 'subject',
        header: 'Syllabus',
        mobile: 'title',
        render: (c) => <Entity primary={c.subjectName} secondary={classLabel(c.className)} />,
      },
      {
        key: 'units',
        header: 'Units',
        numeric: true,
        align: 'right',
        render: (c) => c.unitCount,
      },
      {
        key: 'topics',
        header: 'Topics',
        numeric: true,
        align: 'right',
        mobile: 'subtitle',
        render: (c) => `${c.topicCount} topics · ${c.plannedPeriods} periods`,
      },
      {
        key: 'coverage',
        header: 'Covered',
        width: 200,
        render: (c) =>
          c.topicCount ? (
            <Progress value={c.coverage.percent} size="sm" valueLabel={`${c.coverage.percent}%`} />
          ) : (
            <span className="cb-subtle">No topics yet</span>
          ),
      },
      {
        key: 'books',
        header: 'Books',
        numeric: true,
        align: 'right',
        mobile: 'hidden',
        render: (c) => c.books.length,
      },
      { key: 'status', header: 'Status', mobile: 'aside', render: (c) => <StatusBadge status={c.status} /> },
    ],
    []
  )

  const sheetSubjects = draft.className ? subjectNamesFor(options, draft.className) : allSubjectNames(options)

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    const next: typeof errors = {}
    if (!draft.className) next.className = 'Choose a class'
    if (!draft.subjectName.trim()) next.subjectName = 'Choose a subject'
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      const created = await save.mutateAsync({ payload: { ...draft, subjectName: draft.subjectName.trim(), units: [], books: [] } })
      toast.success('Syllabus created. Add its units and topics.')
      setSheetOpen(false)
      navigate(`/acdmc/curriculum/${created._id}`)
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't create the syllabus."))
    }
  }

  return (
    <Page>
      <Card flush>
        <CardToolbar>
          <FilterBar
            search={{ value: q, onChange: setQ, placeholder: 'Search subject or book' }}
            chips={[
              { id: '', label: 'All', count: counts.draft + counts.published, active: !status },
              { id: 'published', label: 'Published', count: counts.published, active: status === 'published' },
              { id: 'draft', label: 'Draft', count: counts.draft, active: status === 'draft' },
            ]}
            onChipClick={(id) => setStatus(id as CurriculumStatus | '')}
            filters={
              <div className="ac-filters">
                <Select
                  size="sm"
                  aria-label="Class"
                  placeholder="All classes"
                  options={classSelectOptions(options)}
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                />
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
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => {
                  setDraft({ ...EMPTY, className })
                  setErrors({})
                  setSheetOpen(true)
                }}
              >
                Add syllabus
              </Button>
            }
          />
        </CardToolbar>
        <DataTable
          caption="Syllabi"
          columns={columns}
          rows={items}
          getRowKey={(c) => c._id}
          onRowClick={(c) => navigate(`/acdmc/curriculum/${c._id}`)}
          loading={isLoading || (isFetching && !items.length)}
          loadingLabel="Loading syllabi"
          empty={
            hasFilters ? (
              <EmptyState icon={SearchX} title="No syllabi match these filters" body="Clear a filter or search for something else." />
            ) : (
              <EmptyState
                icon={BookOpen}
                title="No syllabi yet"
                body="Add a syllabus for each class and subject: its units, topics and books. Lesson plans then track how much each section has covered."
                action={
                  <Button variant="primary" icon={Plus} onClick={() => setSheetOpen(true)}>
                    Add syllabus
                  </Button>
                }
              />
            )
          }
        />
      </Card>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        icon={BookOpen}
        title="Add syllabus"
        description="One syllabus per class and subject. You'll add units, topics and books next."
        onSubmit={handleCreate}
        footer={
          <>
            <Button onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={save.isPending}>
              Create syllabus
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <div className="cb-form-grid">
            <Select
              label="Class"
              required
              placeholder="Choose class"
              options={classSelectOptions(options)}
              value={draft.className}
              error={errors.className}
              onChange={(e) => setDraft({ ...draft, className: e.target.value })}
            />
            {sheetSubjects.length ? (
              <Combobox
                label="Subject"
                required
                placeholder="Search subjects"
                options={sheetSubjects.map((s) => ({ value: s, label: s }))}
                value={draft.subjectName}
                error={errors.subjectName}
                clearable={false}
                onChange={(value) => setDraft({ ...draft, subjectName: value })}
              />
            ) : (
              <TextField
                label="Subject"
                required
                value={draft.subjectName}
                error={errors.subjectName}
                onChange={(e) => setDraft({ ...draft, subjectName: e.target.value })}
              />
            )}
            <TextArea
              className="is-wide"
              label="About this syllabus"
              hint="Optional. Board, scheme or notes for teachers."
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
        </div>
      </Sheet>
    </Page>
  )
}

export default AcdmcCurriculum
