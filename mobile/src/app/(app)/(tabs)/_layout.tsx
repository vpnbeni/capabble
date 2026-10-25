import { Tabs } from 'expo-router/js-tabs'
import type { LucideIcon } from 'lucide-react-native'
import { CalendarDays, House, LayoutGrid, Megaphone, Wallet } from 'lucide-react-native'

import { usePortal } from '@/portal/PortalProvider'
import type { PortalSection } from '@/services/portalService'
import { useSession } from '@/session/SessionProvider'
import { TabBar } from '@/ui'

// Tabs in order: four or five destinations at most, everything else under More.
// A tab with a `section` shows only when the school has turned that section on for this login.
const TABS: Record<string, { label: string; icon: LucideIcon; section?: PortalSection }> = {
  index: { label: 'Home', icon: House },
  calendar: { label: 'Calendar', icon: CalendarDays, section: 'calendar' },
  fees: { label: 'Fees', icon: Wallet, section: 'fees' },
  notices: { label: 'Notices', icon: Megaphone, section: 'notices' },
  more: { label: 'More', icon: LayoutGrid },
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
      // The TabBar floats over the screens (translucent); each tab screen passes `tabs` to MobileScreen.
      tabBar={({ state, navigateToTab }) => (
        <TabBar
          items={state.routes
            .map((route, index) => ({ route, index }))
            .filter(({ route }) => visible(route.name))
            .map(({ route, index }) => {
              const tab = TABS[route.name] ?? { label: route.name, icon: LayoutGrid }
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
      <Tabs.Screen name="more" />
    </Tabs>
  )
}
