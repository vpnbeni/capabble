import { useRef, useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { authService, passwordProblem, type User } from '@/services/authService'
import { space } from '@/theme/tokens'
import { Banner, Button, TextField, type TextFieldRef } from '@/ui'

type Errors = { current?: string; next?: string; confirm?: string; form?: string }

/**
 * Change the signed-in login's password (PUT /auth/change-password). Other devices are signed
 * out; this one gets fresh session cookies and the server's updated user.
 */
export function PasswordForm({
  currentLabel,
  submitLabel,
  onSaved,
}: {
  /** "Temporary password" on first sign-in, "Current password" otherwise. */
  currentLabel: string
  submitLabel: string
  onSaved: (user: User) => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const nextRef = useRef<TextFieldRef>(null)
  const confirmRef = useRef<TextFieldRef>(null)

  const save = async () => {
    const found: Errors = {}
    if (!current) found.current = `Enter your ${currentLabel.toLowerCase()}`
    const problem = passwordProblem(next)
    if (problem) found.next = problem
    else if (next === current) found.next = 'Choose a password different from the current one'
    if (!found.next && confirm !== next) found.confirm = "The passwords don't match"
    setErrors(found)
    if (Object.keys(found).length) return

    setSaving(true)
    try {
      const { user } = await authService.changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      onSaved(user)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Couldn't save your password. Try again."
      setErrors(/current password/i.test(message) ? { current: `This isn't your ${currentLabel.toLowerCase()}` } : { form: message })
    } finally {
      setSaving(false)
    }
  }

  const clear = (key: keyof Errors) => setErrors(({ [key]: _fixed, form: _form, ...rest }) => rest)

  return (
    <View style={{ gap: space['space-4'] }}>
      {errors.form ? <Banner tone="danger" title={errors.form} /> : null}
      <TextField
        label={currentLabel}
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
      <Button label={submitLabel} onPress={save} loading={saving} fullWidth />
    </View>
  )
}
