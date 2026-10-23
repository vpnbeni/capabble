import { useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ApiError } from '@/lib/api'
import { authService, passwordProblem } from '@/services/authService'
import { useSession } from '@/session/SessionProvider'
import { useTheme } from '@/theme/ThemeProvider'
import { radius, space } from '@/theme/tokens'
import { Banner, Button, Text, TextField, type TextFieldRef } from '@/ui'

type Errors = { current?: string; next?: string; confirm?: string; form?: string }

/**
 * First sign-in with a password the school set: the API refuses everything else until the
 * login has its own password, so this screen stands between sign-in and the app.
 */
export default function SetPasswordScreen() {
  const { colors } = useTheme()
  const session = useSession()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const nextRef = useRef<TextFieldRef>(null)
  const confirmRef = useRef<TextFieldRef>(null)

  const save = async () => {
    const found: Errors = {}
    if (!current) found.current = 'Enter the password your school gave you'
    const problem = passwordProblem(next)
    if (problem) found.next = problem
    else if (next === current) found.next = 'Choose a password different from the one your school gave you'
    if (!found.next && confirm !== next) found.confirm = "The passwords don't match"
    setErrors(found)
    if (Object.keys(found).length) return

    setSaving(true)
    try {
      const { user } = await authService.changePassword(current, next)
      session.updateUser(user)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Couldn't save your password. Try again."
      setErrors(/current password/i.test(message) ? { current: 'This is not the password your school gave you' } : { form: message })
    } finally {
      setSaving(false)
    }
  }

  const clear = (key: keyof Errors) => setErrors(({ [key]: _fixed, form: _form, ...rest }) => rest)

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
            {errors.form ? <Banner tone="danger" title={errors.form} /> : null}
            <TextField
              label="Temporary password"
              value={current}
              onChangeText={(value) => {
                setCurrent(value)
                clear('current')
              }}
              error={errors.current}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="next"
              onSubmitEditing={() => nextRef.current?.focus()}
            />
            <TextField
              ref={nextRef}
              label="New password"
              hint="At least 8 characters, with capital and small letters, a number and a symbol."
              value={next}
              onChangeText={(value) => {
                setNext(value)
                clear('next')
              }}
              error={errors.next}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
            />
            <TextField
              ref={confirmRef}
              label="Type the new password again"
              value={confirm}
              onChangeText={(value) => {
                setConfirm(value)
                clear('confirm')
              }}
              error={errors.confirm}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="go"
              onSubmitEditing={save}
            />
            <Button label="Save password" onPress={save} loading={saving} fullWidth />
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
    gap: space['space-4'],
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
})
