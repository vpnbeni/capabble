import React, { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ExternalLink, FileSearch, Filter, Plus, Upload } from 'lucide-react'
import CandidateTable from '../components/candidates/CandidateTable'
import ImportModal from '../components/candidates/ImportModal'
import ReimportCompareModal from '../components/candidates/ReimportCompareModal'
import {
  Banner,
  Button,
  Card,
  CardToolbar,
  Combobox,
  FilterBar,
  Icon,
  Menu,
  Page,
  Select,
  StatCard,
  cx,
} from '@/components/ui'
import '@/components/exmcl/centre-candidates.css'
import {
  useCandidates,
  useCandidateStats,
  useCandidatesWithoutSubjects,
  useCandidateFilterOptions,
  useImportCandidatesMutation,
} from '../hooks/useCandidates'

type ClassTabId = 'all' | '10th' | '12th'

const PAGE_SIZE_OPTIONS = [
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
]

const DEFAULT_PAGE_SIZE = 50

const CANDIDATES_WITHOUT_SUBJECTS_ACCORDION_THRESHOLD = 5

const Candidates: React.FC = () => {
  const navigate = useNavigate()
  const [showImportModal, setShowImportModal] = useState(false)
  const [showReimportModal, setShowReimportModal] = useState(false)
  const [withoutSubjectsAccordionOpen, setWithoutSubjectsAccordionOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [sortField, setSortField] = useState<'rollNumber' | 'name' | 'class'>('rollNumber')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [filters, setFilters] = useState({
    search: '',
    class: '',
    schoolCode: '',
    subjectCode: '',
    category: '',
    pwd: '',
    medium: '',
  })
  const [showFilterPanel, setShowFilterPanel] = useState(false)

  // Debounce search input so the API query fires only after the user stops typing
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 350)
    return () => clearTimeout(timer)
  }, [filters.search])

  const classTabId: ClassTabId = filters.class === '' ? 'all' : (filters.class === '10th' ? '10th' : '12th')

  const queryParams = useMemo(
    () => ({
      page,
      limit: pageSize,
      sort: `${sortDirection === 'desc' ? '-' : ''}${sortField}`,
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(filters.class && { class: filters.class }),
      ...(filters.schoolCode && { schoolCode: filters.schoolCode }),
      ...(filters.subjectCode && { subjectCode: filters.subjectCode }),
      ...(filters.category && { category: filters.category }),
      ...(filters.pwd && { pwd: filters.pwd }),
      ...(filters.medium && { medium: filters.medium }),
    }),
    [page, pageSize, sortField, sortDirection, debouncedSearch, filters]
  )

  const statsParams = useMemo(
    () => ({
      ...(debouncedSearch && { search: debouncedSearch }),
      ...(filters.class && { class: filters.class }),
      ...(filters.schoolCode && { schoolCode: filters.schoolCode }),
      ...(filters.subjectCode && { subjectCode: filters.subjectCode }),
      ...(filters.category && { category: filters.category }),
      ...(filters.pwd && { pwd: filters.pwd }),
      ...(filters.medium && { medium: filters.medium }),
    }),
    [debouncedSearch, filters]
  )

  const { data, isLoading: loading } = useCandidates(queryParams)
  const { data: stats } = useCandidateStats(statsParams)
  const { data: candidatesWithoutSubjects = [] } = useCandidatesWithoutSubjects()
  const { data: filterOptions } = useCandidateFilterOptions()

  const importMutation = useImportCandidatesMutation()

  const candidates = data?.data ?? []
  const pagination = useMemo(
    () => ({
      page: data?.page ?? 1,
      pages: data?.pages ?? 1,
      total: data?.total ?? 0,
      limit: data?.limit ?? pageSize,
    }),
    [data, pageSize]
  )

  const activeFilterCount = useMemo(() => {
    const { schoolCode, subjectCode, category, pwd, medium } = filters
    return [schoolCode, subjectCode, category, pwd, medium].filter(Boolean).length
  }, [filters])

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters)
    setPage(1)
  }

  const handleClassTabChange = (id: ClassTabId) => {
    handleFilterChange({ ...filters, class: id === 'all' ? '' : id })
  }

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
  }

  const handleSortChange = (field: 'rollNumber' | 'name' | 'class') => {
    if (field === sortField) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
    setPage(1)
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setPage(1)
  }

  const handleImport = async (file: File) => {
    try {
      const response: any = await importMutation.mutateAsync(file)
      const payload = response?.data?.data ?? response?.data
      const imported = payload?.imported ?? 0
      const skipped = payload?.errors ?? 0
      if (imported === 0 && skipped === 0) {
        toast('No candidates found in PDF')
      } else if (imported === 0) {
        toast.success(`All ${skipped} candidates already exist — nothing new to import`)
      } else if (skipped === 0) {
        toast.success(`Successfully added ${imported} new candidate${imported !== 1 ? 's' : ''}`)
      } else {
        toast.success(`Added ${imported} new candidate${imported !== 1 ? 's' : ''} (${skipped} already existed, skipped)`)
      }
      setShowImportModal(false)
    } catch (error: any) {
      if (error?.code === 'ECONNABORTED') {
        toast.error('Request timeout. The PDF file might be too large or complex.')
      } else if (error?.message === 'canceled') {
        toast.error('Upload was canceled. Please try again.')
      } else {
        toast.error(error?.response?.data?.message || 'Failed to import candidates')
      }
    }
  }

  const pct = (count: number) => (stats && stats.totalCandidates > 0 ? (count / stats.totalCandidates) * 100 : 0)

  const setFilter = (key: keyof typeof filters, value: string) => handleFilterChange({ ...filters, [key]: value })

  const missingCount = candidatesWithoutSubjects.length
  const missingList = (
    <ul className={cx('cx-cand-missing', missingCount > CANDIDATES_WITHOUT_SUBJECTS_ACCORDION_THRESHOLD && 'is-scroll')}>
      {candidatesWithoutSubjects.map((c, index) => (
        <li key={c.rollNumber}>
          <span>
            {index + 1}. {c.rollNumber} · {c.name}
          </span>
          <Button size="sm" variant="tertiary" onClick={() => handlePageChange(c.page)}>
            Go to page {c.page}
          </Button>
        </li>
      ))}
    </ul>
  )

  return (
    <Page>
      {stats ? (
        <div className="cb-stats">
          <StatCard label="Total candidates" value={stats.totalCandidates.toLocaleString()} />
          <StatCard
            label="Class 10th"
            value={stats.class10th.toLocaleString()}
            hint={`${Math.round(pct(stats.class10th))}% of candidates`}
            progress={pct(stats.class10th)}
          />
          <StatCard
            label="Class 12th"
            value={stats.class12th.toLocaleString()}
            hint={`${Math.round(pct(stats.class12th))}% of candidates`}
            progress={pct(stats.class12th)}
          />
        </div>
      ) : null}

      {missingCount > 0 ? (
        <Banner
          tone="warning"
          title={`${missingCount} candidate${missingCount !== 1 ? 's have' : ' has'} no subjects assigned`}
        >
          <p>This may affect datesheet accuracy.</p>
          {missingCount > CANDIDATES_WITHOUT_SUBJECTS_ACCORDION_THRESHOLD ? (
            <>
              <div className="cx-cand-banner-actions">
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-expanded={withoutSubjectsAccordionOpen}
                  onClick={() => setWithoutSubjectsAccordionOpen((prev) => !prev)}
                >
                  {withoutSubjectsAccordionOpen ? 'Hide list' : `Show all ${missingCount} candidates`}
                </Button>
              </div>
              {withoutSubjectsAccordionOpen ? missingList : null}
            </>
          ) : (
            missingList
          )}
          <div className="cx-cand-banner-actions">
            <a className="cb-link" href="/relink-candidate-subjects.html" target="_blank" rel="noopener noreferrer">
              Re-link subjects <Icon icon={ExternalLink} size={12} />
            </a>
          </div>
        </Banner>
      ) : null}

      <Card flush title="Candidates" subtitle="Examination candidates at this centre, from the CBSE PDF imports">
        <CardToolbar className="cx-cand-toolbar">
          <FilterBar
            search={{
              placeholder: 'Search name or roll number',
              value: filters.search,
              onChange: (value) => setFilter('search', value),
              label: 'Search candidates',
            }}
            chipsLabel="Class"
            chips={[
              { id: 'all', label: 'All', active: classTabId === 'all' },
              { id: '10th', label: 'Class 10th', active: classTabId === '10th' },
              { id: '12th', label: 'Class 12th', active: classTabId === '12th' },
            ]}
            onChipClick={(id) => handleClassTabChange(id as ClassTabId)}
            filters={
              <Button
                size="sm"
                icon={Filter}
                aria-expanded={showFilterPanel}
                onClick={() => setShowFilterPanel((prev) => !prev)}
              >
                {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
              </Button>
            }
            actions={
              <>
                <Button icon={Upload} onClick={() => setShowImportModal(true)}>
                  Import PDF
                </Button>
                <Button variant="primary" icon={Plus} onClick={() => navigate('/candidates/new')}>
                  Add candidate
                </Button>
                <Menu
                  label="More candidate actions"
                  items={[{ label: 'Re-import and compare', icon: FileSearch, onSelect: () => setShowReimportModal(true) }]}
                />
              </>
            }
          />

          {showFilterPanel ? (
            <div className="cx-cand-filters">
              <Combobox
                label="School"
                size="sm"
                placeholder="All schools"
                value={filters.schoolCode}
                onChange={(value) => setFilter('schoolCode', value)}
                options={(filterOptions?.schools ?? []).map((s) => ({
                  value: s.schoolCode || s.schoolName || '',
                  label: `${s.schoolCode ? `${s.schoolCode} – ` : ''}${s.schoolName || 'Unknown school'}`,
                }))}
              />
              <Combobox
                label="Subject"
                size="sm"
                placeholder="All subjects"
                value={filters.subjectCode}
                onChange={(value) => setFilter('subjectCode', value)}
                options={(filterOptions?.subjectCodes ?? []).map((code) => ({ value: code, label: code }))}
              />
              <Select
                label="Category"
                size="sm"
                placeholder="All categories"
                value={filters.category}
                onChange={(e) => setFilter('category', e.target.value)}
                options={filterOptions?.categories ?? []}
              />
              <Select
                label="PwD"
                size="sm"
                placeholder="All"
                value={filters.pwd}
                onChange={(e) => setFilter('pwd', e.target.value)}
                options={filterOptions?.pwdValues ?? []}
              />
              <Select
                label="Medium"
                size="sm"
                placeholder="All mediums"
                value={filters.medium}
                onChange={(e) => setFilter('medium', e.target.value)}
                options={(filterOptions?.mediums ?? []).map((m) => ({ value: m.value, label: m.label }))}
              />
            </div>
          ) : null}
        </CardToolbar>

        <CandidateTable
          candidates={candidates}
          loading={loading}
          pagination={pagination}
          onPageChange={handlePageChange}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
          sortField={sortField}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
          noCard
        />
      </Card>

      {showImportModal && (
        <ImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
          importing={importMutation.isPending}
        />
      )}

      {showReimportModal && (
        <ReimportCompareModal isOpen={showReimportModal} onClose={() => setShowReimportModal(false)} />
      )}
    </Page>
  )
}

export default Candidates
