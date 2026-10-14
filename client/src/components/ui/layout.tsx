import React from 'react'
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  Info,
  Inbox,
  Search,
  AlertTriangle,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cx } from './format'
import { Icon, Progress, type Tone } from './primitives'

/**
 * Root of every redesigned workspace page: applies the Capabble tokens (.cb-app),
 * the page gutter and the 1280px content width.
 */
export const Page: React.FC<{ children: React.ReactNode; className?: string; width?: 'default' | 'full' }> = ({
  children,
  className,
  width = 'default',
}) => (
  <div className="cb-app cb-page-root">
    <div className={cx('cb-page', width === 'full' && 'cb-page--full', className)}>{children}</div>
  </div>
)

export const Card: React.FC<{
  title?: React.ReactNode
  subtitle?: React.ReactNode
  action?: React.ReactNode
  footer?: React.ReactNode
  flush?: boolean
  fill?: boolean
  className?: string
  bodyClassName?: string
  children?: React.ReactNode
}> = ({ title, subtitle, action, footer, flush, fill, className, bodyClassName, children }) => (
  <section
    className={cx('cb-card', flush && 'cb-card--flush', fill && 'cb-card--fill', className)}
    aria-label={typeof title === 'string' ? title : undefined}
  >
    {title || subtitle || action ? (
      <header className="cb-card__head">
        <div className="cb-card__titles">
          {title ? <h3 className="cb-card__title">{title}</h3> : null}
          {subtitle ? <p className="cb-card__subtitle">{subtitle}</p> : null}
        </div>
        {action ? <div className="cb-card__action">{action}</div> : null}
      </header>
    ) : null}
    <div className={cx('cb-card__body', bodyClassName)}>{children}</div>
    {footer ? <footer className="cb-card__foot">{footer}</footer> : null}
  </section>
)

export const StatCard: React.FC<{
  label: React.ReactNode
  value: React.ReactNode
  unit?: React.ReactNode
  delta?: { value: React.ReactNode; direction?: 'up' | 'down'; tone?: 'success' | 'danger' | 'neutral' }
  hint?: React.ReactNode
  icon?: LucideIcon
  progress?: number
  progressTone?: 'accent' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}> = ({ label, value, unit, delta, hint, icon, progress, progressTone, className }) => (
  <div className={cx('cb-stat', className)}>
    <div className="cb-stat__top">
      <span className="cb-stat__label">{label}</span>
      {icon ? (
        <span className="cb-stat__icon">
          <Icon icon={icon} size={16} />
        </span>
      ) : null}
    </div>
    <div className="cb-stat__value">
      {value}
      {unit ? <span className="cb-stat__unit">{unit}</span> : null}
    </div>
    {delta || hint ? (
      <div className="cb-stat__foot">
        {delta ? (
          <span className={`cb-stat__delta cb-stat__delta--${delta.tone || 'neutral'}`}>
            <Icon icon={delta.direction === 'down' ? ArrowDownRight : ArrowUpRight} size={14} />
            {delta.value}
          </span>
        ) : null}
        {hint ? <span className="cb-stat__hint">{hint}</span> : null}
      </div>
    ) : null}
    {progress != null ? (
      <Progress value={progress} tone={progressTone} showValue={false} size="sm" className="cb-stat__progress" />
    ) : null}
  </div>
)

