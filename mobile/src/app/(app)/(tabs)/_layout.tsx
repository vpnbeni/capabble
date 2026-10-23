import { Tabs } from 'expo-router/js-tabs'
import type { LucideIcon } from 'lucide-react-native'
import { Bell, CalendarRange, House, IndianRupee, Menu } from 'lucide-react-native'

import { usePortal } from '@/portal/PortalProvider'
import type { PortalSection } from '@/services/portalService'
import { useSession } from '@/session/SessionProvider'
import { BottomNav } from '@/ui'

// Tabs in order: four or five destinations at most, everything else under More.
// A tab with a `section` shows only when the school has turned that section on for this login.
const TABS: Record<string, { label: string; icon: LucideIcon; section?: PortalSection }> = {
  index: { label: 'Home', icon: House },
  calendar: { label: 'Calendar', icon: CalendarRange, section: 'calendar' },
  fees: { label: 'Fees', icon: IndianRupee, section: 'fees' },
  notices: { label: 'Notices', icon: Bell, section: 'notices' },
  more: { label: 'More', icon: Menu },
}

export default function TabsLayout() {
  const session = useSession()
  const { has } = usePortal()
  const isStaff = session.status === 'signedIn' && session.user.kind === 'staff'
  const visible = (name: string) => {
    const section = TABS[name]?.section
    return !section || (!isStaff && has(section))
  }

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigateToTab }) => (
        <BottomNav
          items={state.routes
            .map((route, index) => ({ route, index }))
            .filter(({ route }) => visible(route.name))
            .map(({ route, index }) => {
              const tab = TABS[route.name] ?? { label: route.name, icon: Menu }
              return {
                key: route.key,
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
      <Tabs.Screen name="more" />
    </Tabs>
  )
}
