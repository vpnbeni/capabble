import { useRef, useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { ApiError } from '@/lib/api'
import { authService, isEmail, schoolCodeFromLoginId, type School } from '@/services/authService'
import { useSession } from '@/session/SessionProvider'
import { useTheme } from '@/theme/ThemeProvider'
import { space } from '@/theme/tokens'
import { Banner, Button, Text, TextField, type TextFieldRef } from '@/ui'

type Errors = { identifier?: string; password?: string; schoolCode?: string; form?: string }

export default function SignInScreen() {
  const { colors } = useTheme()
  const session = useSession()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [schoolCode, setSchoolCode] = useState('')
  const [askSchoolCode, setAskSchoolCode] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const passwordRef = useRef<TextFieldRef>(null)

  // Which school to sign in to: the email's school, the code in a login ID (2024017@dps),
  // the code typed in, or the school remembered from last time.
  const findSchool = async (): Promise<School | null> => {
    const id = identifier.trim()
    if (isEmail(id)) {
      try {
        return await authService.resolveSchoolByEmail(id)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          setErrors({ identifier: "We couldn't find a school for this email. Check it, or ask your school office." })
          return null
        }
        if (error instanceof ApiError && error.status === 400) {
          setErrors({ identifier: 'Check the email address: it is not complete' })
          return null
        }
        throw error
      }
    }
    const code = schoolCodeFromLoginId(id) || schoolCode.trim().toLowerCase()
    if (code) return { slug: code, name: code }
    if (session.school) return session.school
    setAskSchoolCode(true)
    setErrors({ schoolCode: 'Enter your school code' })
    return null
  }

  const submit = async () => {
    const next: Errors = {}
    if (!identifier.trim()) next.identifier = 'Enter your email or login ID'
    if (!password) next.password = 'Enter your password'
    setErrors(next)
    if (next.identifier || next.password) return

    setSubmitting(true)
    try {
      const school = await findSchool()
      if (school) await session.signIn(school, identifier, password)
    } catch (error) {
      setErrors({ form: error instanceof ApiError ? error.message : "Couldn't sign in. Try again." })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Image source={require('@/assets/splash-icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
            <Text variant="section-title" accessibilityRole="header">
              Sign in
            </Text>
            <Text variant="body" tone="muted" style={{ textAlign: 'center' }}>
              Use the email or login ID your school gave you.
            </Text>
          </View>

          <View style={[styles.form, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {session.school && !askSchoolCode ? (
              <View style={styles.schoolRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="caption" tone="muted">
                    School
                  </Text>
                  <Text variant="body-lg" numberOfLines={2}>
                    {session.school.name}
                  </Text>
                </View>
                <Button label="Change school" variant="tertiary" onPress={() => session.forgetSchool()} />
              </View>
            ) : null}

            {errors.form ? <Banner tone="danger" title={errors.form} /> : null}

            <TextField
              label="Email or login ID"
              value={identifier}
              onChangeText={(value) => {
                setIdentifier(value)
                setErrors(({ identifier: _fixed, ...rest }) => rest)
              }}
              error={errors.identifier}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />

            {askSchoolCode ? (
              <TextField
                label="School code"
                hint="Your school office can tell you this."
                value={schoolCode}
                onChangeText={(value) => {
                  setSchoolCode(value)
                  setErrors(({ schoolCode: _fixed, ...rest }) => rest)
                }}
                error={errors.schoolCode}
                autoCapitalize="none"
                autoCorrect={false}
              />
            ) : null}

            <TextField
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={(value) => {
                setPassword(value)
                setErrors(({ password: _fixed, ...rest }) => rest)
              }}
              error={errors.password}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
            />

            <Button label="Sign in" onPress={submit} loading={submitting} fullWidth />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: space['space-4'], gap: space['space-6'] },
  brand: { alignItems: 'center', gap: space['space-2'] },
  logo: { width: 56, height: 56, marginBottom: space['space-2'] },
  form: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: space['space-4'],
    gap: space['space-4'],
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  schoolRow: { flexDirection: 'row', alignItems: 'center', gap: space['space-3'] },
})
