import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Award, Download, Hash, Home, Medal, School, Sparkles, Trophy, UserX, Users } from 'lucide-react'
import api from '@/services/api'
import { Avatar, Badge, Button, Card, DetailList, EmptyState, Icon, Page, StatCard, formatDate } from '@/components/ui'
import { studentPhotoUrl } from '@/components/students/studentFormat'
import { toneStyle } from '@/components/actvt/entityTone'
import '@/components/actvt/actvt.css'
import '@/components/actvt/council.css'

type StudentProfile = {
  student: {
    _id: string
    rollNumber?: string
    classRollNo?: number | null
    name?: string
    class?: string
    section?: string
    gender?: string
    fatherName?: string
    motherName?: string
    house?: string
    houseId?: string
    profileImage?: string
  }
  house?: {
    _id?: string
    name?: string
    color?: string
    logo?: string
    tagline?: string
  } | null
  certificates: Array<{
    _id?: string
    title?: string
    eventTitle?: string
    eventDate?: string
    houseName?: string
    role?: string
    issuedOn?: string
    className?: string
    section?: string
    participantName?: string
  }>
  medals: Array<{
    _id?: string
    title?: string
    eventTitle?: string
    role?: string
    issuedOn?: string
  }>
  activities: Array<{
    _id?: string
    title?: string
    date?: string
    activityType?: string
    status?: string
    venue?: string
    participated?: boolean
    certificateCount?: number
  }>
  metrics: {
    activityScore: number
    diversityScore: number
    activenessScore: number
    participationCount: number
    medalCount: number
    uniqueActivities: number
    uniqueRoles: number
    housePointsTotal: number
  }
}

/** Dates arrive as ISO strings or free text; format the first, keep the second as typed. */
const showDate = (value?: string) => {
  if (!value) return ''
  const formatted = formatDate(value)
  return formatted === '—' ? value : formatted
}

const scoreTone = (value: number) => (value >= 75 ? 'success' : value >= 45 ? 'warning' : 'accent')

const ActvtStudentProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const printRef = useRef<HTMLDivElement | null>(null)
  const [data, setData] = useState<StudentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [printCertId, setPrintCertId] = useState('')

  const load = async () => {
    if (!id) return
    setLoading(true)
    try {
      const response = await api.get(`/actvt/students/${id}/profile`)
      setData((response.data?.data || null) as StudentProfile | null)
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load student profile.'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [id])

  const printCertificate = useMemo(
    () => (data?.certificates || []).find((item) => String(item._id) === printCertId) || null,
    [data?.certificates, printCertId]
  )

  useEffect(() => {
    if (!printCertId || !printCertificate) return
    const timer = window.setTimeout(() => {
      window.print()
      setPrintCertId('')
    }, 120)
    return () => window.clearTimeout(timer)
  }, [printCertId, printCertificate])

  if (loading) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading student activity profile…
        </div>
      </Page>
    )
  }

  if (!data?.student) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={UserX}
            title="Student not found"
            body="This student may have been removed, or the link is out of date. Go back and pick the student again."
            action={
              <Button icon={ArrowLeft} onClick={() => navigate(-1)}>
                Go back
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  const student = data.student
  const house = data.house
  const houseName = house?.name || student.house || ''
  const participated = data.activities.filter((item) => item.participated)
  const fame = data.medals.length > 0 ? data.medals : data.certificates.slice(0, 6)
  const classLabel = student.class ? `${student.class}${student.section ? `-${student.section}` : ''}` : ''

  return (
    <Page>
      <div className="asc asc-screen">
        <section className="actvt-hero asc-hero" style={toneStyle(house?.color)} aria-label="Student">
          <Avatar name={student.name || 'Student'} src={studentPhotoUrl(student.profileImage)} size="xl" className="asc-hero__photo" />
          <div className="actvt-hero__main">
            <h2 className="actvt-hero__name">{student.name}</h2>
            <div className="asc-hero__tags">
              {houseName ? (
                <span className="asc-housetag">
                  {house?.logo ? (
                    <img src={house.logo} alt="" className="asc-housetag__logo" />
                  ) : (
                    <span className="actvt-tone-dot" aria-hidden="true" />
                  )}
                  {houseName}
                </span>
              ) : (
                <Badge tone="neutral">No house</Badge>
              )}
              {student.gender ? <span className="asc-hero__meta">{student.gender}</span> : null}
              {student.fatherName ? <span className="asc-hero__meta">Father: {student.fatherName}</span> : null}
            </div>
          </div>
          <div className="asc-facts">
            <div className="asc-fact">
              <Icon icon={Hash} size={16} className="asc-fact__icon" />
              <span className="asc-fact__text">
                <span className="asc-fact__label">Admission no.</span>
                <span className="asc-fact__value">{student.rollNumber || '—'}</span>
              </span>
            </div>
            <div className="asc-fact">
              <Icon icon={School} size={16} className="asc-fact__icon" />
              <span className="asc-fact__text">
                <span className="asc-fact__label">Class</span>
                <span className="asc-fact__value">{classLabel || '—'}</span>
              </span>
            </div>
            <div className="asc-fact">
              <Icon icon={Hash} size={16} className="asc-fact__icon" />
              <span className="asc-fact__text">
                <span className="asc-fact__label">Roll no.</span>
                <span className="asc-fact__value">{student.classRollNo != null ? student.classRollNo : '—'}</span>
              </span>
            </div>
            <div className="asc-fact">
              <Icon icon={Home} size={16} className="asc-fact__icon" />
              <span className="asc-fact__text">
                <span className="asc-fact__label">House points</span>
                <span className="asc-fact__value">{data.metrics.housePointsTotal}</span>
              </span>
            </div>
          </div>
        </section>

        <div className="cb-stats">
          <StatCard
            label="Activity score"
            value={data.metrics.activityScore}
            unit="/ 100"
            icon={Sparkles}
            hint={`${data.metrics.participationCount} certificates · ${data.metrics.medalCount} medals`}
            progress={data.metrics.activityScore}
            progressTone={scoreTone(data.metrics.activityScore)}
          />
          <StatCard
            label="Diversity"
            value={data.metrics.diversityScore}
            unit="/ 100"
            icon={Award}
            hint={`${data.metrics.uniqueActivities} distinct activities · ${data.metrics.uniqueRoles} roles`}
            progress={data.metrics.diversityScore}
            progressTone={scoreTone(data.metrics.diversityScore)}
          />
          <StatCard
            label="Activeness"
            value={data.metrics.activenessScore}
            unit="/ 100"
            icon={Users}
            hint="How consistently they show up across house events"
            progress={data.metrics.activenessScore}
            progressTone={scoreTone(data.metrics.activenessScore)}
          />
          <StatCard
            label="House points"
            value={data.metrics.housePointsTotal}
            icon={Trophy}
            hint={`Total points for ${houseName || 'their house'}`}
          />
        </div>

        <Card title="Wall of fame" subtitle={data.medals.length > 0 ? 'Medals and placements' : 'Recent certificates'}>
          {fame.length === 0 ? (
            <EmptyState
              compact
              icon={Trophy}
              title="No certificates or medals yet"
              body="Generate certificates from Activities → Certificates after an activity, and they will show here."
            />
          ) : (
            <ul className="asc-fame">
              {fame.map((item) => (
                <li key={item._id} className="asc-fame__item">
                  <span className="asc-fame__icon" aria-hidden="true">
                    <Icon icon={Medal} size={20} />
                  </span>
                  <span className="asc-fame__text">
                    <span className="asc-fame__role">{item.role || 'Participant'}</span>
                    <span className="asc-fame__event">{item.eventTitle || item.title}</span>
                    <span className="asc-fame__date">{showDate(item.issuedOn) || 'Date not set'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="cb-grid-6-6">
          <Card title="Activities participated" subtitle={`${participated.length} on record`}>
            {participated.length === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title="No participation linked yet"
                body="Activities appear here once a certificate is issued to this student."
              />
            ) : (
              <ul className="asc-list">
                {participated.map((item) => (
                  <li key={item._id} className="asc-list__item">
                    <span className="asc-list__main">
                      <span className="asc-list__line">
                        <span className="asc-list__title">{item.title}</span>
                        <Badge tone="success">Participated</Badge>
                        {item.activityType ? (
                          <Badge tone="neutral" dot={false}>
                            {item.activityType}
                          </Badge>
                        ) : null}
                      </span>
                      <span className="asc-list__meta">
                        {[
                          showDate(item.date) || 'No date',
                          item.venue || '',
                          item.certificateCount
                            ? `${item.certificateCount} ${item.certificateCount === 1 ? 'certificate' : 'certificates'}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Certificates" subtitle={`${data.certificates.length} issued`}>
            {data.certificates.length === 0 ? (
              <EmptyState
                compact
                icon={Award}
                title="No certificates on record"
                body="Certificates issued from Activities → Certificates will be listed here to download."
              />
            ) : (
              <ul className="asc-list">
                {data.certificates.map((item) => (
                  <li key={item._id} className="asc-list__item">
                    <span className="asc-list__main">
                      <span className="asc-list__title">{item.title}</span>
                      <span className="asc-list__meta">
                        {[
                          item.eventTitle || 'Activity',
                          item.role || '',
                          item.issuedOn ? `Issued ${showDate(item.issuedOn)}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <Button size="sm" icon={Download} onClick={() => setPrintCertId(String(item._id || ''))}>
                      Download
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card
          title="Engagement snapshot"
          subtitle="Diversity and activeness rise when the student takes part in different kinds of activities and earns certificates across the year, not just one event type."
        >
          <DetailList
            columns={3}
            items={[
              { label: 'Participations', value: data.metrics.participationCount },
              { label: 'Medals and placements', value: data.metrics.medalCount },
              { label: 'Activity breadth', value: `${data.metrics.uniqueActivities} distinct activities` },
            ]}
          />
        </Card>
      </div>

      <div ref={printRef} className="asc-print">
        {printCertificate ? (
          <div className="asc-cert">
            <p className="asc-cert__brand">CAPABBLE · ACTVT</p>
            <h1 className="asc-cert__title">{printCertificate.title || 'Certificate'}</h1>
            <p className="asc-cert__lead">This is to certify that</p>
            <p className="asc-cert__name">{printCertificate.participantName || student.name}</p>
            {printCertificate.className || printCertificate.section || student.class ? (
              <p className="asc-cert__class">
                Class {printCertificate.className || student.class || '—'}
                {printCertificate.section || student.section
                  ? `-${printCertificate.section || student.section}`
                  : ''}
              </p>
            ) : null}
            <p className="asc-cert__body">
              has been awarded this certificate
              {printCertificate.role ? ` as ${printCertificate.role}` : ''}
              {printCertificate.eventTitle ? ` for ${printCertificate.eventTitle}` : ''}
              {printCertificate.houseName ? ` representing ${printCertificate.houseName}` : ''}.
            </p>
            <div className="asc-cert__sign">
              <div>
                <span className="asc-cert__line" />
                Date: {printCertificate.issuedOn || printCertificate.eventDate || '—'}
              </div>
              <div>
                <span className="asc-cert__line" />
                Authorised signatory
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Page>
  )
}

export default ActvtStudentProfile
