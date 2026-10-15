import React, { useMemo } from 'react'
import { Lock } from 'lucide-react'
import { Checkbox, StrengthMeter, TextField } from './controls'
import { getPasswordStrength, MISMATCH_ERROR, meetsPasswordPolicy, PASSWORD_ERROR, PASSWORD_RULE } from './password'

export interface NewPasswordErrors {
  password?: string
  confirm?: string
}

/** Check a new password pair against the server's rule; returns field errors. */
export const validateNewPassword = (password: string, confirm: string): NewPasswordErrors => {
  if (!meetsPasswordPolicy(password)) return { password: PASSWORD_ERROR }
  if (password !== confirm) return { confirm: MISMATCH_ERROR }
  return {}
}

/** "New password" + "Confirm" + strength meter + show toggle, shared by invite and forced change. */
const NewPasswordFields: React.FC<{
  password: string
  confirm: string
  onPasswordChange: (value: string) => void
  onConfirmChange: (value: string) => void
  errors: NewPasswordErrors
  show: boolean
  onShowChange: (value: boolean) => void
}> = ({ password, confirm, onPasswordChange, onConfirmChange, errors, show, onShowChange }) => {
  const strength = useMemo(() => getPasswordStrength(password), [password])
  const type = show ? 'text' : 'password'

  return (
    <>
      <div>
        <TextField
          id="new-password"
          label="New password"
          icon={Lock}
          type={type}
          hint={PASSWORD_RULE}
          error={errors.password}
          autoComplete="new-password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
        {password ? (
          <div style={{ marginTop: 10 }}>
            <StrengthMeter level={strength} />
          </div>
        ) : null}
      </div>
      <TextField
        id="confirm-password"
        label="Confirm new password"
        icon={Lock}
        type={type}
        error={errors.confirm}
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => onConfirmChange(e.target.value)}
      />
      <div className="cb-auth-checks">
        <Checkbox label="Show passwords" checked={show} onChange={onShowChange} />
      </div>
    </>
  )
}

export default NewPasswordFields
