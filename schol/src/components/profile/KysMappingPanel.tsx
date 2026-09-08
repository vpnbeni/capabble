import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { confirmKysMapping, verifyKysMapping } from '@/services/api'
import type { KysMappingSummary } from '@/types/profile'

export function KysMappingPanel({
  schoolId,
  mapping,
  onUpdated,
}: {
  schoolId: string
  mapping: KysMappingSummary
  onUpdated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [kysSchoolId, setKysSchoolId] = useState('')
  const [udise, setUdise] = useState('')
  const [verification, setVerification] = useState<Record<string, unknown> | null>(null)

  const verifyMutation = useMutation({
    mutationFn: () => verifyKysMapping(schoolId, kysSchoolId),
    onSuccess: (data) => {
      setVerification(data)
      if (data.verdict === 'verified') {
        toast.success('KYS identity verified')
      } else if (data.verdict === 'review') {
        toast('KYS identity needs review', { icon: '⚠️' })
      } else {
        toast.error(data.reason || 'KYS verification failed')
      }
    },
    onError: () => toast.error('Unable to verify KYS school ID'),
  })

  const confirmMutation = useMutation({
    mutationFn: () => confirmKysMapping(schoolId, kysSchoolId, udise || undefined),
    onSuccess: (data) => {
      if (data.status === 'MAPPED') {
        toast.success('KYS mapping saved')
        setOpen(false)
        onUpdated()
      } else {
        toast.error(data.reason || 'Mapping not saved')
      }
    },
    onError: () => toast.error('Unable to save KYS mapping'),
  })

  if (mapping.status === 'connected') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <div className="font-semibold text-emerald-900">KYS Connected</div>
        <div className="mt-2 grid gap-1 text-sm text-emerald-900">
          <div>UDISE: <span className="font-medium">{mapping.udise || '—'}</span></div>
          <div>KYS ID: <span className="font-medium">{mapping.kys_school_id}</span></div>
        </div>
      </div>
    )
  }

  const reviewLabel = mapping.status === 'review' ? 'KYS Mapping Review' : mapping.label

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-amber-900">{reviewLabel}</div>
          <div className="mt-1 text-sm text-amber-800">
            CBSE: {mapping.cbse_affiliation || '—'} · SARAS: {mapping.saras_school_code || '—'}
          </div>
        </div>
        {mapping.can_resolve && (
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
          >
            Resolve KYS
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">KYS School ID</span>
              <input
                value={kysSchoolId}
                onChange={(e) => setKysSchoolId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="e.g. 1519942"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">UDISE (optional)</span>
              <input
                value={udise}
                onChange={(e) => setUdise(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2"
                placeholder="Filled from KYS when verified"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => verifyMutation.mutate()}
              disabled={!kysSchoolId || verifyMutation.isPending}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Verify
            </button>
            <button
              onClick={() => confirmMutation.mutate()}
              disabled={verification?.verdict !== 'verified' || confirmMutation.isPending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Verify &amp; Save
            </button>
            <button onClick={() => setOpen(false)} className="rounded-lg px-4 py-2 text-sm text-slate-600">
              Cancel
            </button>
          </div>
          {verification && (
            <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-3 text-xs text-slate-700">
              {JSON.stringify(verification, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
