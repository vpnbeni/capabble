import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchSchoolDirectory } from '@/services/api'
import { ArrowRight, TrendingDown } from 'lucide-react'

export function SchoolDirectoryPage() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['school-directory', q, page],
    queryFn: () => fetchSchoolDirectory({ q, page, limit: 20 }),
    retry: false,
  })

  const apiMessage =
    error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { data?: { detail?: string } } }).response?.data?.detail
      : undefined

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
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
          placeholder="Search by school name, UDISE, district..."
          className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm"
        />
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
            <div className="font-medium text-slate-900">No schools in the intelligence database yet</div>
            <p className="mt-2 text-sm text-slate-500">
              Collect at least one school from KYS to populate the directory.
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
