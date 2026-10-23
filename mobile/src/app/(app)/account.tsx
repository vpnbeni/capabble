import { useRouter } from 'expo-router'
import { KeyboardAvoidingView, Platform } from 'react-native'

import { PasswordForm } from '@/components/PasswordForm'
import { useSession } from '@/session/SessionProvider'
import { useTheme, type AppearancePreference } from '@/theme/ThemeProvider'
import { Card, DetailList, Screen, SegmentedControl, useToast } from '@/ui'

/** The signed-in parent's or student's own login: details and password. */
export default function AccountScreen() {
  const router = useRouter()
  const session = useSession()
  const toast = useToast()
  const { appearance, setAppearance } = useTheme()
  if (session.status !== 'signedIn') return null
  const { user, school } = session

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Screen title="Your login" onBack={router.back}>
        <Card title="Login details">
          <DetailList
            items={[
              { label: 'Name', value: user.displayName || user.name },
              { label: 'Signs in with', value: user.username ? `${user.username}@${school.slug}` : user.email },
            ]}
          />
        </Card>
        <Card title="Appearance" subtitle="Only on this phone.">
          <SegmentedControl<AppearancePreference>
            label="Theme"
            value={appearance}
            onChange={setAppearance}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </Card>
        <Card title="Change password" subtitle="You stay signed in here; other devices are signed out.">
          <PasswordForm
            currentLabel="Current password"
            submitLabel="Change password"
            onSaved={(updated) => {
              session.updateUser(updated)
              toast('Password changed. Other devices have been signed out.')
            }}
          />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  )
}
