import { View } from 'react-native'

import { PasswordForm } from '@/components/PasswordForm'
import { useSession } from '@/session/SessionProvider'
import { space } from '@/theme/tokens'
import { MobileButton, MobileScreen, Surface, Text } from '@/ui'

/**
 * First sign-in with a password the school set: the API refuses everything else until the
 * login has its own password, so this screen stands between sign-in and the app.
 */
export default function SetPasswordScreen() {
  const session = useSession()

  return (
    <MobileScreen>
      <View style={{ gap: space['space-1'], paddingTop: space['space-8'] }}>
        <Text variant="m-large-title" accessibilityRole="header">
          Set your own password
        </Text>
        <Text variant="body-lg" tone="muted">
          Your school gave you a temporary password. Choose one only you know to continue.
        </Text>
      </View>
      <Surface>
        <PasswordForm currentLabel="Temporary password" submitLabel="Save password" onSaved={session.updateUser} />
      </Surface>
      <MobileButton variant="plain" fullWidth onPress={() => session.signOut()}>
        Sign out
      </MobileButton>
    </MobileScreen>
  )
}
