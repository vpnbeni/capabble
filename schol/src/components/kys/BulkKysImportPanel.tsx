import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  bulkImportKysMapping,
  confirmKysMapping,
  type BulkKysImportMatch,
  type BulkKysImportResult,
  type KysMappingScope,
} from '@/services/api'

type ReviewRowState = 'pending' | 'confirmed' | 'skipped' | 'error'

export function ReviewRow({ match }: { match: BulkKysImportMatch }) {
  const [state, setState] = useState<ReviewRowState>('pending')
  const [errorMessage, setErrorMessage] = useState('')

  const confirmMutation = useMutation({
    mutationFn: () => confirmKysMapping(match.school_id, match.kys_school_id, undefined, true),
    onSuccess: (data) => {
      if (data.status === 'MAPPED') {
        setState('confirmed')
        toast.success(`${match.school_name} confirmed`)
      } else {
        setState('error')
        setErrorMessage(data.reason || 'Mapping not saved')
        toast.error(data.reason || 'Mapping not saved')
      }
    },
    onError: (error: Error) => {
      setState('error')
      setErrorMessage(error.message || 'Confirm failed')
      toast.error(error.message || 'Confirm failed')
    },
  })

  const pinMismatch = Boolean(match.mismatch_fields && 'pin_code' in match.mismatch_fields)

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 py-2 last:border-b-0">
      <div>
        <div>
          <span className="font-medium">{match.school_name}</span> → candidate KYS {match.kys_school_id} (
          {match.kys_school_name}), confidence {match.confidence}
          {state === 'confirmed' && <span className="ml-2 text-emerald-700">✓ Confirmed</span>}
          {state === 'skipped' && <span className="ml-2 text-slate-400">Skipped</span>}
          {state === 'error' && <span className="ml-2 text-red-700">Error: {errorMessage}</span>}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">
          PIN: {match.school_pin_code || '—'} vs {match.kys_pin_code || '—'}
          {pinMismatch && <span className="ml-1 font-medium text-red-600">mismatch</span>}
          {' · '}Address: {match.school_address || '—'} vs {match.kys_address || '—'}
        </div>
      </div>
      {state === 'pending' && (
        <div className="flex gap-2">
          <button
            onClick={() => confirmMutation.mutate()}
            disabled={confirmMutation.isPending}
            className="rounded-lg border border-emerald-400 bg-white px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
          >
            {confirmMutation.isPending ? 'Confirming...' : 'Confirm anyway'}
          </button>
          <button
            onClick={() => setState('skipped')}
            className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Skip
          </button>
        </div>
      )}
    </li>
  )
}

export interface BulkKysImportPanelProps {
  /** Narrows which pending schools this paste can match against. Omitted = every pending school system-wide (Identity Review's default behavior). */
  scope?: KysMappingScope
  /** Pre-filled district hint; ignored by the backend when `scope` is set. */
  defaultDistrict?: string
  title?: string
  description?: string
  /** Panel starts expanded instead of requiring a click to open. */
  defaultOpen?: boolean
  onImported?: (result: BulkKysImportResult) => void
}

export function BulkKysImportPanel({
  scope,
  defaultDistrict = '',
  title = 'Bulk KYS Import',
  description = 'Paste a raw KYS API response (e.g. an Advance Search district listing you retrieved after solving the CAPTCHA yourself) to match many pending schools at once. High-confidence matches are still independently re-verified live before being saved.',
  defaultOpen = false,
  onImported,
}: BulkKysImportPanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [rawText, setRawText] = useState('')
  const [district, setDistrict] = useState(defaultDistrict)
  const [result, setResult] = useState<BulkKysImportResult | null>(null)

  const importMutation = useMutation({
    mutationFn: () => bulkImportKysMapping(rawText, district || undefined, true, scope),
    onSuccess: (data) => {
      setResult(data)
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success(`Mapped ${data.auto_mapped.length} school(s) automatically`)
      }
      onImported?.(data)
    },
    onError: (error: Error) => toast.error(error.message || 'Import failed'),
  })

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">{title}</div>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          {open ? 'Close' : 'Paste JSON'}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          {!scope && (
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600">District (optional — inferred from the data if omitted)</span>
              <input
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="e.g. ROHTAK"
                className="w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Raw JSON response</span>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={8}
              placeholder='Paste the response body here, e.g. {"data": {"content": [...]}}'
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => importMutation.mutate()}
              disabled={!rawText.trim() || importMutation.isPending}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {importMutation.isPending ? 'Matching...' : 'Match & Save'}
            </button>
          </div>

          {result && !result.error && (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <div>
                Parsed {result.candidates_parsed} KYS record(s)
                {result.district_used ? (
                  <>
                    {' '}for district <span className="font-medium">{result.district_used}</span>
                  </>
                ) : null}
                ; checked {result.schools_checked} pending SCHOL school(s).
              </div>

              {result.auto_mapped.length > 0 && (
                <div>
                  <div className="font-medium text-emerald-800">Auto-mapped ({result.auto_mapped.length})</div>
                  <ul className="mt-1 space-y-1">
                    {result.auto_mapped.map((m) => (
                      <li key={m.school_id}>
                        {m.school_name} → KYS {m.kys_school_id} ({m.kys_school_name})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.needs_review.length > 0 && (
                <div>
                  <div className="font-medium text-amber-800">Needs review ({result.needs_review.length})</div>
                  <p className="mt-1 text-xs text-slate-500">
                    Compare the school name against the KYS candidate name before confirming — matches here scored
                    below the auto-confirm threshold and may be wrong.
                  </p>
                  <ul className="mt-2">
                    {result.needs_review.map((m) => (
                      <ReviewRow key={m.school_id} match={m} />
                    ))}
                  </ul>
                </div>
              )}

              {result.no_match.length > 0 && (
                <div>
                  <div className="font-medium text-slate-600">No match found ({result.no_match.length})</div>
                  <ul className="mt-1 space-y-1">
                    {result.no_match.map((m) => (
                      <li key={m.school_id}>{m.school_name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
