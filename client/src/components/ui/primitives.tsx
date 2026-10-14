import React, { forwardRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cx, initials } from './format'

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

/** Lucide line icon at the system's 1.75 stroke. */
export const Icon: React.FC<{ icon: LucideIcon; size?: number; className?: string; label?: string }> = ({
  icon: Glyph,
  size = 16,
  className,
  label,
}) => (
  <Glyph
    size={size}
    strokeWidth={1.75}
    className={cx('cb-icon', className)}
    aria-hidden={label ? undefined : true}
    aria-label={label}
    role={label ? 'img' : undefined}
    focusable={false}
  />
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: LucideIcon
  iconRight?: LucideIcon
  loading?: boolean
  fullWidth?: boolean
}

/** One primary button per view. Labels start with a verb: "Add student", not "Submit". */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, fullWidth, className, children, disabled, type, ...rest },
  ref
) {
  const iconOnly = !children && (icon || iconRight)
  const iconSize = size === 'lg' ? 18 : 16
  return (
    <button
      ref={ref}
      type={type || 'button'}
      {...rest}
      className={cx(
        'cb-btn',
        `cb-btn--${variant}`,
        `cb-btn--${size}`,
        iconOnly && 'cb-btn--icon',
        fullWidth && 'cb-btn--block',
        loading && 'is-loading',
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
    >
      {loading ? <span className="cb-spinner" aria-hidden="true" /> : icon ? <Icon icon={icon} size={iconSize} /> : null}
      {children ? <span className="cb-btn__label">{children}</span> : null}
      {iconRight ? <Icon icon={iconRight} size={iconSize} /> : null}
    </button>
  )
})

/** A short status label. The word always says what the colour means. */
export const Badge: React.FC<{
  tone?: Tone | 'accent'
  dot?: boolean
  /** `sm` is for dense chip lists inside table cells (subject codes); `lg` for headers. */
  size?: 'sm' | 'lg'
  className?: string
  title?: string
  children: React.ReactNode
}> = ({ tone = 'neutral', dot = true, size, className, title, children }) => (
  <span className={cx('cb-badge', `cb-badge--${tone}`, size && `cb-badge--${size}`, className)} title={title}>
    {dot ? <span className="cb-badge__dot" aria-hidden="true" /> : null}
    {children}
  </span>
)

export const Progress: React.FC<{
  value: number
  max?: number
  label?: React.ReactNode
  valueLabel?: React.ReactNode
  showValue?: boolean
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'sm'
  className?: string
}> = ({ value, max = 100, label, valueLabel, showValue = true, tone = 'accent', size, className }) => {
  const v = Math.max(0, Math.min(max, value || 0))
  const pct = max > 0 ? Math.round((v / max) * 100) : 0
  return (
    <div className={cx('cb-progress', size === 'sm' && 'cb-progress--sm', className)}>
      {label || showValue ? (
        <div className="cb-progress__head">
          {label ? <span className="cb-progress__label">{label}</span> : <span />}
          {showValue ? <span className="cb-progress__value">{valueLabel || `${pct}%`}</span> : null}
        </div>
      ) : null}
      <div
        className="cb-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={v}
        aria-label={typeof label === 'string' ? label : undefined}
      >
        <div className={`cb-progress__fill cb-progress__fill--${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** A person's photo or initials; falls back to initials if the photo fails to load. */
export const Avatar: React.FC<{
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  square?: boolean
  className?: string
}> = ({ name, src, size = 'md', square, className }) => {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed
  return (
    <span className={cx('cb-avatar', `cb-avatar--${size}`, square && 'cb-avatar--square', className)} title={name}>
      {showImage ? (
        <img src={src || ''} alt="" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initials(name) || '?'}</span>
      )}
      <span className="cb-visually-hidden">{name}</span>
    </span>
  )
}
