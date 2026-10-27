import Constants from 'expo-constants'
import { useRouter } from 'expo-router'
import { Award, CalendarClock, CalendarRange, ClipboardList, CalendarDays, CalendarOff, Contact, HeartPulse, KeyRound, NotebookPen, UserCheck, Users } from 'lucide-react-native'
import { useState } from 'react'

import { PORTAL_MODULES } from '@/portal/modules'
import { usePortal } from '@/portal/PortalProvider'
import { useSession } from '@/session/SessionProvider'
import { WEB_MODULES, isFrontDesk, isMeetingHost, webModulePath } from '@/staff/access'
import { clearAttendanceQueue, useAttendanceQueue } from '@/staff/attendanceQueue'
import { openWebsite, useStaff } from '@/staff/useStaff'
import { ActionSheet, Avatar, ListGroup, MobileScreen, NavBar, ShortcutGrid } from '@/ui'

const KIND_LABEL = { staff: 'Staff', parent: 'Parent', student: 'Student' } as const

export default function MoreScreen() {
  const router = useRouter()
  const session = useSession()
  const { has, home } = usePortal()
  const staff = useStaff()
  const unsent = useAttendanceQueue().length
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
  // Staff places in the app that aren't tabs.
  const staffShortcuts = [
    ...(isStaff && user.teacher ? [{ label: 'Timetable', icon: CalendarClock, tile: 4 as const, onPress: () => router.push('/timetable') }] : []),
    ...(isStaff && staff.canUse('clndr_events') && (staff.can('clndr.events.create') || staff.can('clndr.events.manage'))
      ? [{ label: 'Events', icon: CalendarDays, tile: 1 as const, onPress: () => router.push('/events') }]
      : []),
    ...(isStaff && staff.can('core.schooldays.write')
      ? [{ label: 'School days', icon: CalendarOff, tile: 1 as const, onPress: () => router.push('/school-days') }]
      : []),
    ...(isStaff && (staff.canUse('timetable_class_wise') || staff.canUse('timetable_teacher_wise'))
      ? [{ label: 'Timetables', icon: CalendarRange, tile: 4 as const, onPress: () => router.push('/timetables') }]
      : []),
    ...(isStaff && (isMeetingHost(staff) || isFrontDesk(staff)) ? [{ label: 'Meetings', icon: Users, tile: 2 as const, onPress: () => router.push('/meetings') }] : []),
    ...(isStaff && staff.canUse('acdmc_academics') && staff.can('acdmc.classwork.write')
      ? [
          { label: 'Homework', icon: NotebookPen, tile: 4 as const, onPress: () => router.push('/homework') },
          { label: 'Assignments', icon: ClipboardList, tile: 4 as const, onPress: () => router.push({ pathname: '/homework', params: { kind: 'assignment' } }) },
        ]
      : []),
    ...(isStaff && staff.canUse('exmcl_result') && staff.can('exam.results.write')
      ? [{ label: 'Marks', icon: Award, tile: 6 as const, onPress: () => router.push('/marks') }]
      : []),
    ...(isStaff && staff.canUse('mdcl_clinic')
      ? [{ label: 'Clinic', icon: HeartPulse, tile: 5 as const, onPress: () => router.push('/clinic') }]
      : []),
    ...(isStaff && staff.canUse('staaf_staff_members')
      ? [{ label: 'Staff', icon: Contact, tile: 2 as const, onPress: () => router.push('/staff-directory') }]
      : []),
    ...(isStaff && staff.canUse('attnd_staff_attendance')
      ? [{ label: 'Staff attendance', icon: UserCheck, tile: 5 as const, onPress: () => router.push('/staff-attendance') }]
      : []),
  ]
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
          message={
            unsent
              ? `${unsent === 1 ? '1 register' : `${unsent} registers`} saved on this phone ${unsent === 1 ? "hasn't" : "haven't"} reached school yet. Signing out deletes ${unsent === 1 ? 'it' : 'them'}.`
              : undefined
          }
          actions={[
            {
              label: 'Sign out',
              tone: 'danger',
              onSelect: async () => {
                setSigningOut(true)
                await clearAttendanceQueue()
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
      {staffShortcuts.length ? <ShortcutGrid items={staffShortcuts} /> : null}
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
