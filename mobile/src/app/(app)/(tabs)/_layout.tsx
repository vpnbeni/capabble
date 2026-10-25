import { Tabs } from 'expo-router/js-tabs'
import type { LucideIcon } from 'lucide-react-native'
import { CalendarDays, ClipboardCheck, GraduationCap, House, LayoutGrid, ListChecks, Megaphone, Sun, Users, Wallet } from 'lucide-react-native'

import { usePortal } from '@/portal/PortalProvider'
import type { PortalSection } from '@/services/portalService'
import { useSession } from '@/session/SessionProvider'
import { STAFF_TABS, staffTabAllowed } from '@/staff/access'
import { useStaff } from '@/staff/useStaff'
import { TabBar } from '@/ui'

// Family tabs in order: four or five destinations at most, everything else under More.
// A tab with a `section` shows only when the school has turned that section on for this login.
const TABS: Record<string, { label: string; icon: LucideIcon; section?: PortalSection }> = {
  index: { label: 'Home', icon: House },
  calendar: { label: 'Calendar', icon: CalendarDays, section: 'calendar' },
  fees: { label: 'Fees', icon: Wallet, section: 'fees' },
  notices: { label: 'Notices', icon: Megaphone, section: 'notices' },
  more: { label: 'More', icon: LayoutGrid },
}

// Staff tabs: which ones a login gets comes from STAFF_TABS (by its permissions), in that order.
const STAFF_TAB_LOOK: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Today', icon: Sun },
  approvals: { label: 'Approvals', icon: ListChecks },
  students: { label: 'Students', icon: GraduationCap },
  classes: { label: 'Classes', icon: Users },
  registers: { label: 'Attendance', icon: ClipboardCheck },
  calendar: { label: 'Calendar', icon: CalendarDays },
  more: { label: 'More', icon: LayoutGrid },
}

export default function TabsLayout() {
  const session = useSession()
  const { has } = usePortal()
  const staff = useStaff()
  const isStaff = session.status === 'signedIn' && session.user.kind === 'staff'
  const staffTabs = staff.mode ? STAFF_TABS[staff.mode].filter((name) => staffTabAllowed(name, staff)) : []
  const visible = (name: string) => {
    if (isStaff) return staffTabs.includes(name)
    if (!TABS[name]) return false
    const section = TABS[name].section
    return !section || has(section)
  }
  const look = (name: string) => (isStaff ? STAFF_TAB_LOOK[name] : TABS[name]) ?? { label: name, icon: LayoutGrid }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      // The TabBar floats over the screens (translucent); each tab screen passes `tabs` to MobileScreen.
      tabBar={({ state, navigateToTab }) => (
        <TabBar
          items={state.routes
            .map((route, index) => ({ route, index }))
            .filter(({ route }) => visible(route.name))
            .sort((a, b) => (isStaff ? staffTabs.indexOf(a.route.name) - staffTabs.indexOf(b.route.name) : 0))
            .map(({ route, index }) => {
              const tab = look(route.name)
              return {
                label: tab.label,
                icon: tab.icon,
                active: state.index === index,
                onPress: () => navigateToTab(route.key),
              }
            })}
        />
      )}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="fees" />
      <Tabs.Screen name="notices" />
      <Tabs.Screen name="approvals" />
      <Tabs.Screen name="students" />
      <Tabs.Screen name="classes" />
      <Tabs.Screen name="registers" />
      <Tabs.Screen name="more" />
    </Tabs>
  )
}
