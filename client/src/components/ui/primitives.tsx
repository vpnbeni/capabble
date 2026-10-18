import React, { forwardRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cx, initials } from './format'
import { HoverCard } from './hovercard'

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

export type RingSegment = { value: number; tone: 'success' | 'warning' | 'danger' | 'info' | 'accent' }

/** Donut of one or more segments out of `max`. Centre content goes in children. Always give it a `label` for screen readers. */
export const Ring: React.FC<{
  segments: RingSegment[]
  max?: number
  size?: 'sm' | 'lg'
  label: string
  children?: React.ReactNode
  className?: string
}> = ({ segments, max = 100, size = 'lg', label, children, className }) => {
  const gap = segments.filter((seg) => seg.value > 0).length > 1 ? 1.2 : 0
  let start = 0
  const arcs = segments.map((seg) => {
    const len = max > 0 ? Math.max(0, Math.min(100 - start, (seg.value / max) * 100)) : 0
    const arc = { tone: seg.tone, len: Math.max(0, len - gap), start }
    start += len
    return arc
  })
  return (
    <div className={cx('cb-ring', `cb-ring--${size}`, className)} role="img" aria-label={label}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle className="cb-ring__track" cx="18" cy="18" r="15.9155" pathLength={100} />
        {arcs.filter((arc) => arc.len > 0).map((arc, i) => (
          <circle
            key={i}
            className={`cb-ring__arc cb-ring__arc--${arc.tone}`}
            cx="18"
            cy="18"
            r="15.9155"
            pathLength={100}
            strokeDasharray={`${arc.len} ${100 - arc.len}`}
            strokeDashoffset={-arc.start}
          />
        ))}
      </svg>
      {children ? <div className="cb-ring__center">{children}</div> : null}
    </div>
  )
}

export type ColumnChartItem = {
  label: string
  value: number
  caption?: string
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'info'
  /** Card shown on hover / focus / tap of the column (e.g. who is absent), labelled by `detailLabel`. */
  detail?: React.ReactNode
  detailLabel?: string
}

/** Column chart on a fixed 0–`max` scale, one column per item, with an optional dashed target line. */
export const ColumnChart: React.FC<{
  items: ColumnChartItem[]
  max?: number
  target?: { value: number; label: string }
  unit?: string
  label: string
  className?: string
}> = ({ items, max = 100, target, unit = '%', label, className }) => {
  const pos = (value: number) => Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0))
  const withDetail = (item: ColumnChartItem, node: React.ReactNode, focusable = true) =>
    item.detail ? (
      <HoverCard className="cb-columns__hover" label={item.detailLabel || item.label} content={item.detail} focusable={focusable}>{node}</HoverCard>
    ) : node
  const interactive = items.some((item) => item.detail)
  return (
    <div className={cx('cb-columns', className)} role={interactive ? 'group' : 'img'} aria-label={label}>
      <div className="cb-columns__plot">
        {target ? (
          <div className="cb-columns__target" style={{ '--pos': pos(target.value) } as React.CSSProperties} title={target.label} />
        ) : null}
        {items.map((item) => (
          <div key={item.label} className="cb-columns__col">
            {withDetail(item, (
              <>
                <span className="cb-columns__value is-num">{`${item.value}${unit}`}</span>
                <span className="cb-columns__track">
                  <i className={`cb-columns__bar cb-columns__bar--${item.tone || 'accent'}`} style={{ '--pos': pos(item.value) } as React.CSSProperties} />
                </span>
              </>
            ))}
          </div>
        ))}
      </div>
      <div className="cb-columns__labels">
        {items.map((item) => (
          <div key={item.label} className="cb-columns__col">
            {withDetail(item, (
              <>
                <span className="cb-columns__name">{item.label}</span>
                <span className={cx('cb-columns__caption', item.detail ? 'has-detail' : null)}>{item.caption || '\u00a0'}</span>
              </>
            ), false)}
          </div>
        ))}
      </div>
    </div>
  )
}

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
