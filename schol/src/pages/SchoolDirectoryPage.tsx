import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchSchoolDirectory, fetchSchoolFilterOptions } from '@/services/api'
import { ArrowRight, ChevronDown, TrendingDown } from 'lucide-react'

const SORT_OPTIONS = [
  { value: 'name', label: 'Name' },
  { value: 'district', label: 'District' },
  { value: 'state', label: 'State' },
  { value: 'validation_status', label: 'Validation status' },
  { value: 'students', label: 'Students' },
  { value: 'teachers', label: 'Teachers' },
]

const KYS_STATUS_LABELS: Record<string, string> = {
  connected: 'KYS Connected',
  pending: 'KYS Pending',
}

const VALIDATION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  valid: 'Valid',
  partial: 'Partial',
  non_reconciling: 'Non-reconciling',
  failed: 'Failed',
}

export function SchoolDirectoryPage() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [state, setState] = useState('')
  const [district, setDistrict] = useState('')
  const [kysStatus, setKysStatus] = useState('')
  const [validationStatus, setValidationStatus] = useState('')
  const [sort, setSort] = useState('name')
  const [order, setOrder] = useState('asc')

  const filterOptionsQuery = useQuery({
    queryKey: ['school-directory-filter-options'],
    queryFn: fetchSchoolFilterOptions,
    retry: false,
  })

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['school-directory', q, state, district, kysStatus, validationStatus, sort, order, page],
    queryFn: () =>
      fetchSchoolDirectory({
        q,
        state: state || undefined,
        district: district || undefined,
        kys_status: kysStatus || undefined,
        validation_status: validationStatus || undefined,
        sort,
        order,
        page,
        limit: 20,
      }),
    retry: false,
  })

  const apiMessage =
    error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
      : undefined

  const activeFilterCount = [state, district, kysStatus, validationStatus].filter(Boolean).length

  const resetToFirstPage = () => setPage(1)

  const clearFilters = () => {
    setState('')
    setDistrict('')
    setKysStatus('')
    setValidationStatus('')
    resetToFirstPage()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">School Directory</h1>
          <p className="mt-1 text-slate-600">Search and explore canonical school intelligence records.</p>
        </div>
        <Link
          to="/collection/new"
          className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          + Collect Schools
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              resetToFirstPage()
            }}
            placeholder="Search by school name, UDISE, district..."
            className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm lg:flex-1"
          />
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">Sort by</label>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value)
                resetToFirstPage()
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={order}
              onChange={(e) => {
                setOrder(e.target.value)
                resetToFirstPage()
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
          </div>
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-primary-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {filtersOpen && (
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">State</span>
              <select
                value={state}
                onChange={(e) => {
                  setState(e.target.value)
                  resetToFirstPage()
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Any state</option>
                {filterOptionsQuery.data?.states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">District</span>
              <select
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value)
                  resetToFirstPage()
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Any district</option>
                {filterOptionsQuery.data?.districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">KYS status</span>
              <select
                value={kysStatus}
                onChange={(e) => {
                  setKysStatus(e.target.value)
                  resetToFirstPage()
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Any</option>
                {filterOptionsQuery.data?.kys_status.map((s) => (
                  <option key={s} value={s}>
                    {KYS_STATUS_LABELS[s] || s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">Validation status</span>
              <select
                value={validationStatus}
                onChange={(e) => {
                  setValidationStatus(e.target.value)
                  resetToFirstPage()
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Any</option>
                {filterOptionsQuery.data?.validation_status.map((s) => (
                  <option key={s} value={s}>
                    {VALIDATION_STATUS_LABELS[s] || s}
                  </option>
                ))}
              </select>
            </label>
            {activeFilterCount > 0 && (
              <div className="sm:col-span-2 lg:col-span-4">
                <button onClick={clearFilters} className="text-sm font-medium text-primary-700 hover:underline">
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {isLoading && <div className="text-slate-500">Loading schools...</div>}

      {isError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
          <div className="font-semibold">School intelligence database not connected</div>
          <p className="mt-2">
            {apiMessage || 'The SCHOL API could not load schools. PostgreSQL must be configured and seeded first.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/setup"
              className="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 font-medium text-white hover:bg-primary-700"
            >
              Configure &amp; migrate database
            </Link>
            <Link
              to="/setup#reset-password"
              className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-4 py-2 font-medium hover:bg-amber-100"
            >
              Forgot / reset password
            </Link>
            <button
              onClick={() => refetch()}
              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium hover:bg-amber-100"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {data?.items.map((school) => (
          <div key={school.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Link to={`/schools/${school.id}`} className="text-lg font-semibold text-primary-700 hover:underline">
                  {school.name}
                </Link>
                <div className="mt-1 text-sm text-slate-500">{school.location}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                  {school.udise && <span>UDISE {school.udise}</span>}
                  {school.state_school_code && <span>State Code {school.state_school_code}</span>}
                  {school.collection_state === 'kys_pending' && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">KYS pending</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-6 text-sm">
                <div>
                  <div className="text-slate-500">Students</div>
                  <div className="font-semibold">{school.students ?? 'Not available'}</div>
                </div>
                <div>
                  <div className="text-slate-500">Teachers</div>
                  <div className="font-semibold">{school.teachers ?? 'Not available'}</div>
                </div>
                {school.enrollment_change_pct != null && school.enrollment_change_pct < 0 && (
                  <div className="flex items-center gap-1 text-red-600">
                    <TrendingDown className="h-4 w-4" />
                    {school.enrollment_change_pct}% ({school.consecutive_declines} declines)
                  </div>
                )}
                <Link
                  to={`/schools/${school.id}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
                >
                  View Profile
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        ))}
        {!isLoading && !isError && data?.items.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <div className="font-medium text-slate-900">No schools match these filters</div>
            <p className="mt-2 text-sm text-slate-500">
              Try clearing a filter, or collect at least one school from KYS to populate the directory.
            </p>
            <Link
              to="/setup"
              className="mt-4 inline-flex rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Open developer setup
            </Link>
          </div>
        )}
      </div>

      {data && data.pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-slate-500">
            Showing page {data.pagination.page} of {data.pagination.pages} ({data.pagination.total} schools)
          </div>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={page >= data.pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
