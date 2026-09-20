import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export function LoginPage() {
  const { login, isAuthenticated, authReady, authRequired } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('capabble')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (authReady && isAuthenticated) {
    return <Navigate to="/schools" replace />
  }

  if (authReady && !authRequired) {
    return <Navigate to="/schools" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate('/schools', { replace: true })
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Login failed'
      setError(typeof detail === 'string' ? detail : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b1220] px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 20% 20%, rgba(37, 99, 235, 0.35), transparent 55%), radial-gradient(ellipse 70% 45% at 85% 75%, rgba(14, 165, 233, 0.2), transparent 50%), linear-gradient(165deg, #0b1220 0%, #111827 45%, #0f172a 100%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="mb-10 text-center">
          <p className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">Capabble</p>
          <p className="mt-2 text-sm font-medium uppercase tracking-[0.2em] text-sky-300/90">
            School Intelligence
          </p>
          <p className="mt-4 text-sm text-slate-400">Internal team access only</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-md sm:p-8"
        >
          <label className="block text-sm text-slate-300">
            Username
            <input
              autoComplete="username"
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-sky-500/40 placeholder:text-slate-500 focus:ring-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>

          <label className="mt-4 block text-sm text-slate-300">
            Password
            <input
              type="password"
              autoComplete="current-password"
              className="mt-1.5 w-full rounded-lg border border-white/15 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none ring-sky-500/40 placeholder:text-slate-500 focus:ring-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || !authReady}
            className="mt-6 w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
