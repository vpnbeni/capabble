import { useRouter } from 'expo-router'
import { Phone } from 'lucide-react-native'
import { Linking, View } from 'react-native'

import { classLabel, formatDate } from '@/lib/format'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalProfile } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import { space } from '@/theme/tokens'
import { Avatar, DetailList, ListGroup, MobileButton, MobileScreen, NavBar, Surface, Text, type ListGroupItem } from '@/ui'

/** The student's record as the school has it. Changes go through the school office. */
export default function ProfileScreen() {
  const router = useRouter()
  const { child } = usePortal()
  const profile = usePortalProfile(child?.studentId)
  const data = profile.data
  const address = data?.address
    ? [data.address.street, data.address.city, data.address.state, data.address.pincode].filter(Boolean).join(', ')
    : ''

  const call = (phone: string, name: string) => (
    <MobileButton variant="tinted" size="medium" icon={Phone} aria-label={`Call ${name}`} onPress={() => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`)} />
  )
  const family: ListGroupItem[] = data
    ? [
        ...(data.fatherName ? [{ title: data.fatherName, subtitle: 'Father', avatar: <Avatar name={data.fatherName} size={36} /> }] : []),
        ...(data.motherName ? [{ title: data.motherName, subtitle: 'Mother', avatar: <Avatar name={data.motherName} size={36} /> }] : []),
        ...(data.guardianName || data.guardianPhone
          ? [
              {
                title: data.guardianName || 'Guardian',
                subtitle: ['Guardian', data.guardianPhone].filter(Boolean).join(' · '),
                avatar: <Avatar name={data.guardianName || 'Guardian'} size={36} />,
                accessory: data.guardianPhone ? call(data.guardianPhone, data.guardianName || 'guardian') : undefined,
              },
            ]
          : []),
      ]
    : []

  return (
    <MobileScreen
      refreshing={profile.isRefetching}
      onRefresh={profile.refetch}
      nav={<NavBar title="Profile" back={{ label: 'Back', onPress: router.back }} trailing={<ChildSwitcher />} />}
    >
      {!child ? (
        <NoChild />
      ) : profile.isPending ? (
        <CardSkeleton rows={4} />
      ) : profile.isError ? (
        <LoadFailed what="The profile" error={profile.error} onRetry={profile.refetch} />
      ) : data ? (
        <>
          <View style={{ alignItems: 'center', gap: space['space-1'], paddingTop: space['space-2'] }}>
            <Avatar name={data.name} src={data.profileImage} size={80} />
            <Text variant="m-section" accessibilityRole="header" style={{ marginTop: space['space-2'], textAlign: 'center' }}>
              {data.name}
            </Text>
            <Text variant="m-subhead" tone="muted">
              {[classLabel(data.className, data.section), data.classRollNo ? `Roll ${data.classRollNo}` : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Surface>
            <DetailList
              columns={2}
              items={[
                { label: 'Admission no.', value: data.rollNumber },
                { label: 'Date of birth', value: data.dateOfBirth ? formatDate(data.dateOfBirth) : null },
                { label: 'Gender', value: data.gender },
                { label: 'House', value: data.house },
                { label: 'Bus', value: data.busNo },
                { label: 'Admitted on', value: data.admissionDate ? formatDate(data.admissionDate) : null },
                { label: 'Email', value: data.guardianEmail, wide: true },
                { label: 'Address', value: address, wide: true },
              ]}
            />
          </Surface>
          {family.length ? <ListGroup header="Family" footer="To change these details, contact the school office." items={family} /> : null}
        </>
      ) : null}
    </MobileScreen>
  )
}
