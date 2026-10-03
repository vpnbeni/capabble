import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchCollectionRunSchools } from '@/services/collection'
import type { SourceMode } from '@/types/collection'
import { BulkKysImportPanel } from '@/components/kys/BulkKysImportPanel'
import { RunSchoolMultiSelect } from '@/components/kys/RunSchoolMultiSelect'

export interface KysMappingSectionProps {
  runId: string
  sourceMode: SourceMode
  /** The run's current status (from CollectionRunSummary.status) — schools can't resolve before the run has started. */
  runStatus: string
}

export function KysMappingSection({ runId, sourceMode, runStatus }: KysMappingSectionProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [mapNowOpen, setMapNowOpen] = useState(false)

  const schoolsQuery = useQuery({
    queryKey: ['collection-run-schools', runId],
    queryFn: () => fetchCollectionRunSchools(runId),
    enabled: Boolean(runId) && runStatus !== 'pending' && sourceMode !== 'kys',
    refetchInterval: runStatus === 'running' ? 3000 : false,
  })

  if (sourceMode === 'kys') {
    return null
  }

  if (runStatus === 'pending') {
    return null
  }

  if (schoolsQuery.isLoading) {
    return <div className="text-sm text-slate-500">Loading schools for this run...</div>
  }

  const resolvable = (schoolsQuery.data ?? []).filter(
    (s) => s.school_id && s.kys_mapping_status?.toLowerCase() !== 'mapped',
  )

  if (resolvable.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
        Waiting for schools to resolve identity before KYS mapping can start. This updates automatically as the
        collection runs.
      </div>
    )
  }

  if (sourceMode === 'saras+kys') {
    return (
      <BulkKysImportPanel
        scope={{ collectionRunId: runId }}
        defaultOpen
        title="Map this run to KYS"
        description={`Paste the KYS JSON you retrieved (after solving the CAPTCHA yourself) to match the ${resolvable.length} resolved school(s) in this run.`}
        onImported={() => schoolsQuery.refetch()}
      />
    )
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">Map to KYS (optional)</div>
          <p className="mt-1 text-sm text-slate-600">
            Select which of this run's schools to match against a pasted KYS JSON. You can always do this later
            from Identity Review instead.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMapNowOpen((v) => !v)}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          {mapNowOpen ? 'Close' : 'Map to KYS now'}
        </button>
      </div>

      {mapNowOpen && (
        <div className="space-y-4">
          <RunSchoolMultiSelect schools={resolvable} selected={selectedIds} onChange={setSelectedIds} />
          {selectedIds.length > 0 && (
            <BulkKysImportPanel
              scope={{ collectionRunId: runId, schoolIds: selectedIds }}
              defaultOpen
              title={`Match ${selectedIds.length} selected school(s) against KYS`}
              description="Paste the KYS JSON you retrieved (after solving the CAPTCHA yourself) — only the schools you selected above will be matched."
              onImported={() => schoolsQuery.refetch()}
            />
          )}
        </div>
      )}
    </div>
  )
}
