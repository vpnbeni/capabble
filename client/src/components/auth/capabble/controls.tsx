import React, { forwardRef, useId } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle as CircleAlert, CheckCircle2 as CircleCheck, type LucideIcon } from 'lucide-react'

const ICON = { size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const

interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  hint?: string
  /** Replaces the hint when set. */
  error?: string | null
  icon?: LucideIcon
  /** Extra element on the right of the label row, e.g. a "Forgot password?" link. */
  labelAside?: React.ReactNode
  /** Wide letter-spacing for one-time codes. */
  code?: boolean
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, hint, error, icon: FieldIcon, labelAside, code, id, ...input }, ref) => {
    const autoId = useId()
    const inputId = id || autoId
    const noteId = `${inputId}-note`
    const note = error || hint
    return (
      <div className="cb-field">
        <div className="cb-field-head">
          <label className="cb-field-label" htmlFor={inputId}>
            {label}
          </label>
          {labelAside}
        </div>
        <div className="cb-field-control">
          {FieldIcon ? (
            <span className="cb-field-icon">
              <FieldIcon {...ICON} />
            </span>
          ) : null}
          <input
            ref={ref}
            id={inputId}
            className="cb-field-input"
            data-icon={FieldIcon ? '' : undefined}
            data-code={code ? '' : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={note ? noteId : undefined}
            {...input}
          />
        </div>
        {error ? (
          <p className="cb-field-error" id={noteId}>
            <CircleAlert {...ICON} />
            <span>{error}</span>
          </p>
        ) : hint ? (
          <p className="cb-field-hint" id={noteId}>
            {hint}
          </p>
        ) : null}
      </div>
    )
  }
)
TextField.displayName = 'TextField'

export const Checkbox: React.FC<{
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
}> = ({ label, description, checked, onChange }) => {
  const descId = useId()
  return (
    <label className="cb-check" data-described={description ? '' : undefined}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={description ? descId : undefined}
      />
      {description ? (
        <span className="cb-check-text">
          <span>{label}</span>
          <span className="cb-check-desc" id={descId}>
            {description}
          </span>
        </span>
      ) : (
        label
      )}
    </label>
  )
}

export const Badge: React.FC<{ tone?: 'neutral' | 'info'; children: React.ReactNode }> = ({
  tone = 'neutral',
  children,
}) => (
  <span className="cb-badge" data-tone={tone}>
    {children}
  </span>
)

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary'
  loading?: boolean
  loadingLabel?: string
  iconRight?: LucideIcon
  icon?: LucideIcon
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  loading,
  loadingLabel,
  iconRight: Right,
  icon: Left,
  children,
  disabled,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={`cb-btn cb-btn-${variant}`}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...rest}
  >
    {loading ? <span className="cb-spinner" aria-hidden="true" /> : Left ? <Left {...ICON} /> : null}
    <span>{loading && loadingLabel ? loadingLabel : children}</span>
    {!loading && Right ? <Right {...ICON} /> : null}
  </button>
)

/** A link styled as a primary button (status screens: "Sign in", "Send a new code"). */
export const LinkButton: React.FC<{ to: string; iconRight?: LucideIcon; children: React.ReactNode }> = ({
  to,
  iconRight: Right,
  children,
}) => (
  <Link to={to} className="cb-btn cb-btn-primary">
    <span>{children}</span>
    {Right ? <Right {...ICON} /> : null}
  </Link>
)

export type StrengthLevel = 1 | 2 | 3

const STRENGTH = {
  1: { label: 'Weak', tone: 'danger' },
  2: { label: 'Medium', tone: 'warning' },
  3: { label: 'Strong', tone: 'success' },
} as const

export const StrengthMeter: React.FC<{ level: StrengthLevel }> = ({ level }) => (
  <div className="cb-progress">
    <div className="cb-progress-head">
      <span>Password strength</span>
      <span className="cb-progress-value" aria-live="polite">
        {STRENGTH[level].label}
      </span>
    </div>
    <div
      className="cb-progress-track"
      role="progressbar"
      aria-label="Password strength"
      aria-valuemin={0}
      aria-valuemax={3}
      aria-valuenow={level}
      aria-valuetext={STRENGTH[level].label}
    >
      <div className="cb-progress-fill" data-tone={STRENGTH[level].tone} style={{ width: `${(level / 3) * 100}%` }} />
    </div>
  </div>
)

export const Callout: React.FC<{ tone?: 'danger' | 'success'; children: React.ReactNode }> = ({
  tone = 'danger',
  children,
}) => {
  const CalloutIcon = tone === 'success' ? CircleCheck : CircleAlert
  return (
    <div className="cb-callout" data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <CalloutIcon {...ICON} />
      <p>{children}</p>
    </div>
  )
}
