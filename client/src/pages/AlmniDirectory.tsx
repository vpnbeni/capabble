import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarRange, GraduationCap, Layers, Search, SearchX, Users } from 'lucide-react'
import { sectionLabel } from '@/components/students/studentFormat'
import almniService, { type AlumniProfile } from '@/services/almniService'
import {
  Avatar,
  Badge,
  Button,
  Card,
  DataTable,
  DetailList,
  EmptyState,
  FilterBar,
  Page,
  Select,
  Sheet,
  StatCard,
  formatDate,
  orDash,
  type DataTableColumn,
} from '@/components/ui'
import '@/components/students/alumni.css'

const formatBatch = (session: string) => {
  const [start, end] = String(session || '').split('-')
  if (!start || !end) return session || 'Batch'
  return `${start.slice(-2)}–${end.slice(-2)}`
}

const formatSession = (session: string) => {
  const [start, end] = String(session || '').split('-')
  return start && end ? `${start}–${end.slice(-2)}` : session
}

const sectionText = (section?: string) => (section ? sectionLabel(section) : '')

const AlmniDirectory: React.FC = () => {
  const [records, setRecords] = useState<AlumniProfile[]>([])
  const [batches, setBatches] = useState<string[]>([])
  const [sections, setSections] = useState<string[]>([])
  const [total, setTotal] = useState(0)
  const [currentSession, setCurrentSession] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBatch, setSelectedBatch] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [loading, setLoading] = useState(false)
  const [viewing, setViewing] = useState<AlumniProfile | null>(null)

  const loadAlumni = async (filters?: { search?: string; batchSession?: string; section?: string }) => {
    setLoading(true)
    try {
      const payload = await almniService.getAlumni(filters)
      setRecords(payload.records || [])
      setBatches(payload.batches || [])
      setSections(payload.sections || [])
      setTotal(payload.total || 0)
      setCurrentSession(payload.currentSession || '')
      if (payload.sync?.added) {
        toast.success(
          `${payload.sync.added} ${payload.sync.added === 1 ? 'student' : 'students'} from Class 12 added to alumni.`
        )
      }
    } catch (error: any) {
      toast.error(
        String(error?.response?.data?.message || error?.message || 'Alumni didn’t load. Check your connection and try again.')
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAlumni({
      search: searchQuery.trim() || undefined,
      batchSession: selectedBatch || undefined,
      section: selectedSection || undefined,
    })
  }, [selectedBatch, selectedSection])

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    void loadAlumni({
      search: searchQuery.trim() || undefined,
      batchSession: selectedBatch || undefined,
      section: selectedSection || undefined,
    })
  }

  const hasFilters = Boolean(searchQuery.trim() || selectedBatch || selectedSection)

  const clearFilters = () => {
    setSearchQuery('')
    if (selectedBatch || selectedSection) {
      // Changing the batch or section reloads through the effect above.
      setSelectedBatch('')
      setSelectedSection('')
    } else {
      void loadAlumni({})
    }
  }

  const latestBatch = batches[0] || ''
  const latestCount = useMemo(
    () => records.filter((item) => item.batchSession === latestBatch).length,
    [records, latestBatch]
  )

  const columns: DataTableColumn<AlumniProfile>[] = [
    {
      key: 'name',
      header: 'Name',
      mobile: 'title',
      render: (alumni) => (
        <span className="almni-name">
          <Avatar name={alumni.name} src={alumni.profileImage} size="sm" />
          <span className="almni-name__text">
            <span className="almni-name__primary">{alumni.name}</span>
            <span className="almni-name__secondary">
              {[`Batch ${formatBatch(alumni.batchSession)}`, sectionText(alumni.section)].filter(Boolean).join(' · ')}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'rollNumber',
      header: 'Roll no.',
      width: 96,
      mobile: 'aside',
      render: (alumni) => <span className="is-num">{orDash(alumni.rollNumber || alumni.classRollNo)}</span>,
    },
    {
      key: 'fatherName',
      header: 'Father’s name',
      render: (alumni) => orDash(alumni.fatherName),
    },
    {
      key: 'now',
      header: 'Now',
      headerLabel: 'Studying or working',
      render: (alumni) => <span className="almni-clip">{orDash(alumni.occupation || alumni.higherEducation)}</span>,
    },
    {
      key: 'currentCity',
      header: 'City',
      render: (alumni) => orDash(alumni.currentCity),
    },
    {
      key: 'contact',
      header: 'Contact',
      mobile: 'subtitle',
      render: (alumni) =>
        alumni.phone || alumni.email ? (
          <span className="almni-contact">
            {alumni.phone ? <span className="is-num">{alumni.phone}</span> : null}
            {alumni.email ? <span className="almni-contact__email">{alumni.email}</span> : null}
          </span>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <Page width="full">
      <section className="cb-stats" aria-label="Alumni totals">
        <StatCard label="Alumni" value={total} icon={GraduationCap} hint="Across all batches" />
        <StatCard label="Batches" value={batches.length} icon={CalendarRange} hint="One per session" />
        <StatCard
          label={latestBatch ? `Batch ${formatBatch(latestBatch)}` : 'Latest batch'}
          value={latestCount}
          icon={Users}
          hint="Most recent to pass out"
        />
        <StatCard label="Sections" value={sections.length} icon={Layers} hint="Of Class 12" />
      </section>

      <Card
        flush
        className="almni-card"
        title="Alumni"
        subtitle={
          currentSession
            ? `Class 12 students from sessions before ${formatSession(currentSession)} are added here automatically.`
            : 'Class 12 students are added here automatically when the school moves to the next session.'
        }
      >
        <form className="almni-toolbar" onSubmit={handleSearch} role="search">
          <FilterBar
            search={{
              placeholder: 'Search name, roll no. or parent',
              value: searchQuery,
              onChange: setSearchQuery,
              label: 'Search alumni',
            }}
            filters={
              <>
                <Select
                  aria-label="Batch"
                  size="sm"
                  value={selectedBatch}
                  onChange={(event) => setSelectedBatch(event.target.value)}
                  placeholder="All batches"
                  options={batches.map((batch) => ({ value: batch, label: `Batch ${formatBatch(batch)}` }))}
                />
                <Select
                  aria-label="Section"
                  size="sm"
                  value={selectedSection}
                  onChange={(event) => setSelectedSection(event.target.value)}
                  placeholder="All sections"
                  options={sections.map((section) => ({ value: section, label: sectionLabel(section) }))}
                />
                {hasFilters ? (
                  <Button variant="tertiary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null}
              </>
            }
            actions={
              <Button type="submit" variant="primary" size="sm" icon={Search} loading={loading}>
                Search alumni
              </Button>
            }
          />
        </form>

        <DataTable
          caption="Alumni"
          columns={columns}
          rows={records}
          getRowKey={(alumni) => alumni._id}
          onRowClick={setViewing}
          loading={loading}
          loadingLabel="Loading alumni"
          maxHeight="min(720px, calc(100vh - 300px))"
          empty={
            hasFilters ? (
              <EmptyState
                compact
                icon={SearchX}
                title="No alumni match these filters"
                body="Try another name or roll number, or clear the filters."
                action={
                  <Button size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={GraduationCap}
                title="No alumni yet"
                body="When the school opens the next session, Class 12 students from the session before are added here automatically. They stay here in every session after that."
              />
            )
          }
        />
      </Card>

      <Sheet
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        icon={GraduationCap}
        title={viewing?.name || 'Alumni profile'}
        description={
          viewing
            ? [`Batch ${formatBatch(viewing.batchSession)}`, `Class ${viewing.passedOutClass || '12'}`, sectionText(viewing.section)]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
        footer={<Button onClick={() => setViewing(null)}>Close profile</Button>}
      >
        {viewing ? (
          <div className="almni-profile">
            <div className="almni-profile__head">
              <Avatar name={viewing.name} src={viewing.profileImage} size="xl" />
              <div className="almni-profile__titles">
                <p className="almni-profile__name">{viewing.name}</p>
                <Badge tone="neutral" dot={false}>
                  Passed out {formatSession(viewing.batchSession)}
                </Badge>
              </div>
            </div>

            <div className="almni-profile__group">
              <h3 className="cb-section-title almni-profile__title">School record</h3>
              <DetailList
                items={[
                  { label: 'Batch', value: formatSession(viewing.batchSession) },
                  { label: 'Class', value: viewing.passedOutClass || '12' },
                  { label: 'Section', value: viewing.section },
                  { label: 'Roll no.', value: viewing.rollNumber || (viewing.classRollNo ?? '') },
                  { label: 'Gender', value: viewing.gender },
                  { label: 'Date of birth', value: viewing.dateOfBirth ? formatDate(viewing.dateOfBirth) : '' },
                ]}
              />
            </div>

            <div className="almni-profile__group">
              <h3 className="cb-section-title almni-profile__title">Family</h3>
              <DetailList
                items={[
                  { label: 'Father’s name', value: viewing.fatherName },
                  { label: 'Mother’s name', value: viewing.motherName },
                ]}
              />
            </div>

            <div className="almni-profile__group">
              <h3 className="cb-section-title almni-profile__title">Now</h3>
              <DetailList
                items={[
                  { label: 'Higher education', value: viewing.higherEducation },
                  { label: 'Occupation', value: viewing.occupation },
                  { label: 'City', value: viewing.currentCity },
                  { label: 'Phone', value: viewing.phone },
                  { label: 'Email', value: viewing.email, wide: true },
                ]}
              />
            </div>
          </div>
        ) : null}
      </Sheet>
    </Page>
  )
}

export default AlmniDirectory
