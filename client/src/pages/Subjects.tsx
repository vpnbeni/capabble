import React, { useState, useMemo, useEffect } from 'react'
import { BookOpen, Pencil } from 'lucide-react'
import { useUrlSearchQuery } from '@/hooks/useUrlSearchQuery'
import SubjectsImportModal from '../components/subjects/ImportModal'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardToolbar,
  DataTable,
  EmptyState,
  FilterBar,
  Page,
  Pagination,
  RadioGroup,
  Sheet,
  TextField,
  orDash,
  type DataTableColumn,
} from '@/components/ui'
import '@/components/exmcl/centre-candidates.css'
import {
  useSubjectList,
  useSubjectStats,
  useCreateSubjectMutation,
  useUpdateSubjectMutation,
  useImportSubjectsMutation,
} from '../hooks/useSubjects'

type SubjectTabId = 'all' | '10th' | '12th'
type SortField = 'name' | 'code' | 'duration' | 'answerSheet'

interface Subject {
  _id: string
  name: string
  code: string
  class: string
  duration: number
  isActive: boolean
  answerSheet?: string
}

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 9999, label: 'All' },
]

const SEARCH_DEBOUNCE_MS = 300

const CLASS_LABEL: Record<string, string> = { '10th': 'Class 10', '12th': 'Class 12' }

const ANSWER_SHEET_LABEL: Record<string, string> = {
  '20_pages': '20 pages',
  '32_pages': '32 pages',
  '40_graph': '40 graph',
  none: 'None',
}

const formatDuration = (hours?: number) => (hours ? `${hours} ${hours === 1 ? 'hour' : 'hours'}` : '—')

