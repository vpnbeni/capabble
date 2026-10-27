import { useLocalSearchParams, useRouter } from 'expo-router'
import { ExternalLink, Phone } from 'lucide-react-native'
import { Linking, View } from 'react-native'

import { classLabel, formatDate } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useStudentRecord } from '@/staff/queries'
import { openWebsite } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { Avatar, DetailList, ListGroup, MobileButton, MobileScreen, NavBar, Surface, Text, type ListGroupItem } from '@/ui'

const call = (phone: string, name: string) => (
  <MobileButton variant="tinted" size="medium" icon={Phone} aria-label={`Call ${name}`} onPress={() => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`)} />
)

/** A student's record for staff, with the family to call. Changes are made on the website. */
export default function StudentScreen() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const record = useStudentRecord(id)
  const data = record.data

  const family: ListGroupItem[] = data
    ? [
        ...(data.guardianName || data.guardianPhone
          ? [
              {
                title: data.guardianName || 'Guardian',
                subtitle: ['Guardian', data.guardianPhone].filter(Boolean).join(' · '),
                avatar: <Avatar name={data.guardianName || 'Guardian'} size={36} />,
                accessory: data.guardianPhone ? call(data.guardianPhone, data.guardianName || 'the guardian') : undefined,
                lines: 2,
              },
            ]
          : []),
        ...(data.fatherName && data.fatherName !== data.guardianName ? [{ title: data.fatherName, subtitle: 'Father', avatar: <Avatar name={data.fatherName} size={36} /> }] : []),
        ...(data.motherName && data.motherName !== data.guardianName ? [{ title: data.motherName, subtitle: 'Mother', avatar: <Avatar name={data.motherName} size={36} /> }] : []),
        ...(data.phone ? [{ title: data.name, subtitle: `Student · ${data.phone}`, avatar: <Avatar name={data.name} size={36} />, accessory: call(data.phone, data.name), lines: 2 }] : []),
      ]
    : []

  return (
    <MobileScreen
      refreshing={record.isRefetching}
      onRefresh={record.refetch}
      nav={<NavBar title="Student" back={{ label: 'Back', onPress: router.back }} />}
    >
      {record.isPending ? (
        <CardSkeleton rows={4} />
      ) : record.isError ? (
        <LoadFailed what="The student's record" error={record.error} onRetry={record.refetch} />
      ) : data ? (
        <>
          <View style={{ alignItems: 'center', gap: space['space-1'], paddingTop: space['space-2'] }}>
            <Avatar name={data.name} src={data.profileImage} size={80} />
            <Text variant="m-section" accessibilityRole="header" style={{ marginTop: space['space-2'], textAlign: 'center' }}>
              {data.name}
            </Text>
            <Text variant="m-subhead" tone="muted">
              {[classLabel(data.class, data.section), data.classRollNo ? `Roll ${data.classRollNo}` : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {family.length ? <ListGroup header="Family" items={family} /> : null}
          <Surface>
            <DetailList
              columns={2}
              items={[
                { label: 'Admission no.', value: data.rollNumber },
                { label: 'Date of birth', value: data.dateOfBirth ? formatDate(data.dateOfBirth) : null },
                { label: 'Gender', value: data.gender },
                { label: 'Bus', value: data.busNo },
                { label: 'Admitted on', value: data.admissionDate ? formatDate(data.admissionDate) : null },
                { label: 'Email', value: data.guardianEmail, wide: true },
                { label: 'Address', value: data.fullAddress, wide: true },
              ]}
            />
          </Surface>
          <MobileButton variant="gray" size="medium" icon={ExternalLink} onPress={() => openWebsite('/stdnt/students')}>
            Open students on the website
          </MobileButton>
        </>
      ) : null}
    </MobileScreen>
  )
}
