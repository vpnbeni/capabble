import { useLocalSearchParams, useRouter } from 'expo-router'
import { Phone, UserX } from 'lucide-react-native'
import { Linking } from 'react-native'

import { classLabel, formatTime } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useCrewStudent } from '@/staff/crewQueries'
import { Avatar, DetailList, ListGroup, MobileButton, MobileScreen, NavBar, StatusView, Surface, type ListGroupItem } from '@/ui'

const call = (phone: string) => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`)

const callButton = (phone: string, who: string) => (
  <MobileButton variant="tinted" size="medium" icon={Phone} aria-label={`Call ${who}`} onPress={() => call(phone)} />
)

/**
 * A student on the bus, for the crew: class and stop, the class teacher and the family, each with a
 * call button. The server answers only for students on this trip's route.
 */
export default function CrewStudentScreen() {
  const router = useRouter()
  const { tripId, studentId } = useLocalSearchParams<{ tripId: string; studentId: string }>()
  const card = useCrewStudent(tripId, studentId)
  const data = card.data

  const teacherRows: ListGroupItem[] = data?.classTeacher
    ? [
        {
          title: data.classTeacher.name,
          subtitle: data.classTeacher.phone || 'No phone recorded',
          avatar: <Avatar name={data.classTeacher.name} size={36} />,
          accessory: data.classTeacher.phone ? callButton(data.classTeacher.phone, data.classTeacher.name) : undefined,
        },
      ]
    : [{ title: 'No class teacher set', subtitle: data ? `For Class ${classLabel(data.student.className, data.student.section)}` : undefined }]

  const familyRows: ListGroupItem[] = data?.family.length
    ? data.family.map((person) => ({
        title: person.name || person.relation,
        subtitle: [person.relation, person.phone].filter(Boolean).join(' · '),
        avatar: <Avatar name={person.name || person.relation} size={36} />,
        accessory: person.phone ? callButton(person.phone, person.name || person.relation) : undefined,
      }))
    : [{ title: 'No parent details on the record' }]

  const stopTime = data?.stop?.pickupTime || data?.stop?.dropTime

  return (
    <MobileScreen refreshing={card.isRefetching} onRefresh={card.refetch} nav={<NavBar title={data?.student.name ?? 'Student'} back={{ label: 'Trip', onPress: router.back }} />}>
      {card.isPending ? (
        <CardSkeleton rows={4} />
      ) : card.isError || !data ? (
        card.isError ? (
          <LoadFailed what="This student" error={card.error} onRetry={card.refetch} />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={UserX} title="Student not found" body="This student is not on this route." />
          </Surface>
        )
      ) : (
        <>
          <Surface>
            <DetailList
              columns={2}
              items={[
                { label: 'Class', value: data.student.className },
                { label: 'Section', value: data.student.section },
                { label: 'Admission no.', value: data.student.rollNumber },
                { label: 'Bus stop', value: data.stop ? `${data.stop.name}${stopTime ? ` · ${formatTime(stopTime)}` : ''}` : 'No stop set' },
              ]}
            />
          </Surface>
          <ListGroup header="Class teacher" items={teacherRows} />
          <ListGroup header="Family" items={familyRows} />
        </>
      )}
    </MobileScreen>
  )
}