export const PageHeader: React.FC<{
  title: React.ReactNode
  subtitle?: React.ReactNode
  back?: { label: React.ReactNode; onClick: () => void }
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}> = ({ title, subtitle, back, actions, children, className }) => (
  <div className={cx('cb-pagehead', className)}>
    {back ? (
      <a
        className="cb-pagehead__back"
        href="#"
        onClick={(event) => {
          event.preventDefault()
          back.onClick()
        }}
      >
        <Icon icon={ChevronLeft} size={16} />
        {back.label}
      </a>
    ) : null}
    <div className="cb-pagehead__row">
      <div className="cb-pagehead__titles">
        <h1 className="cb-pagehead__title">{title}</h1>
        {subtitle ? <p className="cb-pagehead__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="cb-pagehead__actions">{actions}</div> : null}
    </div>
    {children ? <div className="cb-pagehead__below">{children}</div> : null}
  </div>
)

export const Tabs: React.FC<{
  items: Array<{ id: string; label: React.ReactNode; count?: number }>
  value: string
  onChange: (id: string) => void
  variant?: 'underline' | 'segmented'
  label?: string
  className?: string
}> = ({ items, value, onChange, variant = 'underline', label, className }) => {
  const onKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const nextIndex = (index + step + items.length) % items.length
    onChange(items[nextIndex].id)
    const sibling = event.currentTarget.parentElement?.children[nextIndex] as HTMLElement | undefined
    sibling?.focus()
  }
  return (
    <div
      className={cx('cb-tabs', variant === 'segmented' && 'cb-tabs--segmented', className)}
      role="tablist"
      aria-label={label}
    >
      {items.map((item, index) => {
        const on = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={cx('cb-tab', on && 'is-active')}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => onKey(event, index)}
          >
            {item.label}
            {item.count != null ? <span className="cb-tab__count">{item.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Search plus quick filters above a list. `filters` takes extra controls (for example
 * compact selects) that sit between the search and the actions.
 */
export const FilterBar: React.FC<{
  search?: { placeholder?: string; value: string; onChange: (value: string) => void; label?: string }
  chips?: Array<{ id: string; label: React.ReactNode; count?: number; active?: boolean }>
  onChipClick?: (id: string) => void
  chipsLabel?: string
  filters?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}> = ({ search, chips, onChipClick, chipsLabel, filters, actions, className }) => (
  <div className={cx('cb-filterbar', className)}>
    <div className="cb-filterbar__main">
    {search ? (
      <div className="cb-filterbar__search">
        <div className="cb-input cb-input--sm">
          <Icon icon={Search} size={16} className="cb-input__icon" />
          <input
            type="search"
            placeholder={search.placeholder || 'Search'}
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            aria-label={search.label || search.placeholder || 'Search'}
          />
        </div>
      </div>
    ) : null}
    {chips && chips.length ? (
      <div className="cb-filterbar__chips" role="group" aria-label={chipsLabel || 'Filters'}>
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={cx('cb-chip', chip.active && 'is-active')}
            aria-pressed={Boolean(chip.active)}
            onClick={() => onChipClick?.(chip.id)}
          >
            {chip.label}
            {chip.count != null ? <span className="cb-chip__count">{chip.count}</span> : null}
          </button>
        ))}
      </div>
    ) : null}
    {filters ? <div className="cb-filterbar__filters">{filters}</div> : null}
    </div>
    {actions ? <div className="cb-filterbar__actions">{actions}</div> : null}
  </div>
)

/** What a list or card shows when it is empty: a fact, then the next step. */
export const EmptyState: React.FC<{
  icon?: LucideIcon
  title: React.ReactNode
  body?: React.ReactNode
  action?: React.ReactNode
  compact?: boolean
  className?: string
}> = ({ icon = Inbox, title, body, action, compact, className }) => (
  <div className={cx('cb-empty', compact && 'cb-empty--compact', className)}>
    <span className="cb-empty__icon">
      <Icon icon={icon} size={20} />
    </span>
    <p className="cb-empty__title">{title}</p>
    {body ? <p className="cb-empty__body">{body}</p> : null}
    {action ? <div className="cb-empty__action">{action}</div> : null}
  </div>
)

const BANNER_ICON: Record<Tone, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info,
  neutral: Info,
}

/** Inline page message: soft fill, matching border, icon and words — never colour alone. */
export const Banner: React.FC<{
  tone?: Tone
  title?: React.ReactNode
  children?: React.ReactNode
  onDismiss?: () => void
  className?: string
}> = ({ tone = 'info', title, children, onDismiss, className }) => (
  <div className={cx('cb-banner', `cb-banner--${tone}`, className)} role={tone === 'danger' ? 'alert' : 'status'}>
    <Icon icon={BANNER_ICON[tone]} size={16} className="cb-banner__icon" />
    <div className="cb-banner__text">
      {title ? <p className="cb-banner__title">{title}</p> : null}
      {children ? <div className="cb-banner__body">{children}</div> : null}
    </div>
    {onDismiss ? (
      <button type="button" className="cb-banner__close" aria-label="Dismiss" onClick={onDismiss}>
        <Icon icon={X} size={14} />
      </button>
    ) : null}
  </div>
)

/** Label/value pair for record details. Missing values show "—". */
export const DetailList: React.FC<{
  items: Array<{ label: React.ReactNode; value: React.ReactNode; wide?: boolean }>
  columns?: 1 | 2 | 3
  className?: string
}> = ({ items, columns = 2, className }) => (
  <dl className={cx('cb-details', `cb-details--${columns}`, className)}>
    {items.map((item, index) => (
      <div key={index} className={cx('cb-details__item', item.wide && 'is-wide')}>
        <dt>{item.label}</dt>
        <dd>{item.value == null || item.value === '' ? '—' : item.value}</dd>
      </div>
    ))}
  </dl>
)
