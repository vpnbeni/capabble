import { useState } from 'react'
import type { EnrollmentBlock, IntelligenceBlock, SourcesBlock, StaffBlock } from '@/types/profile'
import { TrendingDown } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = {
  derived_metric: 'Derived Metric',
  intelligence_signal: 'Intelligence Signal',
  source_fact: 'Source Fact',
}

export function OverviewSection({
  overview,
}: {
  overview: {
    students: number | null
    teachers: number | null
    student_teacher_ratio: number | null
    enrollment_trend: {
      from: number | null
      to: number | null
      percentage_change: number | null
      consecutive_declines: number
    }
  }
}) {
  const trend = overview.enrollment_trend
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={overview.students} />
        <StatCard label="Teachers" value={overview.teachers} />
        <StatCard label="Student/Teacher Ratio" value={overview.student_teacher_ratio} />
      </div>

      {trend.from != null && trend.to != null && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <TrendingDown className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <div className="text-lg font-semibold text-red-900">
                {trend.from} → {trend.to}
              </div>
              <div className="text-sm text-red-800">
                {trend.percentage_change != null ? `${trend.percentage_change}% over period` : 'Enrollment change'}
                {trend.consecutive_declines > 0 && (
                  <span> · {trend.consecutive_declines} consecutive year-to-year declines</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value ?? 'Not available'}</div>
    </div>
  )
}

export function IntelligenceSection({ intelligence }: { intelligence: IntelligenceBlock }) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {intelligence.signals.map((signal) => (
          <div key={`${signal.type}-${signal.label}`} className="rounded-lg border border-slate-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-primary-700">
              {TYPE_LABELS[signal.type] || signal.type}
            </div>
            <div className="mt-1 font-medium text-slate-900">{signal.label}</div>
            <div className="text-sm text-slate-600">{signal.value}</div>
            {signal.detail && <div className="text-sm text-slate-500">{signal.detail}</div>}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-4">
        <h4 className="font-medium text-slate-900">Areas to investigate</h4>
        <p className="mt-1 text-sm text-slate-500">Hypothesis prompts — not established causes.</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
          {intelligence.investigation_areas.map((area) => (
            <li key={area}>{area}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function SourcesSection({ sources }: { sources: SourcesBlock }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 p-4">
        <h4 className="font-medium">UDISE+ KYS</h4>
        <p className="text-sm text-slate-500">Report Card · Social Data · Profile · Facility</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          {sources.kys.years.map((row) => (
            <div key={row.year} className="rounded bg-slate-50 px-3 py-2 text-sm">
              <div>{row.year}</div>
              <div className="font-medium">{row.kys_collected ? 'UDISE+ KYS ✓' : 'Not collected'}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <h4 className="font-medium">CBSE SARAS</h4>
        <p className="mt-1 text-sm text-slate-600">{sources.saras.message}</p>
        <p className="mt-2 text-xs text-slate-500">
          Not found does not prove the school never had CBSE affiliation.
        </p>
      </div>
    </div>
  )
}

export function HistorySection({
  enrollment,
  staff,
}: {
  enrollment: EnrollmentBlock
  staff: StaffBlock
}) {
  const [selected, setSelected] = useState(enrollment.series[enrollment.series.length - 1]?.year || '')
  const staffRow = staff.series.find((s) => s.year === selected)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {enrollment.series.map((row) => (
          <button
            key={row.year}
            type="button"
            onClick={() => setSelected(row.year)}
            className={`rounded-full px-3 py-1 text-sm ${
              selected === row.year ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {row.year}
          </button>
        ))}
      </div>
      {selected && (
        <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
          <div>Enrollment: {enrollment.series.find((r) => r.year === selected)?.total ?? 'Not reported'}</div>
          <div>Teachers: {staffRow?.total ?? 'Not reported'}</div>
          <div className="mt-2 text-slate-500">Historical snapshot for selected year.</div>
        </div>
      )}
    </div>
  )
}

export function StudentsSection({
  selectedYear,
  enrollmentRow,
}: {
  selectedYear: string
  enrollmentRow?: EnrollmentBlock['series'][number]
}) {
  const boys = enrollmentRow?.boys
  const girls = enrollmentRow?.girls
  const total = enrollmentRow?.total

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-slate-200 p-4">
        <h4 className="font-medium">Gender Distribution ({selectedYear})</h4>
        <dl className="mt-3 space-y-2 text-sm text-slate-700">
          <div>Boys: {boys ?? 'Not reported'}</div>
          <div>Girls: {girls ?? 'Not reported'}</div>
          <div>Total: {total ?? 'Not reported'}</div>
        </dl>
      </div>
      <div className="rounded-lg border border-slate-200 p-4">
        <h4 className="font-medium">Student Indicators ({selectedYear})</h4>
        <dl className="mt-3 space-y-2 text-sm text-slate-700">
          <div>RTE: {enrollmentRow?.rte ?? 'Not reported'}</div>
          <div>EWS: {enrollmentRow?.ews ?? 'Not reported'}</div>
        </dl>
      </div>
    </div>
  )
}
