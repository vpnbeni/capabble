import React, { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Clock, ShieldCheck } from 'lucide-react'
import AuthLayout, { CardHeading } from '@/components/auth/capabble/AuthLayout'
import { Button, Callout, LinkButton } from '@/components/auth/capabble/controls'
import NewPasswordFields, { validateNewPassword, type NewPasswordErrors } from '@/components/auth/capabble/NewPasswordFields'
import authService, { type InvitePreview } from '@/services/authService'
import { setSignedInUser } from '@/redux/slices/authSlice'
import { useAcademicSession } from '@/contexts/AcademicSessionContext'
import { enterStaffPanel, landingPathFor } from '@/utils/landing'
import Loader from '@/components/common/Loader'
import type { AppDispatch } from '@/redux/store'

const SCHOOL_CODE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * Invite link from the school: `#/accept-invite?school=<code>&token=<token>`.
 * The person chooses a password and is signed in. Links work once and expire.
 */
const AcceptInvite: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { hasSession, setSession } = useAcademicSession()
  const token = params.get('token') || ''
  const school = String(params.get('school') || '').toLowerCase()

  const [invite, setInvite] = useState<InvitePreview | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid'>('loading')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<NewPasswordErrors>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!token || !SCHOOL_CODE.test(school)) {
      setStatus('invalid')
      return
    }
    // The invite belongs to one school: send its code with every request.
    localStorage.setItem('tenantSlug', school)
    authService
      .previewInvite(token)
      .then((data) => {
        setInvite(data)
        setStatus('ready')
      })
      .catch(() => setStatus('invalid'))
  }, [school, token])

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    const fieldErrors = validateNewPassword(password, confirm)
    if (fieldErrors.password || fieldErrors.confirm) {
      setErrors(fieldErrors)
      return
    }
    setSaving(true)
    setGeneralError(null)
    try {
      const response = await authService.acceptInvite({ token, password, confirmPassword: confirm })
      const signedIn = { ...response.data.user, ...(response.data.billing ? { billing: response.data.billing } : {}) }
      dispatch(setSignedInUser(signedIn))
      if (signedIn.kind === 'staff') navigate(await enterStaffPanel(setSession), { replace: true })
      else navigate(landingPathFor(signedIn, hasSession), { replace: true })
    } catch (error: any) {
      if (error?.response?.data?.errorCode === 'invite_invalid') setStatus('invalid')
      else setGeneralError(error?.response?.data?.message || 'Could not set the password. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') return <Loader size="lg" fullScreen />

  const loginHint = invite?.username
    ? `${invite.username}@${school}`
    : invite?.email || ''

  return (
    <AuthLayout
      layout="signin"
      headline={<>Welcome to <span className="cb-auth-accent">{invite?.schoolName || 'your school'}.</span></>}
      subline="Choose a password to finish setting up your login."
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
      {status === 'invalid' ? (
        <div className="cb-auth-head" style={{ gap: 16, marginBottom: 0 }}>
          <span className="cb-auth-status-icon" data-tone="warning">
            <Clock size={24} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1 className="cb-auth-title">This invite link has expired</h1>
            <p className="cb-auth-subtitle">
              Invite links work once and expire after 3 days. Ask your school office to send a new one.
            </p>
          </div>
          <LinkButton to="/login" iconRight={ArrowRight}>
            Go to sign in
          </LinkButton>
        </div>
      ) : (
        <>
          <div className="cb-auth-head">
            <h1 className="cb-auth-title">Set your password</h1>
            <p className="cb-auth-subtitle">
              {invite?.name ? <>Hello {invite.name}. </> : null}
              You&apos;ll sign in with <strong>{loginHint}</strong>.
            </p>
          </div>
          <form className="cb-auth-form" style={{ marginTop: 0 }} noValidate onSubmit={save}>
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
            <Button type="submit" iconRight={ArrowRight} loading={saving} loadingLabel="Setting up">
              Set password and sign in
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  )
}

export default AcceptInvite
