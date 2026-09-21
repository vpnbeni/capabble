import { useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { EnrollmentBlock, YearDetail } from '@/types/profile'
import { fetchYearDetail } from '@/services/api'
import { ChevronDown, ChevronRight } from 'lucide-react'

type MetricMode = 'total' | 'boys' | 'girls'

function metricValue(row: { total: number | null; boys: number | null; girls: number | null }, mode: MetricMode) {
  if (mode === 'boys') return row.boys
  if (mode === 'girls') return row.girls
  return row.total
}

export function EnrollmentSection({
  schoolId,
  enrollment,
}: {
  schoolId: string
  enrollment: EnrollmentBlock
}) {
  const [mode, setMode] = useState<MetricMode>('total')
  const [expandedYear, setExpandedYear] = useState<string | null>(null)
  const [yearDetails, setYearDetails] = useState<Record<string, YearDetail>>({})
  const [loadingYear, setLoadingYear] = useState<string | null>(null)

  const chartData = enrollment.series.map((row) => ({
    year: row.year,
    value: metricValue(row, mode),
  }))

  async function toggleYear(year: string) {
    if (expandedYear === year) {
      setExpandedYear(null)
      return
    }
    setExpandedYear(year)
    if (!yearDetails[year]) {
      setLoadingYear(year)
      try {
        const detail = await fetchYearDetail(schoolId, year)
        setYearDetails((prev) => ({ ...prev, [year]: detail }))
      } finally {
        setLoadingYear(null)
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-600">
          {enrollment.trend.percentage_change != null && (
            <span className="font-medium text-red-600">
              {enrollment.trend.percentage_change}% over period
            </span>
          )}
          {enrollment.trend.consecutive_declines > 0 && (
            <span className="ml-3">
              {enrollment.trend.consecutive_declines} consecutive annual declines
            </span>
          )}
        </div>
        <div className="flex rounded-lg border border-slate-200 p-1">
          {(['total', 'boys', 'girls'] as MetricMode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`rounded-md px-3 py-1 text-sm capitalize ${
                mode === item ? 'bg-primary-50 text-primary-700' : 'text-slate-600'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="value" name="Enrollment" stroke="#2563eb" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-2">
        {enrollment.series.map((row) => {
          const open = expandedYear === row.year
          const detail = yearDetails[row.year]
          return (
            <div key={row.year} className="rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => toggleYear(row.year)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="font-medium">{row.year}</div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span>{row.total ?? 'Not reported'} students</span>
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
              </button>
              {open && (
                <div className="border-t border-slate-100 px-4 py-3 text-sm">
                  {loadingYear === row.year && <div className="text-slate-500">Loading year detail...</div>}
                  {detail && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="mb-2 font-medium">Enrollment</h4>
                        <dl className="space-y-1 text-slate-600">
                          <div>Total: {detail.enrollment.total ?? 'Not reported'}</div>
                          <div>Boys: {detail.gender?.boys ?? row.boys ?? 'Not reported'}</div>
                          <div>Girls: {detail.gender?.girls ?? row.girls ?? 'Not reported'}</div>
                        </dl>
                        {detail.social_categories && (
                          <>
                            <h4 className="mb-2 mt-4 font-medium">Social Category</h4>
                            <dl className="space-y-1 text-slate-600">
                              {Object.entries(detail.social_categories).map(([k, v]) => (
                                <div key={k}>{k}: {v ?? 'Not reported'}</div>
                              ))}
                            </dl>
                          </>
                        )}
                      </div>
                      <div>
                        <h4 className="mb-2 font-medium">Student Indicators</h4>
                        <dl className="space-y-1 text-slate-600">
                          <div>RTE: {detail.indicators?.rte ?? row.rte ?? 'Not reported'}</div>
                          <div>EWS: {detail.indicators?.ews ?? row.ews ?? 'Not reported'}</div>
                        </dl>
                        {detail.grades && (
                          <>
                            <h4 className="mb-2 mt-4 font-medium">Grade Distribution</h4>
                            <div className="grid grid-cols-3 gap-2 text-slate-600">
                              {Object.entries(detail.grades).map(([grade, values]) => (
                                <div key={grade} className="rounded bg-slate-50 px-2 py-1">
                                  <div className="font-medium">{grade}</div>
                                  <div>{values.total}</div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                  {!detail && loadingYear !== row.year && (
                    <div className="text-slate-500">Year detail not available</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
