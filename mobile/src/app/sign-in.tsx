import { useRef, useState } from 'react'
import { Image, StyleSheet, View } from 'react-native'

import { ApiError } from '@/lib/api'
import { authService, isEmail, schoolCodeFromLoginId, type School } from '@/services/authService'
import { useSession } from '@/session/SessionProvider'
import { useTheme } from '@/theme/ThemeProvider'
import { radius, space } from '@/theme/tokens'
import { Callout, ListGroup, MobileButton, MobileScreen, MobileTextField, Text, type MobileTextFieldRef } from '@/ui'

type Errors = { identifier?: string; password?: string; schoolCode?: string; form?: string }

export default function SignInScreen() {
  const { colors, shadows } = useTheme()
  const session = useSession()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [schoolCode, setSchoolCode] = useState('')
  const [askSchoolCode, setAskSchoolCode] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const passwordRef = useRef<MobileTextFieldRef>(null)

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
    <MobileScreen>
      <View style={styles.brand}>
        <View style={[styles.logoTile, { backgroundColor: colors.surface, boxShadow: shadows['shadow-card-m'] }]}>
          <Image source={require('@/assets/splash-icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
        </View>
        <View style={{ gap: space['space-1'] }}>
          <Text variant="m-large-title" accessibilityRole="header">
            Sign in
          </Text>
          <Text variant="body-lg" tone="muted">
            Use the email or login ID your school gave you.
          </Text>
        </View>
      </View>

      <View style={styles.form}>
        {session.school && !askSchoolCode ? (
          <ListGroup
            items={[
              {
                title: session.school.name,
                subtitle: 'School',
                lines: 2,
                accessory: (
                  <MobileButton variant="plain" size="medium" onPress={() => session.forgetSchool()}>
                    Change
                  </MobileButton>
                ),
              },
            ]}
          />
        ) : null}

        {errors.form ? <Callout tone="danger" title={errors.form} /> : null}

        <MobileTextField
          label="Email or login ID"
          type="email"
          value={identifier}
          onChangeText={(value) => {
            setIdentifier(value)
            setErrors(({ identifier: _fixed, ...rest }) => rest)
          }}
          error={errors.identifier}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        {askSchoolCode ? (
          <MobileTextField
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

        <MobileTextField
          ref={passwordRef}
          label="Password"
          type="password"
          value={password}
          onChangeText={(value) => {
            setPassword(value)
            setErrors(({ password: _fixed, ...rest }) => rest)
          }}
          error={errors.password}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />

        <MobileButton fullWidth loading={submitting} onPress={submit}>
          Sign in
        </MobileButton>
      </View>

      <Text variant="label" tone="muted" style={{ textAlign: 'center' }}>
        No login yet? Ask your school office.
      </Text>
    </MobileScreen>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  brand: { gap: space['space-4'], paddingTop: space['space-8'] },
  logoTile: { width: 64, height: 64, borderRadius: radius['radius-tile'] + 4, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 44, height: 44 },
  form: { gap: space['space-4'], width: '100%', maxWidth: 440, alignSelf: 'center' },
})
