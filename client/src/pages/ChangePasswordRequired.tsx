import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Lock, ShieldCheck } from 'lucide-react'
import AuthLayout, { CardHeading } from '@/components/auth/capabble/AuthLayout'
import { Button, Callout, TextField } from '@/components/auth/capabble/controls'
import NewPasswordFields, { validateNewPassword, type NewPasswordErrors } from '@/components/auth/capabble/NewPasswordFields'
import { changePassword, logout, selectAuth } from '@/redux/slices/authSlice'
import { useAcademicSession } from '@/contexts/AcademicSessionContext'
import { enterStaffPanel, landingPathFor } from '@/utils/landing'
import type { AppDispatch } from '@/redux/store'

/**
 * Shown after signing in with a temporary password from the school. Nothing
 * else opens until a new password is set (the API enforces this too).
 */
const ChangePasswordRequired: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { user, loading } = useSelector(selectAuth)
  const { hasSession, setSession } = useAcademicSession()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<NewPasswordErrors & { current?: string }>({})
  const [generalError, setGeneralError] = useState<string | null>(null)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (loading) return
    if (!currentPassword) {
      setErrors({ current: 'Enter the temporary password from your school' })
      return
    }
    const fieldErrors = validateNewPassword(password, confirm)
    if (fieldErrors.password || fieldErrors.confirm) {
      setErrors(fieldErrors)
      return
    }
    setGeneralError(null)
    try {
      const result = await dispatch(changePassword({
        currentPassword,
        newPassword: password,
        confirmNewPassword: confirm,
      })).unwrap()
      const signedIn = result.data.user
      if (signedIn.kind === 'staff') navigate(await enterStaffPanel(setSession), { replace: true })
      else navigate(landingPathFor(signedIn, hasSession), { replace: true })
    } catch (message) {
      setGeneralError(String(message || 'Could not change the password. Try again.'))
    }
  }

  const who = user?.name || user?.email || user?.username || ''

  return (
    <AuthLayout
      layout="signin"
      headline={<>Make this account <span className="cb-auth-accent">yours.</span></>}
      subline="Your school gave you a temporary password. Choose your own to continue."
      card={
        <>
          <CardHeading icon={ShieldCheck}>A good password</CardHeading>
          <ul>
            <li>Is at least 8 characters, with upper and lower case letters, a number and a symbol</li>
            <li>Is 12 characters or more to be strong</li>
            <li>Isn&apos;t one you use on another website</li>
          </ul>
        </>
      }
    >
      <div className="cb-auth-head">
        <h1 className="cb-auth-title">Choose your password</h1>
        <p className="cb-auth-subtitle">
          {who ? <>Signed in as <strong>{who}</strong>. </> : null}
          Replace the temporary password before you continue.
        </p>
      </div>
      <form className="cb-auth-form" style={{ marginTop: 0 }} noValidate onSubmit={save}>
        <TextField
          id="current-password"
          label="Temporary password"
          icon={KeyRound}
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          error={errors.current}
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value)
            setErrors({})
          }}
          autoFocus
        />
        <NewPasswordFields
          password={password}
          confirm={confirm}
          onPasswordChange={(value) => {
            setPassword(value)
            setErrors({})
          }}
          onConfirmChange={(value) => {
            setConfirm(value)
            setErrors({})
          }}
          errors={errors}
          show={show}
          onShowChange={setShow}
        />
        {generalError ? <Callout>{generalError}</Callout> : null}
        <Button type="submit" icon={Lock} loading={loading} loadingLabel="Saving password">
          Save password and continue
        </Button>
      </form>
      <div className="cb-auth-back">
        <button
          type="button"
          className="cb-btn-link"
          onClick={async () => {
            await dispatch(logout())
            navigate('/login', { replace: true })
          }}
        >
          Sign out
        </button>
      </div>
    </AuthLayout>
  )
}

export default ChangePasswordRequired
