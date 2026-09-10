import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchCollectionRun, pauseCollectionRun, reEnrichSarasRun, resumeCollectionRun } from '@/services/collection'
import type { ReEnrichSarasResult } from '@/services/collection'
import toast from 'react-hot-toast'
import { useState } from 'react'

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-3 overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full bg-primary-600 transition-all" style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  )
}

export function CollectionRunPage() {
  const { runId = '' } = useParams()
  const [reEnrichResult, setReEnrichResult] = useState<ReEnrichSarasResult | null>(null)
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['collection-run', runId],
    queryFn: () => fetchCollectionRun(runId),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'running' || status === 'pending' ? 2000 : false
    },
  })

  async function handlePause() {
    await pauseCollectionRun(runId)
    toast.success('Collection paused')
    refetch()
  }

  async function handleResume() {
    await resumeCollectionRun(runId)
    toast.success('Collection resumed')
    refetch()
  }

  const reEnrichMutation = useMutation({
    mutationFn: () => reEnrichSarasRun(runId),
    onSuccess: (result) => {
      setReEnrichResult(result)
      toast.success(`Re-enriched ${result.enriched}/${result.total} schools`)
      refetch()
    },
    onError: () => {
      toast.error('Re-enrich SARAS failed')
    },
  })

  const canReEnrichSaras =
    data?.status === 'partial' || data?.status === 'completed' || data?.status === 'paused'

  if (isLoading || !data) {
    return <div className="text-slate-500">Loading collection run...</div>
  }

  const params = data.parameters as { state_name?: string; district_name?: string }
  const current = data.current_school
  const interrupted = data.status === 'paused' || data.status === 'failed' || data.status === 'partial'
  const heading =
    data.status === 'completed'
      ? 'COLLECTION COMPLETE'
      : data.status === 'partial'
        ? 'COLLECTION PARTIAL'
        : interrupted
          ? 'COLLECTION INTERRUPTED'
          : 'COLLECTING SCHOOLS'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{heading}</h1>
        <p className="mt-1 text-slate-600">
          {data.pipeline || 'Collection'} · {params.state_name} · {params.district_name}
        </p>
        {data.pipeline_description && (
          <p className="mt-1 text-sm text-slate-500">{data.pipeline_description}</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>Overall progress</span>
          <span>{data.status_counts.complete} / {data.total_count} schools ({data.overall_percent}%)</span>
        </div>
        <div className="mt-3">
          <ProgressBar percent={data.overall_percent} />
        </div>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>Complete: {data.status_counts.complete}</div>
          <div>KYS Pending: {data.status_counts.kys_pending ?? data.status_counts.unresolved}</div>
          <div>In Progress: {data.status_counts.in_progress}</div>
          <div>Partial: {data.status_counts.partial}</div>
          <div>Needs Review: {data.status_counts.needs_review}</div>
          <div>Failed: {data.status_counts.failed}</div>
          <div>Remaining: {data.status_counts.remaining}</div>
          <div>Status: {data.status}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-900">Stage progress</h2>
        <div className="mt-4 space-y-4">
          {Object.entries(data.stage_progress).map(([stage, progress]) => {
            const percent = progress.total ? (progress.complete / progress.total) * 100 : 0
            return (
              <div key={stage}>
                <div className="mb-1 flex justify-between text-sm capitalize text-slate-600">
                  <span>{stage.replaceAll('_', ' ')}</span>
                  <span>{progress.complete} / {progress.total}</span>
                </div>
                <ProgressBar percent={percent} />
              </div>
            )
          })}
        </div>
      </div>

      {current && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Current school</h2>
          <div className="mt-2 text-lg font-medium">{current.school_name}</div>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>Identity: {current.identity_status}</div>
            <div>KYS: {current.kys_mapping_status}</div>
            <div>Years: {current.years_complete} / {current.years_total}</div>
            <div>Operation: {current.current_operation || '—'}</div>
          </div>
          {current.years_total > 0 && (
            <div className="mt-4">
              <ProgressBar percent={(current.years_complete / current.years_total) * 100} />
            </div>
          )}
        </div>
      )}

      {reEnrichResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
          <h2 className="font-semibold text-emerald-900">Re-enrich SARAS complete</h2>
          <p className="mt-1 text-sm text-emerald-800">
            {reEnrichResult.enriched} / {reEnrichResult.total} schools enriched
          </p>
          <ul className="mt-3 space-y-1 text-sm text-emerald-900">
            {reEnrichResult.schools.map((school) => (
              <li key={school.affiliation_number}>
                {school.school_name}
                {school.address_line ? ` — ${school.address_line}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {data.status === 'running' && (
          <button onClick={handlePause} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
            Pause Collection
          </button>
        )}
        {interrupted && data.status !== 'partial' && (
          <button onClick={handleResume} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">
            Resume Collection
          </button>
        )}
        {data.status === 'partial' && (
          <button onClick={handleResume} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white">
            Resume KYS Pipeline
          </button>
        )}
        {canReEnrichSaras && (
          <button
            onClick={() => reEnrichMutation.mutate()}
            disabled={reEnrichMutation.isPending}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm disabled:opacity-60"
          >
            {reEnrichMutation.isPending ? 'Re-enriching SARAS...' : 'Re-enrich SARAS'}
          </button>
        )}
        <Link to="/schools" className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
          View Directory
        </Link>
        <Link to="/admin/collection-runs" className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
          Collection Runs
        </Link>
      </div>
    </div>
  )
}