const Subjects: React.FC = () => {
  const initialSearch = useUrlSearchQuery((value) => setSearchInput(value))
  const [searchInput, setSearchInput] = useState(initialSearch)
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(initialSearch)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  // Add and import are not reachable from this page (subjects are managed from the admin
  // portal); the flows are kept wired so they can be re-enabled.
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [classFilter, setClassFilter] = useState<SubjectTabId>('all')

  // Debounce search: update API param after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm((prev) => {
        if (prev !== searchInput) setPage(1)
        return searchInput
      })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  const queryParams = useMemo(
    () => ({
      page,
      limit: pageSize,
      ...(debouncedSearchTerm && { search: debouncedSearchTerm }),
      ...(classFilter !== 'all' && { class: classFilter }),
      ...(sortField && sortOrder && { sortField, sortOrder }),
    }),
    [page, pageSize, debouncedSearchTerm, classFilter, sortField, sortOrder]
  )

  const { data, isLoading: loading, refetch } = useSubjectList(queryParams)
  const { data: stats = { total: 0, class10th: 0, class12th: 0 } } = useSubjectStats()

  const createMutation = useCreateSubjectMutation()
  const updateMutation = useUpdateSubjectMutation()
  const importMutation = useImportSubjectsMutation()

  const subjects: Subject[] = data?.data ?? []
  const pagination = useMemo(
    () => ({
      page: data?.page ?? 1,
      pages: data?.pages ?? 1,
      total: data?.total ?? 0,
      limit: data?.limit ?? pageSize,
    }),
    [data, pageSize]
  )

  const handlePageSizeChange = (value: string | number) => {
    setPageSize(Number(value))
    setPage(1)
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
  }

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
  }

  const handleTabChange = (id: SubjectTabId) => {
    setClassFilter(id)
    setPage(1)
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortOrder === 'asc') {
        setSortOrder('desc')
      } else if (sortOrder === 'desc') {
        setSortField(null)
        setSortOrder(null)
      }
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
    setPage(1)
  }

  const handleEditClick = (subject: Subject) => {
    setEditingSubject(subject)
    setIsEditModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsEditModalOpen(false)
    setIsAddModalOpen(false)
    setEditingSubject(null)
    setError(null) // Clear errors when closing modal
  }

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg)
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  const handleUpdateSubject = async (updatedSubject: Partial<Subject>) => {
    if (!editingSubject) return
    setError(null)
    updateMutation.mutate(
      { id: editingSubject._id, data: updatedSubject },
      {
        onSuccess: () => {
          showSuccess('Subject updated.')
          handleCloseModal()
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? err?.message ?? 'The subject wasn’t updated. Try again.'
          if (err?.response?.status === 409) setError('Another subject already uses this code.')
          else if (err?.response?.status === 400) setError('Some details aren’t valid. Check them and try again.')
          else if (err?.response?.status === 404) setError('This subject no longer exists.')
          else setError(msg)
        },
      }
    )
  }

  const handleCreateSubject = async (newSubject: Partial<Subject>) => {
    setError(null)
    createMutation.mutate(newSubject, {
      onSuccess: () => {
        showSuccess('Subject added.')
        handleCloseModal()
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.message ?? err?.message ?? 'The subject wasn’t added. Try again.'
        if (err?.response?.status === 409) setError('Another subject already uses this code.')
        else if (err?.response?.status === 400) setError('Some details aren’t valid. Check them and try again.')
        else setError(msg)
      },
    })
  }

  const handleImportSubjects = async (file: File) => {
    setError(null)
    importMutation.mutate(file, {
      onSuccess: () => {
        setShowImportModal(false)
        showSuccess('Subjects imported.')
      },
      onError: (err: any) => {
        setError(err?.response?.data?.message ?? err?.message ?? 'The subjects weren’t imported. Try again.')
      },
    })
  }

  const sheetOpen = (isEditModalOpen && Boolean(editingSubject)) || isAddModalOpen

  const columns: DataTableColumn<Subject>[] = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      mobile: 'subtitle',
      width: 110,
      render: (s) => <span className="is-num">{orDash(s.code)}</span>,
    },
    {
      key: 'name',
      header: 'Subject',
      sortable: true,
      mobile: 'title',
      render: (s) => orDash(s.name),
    },
    {
      key: 'class',
      header: 'Class',
      mobile: 'aside',
      render: (s) =>
        CLASS_LABEL[s.class] ? (
          <Badge dot={false} tone={s.class === '12th' ? 'info' : 'neutral'}>
            {CLASS_LABEL[s.class]}
          </Badge>
        ) : (
          orDash(s.class)
        ),
    },
    {
      key: 'duration',
      header: 'Duration',
      sortable: true,
      numeric: true,
      align: 'right',
      render: (s) => formatDuration(s.duration),
    },
    {
      key: 'answerSheet',
      header: 'Answer sheet',
      sortable: true,
      mobile: 'hidden',
      render: (s) => (s.answerSheet ? ANSWER_SHEET_LABEL[s.answerSheet] ?? '—' : '—'),
    },
    {
      key: 'actions',
      header: '',
      headerLabel: 'Actions',
      align: 'right',
      interactive: true,
      width: 56,
      render: (s) => (
        <Button
          size="sm"
          variant="tertiary"
          icon={Pencil}
          aria-label={`Edit ${s.name}`}
          title="Edit"
          onClick={() => handleEditClick(s)}
        />
      ),
    },
  ]

  const footer = (
    <Pagination
      page={pagination.page}
      pages={pagination.pages}
      total={pagination.total}
      limit={pagination.limit}
      onPageChange={handlePageChange}
      pageSize={pageSize}
      pageSizeOptions={PAGE_SIZE_OPTIONS}
      onPageSizeChange={handlePageSizeChange}
    />
  )

  return (
    <Page>

      {successMessage ? (
        <Banner tone="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Banner>
      ) : null}

      {error && !sheetOpen && !showImportModal ? (
        <Banner tone="danger" onDismiss={() => setError(null)}>
          <span>{error}</span>{' '}
          <Button size="sm" variant="tertiary" onClick={() => refetch()}>
            Retry
          </Button>
        </Banner>
      ) : null}

      <Card flush>
        <CardToolbar>
          <FilterBar
            search={{
              placeholder: 'Search subjects',
              value: searchInput,
              onChange: handleSearchChange,
              label: 'Search subjects',
            }}
            chips={[
              { id: 'all', label: 'All', count: stats.total, active: classFilter === 'all' },
              { id: '10th', label: 'Class 10', count: stats.class10th, active: classFilter === '10th' },
              { id: '12th', label: 'Class 12', count: stats.class12th, active: classFilter === '12th' },
            ]}
            chipsLabel="Class"
            onChipClick={(id) => handleTabChange(id as SubjectTabId)}
          />
        </CardToolbar>
        <DataTable
          caption="Subjects"
          columns={columns}
          rows={loading ? [] : subjects}
          getRowKey={(s) => s._id}
          onRowClick={handleEditClick}
          loading={loading}
          loadingLabel="Loading subjects…"
          sort={sortField && sortOrder ? { key: sortField, direction: sortOrder } : null}
          onSort={(key) => handleSort(key as SortField)}
          footer={loading || subjects.length === 0 ? undefined : footer}
          empty={
            debouncedSearchTerm ? (
              <EmptyState
                icon={BookOpen}
                title="No subjects match this search"
                body="Try a different code or name."
                action={
                  <Button size="sm" onClick={() => setSearchInput('')}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={BookOpen}
                title="No subjects yet"
                body="Subjects are added from the admin portal. Once added, they appear here."
              />
            )
          }
        />
      </Card>

      {isEditModalOpen && editingSubject && (
        <SubjectSheet
          mode="edit"
          subject={editingSubject}
          isOpen={isEditModalOpen}
          onClose={handleCloseModal}
          onSubmit={handleUpdateSubject}
          isSubmitting={updateMutation.isPending}
          error={error}
        />
      )}

      {isAddModalOpen && (
        <SubjectSheet
          mode="add"
          isOpen={isAddModalOpen}
          onClose={handleCloseModal}
          onSubmit={handleCreateSubject}
          isSubmitting={createMutation.isPending}
          error={error}
        />
      )}

      {showImportModal && (
        <SubjectsImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={handleImportSubjects}
          importing={importMutation.isPending}
          error={error}
        />
      )}
    </Page>
  )
}

