import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { KeyRound } from 'lucide-react-native'
import { useState } from 'react'

import { PORTAL_MODULES } from '@/portal/modules'
import { usePortal } from '@/portal/PortalProvider'
import { useSession } from '@/session/SessionProvider'
import { WEB_MODULES, webModulePath } from '@/staff/access'
import { openWebsite, useStaff } from '@/staff/useStaff'
import { ActionSheet, Avatar, ListGroup, MobileScreen, NavBar, ShortcutGrid } from '@/ui'

const KIND_LABEL = { staff: 'Staff', parent: 'Parent', student: 'Student' } as const

export default function MoreScreen() {
  const router = useRouter()
  const session = useSession()
  const { has, home } = usePortal()
  const staff = useStaff()
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  if (session.status !== 'signedIn') return null

  const { user, school } = session
  const name = user.displayName || user.name || user.email || user.username || 'Signed in'
  const children = home?.kind === 'parent' ? home.students.length : 0
  const isStaff = user.kind === 'staff'
  const roles = user.roles.map((role) => role.name).join(', ')
  const who = isStaff
    ? roles || KIND_LABEL.staff
    : [KIND_LABEL[user.kind], children ? `${children} ${children === 1 ? 'child' : 'children'}` : null].filter(Boolean).join(' · ')
  const modules = isStaff ? [] : PORTAL_MODULES.filter((module) => !module.tab && has(module.section))
  // Staff: the desk work stays on the website; each module opens the first page this login may see.
  const webModules = isStaff
    ? WEB_MODULES.map((module) => ({ module, path: webModulePath(module, staff) })).filter((entry) => entry.path)
    : []

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
            onPress: () => router.push('/account'),
          },
        ]}
      />
      {modules.length ? (
        <ShortcutGrid items={modules.map((module) => ({ label: module.label, icon: module.icon, tile: module.tile, onPress: () => router.push(module.href) }))} />
      ) : null}
      {webModules.length ? (
        <ListGroup
          header="On the website"
          footer="Opens in your browser. Sign in there with the same login."
          items={webModules.map(({ module, path }) => ({
            title: module.label,
            icon: module.icon,
            tile: module.tile,
            onPress: () => openWebsite(path as string),
          }))}
        />
      ) : null}
      <ListGroup items={[{ title: 'Your login', subtitle: 'Password and appearance', icon: KeyRound, tile: 4, onPress: () => router.push('/account') }]} />
      <ListGroup
        footer={`${school.name} · Capabble ${Constants.expoConfig?.version ?? ''}`.trim()}
        items={[{ title: signingOut ? 'Signing out…' : 'Sign out', tone: 'danger', onPress: signingOut ? undefined : () => setConfirmSignOut(true) }]}
      />
    </MobileScreen>
  )
}
