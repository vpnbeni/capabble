import { Users } from 'lucide-react-native'
import { View } from 'react-native'

import { classLabel } from '@/lib/format'
import { usePortal } from '@/portal/PortalProvider'
import { useSession } from '@/session/SessionProvider'
import { space } from '@/theme/tokens'
import { Avatar, Banner, Button, Card, EmptyState, ListRow, Screen, Skeleton, Text } from '@/ui'

export default function HomeScreen() {
  const session = useSession()
  if (session.status !== 'signedIn') return null
  return session.user.kind === 'staff' ? <StaffHome /> : <FamilyHome />
}

function FamilyHome() {
  const session = useSession()
  const { homeQuery: home } = usePortal()
  const school = home.data?.school

  return (
    <Screen
      title={school?.name ?? session.school?.name ?? 'Home'}
      leading={school ? <Avatar name={school.name} src={school.logoUrl} size={32} square /> : null}
      refreshing={home.isRefetching}
      onRefresh={home.refetch}
    >
      {session.status === 'signedIn' && session.user.mustChangePassword ? (
        <Banner tone="warning" title="Change your password">
          Your school set a temporary password. Change it on the website under Account.
        </Banner>
      ) : null}

      {home.isError ? (
        <Card>
          <EmptyState
            title="Couldn't load your home page"
            body={home.error.message}
            action={<Button label="Try again" variant="secondary" onPress={() => home.refetch()} />}
          />
        </Card>
      ) : (
        <Card title={home.data?.kind === 'student' ? 'Your details' : 'Your children'} subtitle={home.data?.academicSession ? `Session ${home.data.academicSession}` : undefined} flush>
          {home.isPending ? (
            <View style={{ padding: space['space-4'], gap: space['space-4'] }}>
              {[0, 1].map((row) => (
                <View key={row} style={{ flexDirection: 'row', gap: space['space-3'], alignItems: 'center' }}>
                  <Skeleton width={40} height={40} round />
                  <View style={{ flex: 1, gap: space['space-2'] }}>
                    <Skeleton width="60%" />
                    <Skeleton width="40%" height={12} />
                  </View>
                </View>
              ))}
            </View>
          ) : home.data.students.length === 0 ? (
            <EmptyState icon={Users} title="No children linked to your login yet" body="Ask the school office to link your child." />
          ) : (
            home.data.students.map((child, index) => (
              <ListRow
                key={child.studentId}
                primary={child.name}
                secondary={`${classLabel(child.className, child.section)} · Admission no. ${child.rollNumber}`}
                leading={<Avatar name={child.name} src={child.profileImage} />}
                divider={index < home.data.students.length - 1}
              />
            ))
          )}
        </Card>
      )}
    </Screen>
  )
}

function StaffHome() {
  const session = useSession()
  if (session.status !== 'signedIn') return null
  const name = session.user.displayName || session.user.name || 'there'

  return (
    <Screen title={session.school.name}>
      <View style={{ gap: space['space-1'] }}>
        <Text variant="section-title">Hello, {name}</Text>
        <Text variant="body" tone="muted">
          {session.user.roles.map((role) => role.name).join(', ') || 'Staff'}
        </Text>
      </View>
      <Banner tone="info" title="The staff app is being built">
        Attendance, your timetable and the calendar come to the app next. Use the website for everything else until then.
      </Banner>
    </Screen>
  )
}
