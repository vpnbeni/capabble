import React, { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Lock, Mail, RefreshCw, KeyRound } from 'lucide-react'
import { clearError, login, selectAuth, setCredentials } from '../redux/slices/authSlice'
import authService from '../services/authService'
import { useAcademicSession } from '../contexts/AcademicSessionContext'
import sessionService from '../services/sessionService'
import { getRememberPreference, persistAuthData, setRememberPreference } from '../utils/authStorage'
import { resolveTenantSlug } from '../utils/tenantRuntime'
import type { AppDispatch } from '../redux/store'
import type { LoginCredentials } from '../types/auth'
import Loader from '../components/common/Loader'
import AuthLayout from '../components/auth/capabble/AuthLayout'
import { Button, Callout, Checkbox, TextField } from '../components/auth/capabble/controls'

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
      setTenantLookupError(
        !identifier ? 'Enter your email address or username.' : 'Enter your password.'
      )
      document.getElementById(!identifier ? 'email' : 'password')?.focus()
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
      headline={
        <>
          One sign-in for every <span className="cb-auth-accent">module.</span>
        </>
      }
      subline="Your workspace account opens every module your school uses."
    >
      {verifyEmailStep ? (
        <>
          <h1 className="cb-auth-title">Confirm your email</h1>
          <p className="cb-auth-subtitle">
            Enter the 6-digit code we sent to <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{formData.email}</strong>.
          </p>

          <form className="cb-auth-form" noValidate onSubmit={handleVerifyEmail}>
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
              value={verifyOtp}
              onChange={(e) => {
                setVerifyOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                setVerifyError(null)
              }}
              autoFocus
            />
            {verifyError ? <Callout>{verifyError}</Callout> : null}
            <Button
              type="submit"
              iconRight={ArrowRight}
              loading={verifyLoading}
              loadingLabel="Verifying"
            >
              Verify and sign in
            </Button>
            <Button variant="secondary" icon={RefreshCw} onClick={handleResendVerification} loading={resendLoading} loadingLabel="Sending">
              Send a new code
            </Button>
          </form>

          <p className="cb-auth-alt">
            Wrong account?{' '}
            <button
              type="button"
              className="cb-btn-link"
              style={{ padding: 0, fontWeight: 600 }}
              onClick={() => {
                setVerifyEmailStep(false)
                setVerifyOtp('')
                setVerifyError(null)
                setVerifySuccessMessage(null)
              }}
            >
              Back to sign in
            </button>
          </p>
        </>
      ) : (
        <>
          <h1 className="cb-auth-title">Sign in to your workspace</h1>
          <p className="cb-auth-subtitle">
            Use the email address or username your school gave you. One account opens every module.
          </p>

          <form className="cb-auth-form" noValidate onSubmit={handleLogin}>
            <TextField
              id="email"
              name="email"
              label="Email or username"
              icon={Mail}
              placeholder="name@yourschool.in"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
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

            <TextField
              id="password"
              name="password"
              label="Password"
              icon={Lock}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              labelAside={<Link to="/forgot-password">Forgot password?</Link>}
              value={formData.password}
              onChange={handleInputChange}
            />

            <div className="cb-auth-checks">
              <Checkbox label="Show password" checked={showPassword} onChange={setShowPassword} />
              <Checkbox label="Stay signed in" checked={rememberMe} onChange={setRememberMe} />
            </div>

            {activeError ? <Callout>{activeError}</Callout> : null}

            <Button
              type="submit"
              iconRight={ArrowRight}
              loading={busy}
              loadingLabel="Signing in"
            >
              Sign in
            </Button>
          </form>

          <p className="cb-auth-alt">
            New to Capabble? <Link to="/signup">Create a workspace account</Link>
          </p>
        </>
      )}
    </AuthLayout>
  )
}

export default Login
