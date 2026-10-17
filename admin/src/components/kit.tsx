import { ReactNode, useId } from 'react'
import { AlertCircle, CheckCircle, X } from './icons'

/*
 * The design kit's form and layout pieces for the admin portal. Same markup and
 * classes as client/src/components/ui (forms.tsx, layout.tsx), so both apps look alike.
 */

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

type FieldChrome = { label?: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; className?: string }

function Field({ id, label, hint, error, required, className, children }: FieldChrome & { id: string; children: ReactNode }) {
  return (
    <div className={cx('cb-field', Boolean(error) && 'is-invalid', className)}>
      {label ? (
        <label className="cb-field__label" htmlFor={id}>
          {label}
          {required ? <span className="cb-field__req" aria-hidden="true"> *</span> : null}
        </label>
      ) : null}
      {children}
      {error || hint ? (
        <div id={`${id}-hint`} className={error ? 'cb-field__error' : 'cb-field__hint'}>
          {error ? <AlertCircle size={14} /> : null}
          {error || hint}
        </div>
      ) : null}
    </div>
  )
}

export function TextField({
  label, hint, error, required, className, prefix, suffix, value, onChange, type = 'text', placeholder, inputMode, disabled, min, max, autoFocus,
}: FieldChrome & {
  prefix?: ReactNode
  suffix?: ReactNode
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  inputMode?: 'numeric' | 'decimal' | 'text' | 'email'
  disabled?: boolean
  min?: string
  max?: string
  autoFocus?: boolean
}) {
  const id = useId()
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <div className={cx('cb-input', 'cb-input--md', disabled && 'is-disabled')}>
        {prefix ? <span className="cb-input__affix">{prefix}</span> : null}
        <input
          id={id}
          type={type}
          value={value}
          placeholder={placeholder}
          inputMode={inputMode}
          disabled={disabled}
          min={min}
          max={max}
          autoFocus={autoFocus}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-hint` : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="cb-input__affix">{suffix}</span> : null}
      </div>
    </Field>
  )
}

export function Select({
  label, hint, error, required, className, value, onChange, options, disabled,
}: FieldChrome & {
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string; disabled?: boolean }>
  disabled?: boolean
}) {
  const id = useId()
  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} className={className}>
      <div className={cx('cb-input', 'cb-select', 'cb-input--md', disabled && 'is-disabled')}>
        <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
          ))}
        </select>
      </div>
    </Field>
  )
}

export function Checkbox({ label, description, checked, onChange, disabled }: {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className={cx('cb-check', disabled && 'is-disabled')}>
      <span className={cx('cb-check__box', checked && 'is-on')}>
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
        {checked ? (
          <svg className="cb-check__glyph" width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : null}
      </span>
      <label htmlFor={id} className="cb-check__text">
        <span className="cb-check__label">{label}</span>
        {description ? <span className="cb-check__desc">{description}</span> : null}
      </label>
    </div>
  )
}

export function RadioGroup<V extends string>({ label, options, value, onChange, horizontal = false }: {
  label?: ReactNode
  options: Array<{ value: V; label: ReactNode; description?: ReactNode }>
  value: V
  onChange: (value: V) => void
  horizontal?: boolean
}) {
  const name = useId()
  return (
    <fieldset className={cx('cb-radiogroup', horizontal && 'cb-radiogroup--h')}>
      {label ? <legend className="cb-field__label">{label}</legend> : null}
      <div className="cb-radiogroup__opts">
        {options.map((option) => {
          const id = `${name}-${option.value}`
          const on = option.value === value
          return (
            <label key={option.value} htmlFor={id} className={cx('cb-radio', on && 'is-on')}>
              <input id={id} type="radio" name={name} value={option.value} checked={on} onChange={() => onChange(option.value)} />
              <span className="cb-radio__dot" aria-hidden="true" />
              <span className="cb-check__text">
                <span className="cb-check__label">{option.label}</span>
                {option.description ? <span className="cb-check__desc">{option.description}</span> : null}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function Tabs({ items, value, onChange, label }: {
  items: Array<{ id: string; label: ReactNode; count?: number }>
  value: string
  onChange: (id: string) => void
  label?: string
}) {
  return (
    <div className="cb-tabs" role="tablist" aria-label={label}>
      {items.map((item) => {
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
          >
            {item.label}
            {item.count != null ? <span className="cb-tab__count">{item.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export function DetailList({ items, columns = 2 }: {
  items: Array<{ label: ReactNode; value: ReactNode; wide?: boolean }>
  columns?: 1 | 2 | 3
}) {
  return (
    <dl className={`cb-details cb-details--${columns}`}>
      {items.map((item, index) => (
        <div key={index} className={cx('cb-details__item', item.wide && 'is-wide')}>
          <dt>{item.label}</dt>
          <dd>{item.value == null || item.value === '' ? '—' : item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Banner({ tone = 'info', title, children, onDismiss }: {
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'
  title?: ReactNode
  children?: ReactNode
  onDismiss?: () => void
}) {
  return (
    <div className={`cb-banner cb-banner--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      {tone === 'success' ? <CheckCircle size={16} className="cb-banner__icon" /> : <AlertCircle size={16} className="cb-banner__icon" />}
      <div className="cb-banner__text">
        {title ? <p className="cb-banner__title">{title}</p> : null}
        {children ? <div className="cb-banner__body">{children}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" className="cb-banner__close" aria-label="Dismiss" onClick={onDismiss}>
          <X size={14} />
        </button>
      ) : null}
    </div>
  )
}

export function MetricTile({ label, value, hint, tone = 'neutral' }: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
}) {
  return (
    <div className={cx('cb-metric', tone !== 'neutral' && `cb-metric--${tone}`)}>
      <span className="cb-metric__label">{label}</span>
      <span className="cb-metric__value">{value}</span>
      {hint ? <span className="cb-metric__hint">{hint}</span> : null}
    </div>
  )
}
