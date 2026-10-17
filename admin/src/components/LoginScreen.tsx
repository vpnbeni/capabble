import { useId, useState, type FormEvent, type ReactNode } from 'react'
import mark from '@capabble/brand/capabble-mark.svg'
import { AlertCircle, Eye, EyeOff } from './icons'
import './login.css'

type Props = {
  email: string
  password: string
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: (event: FormEvent) => void
  loading: boolean
  error: string
  themeToggle?: ReactNode
}

/** Platform admin sign-in, built on the Capabble design system (dark theme). */
const LoginScreen = ({ email, password, onEmailChange, onPasswordChange, onSubmit, loading, error, themeToggle }: Props) => {
  const [showPassword, setShowPassword] = useState(false)
  const id = useId()
  const loginId = `${id}-login`
  const passwordId = `${id}-password`

  return (
    <main className="al-page">
      {themeToggle ? <div className="al-theme">{themeToggle}</div> : null}
      <div className="al-panel">
        <div className="al-brand">
          <img src={mark} alt="" className="al-brand__mark" />
          <span className="al-brand__name">Capabble</span>
          <span className="al-brand__tag">Platform admin</span>
        </div>

        <div className="al-head">
          <h1 className="al-title">Sign in</h1>
          <p className="al-subtitle">Manage schools, modules and billing across Capabble.</p>
        </div>

        {error ? (
          <div className="cb-banner cb-banner--danger" role="alert">
            <span className="cb-banner__icon"><AlertCircle size={16} /></span>
            <div className="cb-banner__text">
              <div className="cb-banner__body">{error}</div>
            </div>
          </div>
        ) : null}

        <form className="al-form" onSubmit={onSubmit}>
          <div className="cb-field">
            <label className="cb-field__label" htmlFor={loginId}>Email or username</label>
            <div className="cb-input cb-input--lg">
              <input
                id={loginId}
                type="text"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="cb-field">
            <label className="cb-field__label" htmlFor={passwordId}>Password</label>
            <div className="cb-input cb-input--lg">
              <input
                id={passwordId}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                required
              />
              <button
                type="button"
                className="al-reveal"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                aria-controls={passwordId}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className={`cb-btn cb-btn--primary cb-btn--lg cb-btn--block${loading ? ' is-loading' : ''}`}
            disabled={loading}
          >
            {loading ? <span className="cb-spinner" aria-hidden="true" /> : null}
            <span className="cb-btn__label">{loading ? 'Signing in…' : 'Sign in'}</span>
          </button>
        </form>
      </div>
      <p className="al-foot">Only Capabble staff can sign in here. Schools use school.capabble.cloud.</p>
    </main>
  )
}

export default LoginScreen
