import React from 'react'
import { useParams } from 'react-router-dom'
import { Phone, UserX } from 'lucide-react'
import { Avatar, Card, DetailList, EmptyState, Entity, Icon, Page, Skeleton } from '@/components/ui'
import { errorMessage } from '@/components/trnst/TrnstUi'
import { useCrewStudent } from '@/hooks/useTrnst'

/** A call button for a phone number (the crew's phone dials it). */
const CallLink: React.FC<{ phone: string; who: string }> = ({ phone, who }) => (
  <a className="cb-btn cb-btn--secondary cb-btn--sm" href={`tel:${phone.replace(/\s+/g, '')}`} aria-label={`Call ${who}`}>
    <Icon icon={Phone} size={16} />
    <span className="cb-btn__label">Call</span>
  </a>
)

/**
 * Bus crew → a student on the bus: class and stop, the class teacher and the family, each with a
 * call button. Only students on this trip's route (the server refuses the rest).
 */
const TrnstCrewStudent: React.FC = () => {
  const { tripId, studentId } = useParams<{ tripId: string; studentId: string }>()
  const card = useCrewStudent(tripId, studentId)
  const data = card.data

  if (card.isLoading) {
    return (
      <Page>
        <div className="tr-crew cb-stack">
          <Card><div className="cb-skeleton-stack"><Skeleton height={56} /><Skeleton height={56} /></div></Card>
        </div>
      </Page>
    )
  }
  if (!data) {
    return (
      <Page>
        <div className="tr-crew">
          <Card>
            <EmptyState icon={UserX} title="Student not found" body={errorMessage(card.error, 'This student is not on this route.')} compact />
          </Card>
        </div>
      </Page>
    )
  }

  const { student, stop, classTeacher, family } = data
  const stopTime = stop?.pickupTime || stop?.dropTime
  return (
    <Page>
      <div className="tr-crew cb-stack">
        <Card>
          <div className="cb-stack">
            <div className="tr-crew__student">
              <Avatar name={student.name} src={student.profileImage || undefined} size="lg" />
              <Entity primary={student.name} secondary={`Class ${student.className}-${student.section}`} />
            </div>
            <DetailList
              items={[
                { label: 'Class', value: student.className },
                { label: 'Section', value: student.section },
                { label: 'Admission no.', value: student.rollNumber },
                { label: 'Bus stop', value: stop ? `${stop.name}${stopTime ? ` · ${stopTime}` : ''}` : 'No stop set' },
              ]}
            />
          </div>
        </Card>

        <Card title="Class teacher">
          {classTeacher ? (
            <ul className="tr-list">
              <li className="tr-list__row tr-list__row--static">
                <Entity primary={classTeacher.name} secondary={classTeacher.phone || 'No phone recorded'} />
                {classTeacher.phone ? <CallLink phone={classTeacher.phone} who={classTeacher.name} /> : null}
              </li>
            </ul>
          ) : (
            <p className="cb-muted">No class teacher set for Class {student.className}-{student.section}.</p>
          )}
        </Card>

        <Card title="Family">
          {family.length ? (
            <ul className="tr-list">
              {family.map((person) => (
                <li key={person.relation} className="tr-list__row tr-list__row--static">
                  <Entity primary={person.name || person.relation} secondary={[person.relation, person.phone].filter(Boolean).join(' · ')} />
                  {person.phone ? <CallLink phone={person.phone} who={person.name || person.relation} /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="cb-muted">No parent details on the student's record.</p>
          )}
        </Card>
      </div>
    </Page>
  )
}

export default TrnstCrewStudent