interface SubjectFormData {
  name: string
  code: string
  class: string
  duration: number
  answerSheet: string
}

const formFromSubject = (subject?: Subject): SubjectFormData => ({
  name: subject?.name || '',
  code: subject?.code || '',
  class: subject?.class || '',
  duration: subject?.duration || 3,
  answerSheet: subject?.answerSheet || '32_pages',
})

interface SubjectSheetProps {
  mode: 'add' | 'edit'
  subject?: Subject
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: Partial<Subject>) => void
  isSubmitting: boolean
  error?: string | null
}

const SubjectSheet: React.FC<SubjectSheetProps> = ({ mode, subject, isOpen, onClose, onSubmit, isSubmitting, error }) => {
  const [formData, setFormData] = useState<SubjectFormData>(() => formFromSubject(subject))

  // Edit: sync when the subject changes. Add: reset when the sheet closes.
  useEffect(() => {
    if (mode === 'edit' && isOpen && subject) setFormData(formFromSubject(subject))
    if (mode === 'add' && !isOpen) setFormData(formFromSubject())
  }, [mode, isOpen, subject])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // The kit's sheet form opts out of native validation; run it here so required/pattern still apply.
    if (!e.currentTarget.reportValidity()) return
    onSubmit(formData)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'code' ? value.toUpperCase() : value,
    }))
  }

  const isEdit = mode === 'edit'

  return (
    <Sheet
      open={isOpen}
      onClose={isSubmitting ? undefined : onClose}
      title={isEdit ? 'Edit subject' : 'Add subject'}
      description={isEdit ? subject?.name : 'Add a board subject with its exam duration and answer sheet.'}
      icon={BookOpen}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {isSubmitting ? (isEdit ? 'Saving…' : 'Adding…') : isEdit ? 'Save changes' : 'Add subject'}
          </Button>
        </>
      }
    >
      <div className="cb-stack">
        {error ? <Banner tone="danger">{error}</Banner> : null}
        <div className="cb-form-section">
          <TextField
            label="Subject name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            placeholder={isEdit ? undefined : 'For example, Mathematics Standard'}
          />
          <TextField
            label="Subject code"
            name="code"
            value={formData.code}
            onChange={handleChange}
            required
            pattern="[A-Z0-9]{3,8}"
            title="Subject code must be 3-8 uppercase letters and numbers"
            hint="3 to 8 letters or numbers"
            placeholder={isEdit ? undefined : 'For example, 041'}
          />
        </div>
        <div className="cb-form-section">
          <RadioGroup
            label="Class"
            orientation="horizontal"
            value={formData.class}
            onChange={(value) => setFormData((prev) => ({ ...prev, class: value }))}
            options={[
              { value: '10th', label: 'Class 10' },
              { value: '12th', label: 'Class 12' },
            ]}
          />
          <RadioGroup
            label="Exam duration"
            orientation="horizontal"
            value={String(formData.duration)}
            onChange={(value) => setFormData((prev) => ({ ...prev, duration: Number(value) }))}
            options={[
              { value: '2', label: '2 hours' },
              { value: '3', label: '3 hours' },
            ]}
          />
          <RadioGroup
            label="Answer sheet"
            orientation="horizontal"
            value={formData.answerSheet}
            onChange={(value) => setFormData((prev) => ({ ...prev, answerSheet: value }))}
            options={[
              { value: '20_pages', label: '20 pages' },
              { value: '32_pages', label: '32 pages' },
              { value: '40_graph', label: '40 graph' },
            ]}
          />
        </div>
      </div>
    </Sheet>
  )
}

export default Subjects
