import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listCollectionRuns } from '@/services/collection'

function formatState(value: string | undefined) {
  if (!value) return '—'
  return value.charAt(0) + value.slice(1).toLowerCase()
}

export function CollectionRunsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['collection-runs'],
    queryFn: listCollectionRuns,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Collection Runs</h1>
          <p className="mt-1 text-slate-600">Audit history for school intelligence collection runs.</p>
        </div>
        <Link to="/collection/new" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">
          New Collection
        </Link>
      </div>

      {isLoading && <div className="text-slate-500">Loading runs...</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Run</th>
              <th className="px-4 py-3">Pipeline</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">District</th>
              <th className="px-4 py-3">Schools</th>
              <th className="px-4 py-3">Complete</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Started</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((run) => (
              <tr key={run.run_id} className="border-t border-slate-100">
                <td className="px-4 py-3">
                  <Link to={`/collection/runs/${run.run_id}`} className="font-medium text-primary-700 hover:underline">
                    {run.run_id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{run.pipeline || run.source}</div>
                  {run.pipeline_description && (
                    <div className="text-xs text-slate-500">{run.pipeline_description}</div>
                  )}
                </td>
                <td className="px-4 py-3">{formatState((run.parameters as { state_name?: string })?.state_name || run.state)}</td>
                <td className="px-4 py-3">{formatState((run.parameters as { district_name?: string })?.district_name || run.district)}</td>
                <td className="px-4 py-3">{run.total_count}</td>
                <td className="px-4 py-3">{run.status_counts?.complete ?? 0}</td>
                <td className="px-4 py-3">{run.status}</td>
                <td className="px-4 py-3">{run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
