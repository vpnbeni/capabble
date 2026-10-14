import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, X } from 'lucide-react'
import { cx } from './format'
import { Icon } from './primitives'
import { Field, type FieldChrome } from './forms'

export type ComboboxOption = { value: string; label: string; meta?: string; keywords?: string }

export interface ComboboxProps extends FieldChrome {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Text shown for the chosen value; defaults to that option's label. */
  selectedLabel?: string
  /** Shows a clear button while a value is chosen. */
  clearable?: boolean
  emptyText?: React.ReactNode
  maxResults?: number
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  'aria-label'?: string
}

/**
 * Searchable picker for long lists (students, teachers, subjects). Filters by label, meta
 * and keywords; arrow keys and Enter choose. The list portals to the body inside its own
 * .cb-app so a card's or table's clipping can't cut it off, and flips up near the bottom.
 */
export const Combobox: React.FC<ComboboxProps> = ({
  label,
  hint,
  error,
  required,
  className,
  options,
  value,
  onChange,
  placeholder,
  selectedLabel,
  clearable = true,
  emptyText,
  maxResults,
  size = 'md',
  disabled,
  'aria-label': ariaLabel,
}) => {
  const id = useId()
  const listId = `${id}-list`
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const shownLabel = selectedLabel ?? options.find((o) => o.value === value)?.label ?? ''
  const name = ariaLabel || (typeof label === 'string' ? label : undefined)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? options.filter((o) => `${o.label} ${o.meta || ''} ${o.keywords || ''}`.toLowerCase().includes(q))
      : options
    return maxResults ? list.slice(0, maxResults) : list
  }, [options, query, maxResults])

  useLayoutEffect(() => {
    if (!open) return
    const update = () => {
      if (wrapRef.current) setRect(wrapRef.current.getBoundingClientRect())
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (wrapRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
      setQuery('')
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    if (!open || !listRef.current) return
    listRef.current.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const openList = () => {
    if (open || disabled) return
    setQuery('')
    const current = options.findIndex((o) => o.value === value)
    setActive(current >= 0 ? current : 0)
    setOpen(true)
  }

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const choose = (next: string) => {
    onChange(next)
    close()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) openList()
      else setActive((i) => Math.min(filtered.length - 1, i + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (event.key === 'Enter') {
      if (!open) return
      event.preventDefault()
      const option = filtered[active]
      if (option) choose(option.value)
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault()
        event.stopPropagation()
        close()
      }
    } else if (event.key === 'Tab') {
      close()
    }
  }

  const spaceBelow = rect ? window.innerHeight - rect.bottom : 0
  const flipUp = Boolean(rect && spaceBelow < 280 && rect.top > spaceBelow)
  const listStyle: React.CSSProperties | undefined = rect
    ? {
        position: 'fixed',
        // At least 240px wide so long names don't wrap word by word, kept inside the viewport.
        left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 240) - 8)),
        right: 'auto',
        width: Math.max(rect.width, 240),
        top: flipUp ? 'auto' : rect.bottom + 4,
        bottom: flipUp ? window.innerHeight - rect.top + 4 : 'auto',
        maxHeight: 260,
        zIndex: 120,
      }
    : undefined

  return (
    <Field id={id} label={label} hint={hint} error={error} required={required} className={cx('cb-combobox', className)}>
      <div ref={wrapRef} className={cx('cb-input', `cb-input--${size}`, 'cb-combo', disabled && 'is-disabled')}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          disabled={disabled}
          aria-label={label ? undefined : ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-hint` : undefined}
          aria-activedescendant={open && filtered[active] ? `${id}-opt-${active}` : undefined}
          placeholder={open ? shownLabel || placeholder : placeholder}
          value={open ? query : shownLabel}
          onFocus={openList}
          onClick={openList}
          onChange={(event) => {
            if (!open) openList()
            setQuery(event.target.value)
          }}
          onKeyDown={onKeyDown}
        />
        {clearable && value && !open && !disabled ? (
          <button
            type="button"
            className="cb-combo__clear"
            aria-label={name ? `Clear ${name.toLowerCase()}` : 'Clear'}
            onClick={() => onChange('')}
          >
            <Icon icon={X} size={14} />
          </button>
        ) : null}
        <Icon icon={ChevronDown} size={16} className="cb-combo__chev" />
      </div>
      {open && rect
        ? createPortal(
            <div className="cb-app cb-portal">
              <ul ref={listRef} id={listId} role="listbox" aria-label={name} className="cb-combo__list" style={listStyle}>
                {filtered.length === 0 ? (
                  <li className="cb-combo__empty">{emptyText || `No matches for “${query.trim()}”`}</li>
                ) : (
                  filtered.map((option, index) => {
                    const isSelected = option.value === value
                    return (
                      <li
                        key={option.value}
                        id={`${id}-opt-${index}`}
                        data-index={index}
                        role="option"
                        aria-selected={isSelected}
                        className={cx('cb-combo__opt', index === active && 'is-active', isSelected && 'is-selected')}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => {
                          choose(option.value)
                          inputRef.current?.blur()
                        }}
                      >
                        <span className="cb-combo__text">
                          <span className="cb-combo__label">{option.label}</span>
                          {option.meta ? <span className="cb-combo__meta">{option.meta}</span> : null}
                        </span>
                        {isSelected ? <Icon icon={Check} size={16} className="cb-combo__tick" /> : null}
                      </li>
                    )
                  })
                )}
              </ul>
            </div>,
            document.body
          )
        : null}
    </Field>
  )
}
