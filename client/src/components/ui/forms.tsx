import React, { forwardRef, useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, ChevronDown, FileText, Upload, type LucideIcon } from 'lucide-react'
import { cx } from './format'
import { Icon } from './primitives'

export type FieldChrome = {
  label?: React.ReactNode
  hint?: React.ReactNode
  error?: React.ReactNode
  required?: boolean
  className?: string
}

/** Label, control and a hint or error underneath. Every field has a visible label. */
export const Field: React.FC<FieldChrome & { id: string; children: React.ReactNode }> = ({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}) => (
  <div className={cx('cb-field', Boolean(error) && 'is-invalid', className)}>
    {label ? (
      <label className="cb-field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="cb-field__req" aria-hidden="true">
            {' *'}
          </span>
        ) : null}
      </label>
    ) : null}
    {children}
    {error || hint ? (
      <div id={`${id}-hint`} className={error ? 'cb-field__error' : 'cb-field__hint'}>
        {error ? <Icon icon={AlertCircle} size={14} /> : null}
        {error || hint}
      </div>
    ) : null}
  </div>
)

export interface TextFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'>,
    FieldChrome {
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  icon?: LucideIcon
  size?: 'sm' | 'md' | 'lg'
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, required, className, prefix, suffix, icon, size = 'md', id, disabled, type, ...rest },
  ref
) {
  const autoId = useId()
  const fieldId = id || autoId
  return (
    <Field id={fieldId} label={label} hint={hint} error={error} required={required} className={className}>
      <div className={cx('cb-input', `cb-input--${size}`, disabled && 'is-disabled')}>
        {icon ? <Icon icon={icon} size={16} className="cb-input__icon" /> : null}
        {prefix ? <span className="cb-input__affix">{prefix}</span> : null}
        <input
          ref={ref}
          type={type || 'text'}
          {...rest}
          id={fieldId}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-hint` : undefined}
        />
        {suffix ? <span className="cb-input__affix">{suffix}</span> : null}
      </div>
    </Field>
  )
})

export interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, FieldChrome {}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, hint, error, required, className, id, disabled, rows = 3, ...rest },
  ref
) {
  const autoId = useId()
  const fieldId = id || autoId
  return (
    <Field id={fieldId} label={label} hint={hint} error={error} required={required} className={className}>
      <div className={cx('cb-input', 'cb-input--textarea', disabled && 'is-disabled')}>
        <textarea
          ref={ref}
          rows={rows}
          {...rest}
          id={fieldId}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-hint` : undefined}
        />
      </div>
    </Field>
  )
})

export type SelectOption = string | { value: string; label: React.ReactNode; disabled?: boolean }

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>,
    FieldChrome {
  options: SelectOption[]
  placeholder?: string
  size?: 'sm' | 'md' | 'lg'
}

/** Native dropdown for a short, known list (up to ~15 options). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, className, options, placeholder, size = 'md', id, disabled, ...rest },
  ref
) {
  const autoId = useId()
  const fieldId = id || autoId
  return (
    <Field id={fieldId} label={label} hint={hint} error={error} required={required} className={className}>
      <div className={cx('cb-input', 'cb-select', `cb-input--${size}`, disabled && 'is-disabled')}>
        <select
          ref={ref}
          {...rest}
          id={fieldId}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-hint` : undefined}
        >
          {placeholder != null ? <option value="">{placeholder}</option> : null}
          {options.map((option) => {
            const value = typeof option === 'object' ? option.value : option
            const text = typeof option === 'object' ? option.label : option
            return (
              <option key={value} value={value} disabled={typeof option === 'object' ? option.disabled : undefined}>
                {text}
              </option>
            )
          })}
        </select>
        <Icon icon={ChevronDown} size={16} className="cb-select__chev" />
      </div>
    </Field>
  )
})

const CheckGlyph: React.FC<{ indeterminate?: boolean }> = ({ indeterminate }) => (
  <svg
    className="cb-check__glyph"
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={3.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {indeterminate ? <path d="M6 12h12" /> : <path d="M20 6 9 17l-5-5" />}
  </svg>
)

export interface CheckboxProps {
  label?: React.ReactNode
  description?: React.ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  indeterminate?: boolean
  disabled?: boolean
  name?: string
  className?: string
  'aria-label'?: string
}

export const Checkbox: React.FC<CheckboxProps> = ({
  label,
  description,
  checked,
  onChange,
  indeterminate,
  disabled,
  name,
  className,
  'aria-label': ariaLabel,
}) => {
  const id = useId()
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate)
  }, [indeterminate])
  const on = checked || indeterminate
  return (
    <div className={cx('cb-check', disabled && 'is-disabled', className)}>
      <span className={cx('cb-check__box', on && 'is-on')}>
        <input
          ref={ref}
          id={id}
          type="checkbox"
          name={name}
          checked={checked}
          disabled={disabled}
          aria-label={label ? undefined : ariaLabel}
          aria-describedby={description ? `${id}-d` : undefined}
          onChange={(event) => onChange(event.target.checked)}
        />
        {on ? <CheckGlyph indeterminate={indeterminate && !checked} /> : null}
      </span>
      {label ? (
        <label htmlFor={id} className="cb-check__text">
          <span className="cb-check__label">{label}</span>
          {description ? (
            <span id={`${id}-d`} className="cb-check__desc">
              {description}
            </span>
          ) : null}
        </label>
      ) : null}
    </div>
  )
}

/** On/off setting inside a saved form is a Checkbox; this is for settings that apply immediately. */
export const Switch: React.FC<{
  label?: React.ReactNode
  description?: React.ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}> = ({ label, description, checked, onChange, disabled, 'aria-label': ariaLabel }) => {
  const id = useId()
  return (
    <div className={cx('cb-switch', disabled && 'is-disabled')}>
      {label ? (
        <label htmlFor={id} className="cb-check__text">
          <span className="cb-check__label">{label}</span>
          {description ? (
            <span id={`${id}-d`} className="cb-check__desc">
              {description}
            </span>
          ) : null}
        </label>
      ) : null}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        aria-describedby={description ? `${id}-d` : undefined}
        aria-label={label ? undefined : ariaLabel}
        className={cx('cb-switch__track', checked && 'is-on')}
        onClick={() => onChange(!checked)}
      >
        <span className="cb-switch__thumb" />
      </button>
    </div>
  )
}

