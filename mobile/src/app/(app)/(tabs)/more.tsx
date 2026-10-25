import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { KeyRound } from 'lucide-react-native'
import { useState } from 'react'

import { PORTAL_MODULES } from '@/portal/modules'
import { usePortal } from '@/portal/PortalProvider'
import { useSession } from '@/session/SessionProvider'
import { ActionSheet, Avatar, ListGroup, MobileScreen, NavBar, ShortcutGrid } from '@/ui'

const KIND_LABEL = { staff: 'Staff', parent: 'Parent', student: 'Student' } as const

export default function MoreScreen() {
  const router = useRouter()
  const session = useSession()
  const { has, home } = usePortal()
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  if (session.status !== 'signedIn') return null

  const { user, school } = session
  const name = user.displayName || user.name || user.email || user.username || 'Signed in'
  const children = home?.kind === 'parent' ? home.students.length : 0
  const who = [KIND_LABEL[user.kind], children ? `${children} ${children === 1 ? 'child' : 'children'}` : null].filter(Boolean).join(' · ')
  const modules = user.kind === 'staff' ? [] : PORTAL_MODULES.filter((module) => !module.tab && has(module.section))

  return (
    <MobileScreen
      tabs
      nav={<NavBar large title="More" />}
      overlay={
        <ActionSheet
          open={confirmSignOut}
          onClose={() => setConfirmSignOut(false)}
          title="Sign out of Capabble on this phone?"
          actions={[
            {
              label: 'Sign out',
              tone: 'danger',
              onSelect: async () => {
                setSigningOut(true)
                await session.signOut()
              },
            },
          ]}
        />
      }
    >
      <ListGroup
        items={[
          {
            title: name,
            subtitle: who,
            avatar: <Avatar name={name} size={48} />,
            onPress: user.kind !== 'staff' ? () => router.push('/account') : undefined,
          },
        ]}
      />
      {modules.length ? (
        <ShortcutGrid items={modules.map((module) => ({ label: module.label, icon: module.icon, tile: module.tile, onPress: () => router.push(module.href) }))} />
      ) : null}
      {user.kind !== 'staff' ? (
        <ListGroup items={[{ title: 'Your login', subtitle: 'Password and appearance', icon: KeyRound, tile: 4, onPress: () => router.push('/account') }]} />
      ) : null}
      <ListGroup
        footer={`${school.name} · Capabble ${Constants.expoConfig?.version ?? ''}`.trim()}
        items={[{ title: signingOut ? 'Signing out…' : 'Sign out', tone: 'danger', onPress: signingOut ? undefined : () => setConfirmSignOut(true) }]}
      />
    </MobileScreen>
  )
}
