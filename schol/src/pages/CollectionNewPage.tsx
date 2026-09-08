import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ACADEMIC_YEARS,
  DATA_GROUP_OPTIONS,
  type CollectionPreview,
} from '@/types/collection'
import { createCollectionRun, fetchDistricts, fetchStates, previewCollection } from '@/services/collection'

const STEPS = ['Source', 'Geography', 'Preview', 'Collect', 'Results']

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
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [stateId, setStateId] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [yearFrom, setYearFrom] = useState('2018-19')
  const [yearTo, setYearTo] = useState('2025-26')
  const [schoolLimit, setSchoolLimit] = useState('5')
  const [dataGroups, setDataGroups] = useState(DATA_GROUP_OPTIONS.map((g) => g.id))
  const [preview, setPreview] = useState<CollectionPreview | null>(null)

  const statesQuery = useQuery({ queryKey: ['geography-states'], queryFn: fetchStates })
  const districtsQuery = useQuery({
    queryKey: ['geography-districts', stateId],
    queryFn: () => fetchDistricts(stateId),
    enabled: Boolean(stateId),
  })

  const selectedState = statesQuery.data?.find((s) => s.id === stateId)
  const selectedDistrict = districtsQuery.data?.find((d) => d.id === districtId)

  const previewMutation = useMutation({
    mutationFn: () =>
      previewCollection({
        source: 'saras',
        state_id: stateId,
        state_name: selectedState?.name || '',
        district_id: districtId,
        district_name: selectedDistrict?.name || '',
        year_from: yearFrom,
        year_to: yearTo,
        data_groups: [...dataGroups],
      }),
    onSuccess: (data) => {
      setPreview(data)
      setStep(2)
      toast.success(`Discovered ${data.unique_schools} schools`)
    },
    onError: (error: Error) => toast.error(error.message || 'Preview failed'),
  })

  const startMutation = useMutation({
    mutationFn: () =>
      createCollectionRun({
        source: 'saras',
        state_id: stateId,
        state_name: selectedState?.name || '',
        district_id: districtId,
        district_name: selectedDistrict?.name || '',
        year_from: yearFrom,
        year_to: yearTo,
        data_groups: [...dataGroups],
        school_limit: schoolLimit,
        options: {
          skip_complete: true,
          resume_incomplete: true,
          skip_completed_endpoints: true,
        },
        start_immediately: true,
      }),
    onSuccess: (data) => {
      toast.success('Collection run started')
      navigate(`/collection/runs/${data.run_id}`)
    },
    onError: (error: Error) => toast.error(error.message || 'Could not start collection'),
  })

  const summaryCards = useMemo(() => {
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
  }, [preview])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Collect Schools</h1>
        <p className="mt-1 text-slate-600">Discover and collect school intelligence from authoritative sources.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <div
            key={label}
            className={`rounded-full px-3 py-1 text-sm ${
              index === step ? 'bg-primary-600 text-white' : index < step ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {index + 1}. {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">CBSE SARAS</h2>
          <p className="mt-2 text-sm text-slate-600">
            CBSE affiliated school directory and affiliation information.
          </p>
          <div className="mt-4 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
            ENABLED
          </div>
          <div className="mt-6 rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
            UDISE+/KYS discovery source — Coming Soon
          </div>
          <button
            onClick={() => setStep(1)}
            className="mt-6 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Continue
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {(statesQuery.isLoading || districtsQuery.isLoading) && (
            <p className="mb-4 text-sm text-slate-500">Loading geography from CBSE SARAS...</p>
          )}
          {statesQuery.isError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Could not load states from SARAS. Ensure the SCHOL API is running on port 8001, then retry.
              <button
                type="button"
                onClick={() => statesQuery.refetch()}
                className="ml-2 font-medium underline"
              >
                Retry
              </button>
            </div>
          )}
          {stateId && districtsQuery.isError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Could not load districts for the selected state.
              <button
                type="button"
                onClick={() => districtsQuery.refetch()}
                className="ml-2 font-medium underline"
              >
                Retry
              </button>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700">State</label>
              <select
                value={stateId}
                disabled={statesQuery.isLoading || statesQuery.isError}
                onChange={(e) => {
                  setStateId(e.target.value)
                  setDistrictId('')
                }}
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
                value={districtId}
                disabled={!stateId || districtsQuery.isLoading || districtsQuery.isError}
                onChange={(e) => setDistrictId(e.target.value)}
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
            disabled={!stateId || !districtId || previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
            className="mt-6 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {previewMutation.isPending ? 'Previewing schools...' : 'Preview Schools'}
          </button>
        </div>
      )}

      {step >= 2 && preview && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm text-slate-500">CBSE SARAS</div>
                <div className="text-lg font-semibold">{preview.state} → {preview.district}</div>
              </div>
              <button onClick={() => setStep(1)} className="text-sm text-primary-700 hover:underline">
                Change geography
              </button>
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
                    <th className="px-4 py-3">CBSE Affiliation</th>
                    <th className="px-4 py-3">School Code</th>
                    <th className="px-4 py-3">District</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">SCHOL Identity</th>
                    <th className="px-4 py-3">Collection State</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.schools.map((school) => (
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
          </div>

          {step === 2 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-slate-900">Collection options</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm text-slate-600">From</label>
                  <select value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                    {ACADEMIC_YEARS.map((year) => <option key={year}>{year}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-slate-600">To</label>
                  <select value={yearTo} onChange={(e) => setYearTo(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm">
                    {ACADEMIC_YEARS.map((year) => <option key={year}>{year}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {DATA_GROUP_OPTIONS.map((group) => (
                  <label key={group.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={dataGroups.includes(group.id)}
                      onChange={(e) => {
                        setDataGroups((prev) =>
                          e.target.checked ? [...prev, group.id] : prev.filter((id) => id !== group.id),
                        )
                      }}
                    />
                    {group.label}
                  </label>
                ))}
              </div>
              <div className="mt-4">
                <label className="text-sm text-slate-600">School limit</label>
                <select value={schoolLimit} onChange={(e) => setSchoolLimit(e.target.value)} className="mt-1 rounded-lg border px-3 py-2 text-sm">
                  {['5', '25', '50', '100', 'all'].map((value) => <option key={value} value={value}>{value === 'all' ? 'All' : value}</option>)}
                </select>
              </div>
              <button
                onClick={() => setStep(3)}
                className="mt-6 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                Continue to collection
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
              <h3 className="font-semibold text-amber-950">Ready to collect</h3>
              <p className="mt-2 text-sm text-amber-900">
                This will create a collection run for {schoolLimit === 'all' ? preview.unique_schools : schoolLimit} schools
                in {preview.district}. Complete schools will be skipped by default.
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
    </div>
  )
}