/** Compact one-of-few choice that applies immediately (e.g. theme). Arrow keys move the choice. */
export const SegmentedControl: React.FC<{
  options: Array<{ value: string; label: React.ReactNode; icon?: LucideIcon }>
  value: string
  onChange: (value: string) => void
  label: string
  fullWidth?: boolean
  className?: string
}> = ({ options, value, onChange, label, fullWidth, className }) => {
  const onKey = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const nextIndex = (index + step + options.length) % options.length
    onChange(options[nextIndex].value)
    const sibling = event.currentTarget.parentElement?.children[nextIndex] as HTMLElement | undefined
    sibling?.focus()
  }
  return (
    <div className={cx('cb-segmented', fullWidth && 'is-full', className)} role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={cx('cb-segmented__item', on && 'is-active')}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKey(event, index)}
          >
            {option.icon ? <Icon icon={option.icon} size={14} /> : null}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export interface RadioGroupProps {
  label?: React.ReactNode
  options: Array<{ value: string; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }>
  value: string
  onChange: (value: string) => void
  variant?: 'list' | 'cards'
  orientation?: 'vertical' | 'horizontal'
  hint?: React.ReactNode
  name?: string
  className?: string
}

/** Exactly one of 2–5 options, all visible. More than five: use Select. */
export const RadioGroup: React.FC<RadioGroupProps> = ({
  label,
  options,
  value,
  onChange,
  variant = 'list',
  orientation = 'vertical',
  hint,
  name,
  className,
}) => {
  const autoId = useId()
  const groupName = name || autoId
  return (
    <fieldset
      className={cx(
        'cb-radiogroup',
        orientation === 'horizontal' && 'cb-radiogroup--h',
        variant === 'cards' && 'cb-radiogroup--cards',
        className
      )}
    >
      {label ? <legend className="cb-field__label">{label}</legend> : null}
      <div className="cb-radiogroup__opts">
        {options.map((option) => {
          const id = `${groupName}-${option.value}`
          const on = option.value === value
          return (
            <label key={option.value} htmlFor={id} className={cx('cb-radio', on && 'is-on', option.disabled && 'is-disabled')}>
              <input
                id={id}
                type="radio"
                name={groupName}
                value={option.value}
                checked={on}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
              />
              <span className="cb-radio__dot" aria-hidden="true" />
              <span className="cb-check__text">
                <span className="cb-check__label">{option.label}</span>
                {option.description ? <span className="cb-check__desc">{option.description}</span> : null}
              </span>
            </label>
          )
        })}
      </div>
      {hint ? <div className="cb-field__hint">{hint}</div> : null}
    </fieldset>
  )
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface FileFieldProps extends FieldChrome {
  file: File | null
  onChange: (file: File | null) => void
  /** Same as the input's accept, e.g. ".pdf" */
  accept?: string
  /** What to pick, shown when nothing is chosen: "Choose the Class 10 candidate list (PDF)" */
  placeholder?: string
  disabled?: boolean
  id?: string
}

/**
 * One file to upload: a drop zone that shows the chosen file's name and size, with a button
 * to choose or replace it. Every field has a visible label.
 */
export const FileField: React.FC<FileFieldProps> = ({
  label,
  hint,
  error,
  required,
  className,
  file,
  onChange,
  accept,
  placeholder = 'Drop a file here or choose one',
  disabled,
  id,
}) => {
  const autoId = useId()
  const fieldId = id || autoId
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const pick = (list: FileList | null) => {
    const next = list?.[0]
    if (next) onChange(next)
  }

  return (
    <Field id={fieldId} label={label} hint={hint} error={error} required={required} className={className}>
      <div
        className={cx('cb-file', file && 'has-file', dragging && 'is-dragging', disabled && 'is-disabled')}
        onDragOver={(event) => { if (disabled) return; event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!disabled) pick(event.dataTransfer.files)
        }}
      >
        <Icon icon={file ? FileText : Upload} size={20} className="cb-file__icon" />
        <div className="cb-file__body">
          {file ? (
            <>
              <span className="cb-file__name">{file.name}</span>
              <span className="cb-file__meta">{formatFileSize(file.size)}</span>
            </>
          ) : (
            <span className="cb-file__placeholder">{placeholder}</span>
          )}
        </div>
        <button
          type="button"
          className="cb-btn cb-btn--secondary cb-btn--sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {file ? 'Replace' : 'Choose file'}
        </button>
        <input
          ref={inputRef}
          id={fieldId}
          type="file"
          accept={accept}
          disabled={disabled}
          required={required}
          className="cb-visually-hidden"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-hint` : undefined}
          onChange={(event) => {
            pick(event.target.files)
            event.target.value = ''
          }}
        />
      </div>
    </Field>
  )
}
