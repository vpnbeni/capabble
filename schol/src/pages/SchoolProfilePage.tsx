import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { fetchRawSources, fetchSchoolProfile } from '@/services/api'
import { KysMappingPanel } from '@/components/profile/KysMappingPanel'
import { ProfileHeaderCard } from '@/components/profile/ProfileHeaderCard'
import { ProfileNav } from '@/components/profile/ProfileNav'
import { ExpandableSection } from '@/components/profile/ExpandableSection'
import { DataQualityPanel } from '@/components/profile/DataQualityPanel'
import { ContactSidebar } from '@/components/profile/ContactSidebar'
import { EnrollmentSection } from '@/components/profile/EnrollmentSection'
import { StaffSection } from '@/components/profile/StaffSection'
import { FacilitiesSection } from '@/components/profile/FacilitiesSection'
import {
  HistorySection,
  IntelligenceSection,
  OverviewSection,
  SourcesSection,
  StudentsSection,
} from '@/components/profile/ProfileSections'
import { useAuth } from '@/context/AuthContext'

const YEARS = ['2025-26', '2024-25', '2023-24', '2022-23', '2021-22', '2020-21', '2019-20', '2018-19']

const DEFAULT_EXPANDED = new Set(['overview', 'enrollment'])

export function SchoolProfilePage() {
  const { schoolId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedYear = searchParams.get('year') || '2025-26'
  const [expanded, setExpanded] = useState<Set<string>>(new Set(DEFAULT_EXPANDED))
  const [showRaw, setShowRaw] = useState(false)
  const [rawPayload, setRawPayload] = useState<unknown>(null)
  const { canViewRaw } = useAuth()

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['school-profile', schoolId, selectedYear],
    queryFn: () => fetchSchoolProfile(schoolId, selectedYear),
    enabled: Boolean(schoolId),
  })

  const enrollmentRow = useMemo(
    () => data?.enrollment.series.find((row) => row.year === selectedYear),
    [data, selectedYear],
  )

  function toggleSection(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAll() {
    setExpanded(new Set(['overview', 'enrollment', 'students', 'staff', 'facilities', 'history', 'intelligence', 'sources']))
  }

  function collapseAll() {
    setExpanded(new Set(['overview']))
  }

  async function handleViewRaw() {
    if (!canViewRaw || !schoolId) return
    try {
      const payload = await fetchRawSources(schoolId)
      setRawPayload(payload)
      setShowRaw(true)
    } catch {
      toast.error('Unable to load raw source data')
    }
  }

  if (isLoading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-slate-500">Loading school intelligence profile...</div>
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-red-700">
        Unable to load school profile.
        <button className="ml-3 underline" onClick={() => refetch()}>Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">
          School Intelligence / School Profile
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Academic year</label>
          <select
            value={selectedYear}
            onChange={(e) => setSearchParams({ year: e.target.value })}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {YEARS.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <button onClick={expandAll} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Expand all</button>
          <button onClick={collapseAll} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">Collapse all</button>
        </div>
      </div>

      <ProfileHeaderCard
        header={data.header}
        onExport={() => toast.success('Export queued')}
        onViewRaw={handleViewRaw}
      />

      {data.kys_mapping && (
        <KysMappingPanel
          schoolId={schoolId}
          mapping={data.kys_mapping}
          onUpdated={() => refetch()}
        />
      )}

      <DataQualityPanel issues={data.data_quality} />

      {data.validation && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900">Validation status</h3>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>Collection: <span className="font-medium uppercase">{data.validation.collection_status || 'unknown'}</span></div>
            <div>Identity: <span className="font-medium uppercase">{data.validation.identity_status || 'unknown'}</span></div>
            <div>Data Quality: <span className="font-medium uppercase">{data.validation.data_quality_status || 'unknown'}</span></div>
          </div>
        </div>
      )}

      <ProfileNav active="overview" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <ExpandableSection
            id="overview"
            title="Executive Overview"
            subtitle="Who is this school and what signals matter?"
            expanded={expanded.has('overview')}
            onToggle={() => toggleSection('overview')}
          >
            <OverviewSection overview={data.overview} />
          </ExpandableSection>

          <ExpandableSection
            id="enrollment"
            title="Enrollment Intelligence"
            subtitle="Historical enrollment trend and year-level detail"
            expanded={expanded.has('enrollment')}
            onToggle={() => toggleSection('enrollment')}
          >
            <EnrollmentSection schoolId={schoolId} enrollment={data.enrollment} />
          </ExpandableSection>

          <ExpandableSection
            id="students"
            title="Student Demographics"
            expanded={expanded.has('students')}
            onToggle={() => toggleSection('students')}
          >
            {data.kys_mapping?.has_kys_collection ? (
              <StudentsSection selectedYear={selectedYear} enrollmentRow={enrollmentRow} />
            ) : (
              <p className="text-sm text-slate-500">Student demographics appear after verified KYS collection.</p>
            )}
          </ExpandableSection>

          <ExpandableSection
            id="staff"
            title="Staff Intelligence"
            expanded={expanded.has('staff')}
            onToggle={() => toggleSection('staff')}
          >
            {data.kys_mapping?.has_kys_collection ? (
              <StaffSection staff={data.staff} />
            ) : (
              <p className="text-sm text-slate-500">Staff intelligence appears after verified KYS collection.</p>
            )}
          </ExpandableSection>

          <ExpandableSection
            id="facilities"
            title="Facilities & Infrastructure"
            expanded={expanded.has('facilities')}
            onToggle={() => toggleSection('facilities')}
          >
            <FacilitiesSection facilities={data.facilities} facilityHistory={data.facility_history} />
          </ExpandableSection>

          <ExpandableSection
            id="history"
            title="School History"
            expanded={expanded.has('history')}
            onToggle={() => toggleSection('history')}
          >
            <HistorySection enrollment={data.enrollment} staff={data.staff} />
          </ExpandableSection>

          <ExpandableSection
            id="intelligence"
            title="School Intelligence"
            expanded={expanded.has('intelligence')}
            onToggle={() => toggleSection('intelligence')}
          >
            <IntelligenceSection intelligence={data.intelligence} />
          </ExpandableSection>

          <ExpandableSection
            id="sources"
            title="Sources"
            expanded={expanded.has('sources')}
            onToggle={() => toggleSection('sources')}
          >
            <SourcesSection sources={data.sources} />
          </ExpandableSection>
        </div>

        <ContactSidebar header={data.header} contacts={data.contacts} />
      </div>

      {showRaw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="font-semibold">Raw Source Data</h3>
              <button onClick={() => setShowRaw(false)} className="text-sm text-slate-600">Close</button>
            </div>
            <pre className="max-h-[calc(80vh-56px)] overflow-auto p-4 text-xs">{JSON.stringify(rawPayload, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
