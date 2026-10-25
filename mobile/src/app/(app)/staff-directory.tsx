import { getStaffTypeId, STAFF_TYPE_OPTIONS, type StaffTypeId } from '@capabble/shared/staffTypes'
import { useRouter } from 'expo-router'
import { Phone, Users } from 'lucide-react-native'
import { useState } from 'react'
import { Linking, View } from 'react-native'

import { CardSkeleton, LoadFailed } from '@/portal/states'
import { useColleagues } from '@/staff/queries'
import { space } from '@/theme/tokens'
import { Avatar, ChipRail, ListGroup, MobileButton, MobileScreen, NavBar, SearchBar, StatusView, Surface } from '@/ui'

/** Staff directory: find a colleague by name, designation or employee ID, and call them. */
export default function StaffDirectoryScreen() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<'all' | StaffTypeId>('all')
  const q = query.trim()
  const list = useColleagues(q.length >= 2 ? q : '')
  const staff = list.data ?? []
  const groups = STAFF_TYPE_OPTIONS.map((option) => ({ ...option, count: staff.filter((member) => getStaffTypeId(member) === option.id).length })).filter(
    (option) => option.count,
  )
  const shown = staff.filter((member) => group === 'all' || getStaffTypeId(member) === group)

  return (
    <MobileScreen refreshing={list.isRefetching} onRefresh={list.refetch} nav={<NavBar title="Staff" back={{ label: 'Back', onPress: router.back }} />}>
      <View style={{ gap: space['space-3'] }}>
        <SearchBar placeholder="Search staff" value={query} onChange={setQuery} onCancel={() => setQuery('')} />
        {groups.length > 1 ? (
          <ChipRail
            label="Staff group"
            value={group}
            onChange={setGroup}
            items={[{ id: 'all' as const, label: 'All', count: staff.length }, ...groups.map((option) => ({ id: option.id, label: option.label, count: option.count }))]}
          />
        ) : null}
      </View>
      {list.isPending ? (
        <CardSkeleton rows={5} />
      ) : list.isError ? (
        <LoadFailed what="The staff list" error={list.error} onRetry={list.refetch} />
      ) : shown.length ? (
        <ListGroup
          footer={staff.length === 100 ? 'Showing the first 100. Search to find someone else.' : undefined}
          items={shown.map((member) => {
            const phone = member.mobileNo || member.phone
            return {
              title: member.name,
              subtitle: [member.designation, member.employeeId].filter(Boolean).join(' · ') || undefined,
              avatar: <Avatar name={member.name} src={member.profileImage} size={36} />,
              accessory: phone ? (
                <MobileButton
                  variant="tinted"
                  size="medium"
                  icon={Phone}
                  aria-label={`Call ${member.name}`}
                  onPress={() => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`)}
                />
              ) : undefined,
            }
          })}
        />
      ) : (
        <Surface padded={false}>
          <StatusView
            compact
            kind="empty"
            icon={Users}
            title={q.length >= 2 ? `No one matches "${q}"` : 'No staff yet'}
            body={q.length >= 2 ? 'Search by name, designation, employee ID or phone number.' : 'Staff show here once the office adds them on the website.'}
          />
        </Surface>
      )}
    </MobileScreen>
  )
}
