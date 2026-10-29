import { useRouter } from 'expo-router'
import { KeyRound, UserPlus } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'

import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { LoginKind } from '@/services/usersService'
import { loginBadge } from '@/staff/loginUi'
import { useSession } from '@/session/SessionProvider'
import { useLogins } from '@/staff/userQueries'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, Avatar, ListGroup, MobileButton, MobileScreen, NavBar, SearchBar, SegmentedControl, StatusView, Surface, haptic, useFixedColumn, useToast } from '@/ui'

/** Every login of the school: staff, parents and students. Administrators create and fix them here. */
export default function UsersScreen() {
  const router = useRouter()
  const [kind, setKind] = useState<LoginKind>('staff')
  const [query, setQuery] = useState('')
  const logins = useLogins(kind, query.trim())
  const rows = logins.data?.users ?? []
  const staff = useStaff()
  const { switchTo } = useSession()
  const toast = useToast()
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  // Testing only: the school owner, where the platform turned it on (admin portal → school → Testing).
  const canSwitch = Boolean(staff.user?.canSwitchUsers)
  // Beside the name when there's room for it, else under it (ListItem decides).
  const switchWidth = useFixedColumn(84)

  const beginSwitch = async (id: string) => {
    setSwitchingId(id)
    try {
      await switchTo(id)
      haptic.medium()
      if (router.canDismiss()) router.dismissAll()
      router.replace('/')
    } catch (error) {
      haptic.error()
      toast(error instanceof ApiError ? error.message : "Couldn't switch. Try again.", 'danger')
    } finally {
      setSwitchingId(null)
    }
  }

  return (
    <MobileScreen
      refreshing={logins.isRefetching}
      onRefresh={logins.refetch}
      nav={<NavBar title="Users and access" back={{ label: 'Back', onPress: router.back }} />}
      actionBar={<ActionBar icon={UserPlus} summary={`${logins.data?.pagination.total ?? 0} logins`} label="Create a login" onPress={() => router.push({ pathname: '/users/new', params: { kind } })} />}
    >
      <SegmentedControl
        label="Kind of login"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'staff', label: 'Staff' },
          { value: 'parent', label: 'Parents' },
          { value: 'student', label: 'Students' },
        ]}
      />
      <SearchBar label="Search logins" placeholder="Name, email or login ID" value={query} onChange={setQuery} onCancel={() => setQuery('')} />
      {logins.isPending ? (
        <CardSkeleton rows={5} />
      ) : logins.isError ? (
        <LoadFailed what="Logins" error={logins.error} onRetry={logins.refetch} />
      ) : rows.length ? (
        <ListGroup
          items={rows.map((login) => {
            const switchable = canSwitch && login._id !== staff.user?._id && login.isActive
            return {
              title: login.name || login.loginId,
              subtitle: [
                login.loginId,
                kind === 'staff' ? login.roles.map((role) => role.name).join(', ') : login.linkedStudents.map((link) => link.name).filter(Boolean).join(', '),
              ]
                .filter(Boolean)
                .join(' · '),
              lines: 2,
              avatar: <Avatar name={login.name || login.loginId} size={36} />,
              badge: loginBadge(login),
              accessory:
                switchable ? (
                  <MobileButton size="small" variant="tinted" loading={switchingId === login._id} disabled={Boolean(switchingId)} onPress={() => beginSwitch(login._id)}>
                    Switch
                  </MobileButton>
                ) : undefined,
              accessoryWidth: switchable ? switchWidth : undefined,
              onPress: () => router.push({ pathname: '/users/[id]', params: { id: login._id } }),
            }
          })}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={KeyRound} title={query.trim() ? 'No login found' : 'No logins yet'} body={query.trim() ? 'Check the spelling, or search by email.' : 'Create one for each person who signs in.'} />
        </Surface>
      )}
    </MobileScreen>
  )
}
