import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BookOpenText, Briefcase, CalendarDays, Hash, Landmark, Mail, MapPin, Phone, School, UserX, Users } from 'lucide-react'
import { useTeacher } from '../hooks/useTeachers'
import { getOrgBandId, ORG_BANDS } from '../utils/staafStaff'
import type { Teacher } from '../redux/slices/teacherSlice'
import { Avatar, Badge, Button, Card, DetailList, EmptyState, Icon, Page, formatDate } from '@/components/ui'
import { studentPhotoUrl } from '@/components/students/studentFormat'
import '@/components/staaf/staaf.css'

/** Imported records use "N/A", "NA" or "[object Object]" for missing values; treat them as empty. */
const clean = (value?: string | number | null) => {
  if (value == null) return null
  const text = String(value).replace(/\[object Object\]/g, '').trim()
  if (!text || /^(n\/?a|null|undefined|-+)(\s|$)/i.test(text)) return null
  return text
}

const subjectName = (subject: Teacher['subjects'][number]) =>
  typeof subject === 'string'
    ? clean(subject)
    : clean([subject.name, subject.class ? `Class ${subject.class}` : ''].filter(Boolean).join(' · '))

const maskAccount = (value?: string) => {
  const digits = clean(value)
  if (!digits) return null
  return digits.length <= 4 ? digits : `•••• ${digits.slice(-4)}`
}

const experienceLabel = (years?: number) => {
  if (years == null || Number.isNaN(Number(years))) return null
  if (Number(years) <= 0) return 'Less than a year'
  return `${years} ${Number(years) === 1 ? 'year' : 'years'}`
}

const ageLabel = (dob?: string) => {
  if (!clean(dob)) return null
  const born = new Date(dob as string)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  if (now < new Date(now.getFullYear(), born.getMonth(), born.getDate())) age -= 1
  return age > 0 ? `${age} years` : null
}

/** Notes from imports look like "School Code: 40291 | Subject: Chemistry"; show them as label–value pairs. */
const parseNotes = (notes?: string) => {
  const text = String(notes || '').trim()
  if (!text) return { pairs: [] as Array<{ label: string; value: string }>, rest: null as string | null }
  const parts = text.split('|').map((part) => part.trim()).filter(Boolean)
  const pairs: Array<{ label: string; value: string }> = []
  const rest: string[] = []
  parts.forEach((part) => {
    const match = part.match(/^([^:]{1,40}):\s*(.*)$/)
    if (match) {
      const value = clean(match[2])
      if (value) pairs.push({ label: match[1].trim(), value })
    } else {
      const value = clean(part)
      if (value) rest.push(value)
    }
  })
  return { pairs, rest: rest.length ? rest.join(' · ') : null }
}

const Fact = ({ icon, label, value }: { icon: typeof Hash; label: string; value: React.ReactNode }) => (
  <div className="staaf-fact">
    <Icon icon={icon} size={16} className="staaf-fact__icon" />
    <span className="staaf-fact__text">
      <span className="staaf-fact__label">{label}</span>
      <span className="staaf-fact__value" title={typeof value === 'string' ? value : undefined}>{value ?? '—'}</span>
    </span>
  </div>
)

const StaafStaffProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading, isError } = useTeacher(id || null)
  const member = data as Teacher | undefined

  const goBack = () => navigate('/staaf/organisation-structure')

  if (isLoading) {
    return (
      <Page>
        <div className="cb-table-state" role="status">
          <span className="cb-spinner" aria-hidden="true" />
          Loading the staff profile
        </div>
      </Page>
    )
  }

  if (isError || !member || !member.name) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={UserX}
            title="This staff member could not be found"
            body="The record may have been removed. Go back to the organisation structure to pick someone else."
            action={
              <Button variant="primary" onClick={goBack}>
                Back to organisation structure
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  const band = ORG_BANDS.find((entry) => entry.id === getOrgBandId(member))
  const groupLabel = band ? (band.id === 'other' ? 'Other staff' : band.id === 'vice-principal' ? 'Vice principal' : band.label) : null
  const placement =
    band?.id === 'principal'
      ? 'Head of school'
      : band?.id === 'vice-principal'
        ? 'Reports to the principal'
        : groupLabel
          ? `${groupLabel} group`
          : null
  const phone = clean(member.mobileNo) || clean(member.phone)
  const email = clean(member.email)
  const subjects = Array.from(new Set((member.subjects || []).map(subjectName).filter(Boolean) as string[]))
  const address = [member.address?.street, member.address?.city, member.address?.state, member.address?.pincode]
    .map((part) => clean(part))
    .filter(Boolean)
    .join(', ')
  const emergencyName = clean(member.emergencyContact?.name)
  const emergency = emergencyName
    ? [emergencyName, clean(member.emergencyContact?.relation), clean(member.emergencyContact?.phone)].filter(Boolean).join(' · ')
    : null
  const notes = parseNotes(member.notes)
  const school = [clean(member.schoolName), clean(member.schoolCode)].filter(Boolean).join(' · ')
  const identifier = clean(member.employeeId) || clean(member.oasisId)
  const identifierLabel = clean(member.employeeId) ? 'Employee ID' : 'OASIS ID'
  const joined = clean(member.dateOfJoining) ? formatDate(member.dateOfJoining as string) : null
  const gender = clean(member.gender) && member.gender !== 'Unspecified' ? member.gender : null

  return (
    <Page>
      <Card className="staaf-hero-card">
        <div className="staaf-hero">
          <Avatar name={member.name} src={studentPhotoUrl(member.profileImage)} size="xl" className="staaf-hero__photo" />
          <div className="staaf-hero__main">
            <div className="staaf-hero__name">
              <h2>{member.name}</h2>
              <Badge tone={member.isActive === false ? 'neutral' : 'success'}>
                {member.isActive === false ? 'Inactive' : 'Active'}
              </Badge>
            </div>
            <div className="staaf-hero__tags">
              {clean(member.designation) ? <Badge tone="info" dot={false}>{member.designation}</Badge> : null}
              {clean(member.dutyType) ? <Badge tone="neutral" dot={false}>{member.dutyType}</Badge> : null}
              {placement ? <span className="staaf-hero__group">{placement}</span> : null}
            </div>
          </div>
          {phone || email ? (
            <div className="staaf-hero__actions">
              {phone ? (
                <a className="cb-btn cb-btn--secondary cb-btn--md" href={`tel:${phone}`}>
                  <Icon icon={Phone} size={16} />
                  <span className="cb-btn__label">Call</span>
                </a>
              ) : null}
              {email ? (
                <a className="cb-btn cb-btn--secondary cb-btn--md" href={`mailto:${email}`}>
                  <Icon icon={Mail} size={16} />
                  <span className="cb-btn__label">Email</span>
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="staaf-facts">
          <Fact icon={Hash} label={identifierLabel} value={identifier} />
          <Fact icon={CalendarDays} label="Joined" value={joined} />
          <Fact icon={Briefcase} label="Experience" value={experienceLabel(member.experience)} />
          <Fact icon={School} label="School" value={school || null} />
        </div>
      </Card>

      <div className="cb-grid-8-4">
        <div className="cb-stack">
          <Card title="Work details">
            <DetailList
              columns={3}
              items={[
                { label: 'Designation', value: clean(member.designation) },
                { label: 'Type', value: clean(member.dutyType) },
                { label: 'Department', value: clean(member.department) },
                { label: 'Qualification', value: clean(member.qualification) },
                { label: 'Subject code', value: clean(member.subjectCode) },
                { label: 'Group', value: groupLabel },
              ]}
            />
            <div className="staaf-subjects">
              <span className="staaf-subjects__label">
                <Icon icon={BookOpenText} size={16} />
                Subjects
              </span>
              {subjects.length ? (
                <span className="staaf-hero__chips">
                  {subjects.map((subject) => (
                    <Badge key={subject} tone="neutral" dot={false}>
                      {subject}
                    </Badge>
                  ))}
                </span>
              ) : (
                <span className="cb-muted">No subjects assigned</span>
              )}
            </div>
          </Card>
          <Card title="Personal details">
            <DetailList
              columns={3}
              items={[
                { label: 'Gender', value: gender },
                { label: 'Date of birth', value: clean(member.dateOfBirth) ? formatDate(member.dateOfBirth as string) : null },
                { label: 'Age', value: ageLabel(member.dateOfBirth) },
              ]}
            />
          </Card>
          {notes.pairs.length || notes.rest ? (
            <Card title="Notes" subtitle="Extra details saved with this record.">
              {notes.pairs.length ? <DetailList columns={3} items={notes.pairs.map((pair) => ({ label: pair.label, value: pair.value }))} /> : null}
              {notes.rest ? <p className="staaf-hero__notes">{notes.rest}</p> : null}
            </Card>
          ) : null}
        </div>

        <div className="cb-stack">
          <Card title="Contact">
            <ul className="staaf-contact">
              <li>
                <Icon icon={Phone} size={16} />
                <span className="staaf-contact__text">
                  <span className="staaf-contact__label">Phone</span>
                  {phone ? <a className="cb-link" href={`tel:${phone}`}>{phone}</a> : <span className="cb-muted">Not recorded</span>}
                </span>
              </li>
              <li>
                <Icon icon={Mail} size={16} />
                <span className="staaf-contact__text">
                  <span className="staaf-contact__label">Email</span>
                  {email ? <a className="cb-link" href={`mailto:${email}`}>{email}</a> : <span className="cb-muted">Not recorded</span>}
                </span>
              </li>
              <li>
                <Icon icon={MapPin} size={16} />
                <span className="staaf-contact__text">
                  <span className="staaf-contact__label">Address</span>
                  {address ? <span>{address}</span> : <span className="cb-muted">Not recorded</span>}
                </span>
              </li>
              <li>
                <Icon icon={Users} size={16} />
                <span className="staaf-contact__text">
                  <span className="staaf-contact__label">Emergency contact</span>
                  {emergency ? <span>{emergency}</span> : <span className="cb-muted">Not recorded</span>}
                </span>
              </li>
            </ul>
          </Card>
          <Card title="Bank details" subtitle="Used for salary payments.">
            {clean(member.bankName) || clean(member.accountNumber) || clean(member.ifscCode) ? (
              <DetailList
                columns={1}
                items={[
                  { label: 'Bank', value: clean(member.bankName) },
                  { label: 'Account number', value: maskAccount(member.accountNumber) },
                  { label: 'IFSC', value: clean(member.ifscCode) },
                ]}
              />
            ) : (
              <EmptyState compact icon={Landmark} title="No bank details recorded" />
            )}
          </Card>
        </div>
      </div>
    </Page>
  )
}

export default StaafStaffProfile
