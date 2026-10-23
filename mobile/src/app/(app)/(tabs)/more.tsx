import Constants from 'expo-constants'
import { useRouter, type Href } from 'expo-router'
import type { LucideIcon } from 'lucide-react-native'
import { Bus, CalendarCheck, CalendarClock, CalendarDays, GraduationCap, KeyRound, UserRound } from 'lucide-react-native'
import { useState } from 'react'

import { usePortal } from '@/portal/PortalProvider'
import type { PortalSection } from '@/services/portalService'
import { useSession } from '@/session/SessionProvider'
import { Avatar, Card, Icon, ListRow, Screen, Text } from '@/ui'

const KIND_LABEL = { staff: 'Staff', parent: 'Parent', student: 'Student' } as const

type Entry = { href: Href; label: string; icon: LucideIcon; section: PortalSection }

// Everything the family portal has that isn't a tab, in the web portal's order.
const SCHOOL_ENTRIES: Entry[] = [
  { href: '/attendance', label: 'Attendance', icon: CalendarCheck, section: 'attendance' },
  { href: '/timetable', label: 'Timetable', icon: CalendarDays, section: 'timetable' },
  { href: '/results', label: 'Results', icon: GraduationCap, section: 'results' },
  { href: '/transport', label: 'Transport', icon: Bus, section: 'transport' },
  { href: '/meetings', label: 'Meetings', icon: CalendarClock, section: 'appointments' },
  { href: '/profile', label: 'Profile', icon: UserRound, section: 'profile' },
]

export default function MoreScreen() {
  const router = useRouter()
  const session = useSession()
  const { has } = usePortal()
  const [signingOut, setSigningOut] = useState(false)
  if (session.status !== 'signedIn') return null

  const { user, school } = session
  const name = user.displayName || user.name || user.email || user.username || 'Signed in'
  const entries = user.kind === 'staff' ? [] : SCHOOL_ENTRIES.filter((entry) => has(entry.section))

  return (
    <Screen title="More">
      {entries.length ? (
        <Card flush>
          {entries.map((entry, index) => (
            <ListRow
              key={entry.label}
              primary={entry.label}
              leading={<Icon icon={entry.icon} size={20} />}
              divider={index < entries.length - 1}
              onPress={() => router.push(entry.href)}
            />
          ))}
        </Card>
      ) : null}

      <Card title="Your login" flush>
        <ListRow
          primary={name}
          secondary={`${user.email || user.username || ''}${user.email || user.username ? ' · ' : ''}${KIND_LABEL[user.kind]}`}
          leading={<Avatar name={name} size={36} />}
          divider
        />
        {user.kind !== 'staff' ? (
          <ListRow primary="Password and appearance" leading={<Icon icon={KeyRound} size={20} />} divider onPress={() => router.push('/account')} />
        ) : null}
        <ListRow primary={school.name} secondary="School" lines={2} />
      </Card>

      <Card flush>
        <ListRow
          primary={signingOut ? 'Signing out…' : 'Sign out'}
          tone="danger"
          onPress={
            signingOut
              ? undefined
              : async () => {
                  setSigningOut(true)
                  await session.signOut()
                }
          }
        />
      </Card>

      <Text variant="caption" tone="subtle" style={{ textAlign: 'center' }}>
        Capabble {Constants.expoConfig?.version}
      </Text>
    </Screen>
  )
}
