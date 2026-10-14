import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, CalendarDays, ImagePlus, Pencil, SearchX, Shapes, Trash2, UserRound, Users } from 'lucide-react'
import api from '@/services/api'
import {
  ClubEditModal,
  ClubLogoCropper,
  ClubLogoTile,
} from '@/components/actvt/ClubEditModal'
import {
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Icon,
  Page,
  Select,
  StatCard,
  TextArea,
  TextField,
  type DataTableColumn,
} from '@/components/ui'
import { toneStyle } from '@/components/actvt/entityTone'
import '@/components/actvt/actvt.css'
import '@/components/actvt/clubs.css'

type ClubRecord = {
  _id?: string
  name?: string
  logo?: string
  tagline?: string
  motto?: string
  color?: string
  incharge?: string
  meetingDay?: string
  description?: string
  members?: string
  activities?: string
}

type ClubDetails = {
  club: ClubRecord
  memberLines: string[]
  students: ClubStudent[]
  stats: {
    membersCount: number
    hasIncharge: boolean
    hasMeetingDay: boolean
  }
}

type ClubStudent = {
  _id: string
  rollNumber?: string
  classRollNo?: number | null
  name: string
  class?: string
  section?: string
  gender?: string
  phone?: string
  fatherName?: string
  motherName?: string
  participationCount?: number
}

type StudentSortKey =
  | 'rollNumber'
  | 'classRollNo'
  | 'name'
  | 'fatherName'
  | 'motherName'
  | 'class'
  | 'section'
  | 'gender'
  | 'participationCount'
  | 'classSectionName'

const dash = (value?: string | number | null) => (value == null || value === '' ? '—' : value)

const STUDENT_COLUMNS: DataTableColumn<ClubStudent>[] = [
  { key: 'rollNumber', header: 'Adm no', sortable: true, mobile: 'aside', render: (s) => dash(s.rollNumber) },
  { key: 'classRollNo', header: 'Roll no', sortable: true, numeric: true, render: (s) => dash(s.classRollNo) },
  {
    key: 'name',
    header: 'Student name',
    sortable: true,
    mobile: 'title',
    render: (s) => <span className="ac-student-name">{s.name}</span>,
  },
  { key: 'fatherName', header: 'Father name', sortable: true, render: (s) => dash(s.fatherName) },
  { key: 'motherName', header: 'Mother name', sortable: true, render: (s) => dash(s.motherName) },
  { key: 'class', header: 'Class', sortable: true, render: (s) => dash(s.class) },
  { key: 'section', header: 'Section', sortable: true, render: (s) => dash(s.section) },
  { key: 'gender', header: 'Gender', sortable: true, render: (s) => dash(s.gender) },
  {
    key: 'participationCount',
    header: 'Participation',
    sortable: true,
    numeric: true,
    align: 'right',
    render: (s) => s.participationCount || 0,
  },
]

const ActvtClubDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<ClubDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoViewerOpen, setLogoViewerOpen] = useState(false)
  const [confirmRemoveLogo, setConfirmRemoveLogo] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [cropSource, setCropSource] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [studentSort, setStudentSort] = useState<{ key: StudentSortKey; direction: 'asc' | 'desc' }>({
    key: 'classSectionName',
    direction: 'asc',
  })
  const [profileForm, setProfileForm] = useState({
    incharge: '',
    meetingDay: '',
    description: '',
    members: '',
    activities: '',
  })
  const membersRef = useRef<HTMLTextAreaElement | null>(null)
  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const cropSourceRef = useRef('')

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      const response = await api.get(`/actvt/clubs/${id}/details`)
      const payload = (response.data?.data || null) as ClubDetails | null
      setData(payload)
      if (payload?.club) {
        setProfileForm({
          incharge: String(payload.club.incharge || ''),
          meetingDay: String(payload.club.meetingDay || ''),
          description: String(payload.club.description || ''),
          members: String(payload.club.members || ''),
          activities: String(payload.club.activities || ''),
        })
      }
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load club details.'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  useEffect(() => {
    cropSourceRef.current = cropSource
  }, [cropSource])

  useEffect(
    () => () => {
      if (cropSourceRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(cropSourceRef.current)
      }
    },
    []
  )

  const club = data?.club

  const classOptions = useMemo(() => {
    const values = new Set<string>()
    ;(data?.students || []).forEach((student) => {
      const value = String(student.class || '').trim()
      if (value) values.add(value)
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }, [data?.students])

  const sectionOptions = useMemo(() => {
    const values = new Set<string>()
    ;(data?.students || []).forEach((student) => {
      if (classFilter && String(student.class || '').trim() !== classFilter) return
      const value = String(student.section || '').trim()
      if (value) values.add(value)
    })
    return Array.from(values).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  }, [data?.students, classFilter])

  useEffect(() => {
    if (sectionFilter && !sectionOptions.includes(sectionFilter)) {
      setSectionFilter('')
    }
  }, [sectionFilter, sectionOptions])

  const filteredStudents = useMemo(() => {
    const students = data?.students || []
    const needle = studentQuery.trim().toLowerCase()
    const filtered = students.filter((student) => {
      if (classFilter && String(student.class || '').trim() !== classFilter) return false
      if (sectionFilter && String(student.section || '').trim() !== sectionFilter) return false
      if (!needle) return true
      return `${student.name} ${student.rollNumber || ''} ${student.class || ''} ${student.section || ''} ${student.fatherName || ''} ${student.motherName || ''}`
        .toLowerCase()
        .includes(needle)
    })

    const direction = studentSort.direction === 'asc' ? 1 : -1
    const compareText = (left?: string | number | null, right?: string | number | null) =>
      String(left ?? '').localeCompare(String(right ?? ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      })

    return [...filtered].sort((a, b) => {
      if (studentSort.key === 'classSectionName') {
        const classCompare = compareText(a.class, b.class)
        if (classCompare !== 0) return classCompare * direction
        const sectionCompare = compareText(a.section, b.section)
        if (sectionCompare !== 0) return sectionCompare * direction
        return compareText(a.name, b.name) * direction
      }

      if (studentSort.key === 'classRollNo' || studentSort.key === 'participationCount') {
        const left = Number(a[studentSort.key] ?? -1)
        const right = Number(b[studentSort.key] ?? -1)
        if (left !== right) return (left - right) * direction
        return compareText(a.name, b.name)
      }

      const left = a[studentSort.key]
      const right = b[studentSort.key]
      const primary = compareText(left as string | number | null | undefined, right as string | number | null | undefined)
      if (primary !== 0) return primary * direction
      return compareText(a.name, b.name)
    })
  }, [classFilter, data?.students, sectionFilter, studentQuery, studentSort])

  const toggleStudentSort = (key: StudentSortKey) => {
    setStudentSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: 'asc' }
    })
  }

  const clearCropSource = () => {
    if (cropSource.startsWith('blob:')) URL.revokeObjectURL(cropSource)
    setCropSource('')
  }

  const buildClubFormData = (extra?: (body: FormData) => void) => {
    const body = new FormData()
    body.append('name', String(club?.name || ''))
    body.append('color', String(club?.color || ''))
    body.append('tagline', String(club?.tagline || ''))
    body.append('motto', String(club?.motto || ''))
    body.append('incharge', profileForm.incharge.trim())
    body.append('meetingDay', profileForm.meetingDay.trim())
    body.append('description', profileForm.description.trim())
    body.append('members', profileForm.members.trim())
    body.append('activities', profileForm.activities.trim())
    extra?.(body)
    return body
  }

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!id || !club) return
    setSaving(true)
    try {
      await api.put(`/actvt/clubs/${id}`, buildClubFormData(), {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('Club profile updated.')
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to update club profile.'))
    } finally {
      setSaving(false)
    }
  }

  const handleLogoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file for the club logo.')
      event.target.value = ''
      return
    }
    clearCropSource()
    setCropSource(URL.createObjectURL(file))
  }

  const handleCropCancel = () => {
    clearCropSource()
    if (logoInputRef.current) logoInputRef.current.value = ''
  }

  const handleCropped = async (file: File) => {
    if (!id || !club) return
    clearCropSource()
    if (logoInputRef.current) logoInputRef.current.value = ''
    setLogoBusy(true)
    try {
      await api.put(
        `/actvt/clubs/${id}`,
        buildClubFormData((body) => {
          body.append('logo', file)
        }),
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      toast.success(club.logo ? 'Logo replaced.' : 'Logo uploaded.')
      setLogoViewerOpen(false)
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to update logo.'))
    } finally {
      setLogoBusy(false)
    }
  }

  const handleRemoveLogo = async () => {
    if (!id || !club?.logo) return
    setLogoBusy(true)
    try {
      await api.put(
        `/actvt/clubs/${id}`,
        buildClubFormData((body) => {
          body.append('clearLogo', 'true')
        }),
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
      toast.success('Logo removed.')
      setConfirmRemoveLogo(false)
      setLogoViewerOpen(false)
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to remove logo.'))
    } finally {
      setLogoBusy(false)
    }
  }

  const openLogoViewer = () => {
    setConfirmRemoveLogo(false)
    setLogoViewerOpen(true)
  }

  const closeLogoViewer = () => {
    if (logoBusy || cropSource) return
    setConfirmRemoveLogo(false)
    setLogoViewerOpen(false)
  }

  const backToClubs = () => navigate('/actvt/clubs')

  if (loading && !data) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading club details
        </div>
      </Page>
    )
  }

  if (!club) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={Shapes}
            title="This club could not be found"
            body="It may have been removed. Go back to the clubs list to pick another one."
            action={
              <Button variant="primary" icon={ArrowLeft} onClick={backToClubs}>
                Back to clubs
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  const memberLines = data?.memberLines || []
  const totalStudents = data?.students?.length || 0
  const totalParticipation = (data?.students || []).reduce((sum, student) => sum + (Number(student.participationCount) || 0), 0)
  const filtersActive = Boolean(classFilter || sectionFilter || studentQuery)

  const studentsEmpty =
    memberLines.length === 0 ? (
      <EmptyState
        icon={Users}
        title="No members added yet"
        body="Add member names in the roster above, one per line, then save the club profile to list them here."
        compact
      />
    ) : totalStudents > 0 && filtersActive ? (
      <EmptyState
        icon={SearchX}
        title="No students match these filters"
        body="Try another class, section or search term."
        action={
          <Button
            onClick={() => {
              setClassFilter('')
              setSectionFilter('')
              setStudentQuery('')
            }}
          >
            Clear filters
          </Button>
        }
        compact
      />
    ) : (
      <EmptyState
        icon={SearchX}
        title="No matching student records"
        body="None of the roster names match a student in the selected academic session. Check the spelling in the roster."
        compact
      />
    )

  return (
    <Page>
      <div className="cb-stack" style={toneStyle(club.color)}>
        <section className="actvt-hero ac-hero" aria-label={club.name}>
          <button
            type="button"
            className="actvt-hero__logo ac-hero-logo"
            onClick={openLogoViewer}
            title={club.logo ? 'View or change logo' : 'Add logo'}
          >
            <ClubLogoTile logo={club.logo} name={club.name} />
            <span className="ac-hero-logo__hint">{club.logo ? 'Change' : 'Add logo'}</span>
          </button>
          <div className="actvt-hero__main">
            <h2 className="actvt-hero__name">{club.name}</h2>
            {club.tagline ? <p className="actvt-hero__tagline">{club.tagline}</p> : null}
            {club.motto ? <p className="ac-hero-motto">“{club.motto}”</p> : null}
            <div className="ac-hero-facts">
              <span className="ac-hero-fact">
                <Icon icon={UserRound} size={16} />
                {club.incharge ? club.incharge : <span className="cb-subtle">No teacher incharge</span>}
              </span>
              <span className="ac-hero-fact">
                <Icon icon={CalendarDays} size={16} />
                {club.meetingDay ? `Meets ${club.meetingDay}` : <span className="cb-subtle">No meeting day</span>}
              </span>
            </div>
          </div>
          <div className="actvt-hero__actions">
            <Button icon={Pencil} onClick={() => setEditOpen(true)}>
              Edit club
            </Button>
          </div>
        </section>

        <section className="ac-stats" aria-label="Club totals">
          <StatCard label="Members on roster" value={data?.stats.membersCount || 0} icon={Users} />
          <StatCard
            label="Students matched"
            value={totalStudents}
            hint="In the selected academic session"
          />
          <StatCard
            label="Total participation"
            value={totalParticipation}
            hint="Across matched students"
          />
        </section>

        <form onSubmit={handleSaveProfile} className="cb-stack">
          <div className="cb-grid-6-6">
            <Card title="Club details" subtitle="Who runs the club and what it does">
              <div className="cb-form-section">
                <div className="cb-form-grid">
                  <TextField
                    label="Teacher incharge"
                    icon={UserRound}
                    value={profileForm.incharge}
                    onChange={(event) => setProfileForm({ ...profileForm, incharge: event.target.value })}
                    placeholder="Teacher name"
                  />
                  <TextField
                    label="Meeting day"
                    icon={CalendarDays}
                    value={profileForm.meetingDay}
                    onChange={(event) => setProfileForm({ ...profileForm, meetingDay: event.target.value })}
                    placeholder="e.g. Friday"
                  />
                </div>
                <TextArea
                  label="Description"
                  rows={5}
                  value={profileForm.description}
                  onChange={(event) => setProfileForm({ ...profileForm, description: event.target.value })}
                  placeholder="What this club is about"
                />
                <TextArea
                  label="Activities and notes"
                  rows={5}
                  value={profileForm.activities}
                  onChange={(event) => setProfileForm({ ...profileForm, activities: event.target.value })}
                  placeholder="Upcoming activities, notes…"
                />
              </div>
            </Card>

            <Card title="Members" subtitle="Student names, matched against this session's records">
              <div className="cb-form-section">
                <TextArea
                  ref={membersRef}
                  label="Roster"
                  hint="One name per line."
                  rows={14}
                  value={profileForm.members}
                  onChange={(event) => setProfileForm({ ...profileForm, members: event.target.value })}
                  placeholder={'Student A\nStudent B\nStudent C'}
                />
                {memberLines.length > 0 ? (
                  <div className="ac-roster">
                    <p className="ac-roster__title">Saved roster · {memberLines.length}</p>
                    <ul className="ac-roster__list">
                      {memberLines.map((line, index) => (
                        <li key={`${line}-${index}`} className="ac-roster__item">
                          <span className="actvt-tone-dot" aria-hidden="true" />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </Card>
          </div>

          <div className="ac-savebar">
            <Button variant="primary" type="submit" loading={saving}>
              Save club profile
            </Button>
          </div>
        </form>

        <Card
          flush
          title="Students"
          subtitle={
            filtersActive ? `${filteredStudents.length} of ${totalStudents} shown` : `${totalStudents} matched from the roster`
          }
        >
          <div className="ac-toolbar">
            <FilterBar
              search={{ placeholder: 'Search students', value: studentQuery, onChange: setStudentQuery }}
              filters={
                <>
                  <Select
                    size="sm"
                    aria-label="Class"
                    value={classFilter}
                    onChange={(event) => {
                      setClassFilter(event.target.value)
                      setSectionFilter('')
                    }}
                    placeholder="All classes"
                    options={classOptions}
                  />
                  <Select
                    size="sm"
                    aria-label="Section"
                    value={sectionFilter}
                    onChange={(event) => setSectionFilter(event.target.value)}
                    placeholder="All sections"
                    options={sectionOptions}
                  />
                </>
              }
              actions={
                filtersActive ? (
                  <Button
                    variant="tertiary"
                    size="sm"
                    onClick={() => {
                      setClassFilter('')
                      setSectionFilter('')
                      setStudentQuery('')
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null
              }
            />
          </div>
          <DataTable
            columns={STUDENT_COLUMNS}
            rows={filteredStudents}
            getRowKey={(student) => student._id}
            sort={studentSort}
            onSort={(key) => toggleStudentSort(key as StudentSortKey)}
            caption={`Students in ${club.name}`}
            maxHeight="calc(2.5rem + 20 * var(--row-compact))"
            empty={studentsEmpty}
            className="ac-table"
          />
        </Card>
      </div>

      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="ac-file-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleLogoSelected}
      />

      <Dialog
        open={logoViewerOpen}
        onClose={closeLogoViewer}
        tone={confirmRemoveLogo ? 'danger' : 'default'}
        size="sm"
        title={confirmRemoveLogo ? 'Remove this club logo?' : 'Club logo'}
        description={
          confirmRemoveLogo
            ? 'The card and profile will show the club initials on its colour instead.'
            : club.logo
              ? 'Replace or remove the logo shown on the card and profile.'
              : 'No logo yet. Upload one to brand this club.'
        }
        footer={
          confirmRemoveLogo ? (
            <>
              <Button variant="secondary" onClick={() => setConfirmRemoveLogo(false)} disabled={logoBusy}>
                Keep logo
              </Button>
              <Button variant="danger" icon={Trash2} loading={logoBusy} onClick={() => void handleRemoveLogo()}>
                Remove logo
              </Button>
            </>
          ) : (
            <>
              {club.logo ? (
                <Button variant="tertiary" icon={Trash2} disabled={logoBusy} onClick={() => setConfirmRemoveLogo(true)}>
                  Remove
                </Button>
              ) : null}
              <Button
                variant="primary"
                icon={ImagePlus}
                loading={logoBusy}
                onClick={() => logoInputRef.current?.click()}
              >
                {club.logo ? 'Replace logo' : 'Upload logo'}
              </Button>
            </>
          )
        }
      >
        <div className="ac-logo-preview" style={toneStyle(club.color)}>
          <ClubLogoTile logo={club.logo} name={club.name} />
        </div>
      </Dialog>

      <ClubEditModal
        open={editOpen}
        club={club}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          void load()
        }}
      />

      <ClubLogoCropper
        imageSrc={cropSource}
        onCancel={handleCropCancel}
        onCropped={(file) => {
          void handleCropped(file)
        }}
      />
    </Page>
  )
}

export default ActvtClubDetail
