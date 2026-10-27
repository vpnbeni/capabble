import { useRouter } from 'expo-router'
import { KeyRound, UserPlus } from 'lucide-react-native'
import { useState } from 'react'

import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { LoginKind } from '@/services/usersService'
import { loginBadge } from '@/staff/loginUi'
import { useLogins } from '@/staff/userQueries'
import { ActionBar, Avatar, ListGroup, MobileScreen, NavBar, SearchBar, SegmentedControl, StatusView, Surface } from '@/ui'

/** Every login of the school: staff, parents and students. Administrators create and fix them here. */
export default function UsersScreen() {
  const router = useRouter()
  const [kind, setKind] = useState<LoginKind>('staff')
  const [query, setQuery] = useState('')
  const logins = useLogins(kind, query.trim())
  const rows = logins.data?.users ?? []

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
          items={rows.map((login) => ({
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
            onPress: () => router.push({ pathname: '/users/[id]', params: { id: login._id } }),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={KeyRound} title={query.trim() ? 'No login found' : 'No logins yet'} body={query.trim() ? 'Check the spelling, or search by email.' : 'Create one for each person who signs in.'} />
        </Surface>
      )}
    </MobileScreen>
  )
}
