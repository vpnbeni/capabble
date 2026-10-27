import { useLocalSearchParams, useRouter } from 'expo-router'
import { CalendarRange, Mail, Pencil, Phone } from 'lucide-react-native'
import { Linking, View } from 'react-native'

import { formatDate } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useStaffRecord } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { Avatar, Badge, DetailList, ListGroup, MobileScreen, NavBar, Surface, Text } from '@/ui'

/** A colleague's record: role, contact and joining, with call and email; the office edits it. */
export default function ColleagueScreen() {
  const router = useRouter()
  const staff = useStaff()
  const { id } = useLocalSearchParams<{ id: string }>()
  const record = useStaffRecord(id)
  const data = record.data
  const canEdit = staff.can('staaf.staff.write')
  const canTimetable = staff.canUse('timetable_teacher_wise')
  const phone = data?.mobileNo || data?.phone

  return (
    <MobileScreen
      refreshing={record.isRefetching}
      onRefresh={record.refetch}
      nav={
        <NavBar
          title="Staff"
          back={{ label: 'Staff', onPress: router.back }}
          actions={canEdit && data ? [{ icon: Pencil, label: 'Edit record', onPress: () => router.push({ pathname: '/colleague/edit', params: { id: data._id } }) }] : []}
        />
      }
    >
      {record.isPending ? (
        <CardSkeleton rows={4} />
      ) : record.isError || !data ? (
        <LoadFailed what="The staff record" error={record.error} onRetry={record.refetch} />
      ) : (
        <>
          <View style={{ alignItems: 'center', gap: space['space-1'], paddingTop: space['space-2'] }}>
            <Avatar name={data.name} src={data.profileImage} size={80} />
            <Text variant="m-section" accessibilityRole="header" style={{ marginTop: space['space-2'], textAlign: 'center' }}>
              {data.name}
            </Text>
            <Text variant="m-subhead" tone="muted" style={{ textAlign: 'center' }}>
              {[data.designation, data.department].filter(Boolean).join(' · ') || 'Staff'}
            </Text>
            {data.isActive === false ? <Badge label="Left the school" tone="neutral" /> : null}
          </View>
          {phone || data.email ? (
            <ListGroup
              items={[
                ...(phone ? [{ title: phone, subtitle: 'Call', icon: Phone, tile: 2 as const, onPress: () => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`) }] : []),
                ...(data.email ? [{ title: data.email, subtitle: 'Email', icon: Mail, tile: 2 as const, onPress: () => Linking.openURL(`mailto:${data.email}`) }] : []),
              ]}
            />
          ) : null}
          <Surface>
            <DetailList
              columns={2}
              items={[
                { label: 'Employee ID', value: data.employeeId },
                { label: 'Joined', value: data.dateOfJoining ? formatDate(data.dateOfJoining) : null },
                { label: 'Qualification', value: data.qualification, wide: true },
                { label: 'Experience', value: data.experience ? `${data.experience} ${data.experience === 1 ? 'year' : 'years'}` : null },
                { label: 'Duty', value: data.dutyType },
                ...(data.notes ? [{ label: 'Notes', value: data.notes, wide: true }] : []),
              ]}
            />
          </Surface>
          {canTimetable ? (
            <ListGroup
              items={[
                {
                  title: 'Timetable',
                  subtitle: 'Their week from the published timetable',
                  icon: CalendarRange,
                  tile: 4,
                  onPress: () => router.push({ pathname: '/timetables/view', params: { type: 'teacher', id: data._id, title: data.name } }),
                },
              ]}
            />
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
