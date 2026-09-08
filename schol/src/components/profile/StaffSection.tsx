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
import type { StaffBlock } from '@/types/profile'

export function StaffSection({ staff }: { staff: StaffBlock }) {
  const combined = staff.series.map((row) => {
    const ratio = staff.student_teacher_ratio_series.find((r) => r.year === row.year)?.ratio
    return { year: row.year, teachers: row.total, ratio }
  })

  const latest = staff.series[staff.series.length - 1]
  const details = latest?.details || {}

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Total Teachers" value={latest?.total} />
        <Metric label="Male" value={details.totMale as number | undefined} />
        <Metric label="Female" value={details.totFemale as number | undefined} />
        <Metric label="Regular" value={details.tchReg as number | undefined} />
        <Metric label="Contract" value={details.tchCont as number | undefined} />
        <Metric label="Part-time" value={details.tchPart as number | undefined} />
      </div>

      <div>
        <h4 className="mb-2 font-medium text-slate-900">Teacher headcount trend</h4>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={combined}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="teachers" name="Teachers" stroke="#059669" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <h4 className="mb-2 font-medium text-slate-900">Students per teacher</h4>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={combined}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="ratio" name="Student/Teacher" stroke="#7c3aed" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Neutral observation: compare enrollment and teacher trends without inferring causation.
        </p>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">
        {value ?? 'Not reported'}
      </div>
    </div>
  )
}
