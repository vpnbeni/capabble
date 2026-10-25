import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { ApiError } from '@/lib/api'
import { usePushNotifications } from '@/lib/usePushNotifications'
import { SessionProvider, useSession } from '@/session/SessionProvider'
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider'

SplashScreen.preventAutoHideAsync()

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // Don't retry what the server refused (signed out, no access); retry flaky networks twice.
        retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      },
    },
  })

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient)
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold })

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SessionProvider>{fontsLoaded ? <RootStack /> : null}</SessionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}

function RootStack() {
  const session = useSession()
  const { status } = session
  // A school-set temporary password must be replaced before the API serves anything else.
  const mustSetPassword = session.status === 'signedIn' && session.user.mustChangePassword
  const { scheme, colors, setSchoolColor } = useTheme()
  const schoolColor = session.status === 'signedIn' ? session.user.tenant?.brandColor || null : null

  usePushNotifications(status === 'signedIn' && !mustSetPassword ? session.user : null, session.school?.slug ?? null)

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hideAsync()
  }, [status])

  // The school's colour as the accent while signed in; Capabble blue on the sign-in screen.
  useEffect(() => setSchoolColor(schoolColor), [schoolColor, setSchoolColor])

  if (status === 'loading') return null

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={status === 'signedIn' && !mustSetPassword}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={mustSetPassword}>
          <Stack.Screen name="set-password" />
        </Stack.Protected>
        <Stack.Protected guard={status !== 'signedIn'}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  )
}
