import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, KeyRound, Lock, Mail, RefreshCw, ShieldCheck, UserCog } from 'lucide-react'
import authService from '@/services/authService'
import AuthLayout, { CardHeading } from '@/components/auth/capabble/AuthLayout'
import { Button, Callout, Checkbox, LinkButton, StrengthMeter, TextField } from '@/components/auth/capabble/controls'
import { getPasswordStrength, MISMATCH_ERROR, PASSWORD_ERROR, PASSWORD_RULE } from '@/components/auth/capabble/password'
import { marketingLinks } from '@/utils/marketingSite'

const RESEND_COOLDOWN_SECONDS = 45
// Matches PASSWORD_RESET_OTP_TTL_MINUTES on the server (default 10).
const CODE_LIFETIME = '10 minutes'

/*
 * request → sent (enter the emailed code) → new (choose a password) → done
 * A rejected code sends the user back to "sent"; an expired or used-up code shows "expired".
 */
type Step = 'request' | 'sent' | 'new' | 'done' | 'expired'

const syncTenantInUrl = (tenantSlug: string | null) => {
  const url = new URL(window.location.href)
  if (tenantSlug) url.searchParams.set('tenant', tenantSlug)
  else url.searchParams.delete('tenant')
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
}

type ApiError = { response?: { data?: { message?: string; errorCode?: string } } }
const apiError = (err: unknown) => (err && typeof err === 'object' ? (err as ApiError).response?.data : undefined)

const focusSoon = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus())

