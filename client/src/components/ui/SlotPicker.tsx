import React, { useId } from 'react'
import { AlertCircle } from 'lucide-react'
import { cx, formatTime } from './format'
import { Icon } from './primitives'
import type { FieldChrome } from './forms'

export type SlotPickerSlot = {
  start: string
  end?: string
  /** free — can be picked; busy — taken or too soon; caution — pickable only with `allowCaution` (e.g. a teaching period). */
  state: 'free' | 'busy' | 'caution'
  /** Why the slot is busy or needs care; shown as the title and to screen readers. */
  reason?: string
}

export interface SlotPickerProps extends FieldChrome {
  slots: SlotPickerSlot[]
  value: string
  onChange: (start: string) => void
  /** Lets the user pick `caution` slots (they are shown, but disabled, otherwise). */
  allowCaution?: boolean
  /** Shown instead of the grid when there are no slots. */
  emptyText?: React.ReactNode
  loading?: boolean
}

/**
 * Time-slot chooser: one chip per slot, picked like a radio group. Busy slots stay visible
 * so people can see the day's shape; their reason is announced, never shown by colour alone.
 */
export const SlotPicker: React.FC<SlotPickerProps> = ({
  label,
  hint,
  error,
  required,
  className,
  slots,
  value,
  onChange,
  allowCaution = false,
  emptyText = 'No times available on this day.',
  loading = false,
}) => {
  const groupName = useId()
  const hasCaution = slots.some((slot) => slot.state === 'caution')
  return (
    <fieldset className={cx('cb-field', 'cb-slots', Boolean(error) && 'is-invalid', className)} aria-busy={loading || undefined}>
      {label ? (
        <legend className="cb-field__label">
          {label}
          {required ? <span className="cb-field__req" aria-hidden="true">{' *'}</span> : null}
        </legend>
      ) : null}
      {loading ? (
        <div className="cb-slots__empty"><span className="cb-spinner" /> Loading times</div>
      ) : slots.length === 0 ? (
        <div className="cb-slots__empty">{emptyText}</div>
      ) : (
        <div className="cb-slots__grid">
          {slots.map((slot) => {
            const id = `${groupName}-${slot.start}`
            const disabled = slot.state === 'busy' || (slot.state === 'caution' && !allowCaution)
            const on = slot.start === value
            return (
              <label
                key={slot.start}
                htmlFor={id}
                title={slot.reason || undefined}
                className={cx('cb-slot', `cb-slot--${slot.state}`, on && 'is-on', disabled && 'is-disabled')}
              >
                <input
                  id={id}
                  type="radio"
                  name={groupName}
                  value={slot.start}
                  checked={on}
                  disabled={disabled}
                  onChange={() => onChange(slot.start)}
                />
                <span className="cb-slot__time is-num">{formatTime(slot.start)}</span>
                {slot.state !== 'free' && slot.reason ? <span className="cb-visually-hidden">, {slot.reason}</span> : null}
              </label>
            )
          })}
        </div>
      )}
      {hasCaution && !loading ? (
        <div className="cb-slots__legend">
          <span className="cb-slot cb-slot--caution cb-slot--key" aria-hidden="true" />
          {allowCaution ? 'Teaching period: pick only if the meeting must happen then.' : 'Teaching period'}
        </div>
      ) : null}
      {error || hint ? (
        <div className={error ? 'cb-field__error' : 'cb-field__hint'}>
          {error ? <Icon icon={AlertCircle} size={14} /> : null}
          {error || hint}
        </div>
      ) : null}
    </fieldset>
  )
}
