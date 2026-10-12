import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, KeyRound, LayoutGrid, Lock, Mail, RefreshCw } from 'lucide-react'
import { clearError, login, selectAuth, setCredentials } from '../redux/slices/authSlice'
import authService from '../services/authService'
import { useAcademicSession } from '../contexts/AcademicSessionContext'
import sessionService from '../services/sessionService'
import { getRememberPreference, persistAuthData, setRememberPreference } from '../utils/authStorage'
import { resolveTenantSlug } from '../utils/tenantRuntime'
import type { AppDispatch } from '../redux/store'
import type { LoginCredentials } from '../types/auth'
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
  const { loading, error, isAuthenticated } = useSelector(selectAuth)
  const { hasSession, setSession } = useAcademicSession()

  useEffect(() => {
    if (isAuthenticated && !resolvingTenant) {
      navigate(hasSession ? '/dashboard' : '/select-session')
    }
  }, [hasSession, isAuthenticated, navigate, resolvingTenant])

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
      setFieldErrors(!identifier ? { email: 'Enter your email or username' } : { password: 'Enter your password' })
      requestAnimationFrame(() => document.getElementById(!identifier ? 'email' : 'password')?.focus())
      return
    }

    try {
      setTenantLookupError(null)
      dispatch(clearError())
      setResolvingTenant(true)

      if (identifier.includes('@')) {
        const tenant = await authService.resolveTenantByEmail(identifier)
        localStorage.setItem('tenantSlug', tenant.slug)
        syncTenantInUrl(tenant.slug)
      } else {
        // Username login: resolve tenant from localStorage/JWT, or from the school code field.
        const tenantSlug = resolveTenantSlug()
        if (!tenantSlug) {
          const code = schoolCode.trim().toLowerCase()
          if (!code) {
            setShowSchoolCode(true)
            setTenantLookupError('Enter your workspace code to sign in with a username.')
            return
          }
          localStorage.setItem('tenantSlug', code)
          syncTenantInUrl(code)
        }
      }

      setRememberPreference(rememberMe)
      await dispatch(login({ email: identifier, password })).unwrap()

      try {
        const available = await sessionService.getAvailableSessions()
        const fallbackCurrent = available?.data?.find((session) => session.isCurrent)?.label || null
        const currentLabel = available?.meta?.currentLabel || fallbackCurrent

        if (currentLabel) {
          await sessionService.createSession(currentLabel)
          setSession(currentLabel)
          navigate('/dashboard', { replace: true })
          return
        }
      } catch (sessionError) {
        console.warn('Unable to auto-select current academic session:', sessionError)
      }

      navigate('/select-session', { replace: true })
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
      const data = response.data as any
      const userWithBilling = {
        ...data.user,
        ...(data.billing ? { billing: data.billing } : {}),
      }
      persistAuthData({ token: data.token, refreshToken: data.refreshToken, user: userWithBilling, remember: rememberMe })
      dispatch(setCredentials({ user: userWithBilling, token: data.token }))

      try {
        const available = await sessionService.getAvailableSessions()
        const fallbackCurrent = available?.data?.find((s: any) => s.isCurrent)?.label || null
        const currentLabel = available?.meta?.currentLabel || fallbackCurrent
        if (currentLabel) {
          await sessionService.createSession(currentLabel)
          setSession(currentLabel)
          navigate('/dashboard', { replace: true })
          return
        }
      } catch {
        // ignore session error
      }
      navigate('/select-session', { replace: true })
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
              Use your workspace account. It works across every module your school has turned on.
            </p>
          </div>

          <form className="cb-auth-form" style={{ marginTop: 0 }} noValidate onSubmit={handleLogin}>
            <TextField
              id="email"
              name="email"
              label="Email or username"
              icon={Mail}
              placeholder="name@yourschool.in"
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
                label="Workspace code"
                icon={Building2}
                placeholder="e.g. springdale"
                hint="Your workspace or institution code, from your administrator."
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
