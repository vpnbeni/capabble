import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ChevronLeft,
  Crown,
  Flag,
  GraduationCap,
  Pencil,
  Plus,
  Shield,
  Trash2,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react'
import api from '@/services/api'
import { ImageCropModal } from '@/components/common/ImageCropModal'
import {
  Avatar,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  FilterBar,
  Icon,
  Page,
  Select,
  StatCard,
  TextField,
  orDash,
  type DataTableColumn,
} from '@/components/ui'
import { HouseEditModal, houseInitials } from '@/components/actvt/HouseEditModal'
import { HouseFlagFly } from '@/components/actvt/HouseFlagFly'
import { toneStyle } from '@/components/actvt/entityTone'
import { HOUSE_COUNCIL_MEMBER_ROLES } from '@/constants/councilMetadata'
import '@/components/actvt/actvt.css'
import '@/components/actvt/houses.css'

type HouseTeacher = {
  _id?: string
  name: string
  role?: string
  phone?: string
  email?: string
}

type HouseCouncilMember = {
  _id?: string
  name: string
  role?: string
  className?: string
  section?: string
  phone?: string
}

type HouseStudent = {
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

type HouseWallOfFameEntry = {
  _id: string
  name?: string
  class?: string
  section?: string
  participationCount?: number
  medalCount?: number
  highlight?: {
    role?: string
    title?: string
    eventTitle?: string
    issuedOn?: string
  } | null
}

type HouseDetailsPayload = {
  house: {
    _id: string
    name?: string
    logo?: string
    flag?: string
    tagline?: string
    motto?: string
    color?: string
    teachers?: HouseTeacher[]
    councilMembers?: HouseCouncilMember[]
  }
  students: HouseStudent[]
  wallOfFame?: HouseWallOfFameEntry[]
  stats: {
    totalStudents: number
    teachersCount: number
    councilCount: number
    genderCounts: Record<string, number>
    byClassSection: Array<{ className: string; section: string; count: number }>
  }
}

const COUNCIL_ROLES: string[] = [...HOUSE_COUNCIL_MEMBER_ROLES]
const TEACHER_ROLES = ['House Master', 'House Mistress', 'Assistant House Teacher', 'Mentor', 'House Teacher']

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

const STUDENT_COLUMNS: DataTableColumn<HouseStudent>[] = [
  { key: 'rollNumber', header: 'Adm no', sortable: true, mobile: 'aside', render: (row) => orDash(row.rollNumber) },
  { key: 'classRollNo', header: 'Roll no', sortable: true, numeric: true, render: (row) => orDash(row.classRollNo) },
  {
    key: 'name',
    header: 'Student',
    sortable: true,
    mobile: 'title',
    render: (row) => <span className="cb-strong">{row.name}</span>,
  },
  { key: 'fatherName', header: 'Father', sortable: true, render: (row) => orDash(row.fatherName) },
  { key: 'motherName', header: 'Mother', sortable: true, render: (row) => orDash(row.motherName) },
  { key: 'class', header: 'Class', sortable: true, mobile: 'subtitle', render: (row) => orDash(row.class) },
  { key: 'section', header: 'Section', sortable: true, render: (row) => orDash(row.section) },
  { key: 'gender', header: 'Gender', sortable: true, render: (row) => orDash(row.gender) },
  {
    key: 'participationCount',
    header: 'Participation',
    sortable: true,
    numeric: true,
    align: 'right',
    render: (row) => row.participationCount ?? 0,
  },
]

const ActvtHouseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<HouseDetailsPayload | null>(null)
  const [studentQuery, setStudentQuery] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [sectionFilter, setSectionFilter] = useState('')
  const [studentSort, setStudentSort] = useState<{ key: StudentSortKey; direction: 'asc' | 'desc' }>({
    key: 'classSectionName',
    direction: 'asc',
  })

  const [teacherForm, setTeacherForm] = useState({ name: '', role: 'House Teacher', phone: '', email: '' })
  const [councilForm, setCouncilForm] = useState<{
    name: string
    role: string
    className: string
    section: string
    phone: string
  }>({
    name: '',
    role: COUNCIL_ROLES[0],
    className: '',
    section: '',
    phone: '',
  })
  const [uploadingFlag, setUploadingFlag] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [flagCropSource, setFlagCropSource] = useState('')
  const flagInputRef = useRef<HTMLInputElement | null>(null)
  const flagCropSourceRef = useRef('')

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      const response = await api.get(`/actvt/houses/${id}/details`)
      setData(response.data?.data || null)
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load house details.'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  useEffect(() => {
    flagCropSourceRef.current = flagCropSource
  }, [flagCropSource])

  useEffect(() => () => {
    if (flagCropSourceRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(flagCropSourceRef.current)
    }
  }, [])

  const house = data?.house

  const classOptions = useMemo(() => {
    const values = new Set<string>()
    ;(data?.students || []).forEach((student) => {
      const value = String(student.class || '').trim()
      if (value) values.add(value)
    })
    return Array.from(values).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    )
  }, [data?.students])

  const sectionOptions = useMemo(() => {
    const values = new Set<string>()
    ;(data?.students || []).forEach((student) => {
      if (classFilter && String(student.class || '').trim() !== classFilter) return
      const value = String(student.section || '').trim()
      if (value) values.add(value)
    })
    return Array.from(values).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    )
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
  }, [data?.students, studentQuery, classFilter, sectionFilter, studentSort])

  const toggleStudentSort = (key: StudentSortKey) => {
    setStudentSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { key, direction: 'asc' }
    })
  }

  const persistMembers = async (
    nextTeachers: HouseTeacher[],
    nextCouncil: HouseCouncilMember[],
    successMessage: string
  ) => {
    if (!id || !house) return
    setSaving(true)
    try {
      const body = new FormData()
      body.append('name', String(house.name || ''))
      body.append('color', String(house.color || ''))
      body.append('tagline', String(house.tagline || ''))
      body.append('motto', String(house.motto || ''))
      body.append('teachers', JSON.stringify(nextTeachers))
      body.append('councilMembers', JSON.stringify(nextCouncil))
      await api.put(`/actvt/houses/${id}`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success(successMessage)
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to update house.'))
    } finally {
      setSaving(false)
    }
  }

  const handleAddTeacher = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!teacherForm.name.trim()) {
      toast.error('Teacher name is required.')
      return
    }
    const next = [
      ...(house?.teachers || []),
      {
        name: teacherForm.name.trim(),
        role: teacherForm.role,
        phone: teacherForm.phone.trim(),
        email: teacherForm.email.trim(),
      },
    ]
    await persistMembers(next, house?.councilMembers || [], 'Teacher added to house.')
    setTeacherForm({ name: '', role: 'House Teacher', phone: '', email: '' })
  }

  const clearFlagCropSource = () => {
    if (flagCropSource.startsWith('blob:')) URL.revokeObjectURL(flagCropSource)
    setFlagCropSource('')
  }

  const handleFlagSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file for the house flag.')
      event.target.value = ''
      return
    }
    clearFlagCropSource()
    setFlagCropSource(URL.createObjectURL(file))
    event.target.value = ''
  }

  const handleFlagCropCancel = () => {
    clearFlagCropSource()
    if (flagInputRef.current) flagInputRef.current.value = ''
  }

  const handleFlagCropped = async (file: File, previewUrl: string) => {
    if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl)
    clearFlagCropSource()
    if (!id || !house) return

    setUploadingFlag(true)
    try {
      const body = new FormData()
      body.append('name', String(house.name || ''))
      body.append('color', String(house.color || ''))
      body.append('tagline', String(house.tagline || ''))
      body.append('motto', String(house.motto || ''))
      body.append('teachers', JSON.stringify(house.teachers || []))
      body.append('councilMembers', JSON.stringify(house.councilMembers || []))
      body.append('flag', file)
      await api.put(`/actvt/houses/${id}`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('House flag updated.')
      await load()
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to upload house flag.'))
    } finally {
      setUploadingFlag(false)
      if (flagInputRef.current) flagInputRef.current.value = ''
    }
  }

  const handleRemoveTeacher = async (index: number) => {
    const next = [...(house?.teachers || [])]
    next.splice(index, 1)
    await persistMembers(next, house?.councilMembers || [], 'Teacher removed.')
  }

  const handleAddCouncil = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!councilForm.name.trim()) {
      toast.error('Council member name is required.')
      return
    }
    const next = [
      ...(house?.councilMembers || []),
      {
        name: councilForm.name.trim(),
        role: councilForm.role,
        className: councilForm.className.trim(),
        section: councilForm.section.trim(),
        phone: councilForm.phone.trim(),
      },
    ]
    await persistMembers(house?.teachers || [], next, 'Council member added.')
    setCouncilForm({ name: '', role: COUNCIL_ROLES[0], className: '', section: '', phone: '' })
  }

  const handleRemoveCouncil = async (index: number) => {
    const next = [...(house?.councilMembers || [])]
    next.splice(index, 1)
    await persistMembers(house?.teachers || [], next, 'Council member removed.')
  }

  // ---- Early returns: every hook is above this line. ----

  if (loading && !data) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading house…
        </div>
      </Page>
    )
  }

  if (!house) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={Shield}
            title="House not found"
            body="It may have been removed. Go back to the house list to pick another."
            action={
              <Button icon={ChevronLeft} onClick={() => navigate('/actvt/houses')}>
                Back to houses
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  const teachers = house.teachers || []
  const councilMembers = house.councilMembers || []
  const wallOfFame = data?.wallOfFame || []
  const totalStudents = data?.students.length || 0
  const hasStudentFilters = Boolean(classFilter || sectionFilter || studentQuery)
  const tone = toneStyle(house.color)

  return (
    <Page>
      <div className="cb-stack">
        <div className="ah-detail-head">

        <section className="actvt-hero ah-hero" style={tone} aria-label={`${house.name || 'House'} profile`}>
          <input ref={flagInputRef} type="file" accept="image/*" hidden onChange={handleFlagSelected} />

          <div className="actvt-hero__logo ah-hero__logo">
            {house.logo ? (
              <img src={house.logo} alt={`${house.name || 'House'} logo`} />
            ) : (
              <span className="ah-hero__initials actvt-tone-fill" aria-hidden="true">
                {houseInitials(house.name)}
              </span>
            )}
          </div>

          <div className="actvt-hero__main">
            <h2 className="actvt-hero__name">{house.name || 'Untitled house'}</h2>
            <p className="actvt-hero__tagline">{house.tagline || 'No tagline yet'}</p>
            <p className="ah-hero__motto">{house.motto ? `“${house.motto}”` : 'No motto yet'}</p>
            <div className="ah-hero__swatch">
              <span className="actvt-tone-dot" aria-hidden="true" />
              {house.color || 'No colour set'}
            </div>
            <div className="actvt-hero__actions">
              <Button variant="primary" size="sm" icon={Pencil} onClick={() => setEditOpen(true)}>
                Edit house
              </Button>
              <Button
                size="sm"
                icon={Flag}
                loading={uploadingFlag}
                onClick={() => flagInputRef.current?.click()}
              >
                {uploadingFlag
                  ? house.flag
                    ? 'Changing flag…'
                    : 'Uploading flag…'
                  : house.flag
                    ? 'Change flag'
                    : 'Upload flag'}
              </Button>
            </div>
          </div>

          <div className="ah-hero__flag">
            {house.flag ? (
              <HouseFlagFly
                key={house.flag}
                src={house.flag}
                alt={`${house.name} flag`}
                height={72}
                poleHeight={160}
                hoist
              />
            ) : (
              <button
                type="button"
                className="ah-flag-empty"
                onClick={() => flagInputRef.current?.click()}
                disabled={uploadingFlag}
              >
                <Icon icon={Flag} size={20} />
                <span>{uploadingFlag ? 'Uploading…' : 'Add house flag'}</span>
              </button>
            )}
          </div>
        </section>
        </div>

        <div className="cb-stats">
          <StatCard label="Students" value={data?.stats.totalStudents || 0} icon={Users} />
          <StatCard label="Teachers" value={data?.stats.teachersCount || 0} icon={UserRound} />
          <StatCard label="Council members" value={data?.stats.councilCount || 0} icon={Crown} />
          <StatCard
            label="Boys / girls"
            value={`${data?.stats.genderCounts?.Boy || 0} / ${data?.stats.genderCounts?.Girl || 0}`}
            icon={GraduationCap}
          />
        </div>

        <div className="cb-grid-6-6">
          <Card title="Teachers" subtitle="House master, mistress and mentors">
            <form onSubmit={handleAddTeacher} className="ah-member-form">
              <div className="cb-form-grid">
                <TextField
                  label="Name"
                  size="sm"
                  value={teacherForm.name}
                  onChange={(event) => setTeacherForm({ ...teacherForm, name: event.target.value })}
                  placeholder="Teacher name"
                />
                <Select
                  label="Role"
                  size="sm"
                  value={teacherForm.role}
                  onChange={(event) => setTeacherForm({ ...teacherForm, role: event.target.value })}
                  options={TEACHER_ROLES}
                />
                <TextField
                  label="Phone"
                  size="sm"
                  type="tel"
                  value={teacherForm.phone}
                  onChange={(event) => setTeacherForm({ ...teacherForm, phone: event.target.value })}
                />
                <TextField
                  label="Email"
                  size="sm"
                  type="email"
                  value={teacherForm.email}
                  onChange={(event) => setTeacherForm({ ...teacherForm, email: event.target.value })}
                />
              </div>
              <div className="ah-member-form__foot">
                <Button type="submit" size="sm" icon={Plus} loading={saving}>
                  Add teacher
                </Button>
              </div>
            </form>

            {teachers.length === 0 ? (
              <EmptyState
                compact
                icon={UserRound}
                title="No teachers in this house yet"
                body="Add the house master or mistress above."
              />
            ) : (
              <ul className="ah-members" aria-label="House teachers">
                {teachers.map((teacher, index) => (
                  <li key={`${teacher.name}-${index}`} className="ah-member">
                    <Avatar name={teacher.name} size="md" />
                    <div className="ah-member__text">
                      <span className="ah-member__name">{teacher.name}</span>
                      <span className="ah-member__meta">
                        {[teacher.phone, teacher.email].filter(Boolean).join(' · ') || 'No contact details'}
                      </span>
                    </div>
                    <Badge tone="info" dot={false}>{teacher.role || 'House Teacher'}</Badge>
                    <Button
                      variant="tertiary"
                      size="sm"
                      icon={Trash2}
                      disabled={saving}
                      aria-label={`Remove ${teacher.name}`}
                      onClick={() => void handleRemoveTeacher(index)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="House council"
            subtitle="Members picked on Student Council appear here automatically"
            action={
              <Link to="/actvt/student-council" className="cb-link ah-small-link">
                Manage in Student Council
              </Link>
            }
          >
            <form onSubmit={handleAddCouncil} className="ah-member-form">
              <div className="cb-form-grid">
                <TextField
                  label="Name"
                  size="sm"
                  value={councilForm.name}
                  onChange={(event) => setCouncilForm({ ...councilForm, name: event.target.value })}
                  placeholder="Member name"
                />
                <Select
                  label="Role"
                  size="sm"
                  value={councilForm.role}
                  onChange={(event) => setCouncilForm({ ...councilForm, role: event.target.value })}
                  options={COUNCIL_ROLES}
                />
                <TextField
                  label="Class"
                  size="sm"
                  value={councilForm.className}
                  onChange={(event) => setCouncilForm({ ...councilForm, className: event.target.value })}
                />
                <TextField
                  label="Section"
                  size="sm"
                  value={councilForm.section}
                  onChange={(event) => setCouncilForm({ ...councilForm, section: event.target.value })}
                />
                <TextField
                  label="Phone"
                  size="sm"
                  type="tel"
                  value={councilForm.phone}
                  onChange={(event) => setCouncilForm({ ...councilForm, phone: event.target.value })}
                />
              </div>
              <div className="ah-member-form__foot">
                <Button type="submit" size="sm" icon={Plus} loading={saving}>
                  Add member
                </Button>
              </div>
            </form>

            {councilMembers.length === 0 ? (
              <EmptyState
                compact
                icon={Crown}
                title="No council members yet"
                body="Add a captain or prefect above, or select them on Student Council."
              />
            ) : (
              <ul className="ah-members" aria-label="House council members">
                {councilMembers.map((member, index) => (
                  <li key={`${member.name}-${index}`} className="ah-member">
                    <Avatar name={member.name} size="md" />
                    <div className="ah-member__text">
                      <span className="ah-member__name">{member.name}</span>
                      <span className="ah-member__meta">
                        {[member.className, member.section].filter(Boolean).join(' · ') || 'Class and section not set'}
                        {member.phone ? ` · ${member.phone}` : ''}
                      </span>
                    </div>
                    <Badge tone="warning" dot={false}>{member.role || 'Member'}</Badge>
                    <Button
                      variant="tertiary"
                      size="sm"
                      icon={Trash2}
                      disabled={saving}
                      aria-label={`Remove ${member.name}`}
                      onClick={() => void handleRemoveCouncil(index)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Wall of fame" subtitle="Top achievers by medals and activity participation">
          {wallOfFame.length === 0 ? (
            <EmptyState
              compact
              icon={Trophy}
              title="No achievers ranked yet"
              body="Issue house participation or medal certificates after activities to rank students here."
            />
          ) : (
            <ol className="ah-fame" aria-label="Wall of fame">
              {wallOfFame.map((entry, index) => (
                <li key={entry._id}>
                  <button
                    type="button"
                    className="ah-fame__card"
                    style={tone}
                    onClick={() => navigate(`/actvt/students/${entry._id}`)}
                  >
                    <span className="ah-fame__top">
                      <span className="ah-fame__mark actvt-tone-fill" aria-hidden="true">
                        {houseInitials(entry.name || '')}
                      </span>
                      <span className="ah-fame__rank">#{index + 1}</span>
                    </span>
                    <span className="ah-fame__name">{entry.name || 'Student'}</span>
                    <span className="ah-fame__class">
                      {[entry.class, entry.section].filter(Boolean).join('-') || 'Class not set'}
                    </span>
                    <span className="ah-fame__badges">
                      <Badge tone="warning" dot={false}>{plural(entry.medalCount || 0, 'medal')}</Badge>
                      <Badge tone="neutral" dot={false}>
                        {plural(entry.participationCount || 0, 'certificate')}
                      </Badge>
                    </span>
                    {entry.highlight ? (
                      <span className="ah-fame__highlight">
                        <strong>{entry.highlight.role || 'Winner'}</strong>
                        {' · '}
                        {entry.highlight.eventTitle || entry.highlight.title || 'Activity'}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card
          flush
          title="Students"
          subtitle={
            hasStudentFilters
              ? `${filteredStudents.length} of ${plural(totalStudents, 'student')}`
              : plural(totalStudents, 'student')
          }
        >
          <div className="ah-toolbar">
            <FilterBar
              search={{
                placeholder: 'Search name, admission no or parent',
                value: studentQuery,
                onChange: setStudentQuery,
                label: 'Search students',
              }}
              filters={
                <>
                  <Select
                    aria-label="Class"
                    size="sm"
                    value={classFilter}
                    onChange={(event) => {
                      setClassFilter(event.target.value)
                      setSectionFilter('')
                    }}
                    placeholder="All classes"
                    options={classOptions}
                    className="ah-filter"
                  />
                  <Select
                    aria-label="Section"
                    size="sm"
                    value={sectionFilter}
                    onChange={(event) => setSectionFilter(event.target.value)}
                    placeholder="All sections"
                    options={sectionOptions}
                    className="ah-filter"
                  />
                  {hasStudentFilters ? (
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
                  ) : null}
                </>
              }
            />
          </div>
          <DataTable
            columns={STUDENT_COLUMNS}
            rows={filteredStudents}
            getRowKey={(row) => row._id}
            onRowClick={(row) => navigate(`/actvt/students/${row._id}`)}
            sort={studentSort}
            onSort={(key) => toggleStudentSort(key as StudentSortKey)}
            caption={`Students in ${house.name || 'this house'}`}
            maxHeight="min(70vh, 920px)"
            loading={loading}
            loadingLabel="Loading students…"
            empty={
              hasStudentFilters ? (
                <EmptyState
                  compact
                  title="No students match these filters"
                  body="Change the class, section or search, or clear the filters."
                />
              ) : (
                <EmptyState
                  compact
                  icon={Users}
                  title="No students in this house yet"
                  body="Assign houses from student records in Student Management."
                />
              )
            }
          />
        </Card>
      </div>

      <HouseEditModal
        open={editOpen}
        house={house}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          void load()
        }}
      />

      <ImageCropModal
        open={Boolean(flagCropSource)}
        imageSrc={flagCropSource}
        title="Crop house flag"
        hint="Drag to reposition. In Free mode, drag one edge or corner to resize that side only."
        aspect={3 / 2}
        fileNamePrefix="house-flag"
        onCancel={handleFlagCropCancel}
        onCropped={(file, previewUrl) => {
          void handleFlagCropped(file, previewUrl)
        }}
      />
    </Page>
  )
}

export default ActvtHouseDetail
