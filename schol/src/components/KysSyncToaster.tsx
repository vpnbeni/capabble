import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { cancelKysSync, fetchKysSyncStatus, type KysSyncRun } from '@/services/api'
import { useActiveKysSyncs } from '@/hooks/useActiveKysSyncs'

function SyncToastContent({ run }: { run: KysSyncRun }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-lg">
      <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-primary-600" />
      <div className="text-sm">
        <div className="font-medium text-slate-900">Syncing {run.school_name || 'school'}</div>
        <div className="text-slate-500">{run.current_year ? `Collecting ${run.current_year}...` : 'Starting...'}</div>
      </div>
      <button
        onClick={async () => {
          if (!run.school_id) return
          try {
            await cancelKysSync(run.school_id, run.run_id)
          } catch {
            // ignore — the next poll will reconcile actual state
          }
        }}
        className="ml-2 flex-shrink-0 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        Cancel
      </button>
    </div>
  )
}

// Mounted once at the app root — polls for any currently-running single-school
// KYS sync jobs (regardless of which page started them, or whether the page
// that started one is still open) and renders a persistent toast per job with
// a Cancel action. Survives navigation, tab switches, and reloads because the
// job itself lives server-side; this component just reflects its state.
export function KysSyncToaster() {
  const { data: activeSyncs } = useActiveKysSyncs()
  const queryClient = useQueryClient()
  const knownRunIds = useRef<Map<string, KysSyncRun>>(new Map())

  useEffect(() => {
    const current = new Map((activeSyncs || []).map((run) => [run.run_id, run]))

    for (const run of current.values()) {
      toast.custom(<SyncToastContent run={run} />, { id: run.run_id, duration: Infinity })
    }

    for (const [runId, previousRun] of knownRunIds.current) {
      if (current.has(runId)) continue
      // Dropped out of the active list since the last poll — it finished.
      if (previousRun.school_id) {
        fetchKysSyncStatus(previousRun.school_id, runId)
          .then((finalRun) => {
            if (finalRun.status === 'completed' || finalRun.status === 'paused') {
              toast.success(
                `${finalRun.school_name || previousRun.school_name || 'School'} KYS sync finished (${finalRun.processed_count} succeeded, ${finalRun.failed_count} failed)`,
                { id: runId },
              )
            } else if (finalRun.status === 'cancelled') {
              toast(`${finalRun.school_name || previousRun.school_name || 'School'} sync cancelled`, { id: runId, icon: '⚠️' })
            } else {
              toast.error(finalRun.error_summary || `${previousRun.school_name || 'School'} KYS sync failed`, { id: runId })
            }
          })
          .catch(() => toast.dismiss(runId))
          .finally(() => {
            if (previousRun.school_id) {
              queryClient.invalidateQueries({ queryKey: ['school-profile', previousRun.school_id] })
              queryClient.invalidateQueries({ queryKey: ['school-directory'] })
            }
          })
      } else {
        toast.dismiss(runId)
      }
    }

    knownRunIds.current = current
  }, [activeSyncs, queryClient])

  return null
}
