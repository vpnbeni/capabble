import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, Clock, KeyRound, LayoutGrid, Mail, RefreshCw } from 'lucide-react'
import tenantSignupService, { SIGNUP_EMAIL_KEY } from '@/services/tenantSignupService'
import { resolveTenantSlug } from '@/utils/tenantRuntime'
import { setSignedInUser } from '@/redux/slices/authSlice'
import type { AppDispatch } from '@/redux/store'
import AuthLayout, { StepsCard } from '@/components/auth/capabble/AuthLayout'
import { Button, Callout, LinkButton, TextField } from '@/components/auth/capabble/controls'

const RESEND_COOLDOWN_SECONDS = 45
// Matches PUBLIC_SIGNUP_EMAIL_OTP_TTL_MINUTES on the server (default 10).
const CODE_LIFETIME = '10 minutes'

/* code → done; a used, expired or unknown signup session shows "ended". */
type Step = 'code' | 'done' | 'ended'

type ApiError = { response?: { data?: { message?: string; errorCode?: string } } }
const apiError = (err: unknown) => (err && typeof err === 'object' ? (err as ApiError).response?.data : undefined)

const SESSION_ENDED: Record<string, string> = {
  expired_ticket: 'Your signup session has expired. Start again to get a new code.',
  used_ticket: 'This signup has already been confirmed. Sign in with your email and password.',
  invalid_ticket: "We couldn't find this signup. Start again, or sign in if you've already confirmed it.",
}

const CODE_ERRORS: Record<string, string> = {
  invalid_otp: "That code isn't right. Check the latest email and try again.",
  otp_expired: 'That code has expired. Send a new code and enter it straight away.',
  otp_attempts_exceeded: 'Too many tries with that code. Send a new code and enter it carefully.',
  otp_required: 'Enter the 6-digit code from the email',
}

const readSignupEmail = () => {
  try {
    return sessionStorage.getItem(SIGNUP_EMAIL_KEY) || ''
  } catch {
    return ''
  }
}

