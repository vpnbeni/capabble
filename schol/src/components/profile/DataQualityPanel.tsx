import type { DataQualityIssue } from '@/types/profile'
import { AlertTriangle } from 'lucide-react'

export function DataQualityPanel({ issues }: { issues: DataQualityIssue[] }) {
  if (!issues.length) return null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="mb-3 flex items-center gap-2 text-amber-900">
        <AlertTriangle className="h-4 w-4" />
        <h3 className="font-semibold">Data Quality</h3>
      </div>
      <div className="space-y-3">
        {issues.map((issue) => (
          <div key={`${issue.code}-${issue.year}`} className="rounded-lg bg-white/70 p-3 text-sm">
            <div className="font-medium text-amber-900">Data reconciliation issue</div>
            <div className="mt-1 text-slate-700">{issue.message}</div>
            <dl className="mt-2 grid gap-1 text-slate-600 sm:grid-cols-2">
              <div>Year: {issue.year}</div>
              <div>Reported enrollment: {issue.reported_enrollment ?? 'Not available'}</div>
              <div>Age-distribution total: {issue.distribution_total ?? 'Not available'}</div>
              <div>Difference: {issue.difference ?? 'Not available'}</div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}