const ForgotPassword: React.FC = () => {
  const [step, setStep] = useState<Step>('request')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [expiredReason, setExpiredReason] = useState<'expired' | 'attempts'>('expired')
  const [errors, setErrors] = useState<{ email?: string; otp?: string; password?: string; confirm?: string }>({})
  const [generalError, setGeneralError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const strength = useMemo(() => getPasswordStrength(newPassword), [newPassword])
  const normalizedEmail = email.trim().toLowerCase()

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = window.setInterval(() => setCooldown((v) => (v > 0 ? v - 1 : 0)), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  // Each step swaps the whole form, so move focus to its heading for screen readers.
  useEffect(() => {
    if (step !== 'request') headingRef.current?.focus()
  }, [step])

  const goTo = (next: Step) => {
    setGeneralError(null)
    setErrors({})
    setStep(next)
  }

  const sendCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setErrors({ email: 'Enter an email address like name@yourschool.in' })
      focusSoon('reset-email')
      return
    }
    setGeneralError(null)
    setSending(true)
    try {
      const tenant = await authService.resolveTenantByEmail(normalizedEmail)
      localStorage.setItem('tenantSlug', tenant.slug)
      syncTenantInUrl(tenant.slug)
      await authService.forgotPassword(normalizedEmail)
      setEmail(normalizedEmail)
      setOtp('')
      setResent(false)
      setCooldown(RESEND_COOLDOWN_SECONDS)
      goTo('sent')
    } catch (err) {
      setGeneralError(apiError(err)?.message || "We couldn't send the code. Check your connection and try again.")
    } finally {
      setSending(false)
    }
  }

  const resendCode = async () => {
    if (resending || cooldown > 0) return
    setGeneralError(null)
    setResending(true)
    try {
      await authService.resendForgotPasswordOtp(normalizedEmail)
      setOtp('')
      setResent(true)
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      setGeneralError(apiError(err)?.message || "We couldn't send a new code. Try again in a moment.")
    } finally {
      setResending(false)
    }
  }

  const continueWithCode = (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^\d{6}$/.test(otp)) {
      setErrors({ otp: 'Enter the 6-digit code from the email' })
      focusSoon('reset-code')
      return
    }
    goTo('new')
  }

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    if (strength < 2) {
      setErrors({ password: PASSWORD_ERROR })
      focusSoon('new-password')
      return
    }
    if (confirmNewPassword !== newPassword) {
      setErrors({ confirm: MISMATCH_ERROR })
      focusSoon('confirm-password')
      return
    }
    setErrors({})
    setGeneralError(null)
    setSaving(true)
    try {
      await authService.resetPassword({ email: normalizedEmail, otp, newPassword, confirmNewPassword })
      goTo('done')
    } catch (err) {
      const data = apiError(err)
      if (data?.errorCode === 'invalid_otp') {
        setStep('sent')
        setErrors({ otp: "That code isn't right. Check the latest email and try again." })
        focusSoon('reset-code')
      } else if (data?.errorCode === 'otp_expired' || data?.errorCode === 'otp_not_requested') {
        setExpiredReason('expired')
        goTo('expired')
      } else if (data?.errorCode === 'otp_attempts_exceeded') {
        setExpiredReason('attempts')
        goTo('expired')
      } else {
        setGeneralError(data?.message || "We couldn't save the password. Check your connection and try again.")
      }
    } finally {
      setSaving(false)
    }
  }

  const startOver = () => {
    setOtp('')
    setNewPassword('')
    setConfirmNewPassword('')
    setCooldown(0)
    goTo('request')
    focusSoon('reset-email')
  }

  const passwordType = showPasswords ? 'text' : 'password'
  const choosingPassword = step === 'new' || step === 'done'

  return (
    <AuthLayout
      layout="signin"
      headline={
        choosingPassword ? (
          <>
            A fresh start for your <span className="cb-auth-accent">account.</span>
          </>
        ) : (
          <>
            Locked out? You&apos;ll be back in a <span className="cb-auth-accent">minute.</span>
          </>
        )
      }
      subline={
        choosingPassword
          ? 'Your new password works in every module straight away.'
          : 'One reset brings back every module on your account.'
      }
      card={
        choosingPassword ? (
          <>
            <CardHeading icon={ShieldCheck}>A good password</CardHeading>
            <ul>
              <li>Is at least 8 characters, with upper and lower case letters, a number and a symbol</li>
              <li>Is 12 characters or more to be strong</li>
              <li>Isn&apos;t one you use on another website</li>
            </ul>
          </>
        ) : (
          <>
            <CardHeading icon={UserCog}>No access to that email?</CardHeading>
            <p>Your school&apos;s Capabble admin can change the email on your account. Then reset your password here.</p>
            <a className="cb-auth-card-link" href={marketingLinks().signingInHelp}>
              Get help signing in
            </a>
          </>
        )
      }
    >
      {step === 'request' ? (
        <>
          <div className="cb-auth-head">
            <h1 className="cb-auth-title">Reset your password</h1>
            <p className="cb-auth-subtitle">
              Enter the email you sign in with. We&apos;ll send you a 6-digit code to set a new password.
            </p>
          </div>
          <form
            className="cb-auth-form"
            style={{ marginTop: 0 }}
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (!sending) void sendCode()
            }}
          >
            <TextField
              id="reset-email"
              label="Email address"
              icon={Mail}
              type="email"
              placeholder="name@yourschool.in"
              autoComplete="email"
              error={errors.email}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setErrors({})
              }}
            />
            {generalError ? <Callout>{generalError}</Callout> : null}
            <Button type="submit" iconRight={ArrowRight} loading={sending} loadingLabel="Sending code">
              Send reset code
            </Button>
          </form>
        </>
      ) : null}

      {step === 'sent' ? (
        <>
          <div className="cb-auth-head" style={{ gap: 16 }}>
            <span className="cb-auth-status-icon">
              <Mail size={24} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h1 className="cb-auth-title" ref={headingRef} tabIndex={-1}>
                Check your email
              </h1>
              <p className="cb-auth-subtitle">
                We&apos;ve sent a 6-digit code to <strong>{normalizedEmail}</strong>. The code works for {CODE_LIFETIME}.
              </p>
            </div>
          </div>

          <form className="cb-auth-form" style={{ marginTop: 0 }} noValidate onSubmit={continueWithCode}>
            <TextField
              id="reset-code"
              label="Reset code"
              icon={KeyRound}
              code
              inputMode="numeric"
              autoComplete="one-time-code"
              hint="6 digits"
              error={errors.otp}
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                setErrors({})
              }}
            />
            <Button type="submit" iconRight={ArrowRight}>
              Continue
            </Button>
          </form>

          <div className="cb-auth-panel" style={{ marginTop: 24 }}>
            <strong>Didn&apos;t get it?</strong>
            <span>Check your spam folder. It can take a minute to arrive.</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' }}>
              <Button
                variant="secondary"
                icon={RefreshCw}
                onClick={resendCode}
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
          {generalError ? (
            <div style={{ marginTop: 16 }}>
              <Callout>{generalError}</Callout>
            </div>
          ) : null}
          <div style={{ marginTop: 16 }}>
            <Button variant="tertiary" onClick={startOver}>
              Use a different email
            </Button>
          </div>
        </>
      ) : null}

      {step === 'new' ? (
        <>
          <div className="cb-auth-head">
            <h1 className="cb-auth-title" ref={headingRef} tabIndex={-1}>
              Set a new password
            </h1>
            <p className="cb-auth-subtitle">
              For <strong>{normalizedEmail}</strong>
            </p>
          </div>
          <form className="cb-auth-form" style={{ marginTop: 0 }} noValidate onSubmit={savePassword}>
            <div>
              <TextField
                id="new-password"
                label="New password"
                icon={Lock}
                type={passwordType}
                hint={PASSWORD_RULE}
                error={errors.password}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setErrors({})
                }}
              />
              {newPassword ? (
                <div style={{ marginTop: 10 }}>
                  <StrengthMeter level={strength} />
                </div>
              ) : null}
            </div>
            <TextField
              id="confirm-password"
              label="Confirm new password"
              icon={Lock}
              type={passwordType}
              error={errors.confirm}
              autoComplete="new-password"
              value={confirmNewPassword}
              onChange={(e) => {
                setConfirmNewPassword(e.target.value)
                setErrors({})
              }}
            />
            <div className="cb-auth-checks">
              <Checkbox label="Show passwords" checked={showPasswords} onChange={setShowPasswords} />
            </div>
            {generalError ? <Callout>{generalError}</Callout> : null}
            <Button type="submit" loading={saving} loadingLabel="Saving password">
              Save new password
            </Button>
          </form>
        </>
      ) : null}

      {step === 'done' ? (
        <div className="cb-auth-head" style={{ gap: 16, marginBottom: 0 }}>
          <span className="cb-auth-status-icon" data-tone="success">
            <CheckCircle2 size={24} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1 className="cb-auth-title" ref={headingRef} tabIndex={-1}>
              Password changed
            </h1>
            <p className="cb-auth-subtitle">Sign in with your new password to get back to your modules.</p>
          </div>
          <LinkButton to="/login" iconRight={ArrowRight}>
            Sign in
          </LinkButton>
        </div>
      ) : null}

      {step === 'expired' ? (
        <div className="cb-auth-head" style={{ gap: 16, marginBottom: 0 }}>
          <span className="cb-auth-status-icon" data-tone="warning">
            <Clock size={24} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h1 className="cb-auth-title" ref={headingRef} tabIndex={-1}>
              {expiredReason === 'attempts' ? 'Too many tries with that code' : 'This code has expired'}
            </h1>
            <p className="cb-auth-subtitle">
              {expiredReason === 'attempts'
                ? 'For your security, that code no longer works. Ask for a new one and enter it carefully.'
                : `Reset codes work for ${CODE_LIFETIME} and only once. Ask for a new one and use it straight away.`}
            </p>
          </div>
          {generalError ? <Callout>{generalError}</Callout> : null}
          <Button iconRight={ArrowRight} onClick={sendCode} loading={sending} loadingLabel="Sending code">
            Send a new code
          </Button>
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

export default ForgotPassword
