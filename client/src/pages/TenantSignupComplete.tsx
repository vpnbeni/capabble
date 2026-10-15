import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { CheckCircle2, Loader2, Mail, RefreshCcw, XCircle } from 'lucide-react'
import tenantSignupService from '@/services/tenantSignupService'
import { resolveTenantSlug } from '@/utils/tenantRuntime'
import { setSignedInUser } from '@/redux/slices/authSlice'
import type { AppDispatch } from '@/redux/store'

const TenantSignupComplete: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState<'otp' | 'loading' | 'success' | 'error'>('otp')
  const [otp, setOtp] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [otpMessage, setOtpMessage] = useState('Enter the 6-digit verification code sent to your admin email.')
  const [errorMessage, setErrorMessage] = useState('')

  const ticket = searchParams.get('ticket') || ''
  const tenantSlug = useMemo(() => resolveTenantSlug() || '', [])

  useEffect(() => {
    if (!ticket || !tenantSlug) {
      setStatus('error')
      setErrorMessage('Missing onboarding details. Please restart signup.')
    }
  }, [tenantSlug, ticket])

  const handleExchange = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!ticket || !tenantSlug || isSubmitting) {
      return
    }

    const normalizedOtp = otp.trim()
    if (!/^\d{6}$/.test(normalizedOtp)) {
      setOtpMessage('Please enter a valid 6-digit verification code.')
      return
    }

    setIsSubmitting(true)
    setStatus('loading')

    try {
      const response = await tenantSignupService.exchangeTicket({
        ticket,
        tenantSlug,
        otp: normalizedOtp,
      })

      const userWithBilling = {
        ...response.user,
        ...(response.billing ? { billing: response.billing } : {}),
      }

      // The session cookie is already set by the exchange response.
      localStorage.setItem('tenantSlug', response.tenant.slug)
      dispatch(setSignedInUser(userWithBilling))

      setStatus('success')
      window.setTimeout(() => {
        navigate('/dashboard', { replace: true })
      }, 900)
    } catch (error: any) {
      const errorCode = error?.response?.data?.errorCode
      const message = error?.response?.data?.message

      if (errorCode === 'expired_ticket') {
        setStatus('error')
        setErrorMessage('Your signup session expired. Please start again.')
        return
      }

      if (errorCode === 'used_ticket') {
        setStatus('error')
        setErrorMessage('This signup session was already used. Please start again.')
        return
      }

      if (errorCode === 'otp_expired') {
        setStatus('otp')
        setOtpMessage('Your verification code expired. Please request a new code.')
        return
      }

      if (errorCode === 'otp_attempts_exceeded') {
        setStatus('otp')
        setOtpMessage('Too many incorrect attempts. Please request a new code.')
        return
      }

      if (errorCode === 'invalid_otp') {
        setStatus('otp')
        setOtpMessage('That verification code is incorrect. Please try again.')
        return
      }

      if (errorCode === 'otp_required') {
        setStatus('otp')
        setOtpMessage('Verification code is required to complete signup.')
        return
      }

      setStatus('otp')
      setOtpMessage(message || 'Unable to verify code right now. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResendOtp = async () => {
    if (!ticket || !tenantSlug || isResending) {
      return
    }

    setIsResending(true)
    setOtpMessage('Requesting a new verification code...')

    try {
      await tenantSignupService.resendOtp({
        ticket,
        tenantSlug,
      })

      setOtp('')
      setOtpMessage('A new verification code was sent. Check your admin email and enter it below.')
    } catch (error: any) {
      const errorCode = error?.response?.data?.errorCode
      const message = error?.response?.data?.message

      if (errorCode === 'expired_ticket') {
        setStatus('error')
        setErrorMessage('Your signup session expired. Please start again.')
        return
      }

      if (errorCode === 'used_ticket') {
        setStatus('error')
        setErrorMessage('This signup session was already used. Please start again.')
        return
      }

      setOtpMessage(message || 'Could not resend the verification code right now. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-6">
      <div className="max-w-lg w-full rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
        {status === 'otp' && (
          <>
            <Mail className="w-10 h-10 mx-auto text-cyan-300" />
            <h1 className="text-2xl font-semibold mt-5">Verify Your Email</h1>
            <p className="text-slate-300 mt-2">{otpMessage}</p>

            <form onSubmit={handleExchange} className="mt-6 space-y-3">
              <input
                type="text"
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                pattern="\d{6}"
                placeholder="Enter 6-digit OTP"
                className="w-full rounded-xl border border-white/15 bg-slate-900/70 px-4 py-3 text-center tracking-[0.25em] text-lg outline-none focus:border-cyan-300/70"
                autoComplete="one-time-code"
                required
              />

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold px-4 py-3 disabled:opacity-60"
              >
                {isSubmitting ? 'Verifying...' : 'Verify and Continue'}
              </button>
            </form>

            <button
              type="button"
              onClick={handleResendOtp}
              disabled={isResending}
              className="mt-3 w-full rounded-xl border border-white/20 px-4 py-3 hover:bg-white/10 disabled:opacity-60"
            >
              {isResending ? 'Sending...' : 'Resend OTP'}
            </button>
          </>
        )}

        {status === 'loading' && (
          <>
            <Loader2 className="w-10 h-10 mx-auto text-cyan-300 animate-spin" />
            <h1 className="text-2xl font-semibold mt-5">Verifying Your Code</h1>
            <p className="text-slate-300 mt-2">Please wait while we complete secure onboarding.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400" />
            <h1 className="text-2xl font-semibold mt-5">Signup Completed</h1>
            <p className="text-slate-300 mt-2">You are being redirected to your tenant dashboard.</p>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-10 h-10 mx-auto text-red-400" />
            <h1 className="text-2xl font-semibold mt-5">Signup Could Not Be Completed</h1>
            <p className="text-slate-300 mt-2">{errorMessage}</p>
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-semibold px-4 py-2.5"
              >
                <RefreshCcw className="w-4 h-4" />
                Restart Signup
              </Link>
              <Link
                to="/"
                className="rounded-xl border border-white/20 px-4 py-2.5 hover:bg-white/10"
              >
                Go to Login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default TenantSignupComplete
