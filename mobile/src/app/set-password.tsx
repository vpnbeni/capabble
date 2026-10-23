import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { PasswordForm } from '@/components/PasswordForm'
import { useSession } from '@/session/SessionProvider'
import { useTheme } from '@/theme/ThemeProvider'
import { radius, space } from '@/theme/tokens'
import { Button, Text } from '@/ui'

/**
 * First sign-in with a password the school set: the API refuses everything else until the
 * login has its own password, so this screen stands between sign-in and the app.
 */
export default function SetPasswordScreen() {
  const { colors } = useTheme()
  const session = useSession()

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={{ gap: space['space-2'] }}>
            <Text variant="section-title" accessibilityRole="header">
              Set your own password
            </Text>
            <Text variant="body" tone="muted">
              Your school gave you a temporary password. Choose one only you know to continue.
            </Text>
          </View>

          <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <PasswordForm currentLabel="Temporary password" submitLabel="Save password" onSaved={session.updateUser} />
          </View>

          <Button label="Sign out" variant="tertiary" onPress={() => session.signOut()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: space['space-4'], gap: space['space-6'] },
  form: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius['radius-lg'],
    padding: space['space-4'],
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
})
