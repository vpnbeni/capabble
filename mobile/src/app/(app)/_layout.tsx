import { House, Menu } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { Tabs } from 'expo-router/js-tabs'

import { BottomNav } from '@/ui'

// Tabs in order. Family tabs (Calendar, Fees, Notices) join here as their screens are built:
// four or five destinations at most, everything else under More.
const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  index: { label: 'Home', icon: House },
  more: { label: 'More', icon: Menu },
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigateToTab }) => (
        <BottomNav
          items={state.routes.map((route, index) => {
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
      <Tabs.Screen name="more" />
    </Tabs>
  )
}
