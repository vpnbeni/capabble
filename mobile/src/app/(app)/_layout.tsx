import { Stack } from 'expo-router'

import { PortalProvider } from '@/portal/PortalProvider'
import { useTheme } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'

/** Signed-in area: the tabs, with detail screens (a notice) pushed on top. */
export default function AppLayout() {
  const { colors } = useTheme()
  return (
    <PortalProvider>
      <ToastProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="notice/[id]" />
        </Stack>
      </ToastProvider>
    </PortalProvider>
  )
}
