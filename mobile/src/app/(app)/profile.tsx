import { useRouter } from 'expo-router'

import { classLabel, formatDate } from '@/lib/format'
import { ChildSwitcher } from '@/portal/ChildSwitcher'
import { usePortal } from '@/portal/PortalProvider'
import { usePortalProfile } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import { Avatar, Card, DetailList, Screen, Text } from '@/ui'

/** The student's record as the school has it. Changes go through the school office. */
export default function ProfileScreen() {
  const router = useRouter()
  const { child } = usePortal()
  const profile = usePortalProfile(child?.studentId)
  const data = profile.data
  const address = data?.address
    ? [data.address.street, data.address.city, data.address.state, data.address.pincode].filter(Boolean).join(', ')
    : ''

  return (
    <Screen title="Profile" onBack={router.back} headerAction={<ChildSwitcher />} refreshing={profile.isRefetching} onRefresh={profile.refetch}>
      {!child ? (
        <NoChild />
      ) : profile.isPending ? (
        <CardSkeleton rows={4} />
      ) : profile.isError ? (
        <LoadFailed what="The profile" error={profile.error} onRetry={profile.refetch} />
      ) : data ? (
        <>
          <Card title={data.name} subtitle={`${classLabel(data.className, data.section)} · Admission no. ${data.rollNumber}`} action={<Avatar name={data.name} src={data.profileImage} size={48} />}>
            <DetailList
              columns={2}
              items={[
                { label: 'Roll no.', value: data.classRollNo },
                { label: 'Date of birth', value: data.dateOfBirth ? formatDate(data.dateOfBirth) : null },
                { label: 'Gender', value: data.gender },
                { label: 'House', value: data.house },
                { label: 'Bus', value: data.busNo },
                { label: 'Admitted on', value: data.admissionDate ? formatDate(data.admissionDate) : null },
              ]}
            />
          </Card>
          <Card title="Family and contact">
            <DetailList
              columns={2}
              items={[
                { label: "Father's name", value: data.fatherName },
                { label: "Mother's name", value: data.motherName },
                ...(data.guardianName ? [{ label: 'Guardian', value: data.guardianName }] : []),
                { label: 'Guardian phone', value: data.guardianPhone },
                { label: 'Guardian email', value: data.guardianEmail, wide: true },
                { label: 'Address', value: address, wide: true },
              ]}
            />
          </Card>
          <Text variant="small" tone="muted" style={{ textAlign: 'center' }}>
            To correct anything here, contact the school office.
          </Text>
        </>
      ) : null}
    </Screen>
  )
}
