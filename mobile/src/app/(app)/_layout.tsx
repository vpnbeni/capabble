import { Stack } from 'expo-router'

import { PortalProvider } from '@/portal/PortalProvider'
import { useSession } from '@/session/SessionProvider'
import { AttendanceSync } from '@/staff/AttendanceSync'
import { useTheme } from '@/theme/ThemeProvider'
import { ToastProvider } from '@/ui'

/** Signed-in area: the tabs, with detail screens (a notice) pushed on top. */
export default function AppLayout() {
  const { colors } = useTheme()
  const session = useSession()
  const isStaff = session.status === 'signedIn' && session.user.kind === 'staff'
  return (
    <PortalProvider>
      <ToastProvider>
        {isStaff ? <AttendanceSync /> : null}
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="notice/[id]" />
          <Stack.Screen name="fee-payment/[orderId]" />
          <Stack.Screen name="roll-call" />
          <Stack.Screen name="event-new" />
          <Stack.Screen name="school-attendance" />
          <Stack.Screen name="fee-collection" />
          <Stack.Screen name="class-roster" />
          <Stack.Screen name="student/[id]" />
          <Stack.Screen name="notifications" />
        </Stack>
      </ToastProvider>
    </PortalProvider>
  )
}
