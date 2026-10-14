import { useEffect, useState } from 'react'
import { Award, BookOpen, Bus, CalendarDays, Mail, Pencil, Phone, Trophy, UserRound, UserX } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../services/api'
import attndService from '../services/attndService'
import {
  Avatar,
  Badge,
  Button,
  Card,
  DetailList,
  EmptyState,
  Icon,
  Page,
  PageHeader,
  Progress,
  StatCard,
  Tabs,
  formatDate,
} from '@/components/ui'
import {
  classLabel,
  classSectionLabel,
  formatAddress,
  normalizeGender,
  sectionLabel,
  studentPhotoUrl,
} from '@/components/students/studentFormat'
import '@/components/students/students.css'

type TabId = 'overview' | 'academics' | 'activities'

const attendanceTone = (rate: number) => (rate >= 90 ? 'success' : rate >= 75 ? 'warning' : 'danger')

export default function StudentProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [student, setStudent] = useState<any>(null)
  const [activity, setActivity] = useState<any>(null)
  const [attendance, setAttendance] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<TabId>('overview')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await api.get(`/students/${id}`)
        const s = r.data?.data
        if (!alive) return
        setStudent(s)
        const results = await Promise.allSettled([
          api.get(`/actvt/students/${id}/profile`),
          s?.class && s?.section
            ? attndService.getStudentAttendance(s.class, s.section, {
                month: new Date().toISOString().slice(0, 7),
              })
            : Promise.resolve({ records: [] }),
        ])
        if (!alive) return
        if (results[0].status === 'fulfilled') setActivity(results[0].value.data?.data)
        if (results[1].status === 'fulfilled')
          setAttendance(results[1].value.records.filter((x: any) => String(x.studentId) === String(id)))
      } catch {
        // A missing record shows the not-found state below.
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [id])

  const backToList = { label: 'Students', onClick: () => navigate('/stdnt/students') }

  if (loading) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading student profile
        </div>
      </Page>
    )
  }

  if (!student) {
    return (
      <Page>
        <PageHeader title="Student not found" back={backToList} />
        <Card>
          <EmptyState
            icon={UserX}
            title="This student record doesn't exist"
            body="It may have been deleted, or it belongs to another session."
            action={<Button onClick={backToList.onClick}>Back to students</Button>}
          />
        </Card>
      </Page>
    )
  }

  const present = attendance.filter((x) => x.status === 'present').length
  const marked = attendance.length
  const rate = marked ? Math.round((present * 100) / marked) : 0
  const activities: any[] = activity?.activities || []
  const certificates: any[] = activity?.certificates || []
  const medals: any[] = activity?.medals || []
  const achievements = [...medals, ...certificates]
  const subjects: any[] = student.subjects || []
  const address = formatAddress(student.address)
  const isActive = student.isActive !== false
  const thisMonth = new Date().toLocaleString('en-IN', { month: 'long' })

  const editStudent = () => navigate('/stdnt/students', { state: { editStudent: student } })

  return (
    <Page>
      <PageHeader
        back={backToList}
        title={student.name || 'Student'}
        subtitle={`${classSectionLabel(student.class, student.section)} · Admission no. ${student.rollNumber || '—'}`}
        actions={
          <Button variant="primary" icon={Pencil} onClick={editStudent}>
            Edit details
          </Button>
        }
      />

      <Card>
        <div className="stdnt-hero">
          <Avatar
            name={student.name || 'Student'}
            src={studentPhotoUrl(student.profileImage)}
            size="xl"
            square
            className="stdnt-hero__photo"
          />
          <div className="stdnt-hero__main">
            <div className="stdnt-hero__name">
              {isActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
            </div>
            <p className="stdnt-hero__facts">
              <span>
                <strong>{classLabel(student.class)}</strong> · {sectionLabel(student.section) || 'No section'}
              </span>
              <span>
                Roll no. <strong className="is-num">{student.classRollNo || '—'}</strong>
              </span>
              <span>{normalizeGender(student.gender)}</span>
              <span>Born {formatDate(student.dateOfBirth)}</span>
            </p>
          </div>
          <div className="stdnt-hero__contact">
            <ul>
              <li>
                <Icon icon={Phone} size={16} />
                <span className="is-num">{student.phone || student.guardianPhone || 'No phone number'}</span>
              </li>
              <li>
                <Icon icon={Mail} size={16} />
                <span>{student.email || 'No email'}</span>
              </li>
              <li>
                <Icon icon={UserRound} size={16} />
                <span>{student.fatherName || student.guardianName || 'No guardian recorded'}</span>
              </li>
            </ul>
          </div>
        </div>
      </Card>

      <section className="cb-stats" aria-label="At a glance">
        <StatCard
          label={`Attendance · ${thisMonth}`}
          value={marked ? `${rate}%` : '—'}
          icon={CalendarDays}
          hint={marked ? `${present} of ${marked} days present` : 'No attendance marked yet'}
          progress={marked ? rate : undefined}
          progressTone={attendanceTone(rate)}
        />
        <StatCard label="Subjects" value={subjects.length} icon={BookOpen} hint="Enrolled this session" />
        <StatCard
          label="Activities"
          value={activity?.metrics?.participationCount || 0}
          icon={Trophy}
          hint="Participations"
        />
        <StatCard
          label="Awards"
          value={achievements.length}
          icon={Award}
          hint={`${medals.length} ${medals.length === 1 ? 'medal' : 'medals'} · ${certificates.length} ${
            certificates.length === 1 ? 'certificate' : 'certificates'
          }`}
        />
      </section>

      <Tabs
        label="Student profile sections"
        value={tab}
        onChange={(next) => setTab(next as TabId)}
        items={[
          { id: 'overview', label: 'Overview' },
          { id: 'academics', label: 'Academics', count: subjects.length },
          { id: 'activities', label: 'Activities', count: activities.length + achievements.length },
        ]}
      />

      {tab === 'overview' ? (
        <div className="cb-grid-6-6">
          <Card title="Personal details">
            <DetailList
              items={[
                { label: 'Admission no.', value: student.rollNumber },
                { label: 'Admission date', value: formatDate(student.admissionDate) },
                { label: 'Date of birth', value: formatDate(student.dateOfBirth) },
                { label: 'Gender', value: normalizeGender(student.gender) },
                { label: 'Blood group', value: student.medicalInfo?.bloodGroup },
                { label: 'Category', value: student.category },
                { label: 'Religion', value: student.religion },
                { label: 'Nationality', value: student.nationality },
                { label: 'PEN no.', value: student.penNumber },
                { label: 'Aadhaar number', value: student.aadharNumber },
              ]}
            />
          </Card>
          <div className="cb-stack">
            <Card title="Family and contact">
              <DetailList
                items={[
                  { label: "Father's name", value: student.fatherName },
                  { label: "Mother's name", value: student.motherName },
                  { label: "Guardian's phone", value: student.guardianPhone },
                  { label: "Student's phone", value: student.phone },
                  { label: 'Email', value: student.email, wide: true },
                  { label: 'Address', value: address, wide: true },
                ]}
              />
            </Card>
            <Card title="House and transport">
              <DetailList
                items={[
                  { label: 'House', value: student.house },
                  { label: 'Bus no.', value: student.busNo },
                ]}
              />
              <p className="stdnt-list__meta" style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <Icon icon={Bus} size={14} /> Stop and driver details come from Transport once it is set up.
              </p>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'academics' ? (
        <div className="cb-grid-6-6">
          <Card title="Attendance" subtitle={thisMonth}>
            {marked ? (
              <Progress
                label={`${present} of ${marked} days present`}
                value={rate}
                valueLabel={`${rate}%`}
                tone={attendanceTone(rate)}
              />
            ) : (
              <EmptyState
                compact
                icon={CalendarDays}
                title="No attendance marked this month"
                body="Days appear here once the class teacher marks attendance."
              />
            )}
          </Card>
          <Card title="Subjects" subtitle={subjects.length ? `${subjects.length} enrolled` : undefined}>
            {subjects.length ? (
              <div className="stdnt-chips">
                {subjects.map((s: any) => (
                  <Badge key={s._id || s.name} tone="neutral" dot={false} size="lg">
                    {s.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={BookOpen}
                title="No subjects assigned"
                body="Subjects appear once they are mapped to this class."
              />
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'activities' ? (
        <div className="cb-grid-6-6">
          <Card title="Recent activities">
            {activities.length ? (
              <ul className="stdnt-list">
                {activities.slice(0, 8).map((a: any) => (
                  <li key={a._id}>
                    <span>
                      <span className="stdnt-list__title">{a.title || 'Activity'}</span>
                      <br />
                      <span className="stdnt-list__meta">{a.role || a.activityType || 'Participant'}</span>
                    </span>
                    <span className="stdnt-list__meta is-num">{formatDate(a.date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={Trophy}
                title="No activities recorded"
                body="Participation appears here when it is logged under Activities."
              />
            )}
          </Card>
          <Card title="Awards and certificates">
            {achievements.length ? (
              <ul className="stdnt-list">
                {achievements.slice(0, 8).map((a: any, i: number) => (
                  <li key={a._id || i}>
                    <span>
                      <span className="stdnt-list__title">{a.title || a.eventTitle || 'Award'}</span>
                      <br />
                      <span className="stdnt-list__meta">{a.role || 'Awarded'}</span>
                    </span>
                    <span className="stdnt-list__meta is-num">{formatDate(a.issuedOn || a.eventDate)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={Award}
                title="No awards or certificates yet"
                body="Medals and certificates appear here when they are issued under Activities."
              />
            )}
          </Card>
        </div>
      ) : null}
    </Page>
  )
}
