import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, KeyRound, LayoutGrid, Lock, Mail, RefreshCw } from 'lucide-react'
import { clearError, login, selectAuth, setSignedInUser } from '../redux/slices/authSlice'
import authService, { schoolCodeFromLoginId } from '../services/authService'
import { useAcademicSession } from '../contexts/AcademicSessionContext'
import { getRememberPreference, setRememberPreference } from '../utils/authStorage'
import { enterStaffPanel, landingPathFor } from '../utils/landing'
import { resolveTenantSlug } from '../utils/tenantRuntime'
import type { AppDispatch } from '../redux/store'
import type { LoginCredentials, User } from '../types/auth'
import Loader from '../components/common/Loader'
import AuthLayout, { CardHeading } from '../components/auth/capabble/AuthLayout'
import { Badge, Button, Callout, Checkbox, TextField } from '../components/auth/capabble/controls'

const syncTenantInUrl = (tenantSlug: string | null) => {
  const url = new URL(window.location.href)

  if (tenantSlug) {
    url.searchParams.set('tenant', tenantSlug)
  } else {
    url.searchParams.delete('tenant')
  }

  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

const Login: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false)
  const [resolvingTenant, setResolvingTenant] = useState(false)
  const [rememberMe, setRememberMe] = useState<boolean>(getRememberPreference())
  const [tenantLookupError, setTenantLookupError] = useState<string | null>(null)
  const [schoolCode, setSchoolCode] = useState('')
  const [showSchoolCode, setShowSchoolCode] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [formData, setFormData] = useState<LoginCredentials>({
    email: '',
    password: '',
  })

  // Email verification flow
  const [verifyEmailStep, setVerifyEmailStep] = useState(false)
  const [verifyOtp, setVerifyOtp] = useState('')
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [verifySuccessMessage, setVerifySuccessMessage] = useState<string | null>(null)

  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { loading, error, isAuthenticated, user } = useSelector(selectAuth)
  const { hasSession, setSession } = useAcademicSession()

  useEffect(() => {
    if (isAuthenticated && !resolvingTenant) {
      navigate(landingPathFor(user, hasSession))
    }
  }, [hasSession, isAuthenticated, navigate, resolvingTenant, user])

  /** After any successful sign-in: parents/students to the portal, staff into a session. */
  const goToLanding = async (signedIn: User) => {
    if (signedIn.mustChangePassword || signedIn.kind !== 'staff') {
      navigate(landingPathFor(signedIn, hasSession), { replace: true })
      return
    }
    navigate(await enterStaffPanel(setSession), { replace: true })
  }

  useEffect(() => {
    return () => {
      dispatch(clearError())
    }
  }, [dispatch])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setTenantLookupError(null)
    setFieldErrors({})
    dispatch(clearError())
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSchoolCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSchoolCode(e.target.value)
    setTenantLookupError(null)
    dispatch(clearError())
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()

    const identifier = String(formData.email || '').trim().toLowerCase()
    const password = String(formData.password || '')

    if (resolvingTenant || loading) {
      return
    }
    if (!identifier || !password) {
      setFieldErrors(!identifier ? { email: 'Enter your email or login ID' } : { password: 'Enter your password' })
      requestAnimationFrame(() => document.getElementById(!identifier ? 'email' : 'password')?.focus())
      return
    }

    try {
      setTenantLookupError(null)
      dispatch(clearError())
      setResolvingTenant(true)

      const loginIdSchool = schoolCodeFromLoginId(identifier)
      if (loginIdSchool) {
        // Student login ID such as 2024017@springdale: the school code is after the @.
        localStorage.setItem('tenantSlug', loginIdSchool)
        syncTenantInUrl(loginIdSchool)
      } else if (identifier.includes('@')) {
        const tenant = await authService.resolveTenantByEmail(identifier)
        localStorage.setItem('tenantSlug', tenant.slug)
        syncTenantInUrl(tenant.slug)
      } else {
        // Bare login ID: use the school this browser knows, or ask for the school code.
        const code = schoolCode.trim().toLowerCase() || resolveTenantSlug()
        if (!code) {
          setShowSchoolCode(true)
          setTenantLookupError('Enter your school code, or sign in with your full login ID (for example 2024017@springdale).')
          return
        }
        localStorage.setItem('tenantSlug', code)
        syncTenantInUrl(code)
      }

      setRememberPreference(rememberMe)
      const result = await dispatch(login({ email: identifier, password })).unwrap()
      await goToLanding(result.data.user)
    } catch (loginError: any) {
      const errorCode = loginError?.response?.data?.errorCode
      const message =
        loginError?.response?.data?.message
        || (loginError as Error)?.message
        || 'Login failed. Check your credentials and try again.'

      if (errorCode === 'email_not_verified') {
        setVerifyEmailStep(true)
        setVerifyError(null)
        setVerifySuccessMessage('We sent a 6-digit code to your email address.')
      } else {
        setTenantLookupError(message)
      }
      console.error('Login failed:', loginError)
    } finally {
      setResolvingTenant(false)
    }
  }

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = String(formData.email || '').trim().toLowerCase()
    const normalizedOtp = verifyOtp.trim()

    if (!email || verifyLoading) return
    if (!/^\d{6}$/.test(normalizedOtp)) {
      setVerifyError('Enter the 6-digit code from the email.')
      document.getElementById('verifyOtp')?.focus()
      return
    }

    setVerifyLoading(true)
    setVerifyError(null)
    setVerifySuccessMessage(null)

    try {
      const response = await authService.verifyEmail(email, normalizedOtp)
      const signedIn = { ...response.data.user, ...(response.data.billing ? { billing: response.data.billing } : {}) }
      dispatch(setSignedInUser(signedIn))
      await goToLanding(signedIn)
    } catch (err: any) {
      const code = err?.response?.data?.errorCode
      const msg = err?.response?.data?.message || 'Verification failed. Please try again.'
      if (code === 'otp_attempts_exceeded' || code === 'otp_expired' || code === 'otp_not_requested') {
        setVerifyError(msg + ' Send a new code and try again.')
      } else {
        setVerifyError(msg)
      }
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleResendVerification = async () => {
    const email = String(formData.email || '').trim().toLowerCase()
    if (!email || resendLoading) return

    setResendLoading(true)
    setVerifyError(null)
    setVerifySuccessMessage(null)

    try {
      await authService.resendEmailVerificationOtp(email)
      setVerifyOtp('')
      setVerifySuccessMessage('We sent a new 6-digit code to your email address.')
    } catch (err: any) {
      setVerifyError(err?.response?.data?.message || 'Could not resend code. Please try again.')
    } finally {
      setResendLoading(false)
    }
  }

  const activeError = tenantLookupError || error
  const busy = loading || resolvingTenant

  if (loading) {
    return <Loader />
  }

  return (
    <AuthLayout
      layout="signin"
      headline={
        <>
          One account for every <span className="cb-auth-accent">module.</span>
        </>
      }
      subline="Attendance, exams, fees and the exam centre all open with the same sign-in."
      card={
        <>
          <CardHeading icon={LayoutGrid}>Modules on this account</CardHeading>
          <div className="cb-auth-badges">
            {['Students', 'Attendance', 'Exams', 'Exam centre', 'Finance', 'Timetable'].map((m) => (
              <Badge key={m}>{m}</Badge>
            ))}
            <Badge tone="info">+6 more</Badge>
          </div>
          <p>Your school chooses which modules are turned on.</p>
        </>
      }
    >
      {verifyEmailStep ? (
        <>
          <div className="cb-auth-head">
            <h1 className="cb-auth-title">Confirm your email</h1>
            <p className="cb-auth-subtitle">
              Enter the 6-digit code we sent to <strong>{formData.email}</strong>.
            </p>
          </div>

          <form className="cb-auth-form" style={{ marginTop: 0 }} noValidate onSubmit={handleVerifyEmail}>
            {verifySuccessMessage && !verifyError ? <Callout tone="success">{verifySuccessMessage}</Callout> : null}
            <TextField
              id="verifyOtp"
              label="Verification code"
              icon={KeyRound}
              code
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              hint="6 digits"
              error={verifyError}
              value={verifyOtp}
              onChange={(e) => {
                setVerifyOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                setVerifyError(null)
              }}
              autoFocus
            />
            <Button type="submit" iconRight={ArrowRight} loading={verifyLoading} loadingLabel="Verifying">
              Verify and sign in
            </Button>
            <Button variant="secondary" icon={RefreshCw} onClick={handleResendVerification} loading={resendLoading} loadingLabel="Sending">
              Send a new code
            </Button>
          </form>

          <div className="cb-auth-back">
            <button
              type="button"
              className="cb-btn-link"
              onClick={() => {
                setVerifyEmailStep(false)
                setVerifyOtp('')
                setVerifyError(null)
                setVerifySuccessMessage(null)
              }}
            >
              Back to sign in
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="cb-auth-head">
            <h1 className="cb-auth-title">Sign in to Capabble</h1>
            <p className="cb-auth-subtitle">
              Staff and parents sign in with their email. Students use the login ID from their school.
            </p>
          </div>

          <form className="cb-auth-form" style={{ marginTop: 0 }} noValidate onSubmit={handleLogin}>
            <TextField
              id="email"
              name="email"
              label="Email or login ID"
              icon={Mail}
              placeholder="name@yourschool.in or 2024017@school"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              error={fieldErrors.email}
              value={formData.email}
              onChange={handleInputChange}
            />

            {showSchoolCode ? (
              <TextField
                id="schoolCode"
                name="schoolCode"
                label="School code"
                icon={Building2}
                placeholder="e.g. springdale"
                hint="The code your school gave you with your login ID."
                autoCapitalize="none"
                value={schoolCode}
                onChange={handleSchoolCodeChange}
                autoFocus
              />
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <TextField
                id="password"
                name="password"
                label="Password"
                icon={Lock}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                error={fieldErrors.password}
                value={formData.password}
                onChange={handleInputChange}
              />
              <div className="cb-auth-row">
                <Checkbox label="Show password" checked={showPassword} onChange={setShowPassword} />
                <Link to="/forgot-password">Forgot password?</Link>
              </div>
            </div>

            <Checkbox
              label="Keep me signed in on this device"
              description="Don't use this on a shared computer."
              checked={rememberMe}
              onChange={setRememberMe}
            />

            {activeError ? <Callout>{activeError}</Callout> : null}

            <Button type="submit" iconRight={ArrowRight} loading={busy} loadingLabel="Signing in">
              Sign in
            </Button>
          </form>

          <p className="cb-auth-alt">
            New school on Capabble? <Link to="/signup">Create a workspace account</Link>
          </p>
        </>
      )}
    </AuthLayout>
  )
}

export default Login