const TenantSignupComplete: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ticket = searchParams.get('ticket') || ''
  const tenantSlug = useMemo(() => resolveTenantSlug() || '', [])
  const email = useMemo(readSignupEmail, [])

  const [step, setStep] = useState<Step>(ticket && tenantSlug ? 'code' : 'ended')
  const [endedMessage, setEndedMessage] = useState(
    "This link is missing your signup details. Start again, or sign in if you've already confirmed it."
  )
  const [otp, setOtp] = useState('')
  const [otpError, setOtpError] = useState<string | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = window.setInterval(() => setCooldown((v) => (v > 0 ? v - 1 : 0)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  // The whole panel changes between steps, so move focus to the new heading.
  useEffect(() => {
    if (step !== 'code') headingRef.current?.focus()
  }, [step])

  const endSession = (errorCode: string) => {
    setEndedMessage(SESSION_ENDED[errorCode])
    setStep('ended')
  }

  const showCodeError = (message: string) => {
    setOtpError(message)
    requestAnimationFrame(() => codeRef.current?.focus())
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    setGeneralError(null)
    if (!/^\d{6}$/.test(otp)) {
      showCodeError('Enter the 6-digit code from the email')
      return
    }

    setSubmitting(true)
    try {
      const response = await tenantSignupService.exchangeTicket({ ticket, tenantSlug, otp })
      // The session cookie is already set by the exchange response.
      localStorage.setItem('tenantSlug', response.tenant.slug)
      try {
        sessionStorage.removeItem(SIGNUP_EMAIL_KEY)
      } catch {
        /* storage unavailable */
      }
      dispatch(
        setSignedInUser({ ...response.user, ...(response.billing ? { billing: response.billing } : {}) })
      )
      setStep('done')
      window.setTimeout(() => navigate('/dashboard', { replace: true }), 900)
    } catch (err) {
      const data = apiError(err)
      const code = data?.errorCode || ''
      if (SESSION_ENDED[code]) endSession(code)
      else if (CODE_ERRORS[code]) showCodeError(CODE_ERRORS[code])
      else setGeneralError(data?.message || "We couldn't check the code. Check your connection and try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleResend = async () => {
    if (resending || cooldown > 0) return
    setGeneralError(null)
    setResending(true)
    try {
      await tenantSignupService.resendOtp({ ticket, tenantSlug })
      setOtp('')
      setOtpError(null)
      setResent(true)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      const data = apiError(err)
      const code = data?.errorCode || ''
      if (SESSION_ENDED[code]) endSession(code)
      else setGeneralError(data?.message || "We couldn't send a new code. Try again in a moment.")
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthLayout
      layout="signup"
      headline={
        <>
          Set up your school <span className="cb-auth-accent">once.</span>
        </>
      }
      subline="One workspace account opens every module your school uses."
      card={
        <StepsCard
          title="Almost there"
          items={[
            { icon: Building2, title: 'Add your institution', detail: 'Done' },
            { icon: Mail, title: 'Confirm your email', detail: 'Enter the 6-digit code we sent' },
            { icon: LayoutGrid, title: 'Open any module', detail: 'Exams, exam centre, fees and more' },
          ]}
        />
      }
    >
      {step === 'code' ? (
        <>
          <div className="cb-auth-head" style={{ gap: 16 }}>
            <span className="cb-auth-status-icon">
              <Mail size={24} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h1 className="cb-auth-title">Confirm your email</h1>
              <p className="cb-auth-subtitle">
                We&apos;ve sent a 6-digit code to {email ? <strong>{email}</strong> : 'your email'}. The code works for{' '}
                {CODE_LIFETIME}.
              </p>
            </div>
          </div>

          <form className="cb-auth-form" style={{ marginTop: 0 }} noValidate onSubmit={handleVerify}>
            <TextField
              ref={codeRef}
              id="signup-code"
              label="Confirmation code"
              icon={KeyRound}
              code
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              hint="6 digits"
              error={otpError}
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                setOtpError(null)
              }}
            />
            {generalError ? <Callout>{generalError}</Callout> : null}
            <Button type="submit" iconRight={ArrowRight} loading={submitting} loadingLabel="Checking code">
              Confirm and continue
            </Button>
          </form>

          <div className="cb-auth-panel" style={{ marginTop: 24 }}>
            <strong>Didn&apos;t get it?</strong>
            <span>Check your spam folder. It can take a minute to arrive.</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={handleResend}
                disabled={cooldown > 0}
                loading={resending}
                loadingLabel="Sending"
              >
                Resend code
              </Button>
              <span className="cb-auth-note" aria-live="polite">
                {resent ? 'Sent again. ' : ''}
                {cooldown > 0 ? `You can resend in 0:${String(cooldown).padStart(2, '0')}` : ''}
              </span>
            </div>
          </div>
        </>
      ) : null}

      {step === 'done' ? (
        <div className="cb-auth-head" style={{ gap: 16, marginBottom: 0 }}>
          <span className="cb-auth-status-icon" data-tone="success">
            <CheckCircle2 size={24} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1 className="cb-auth-title" ref={headingRef} tabIndex={-1}>
              Your account is ready
            </h1>
            <p className="cb-auth-subtitle" role="status">
              Opening your dashboard…
            </p>
          </div>
        </div>
      ) : null}

      {step === 'ended' ? (
        <div className="cb-auth-head" style={{ gap: 16, marginBottom: 0 }}>
          <span className="cb-auth-status-icon" data-tone="warning">
            <Clock size={24} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1 className="cb-auth-title" ref={headingRef} tabIndex={-1}>
              This signup can&apos;t be confirmed
            </h1>
            <p className="cb-auth-subtitle">{endedMessage}</p>
          </div>
          <LinkButton to="/signup" iconRight={ArrowRight}>
            Start again
          </LinkButton>
        </div>
      ) : null}

      {step !== 'done' ? (
        <div className="cb-auth-back">
          <Link to="/login">
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            Back to sign in
          </Link>
        </div>
      ) : null}
    </AuthLayout>
  )
}

export default TenantSignupComplete
