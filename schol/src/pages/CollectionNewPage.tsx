import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ACADEMIC_YEARS, DATA_GROUP_OPTIONS, type SourceMode } from '@/types/collection'
import { createCollectionRun, fetchDistricts, fetchStates, previewCollection } from '@/services/collection'
import { useSessionPersistedState } from '@/hooks/useSessionPersistedState'
import { CollectionRunProgress } from '@/components/collection/CollectionRunProgress'
import { KysMappingSection } from '@/components/kys/KysMappingSection'
import { parseKysDistrictPaste } from '@/utils/kysDistrictPaste'

const STEPS = ['Source', 'Geography', 'Preview', 'Collect', 'Run & Map', 'Results']

interface WizardState {
  step: number
  maxReachedStep: number
  sourceMode: SourceMode
  stateId: string
  districtId: string
  /** Free-text labels for KYS-only (no SARAS geography IDs). */
  kysStateName: string
  kysDistrictName: string
  kysPasteText: string
  yearFrom: string
  yearTo: string
  schoolLimit: string
  dataGroups: string[]
  previewPage: number
  hasRequestedPreview: boolean
  runId: string | null
}

const INITIAL_WIZARD: WizardState = {
  step: 0,
  maxReachedStep: 0,
  sourceMode: 'saras',
  stateId: '',
  districtId: '',
  kysStateName: '',
  kysDistrictName: '',
  kysPasteText: '',
  yearFrom: '2018-19',
  yearTo: '2025-26',
  schoolLimit: '5',
  dataGroups: DATA_GROUP_OPTIONS.map((g) => g.id),
  previewPage: 1,
  hasRequestedPreview: false,
  runId: null,
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === 'COMPLETE' || value === 'VERIFIED' || value === 'SKIP'
      ? 'bg-emerald-100 text-emerald-800'
      : value === 'NEW'
        ? 'bg-blue-100 text-blue-800'
        : value === 'INCOMPLETE' || value === 'UNRESOLVED'
          ? 'bg-amber-100 text-amber-800'
          : value === 'CONFLICT'
            ? 'bg-red-100 text-red-800'
            : 'bg-slate-100 text-slate-700'
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${tone}`}>{value}</span>
}

export function CollectionNewPage() {
  const [wizard, setWizard, resetWizard] = useSessionPersistedState('collection-wizard', 2, INITIAL_WIZARD)
  const [runStatus, setRunStatus] = useState('pending')
  const advancedForKeyRef = useRef<string | null>(null)

  const isKysOnly = wizard.sourceMode === 'kys'

  function update(patch: Partial<WizardState>) {
    setWizard((prev) => ({ ...prev, ...patch }))
  }

  const statesQuery = useQuery({ queryKey: ['geography-states'], queryFn: fetchStates, enabled: !isKysOnly })
  const districtsQuery = useQuery({
    queryKey: ['geography-districts', wizard.stateId],
    queryFn: () => fetchDistricts(wizard.stateId),
    enabled: !isKysOnly && Boolean(wizard.stateId),
  })

  const selectedState = statesQuery.data?.find((s) => s.id === wizard.stateId)
  const selectedDistrict = districtsQuery.data?.find((d) => d.id === wizard.districtId)

  const kysPaste = useMemo(() => parseKysDistrictPaste(wizard.kysPasteText), [wizard.kysPasteText])

  // Cached on [state, district, years, data groups, page] — revisiting Preview after only
  // tweaking Collect options, or flipping back to an already-seen page, reuses this cache
  // instead of re-issuing the 30-120s SARAS scrape. Only an explicit "Preview Schools" /
  // "Force re-preview" click (or a genuinely new combo) triggers a fetch.
  const previewQuery = useQuery({
    queryKey: [
      'collection-preview',
      wizard.stateId,
      wizard.districtId,
      wizard.yearFrom,
      wizard.yearTo,
      wizard.dataGroups.join(','),
      wizard.previewPage,
    ],
    queryFn: ({ signal }) =>
      previewCollection(
        {
          source: 'saras',
          state_id: wizard.stateId,
          state_name: selectedState?.name || '',
          district_id: wizard.districtId,
          district_name: selectedDistrict?.name || '',
          year_from: wizard.yearFrom,
          year_to: wizard.yearTo,
          data_groups: [...wizard.dataGroups],
          page: wizard.previewPage,
          limit: 20,
        },
        signal,
      ),
    enabled: !isKysOnly && wizard.hasRequestedPreview && Boolean(wizard.stateId) && Boolean(wizard.districtId),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const preview = previewQuery.data ?? null

  useEffect(() => {
    if (!preview || isKysOnly) return
    const key = `${wizard.stateId}:${wizard.districtId}`
    if (advancedForKeyRef.current === key) return
    advancedForKeyRef.current = key
    update({ maxReachedStep: Math.max(wizard.maxReachedStep, 2), step: wizard.step < 2 ? 2 : wizard.step })
    toast.success(`Discovered ${preview.unique_schools} schools`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview])

  useEffect(() => {
    if (previewQuery.isError) {
      toast.error((previewQuery.error as Error)?.message || 'Preview failed')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewQuery.isError])

  function goToPreviewPage(page: number) {
    update({ previewPage: page })
  }

  const limitedKysSchools = useMemo(() => {
    if (wizard.schoolLimit === 'all') return kysPaste.schools
    return kysPaste.schools.slice(0, Number(wizard.schoolLimit) || kysPaste.schools.length)
  }, [kysPaste.schools, wizard.schoolLimit])

  const startMutation = useMutation({
    mutationFn: () => {
      if (isKysOnly) {
        if (!kysPaste.rawJson || kysPaste.parseError) {
          return Promise.reject(new Error(kysPaste.parseError || 'Paste valid KYS district JSON first'))
        }
        const inferredState = wizard.kysStateName || kysPaste.schools[0]?.state || ''
        const inferredDistrict = wizard.kysDistrictName || kysPaste.schools[0]?.district || ''
        return createCollectionRun({
          source: 'kys',
          source_mode: 'kys',
          state_id: '',
          state_name: inferredState,
          district_id: '',
          district_name: inferredDistrict,
          year_from: wizard.yearFrom,
          year_to: wizard.yearTo,
          data_groups: [...wizard.dataGroups],
          school_limit: wizard.schoolLimit,
          kys_district_json: kysPaste.rawJson,
          options: {
            skip_complete: true,
            resume_incomplete: true,
            skip_completed_endpoints: true,
          },
          start_immediately: true,
        })
      }
      return createCollectionRun({
        source: 'saras',
        source_mode: wizard.sourceMode,
        state_id: wizard.stateId,
        state_name: selectedState?.name || '',
        district_id: wizard.districtId,
        district_name: selectedDistrict?.name || '',
        year_from: wizard.yearFrom,
        year_to: wizard.yearTo,
        data_groups: [...wizard.dataGroups],
        school_limit: wizard.schoolLimit,
        options: {
          skip_complete: true,
          resume_incomplete: true,
          skip_completed_endpoints: true,
        },
        start_immediately: true,
      })
    },
    onSuccess: (data) => {
      toast.success('Collection run started')
      setRunStatus('pending')
      update({ runId: data.run_id, step: 4, maxReachedStep: Math.max(wizard.maxReachedStep, 4) })
    },
    onError: (error: Error) => toast.error(error.message || 'Could not start collection'),
  })

  const summaryCards = useMemo(() => {
    if (isKysOnly) {
      return [
        { label: 'Schools in paste', value: kysPaste.schools.length },
        { label: 'Will collect', value: limitedKysSchools.length },
        { label: 'Duplicates skipped', value: kysPaste.duplicates },
        { label: 'Rows seen', value: kysPaste.rowsSeen },
      ]
    }
    if (!preview) return []
    return [
      { label: 'Schools discovered', value: preview.unique_schools },
      { label: 'Already in SCHOL', value: preview.existing_canonical_schools },
      { label: 'Already complete', value: preview.existing_complete },
      { label: 'Incomplete', value: preview.existing_incomplete },
      { label: 'New', value: preview.new_schools },
      { label: 'Identity review', value: preview.unresolved_matches },
      { label: 'Conflicts', value: preview.conflicts },
    ]
  }, [preview, isKysOnly, kysPaste, limitedKysSchools.length])

  function startOver() {
    resetWizard()
    advancedForKeyRef.current = null
    setRunStatus('pending')
  }

  const runInProgress = Boolean(wizard.runId)

  function goToStep(index: number) {
    if (runInProgress && index < 4) return // setup is locked once a run has actually started
    if (index > wizard.maxReachedStep) return
    update({ step: index })
  }

  function continueFromKysPaste() {
    if (kysPaste.parseError || kysPaste.schools.length === 0) {
      toast.error(kysPaste.parseError || 'No schools found in paste')
      return
    }
    const inferredState = wizard.kysStateName || kysPaste.schools[0]?.state || ''
    const inferredDistrict = wizard.kysDistrictName || kysPaste.schools[0]?.district || ''
    update({
      kysStateName: inferredState,
      kysDistrictName: inferredDistrict,
      step: 2,
      maxReachedStep: Math.max(wizard.maxReachedStep, 2),
    })
    toast.success(`Loaded ${kysPaste.schools.length} KYS schools`)
  }

  const previewReady = isKysOnly ? kysPaste.schools.length > 0 && !kysPaste.parseError : Boolean(preview)
  const geographyLabel = isKysOnly
    ? `${wizard.kysStateName || '—'} → ${wizard.kysDistrictName || '—'}`
    : preview
      ? `${preview.state} → ${preview.district}`
      : ''

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Collect Schools</h1>
          <p className="mt-1 text-slate-600">Discover and collect school intelligence from authoritative sources.</p>
        </div>
        {runInProgress && (
          <button
            onClick={startOver}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Start a new collection
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => {
          const enabled = index <= wizard.maxReachedStep && !(runInProgress && index < 4)
          return (
            <button
              key={label}
              type="button"
              disabled={!enabled}
              onClick={() => goToStep(index)}
              className={`rounded-full px-3 py-1 text-sm transition ${
                index === wizard.step
                  ? 'bg-primary-600 text-white'
                  : enabled
                    ? 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                    : 'cursor-not-allowed bg-slate-100 text-slate-400'
              }`}
            >
              {index + 1}. {label}
            </button>
          )
        })}
      </div>

      {wizard.step === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Choose a source</h2>
          <p className="mt-1 text-sm text-slate-600">
            Use SARAS for CBSE-affiliated discovery, or KYS-only when you already have a district listing JSON
            (CAPTCHA solved in the browser).
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <button
              type="button"
              onClick={() => update({ sourceMode: 'saras' })}
              className={`rounded-xl border p-4 text-left transition ${
                wizard.sourceMode === 'saras'
                  ? 'border-primary-500 ring-2 ring-primary-200'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="font-semibold text-slate-900">CBSE SARAS only</div>
              <p className="mt-2 text-sm text-slate-600">
                Discover and collect schools from the CBSE affiliated school directory. KYS mapping can still be
                done later, optionally, right after this run starts.
              </p>
            </button>
            <button
              type="button"
              onClick={() => update({ sourceMode: 'saras+kys' })}
              className={`rounded-xl border p-4 text-left transition ${
                wizard.sourceMode === 'saras+kys'
                  ? 'border-primary-500 ring-2 ring-primary-200'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="font-semibold text-slate-900">CBSE SARAS + UDISE+/KYS mapping</div>
              <p className="mt-2 text-sm text-slate-600">
                Same SARAS discovery, plus an inline step to paste the KYS JSON and match it against this run&apos;s
                schools as soon as they&apos;re discovered.
              </p>
            </button>
            <button
              type="button"
              onClick={() => update({ sourceMode: 'kys' })}
              className={`rounded-xl border p-4 text-left transition ${
                wizard.sourceMode === 'kys'
                  ? 'border-primary-500 ring-2 ring-primary-200'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="font-semibold text-slate-900">KYS only</div>
              <p className="mt-2 text-sm text-slate-600">
                Skip SARAS. Paste a district Advance Search JSON (after solving CAPTCHA yourself). Detail APIs have
                no CAPTCHA — we collect profiles, facilities, and enrollment into the DB automatically.
              </p>
            </button>
          </div>
          <button
            onClick={() => update({ step: 1, maxReachedStep: Math.max(wizard.maxReachedStep, 1) })}
            className="mt-6 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Continue
          </button>
        </div>
      )}

      {wizard.step === 1 && isKysOnly && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Paste KYS district JSON</h2>
          <p className="mt-1 text-sm text-slate-600">
            On kys.udiseplus.gov.in, solve the CAPTCHA, run Advance Search for a district, then copy the Network
            response body (the JSON with <code className="text-xs">data.content</code> schools) and paste it here.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">State label (optional)</label>
              <input
                value={wizard.kysStateName}
                onChange={(e) => update({ kysStateName: e.target.value })}
                placeholder="Inferred from JSON if blank"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">District label (optional)</label>
              <input
                value={wizard.kysDistrictName}
                onChange={(e) => update({ kysDistrictName: e.target.value })}
                placeholder="Inferred from JSON if blank"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <textarea
            value={wizard.kysPasteText}
            onChange={(e) => update({ kysPasteText: e.target.value })}
            rows={12}
            placeholder='{"data":{"content":[{"schoolId":...,"udiseschCode":"...","schoolName":"..."}]}}'
            className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
          />
          {wizard.kysPasteText.trim() && (
            <p className={`mt-2 text-sm ${kysPaste.parseError ? 'text-red-700' : 'text-emerald-700'}`}>
              {kysPaste.parseError
                ? kysPaste.parseError
                : `${kysPaste.schools.length} schools ready (${kysPaste.duplicates} duplicates skipped)`}
            </p>
          )}
          <button
            onClick={continueFromKysPaste}
            disabled={Boolean(kysPaste.parseError) || kysPaste.schools.length === 0}
            className="mt-6 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            Preview schools
          </button>
        </div>
      )}

      {wizard.step === 1 && !isKysOnly && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {(statesQuery.isLoading || districtsQuery.isLoading) && (
            <p className="mb-4 text-sm text-slate-500">Loading geography from CBSE SARAS...</p>
          )}
          {statesQuery.isError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Could not load states from SARAS.
              {(statesQuery.error as { response?: { status?: number } })?.response?.status === 401
                ? ' Sign out and sign in again, then retry.'
                : ' Ensure the SCHOL API is running (started by npm run dev as schol-api on port 8001), then retry.'}
              <button type="button" onClick={() => statesQuery.refetch()} className="ml-2 font-medium underline">
                Retry
              </button>
            </div>
          )}
          {wizard.stateId && districtsQuery.isError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Could not load districts for the selected state.
              <button type="button" onClick={() => districtsQuery.refetch()} className="ml-2 font-medium underline">
                Retry
              </button>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">State</label>
              <select
                value={wizard.stateId}
                disabled={statesQuery.isLoading || statesQuery.isError}
                onChange={(e) =>
                  update({ stateId: e.target.value, districtId: '', hasRequestedPreview: false, previewPage: 1 })
                }
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
              >
                <option value="">Select State</option>
                {statesQuery.data?.map((state) => (
                  <option key={state.id} value={state.id}>{state.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">District</label>
              <select
                value={wizard.districtId}
                disabled={!wizard.stateId || districtsQuery.isLoading || districtsQuery.isError}
                onChange={(e) => update({ districtId: e.target.value, hasRequestedPreview: false, previewPage: 1 })}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
              >
                <option value="">Select District</option>
                {districtsQuery.data?.map((district) => (
                  <option key={district.id} value={district.id}>{district.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            disabled={!wizard.stateId || !wizard.districtId || previewQuery.isFetching}
            onClick={() => update({ hasRequestedPreview: true, previewPage: 1 })}
            className="mt-6 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {previewQuery.isFetching ? 'Previewing schools...' : 'Preview Schools'}
          </button>
          {previewQuery.isFetching ? (
            <p className="mt-3 text-sm text-slate-500">
              Fetching the CBSE SARAS directory for this district. This often takes 30–90 seconds —
              keep this tab open.
            </p>
          ) : null}
        </div>
      )}

      {wizard.step >= 2 && wizard.step <= 3 && previewReady && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">{isKysOnly ? 'UDISE+/KYS' : 'CBSE SARAS'}</div>
                <div className="text-lg font-semibold">{geographyLabel}</div>
              </div>
              <div className="flex items-center gap-3">
                {!isKysOnly && previewQuery.isFetching && <span className="text-xs text-slate-400">Refreshing…</span>}
                {!isKysOnly && (
                  <button type="button" onClick={() => previewQuery.refetch()} className="text-sm text-primary-700 hover:underline">
                    Force re-preview
                  </button>
                )}
                <button onClick={() => update({ step: 1 })} className="text-sm text-primary-700 hover:underline">
                  {isKysOnly ? 'Change paste' : 'Change geography'}
                </button>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {summaryCards.map((card) => (
                <div key={card.label} className="rounded-lg border border-slate-200 p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500">{card.label}</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">{card.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3">School</th>
                    <th className="px-4 py-3">{isKysOnly ? 'UDISE' : 'CBSE Affiliation'}</th>
                    <th className="px-4 py-3">{isKysOnly ? 'KYS ID' : 'School Code'}</th>
                    <th className="px-4 py-3">District</th>
                    {!isKysOnly && <th className="px-4 py-3">Status</th>}
                    {!isKysOnly && <th className="px-4 py-3">SCHOL Identity</th>}
                    {!isKysOnly && <th className="px-4 py-3">Collection State</th>}
                  </tr>
                </thead>
                <tbody>
                  {isKysOnly
                    ? limitedKysSchools.map((school) => (
                        <tr key={school.schoolId} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-medium text-slate-900">{school.schoolName}</td>
                          <td className="px-4 py-3">{school.udise || '—'}</td>
                          <td className="px-4 py-3">{school.schoolId}</td>
                          <td className="px-4 py-3">{school.district || '—'}</td>
                        </tr>
                      ))
                    : preview!.schools.map((school) => (
                        <tr key={school.affiliation_number} className="border-t border-slate-100">
                          <td className="px-4 py-3 font-medium text-slate-900">{school.school_name}</td>
                          <td className="px-4 py-3">{school.affiliation_number}</td>
                          <td className="px-4 py-3">{school.school_code || '—'}</td>
                          <td className="px-4 py-3">{school.district || '—'}</td>
                          <td className="px-4 py-3">{school.status || '—'}</td>
                          <td className="px-4 py-3"><StatusBadge value={school.schol_identity} /></td>
                          <td className="px-4 py-3"><StatusBadge value={school.collection_state} /></td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            {!isKysOnly && preview && preview.pagination.pages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
                <div className="text-slate-500">
                  Showing page {preview.pagination.page} of {preview.pagination.pages} ({preview.pagination.total} schools)
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={wizard.previewPage <= 1 || previewQuery.isFetching}
                    onClick={() => goToPreviewPage(wizard.previewPage - 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    disabled={wizard.previewPage >= preview.pagination.pages || previewQuery.isFetching}
                    onClick={() => goToPreviewPage(wizard.previewPage + 1)}
                    className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            {isKysOnly && kysPaste.schools.length > limitedKysSchools.length && (
              <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
                Showing first {limitedKysSchools.length} of {kysPaste.schools.length} (school limit). Change limit in
                Collect options.
              </div>
            )}
          </div>

          {wizard.step === 2 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900">Collection options</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-slate-600">From</label>
                  <select value={wizard.yearFrom} onChange={(e) => update({ yearFrom: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                    {ACADEMIC_YEARS.map((year) => <option key={year}>{year}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-600">To</label>
                  <select value={wizard.yearTo} onChange={(e) => update({ yearTo: e.target.value })} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                    {ACADEMIC_YEARS.map((year) => <option key={year}>{year}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {DATA_GROUP_OPTIONS.map((group) => (
                  <label key={group.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={wizard.dataGroups.includes(group.id)}
                      onChange={(e) => {
                        update({
                          dataGroups: e.target.checked
                            ? [...wizard.dataGroups, group.id]
                            : wizard.dataGroups.filter((id) => id !== group.id),
                        })
                      }}
                    />
                    {group.label}
                  </label>
                ))}
              </div>
              <div className="mt-4">
                <label className="text-sm text-slate-600">School limit</label>
                <select value={wizard.schoolLimit} onChange={(e) => update({ schoolLimit: e.target.value })} className="mt-1 rounded-lg border px-3 py-2 text-sm">
                  {['5', '25', '50', '100', 'all'].map((value) => <option key={value} value={value}>{value === 'all' ? 'All' : value}</option>)}
                </select>
              </div>
              <button
                onClick={() => update({ step: 3, maxReachedStep: Math.max(wizard.maxReachedStep, 3) })}
                className="mt-6 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                Continue to collection
              </button>
            </div>
          )}

          {wizard.step === 3 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
              <h3 className="font-semibold text-amber-950">Ready to collect</h3>
              <p className="mt-2 text-sm text-amber-900">
                {isKysOnly ? (
                  <>
                    This will create a KYS-only run for{' '}
                    {wizard.schoolLimit === 'all' ? kysPaste.schools.length : limitedKysSchools.length} schools
                    in {wizard.kysDistrictName || 'this district'}. Detail APIs (report-card, profile, facility,
                    social data) will be fetched automatically — no further CAPTCHA.
                  </>
                ) : (
                  <>
                    This will create a collection run for {wizard.schoolLimit === 'all' ? preview!.unique_schools : wizard.schoolLimit} schools
                    in {preview!.district}. Complete schools will be skipped by default.
                    {wizard.sourceMode === 'saras+kys' && ' A KYS mapping step will open automatically once schools resolve.'}
                  </>
                )}
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => startMutation.mutate()}
                  disabled={startMutation.isPending}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {startMutation.isPending ? 'Starting...' : 'Start Collection'}
                </button>
                <Link to="/schools" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
                  Back to Directory
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      {wizard.step === 4 && wizard.runId && (
        <div className="space-y-6">
          <CollectionRunProgress runId={wizard.runId} onSummary={(s) => setRunStatus(s.status)} showNavLinks={false} />
          {!isKysOnly && (
            <KysMappingSection runId={wizard.runId} sourceMode={wizard.sourceMode} runStatus={runStatus} />
          )}
          {isKysOnly && (
            <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              KYS IDs came from your pasted district JSON — no separate mapping step needed. When this district
              finishes, start a new collection and paste the next district&apos;s JSON.
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => update({ step: 5, maxReachedStep: Math.max(wizard.maxReachedStep, 5) })}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Continue to Results
            </button>
            <Link to={`/collection/runs/${wizard.runId}`} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
              Open full run page
            </Link>
          </div>
        </div>
      )}

      {wizard.step === 5 && wizard.runId && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <h3 className="font-semibold text-emerald-950">Collection run in progress / complete</h3>
          <p className="mt-2 text-sm text-emerald-900">
            Status: {runStatus}. You can keep this run open, jump to the School Directory to see collected schools,
            or start a new collection{isKysOnly ? ' with the next district JSON' : ''}.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/schools" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
              View School Directory
            </Link>
            <Link to={`/collection/runs/${wizard.runId}`} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
              Open full run page
            </Link>
            <button onClick={startOver} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm">
              Start a new collection
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
