import React, { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './primitives'
import { cx, formatTime } from './format'
import type { Tone } from './primitives'

/**
 * Calendar pieces for the workspace. Every date is a school day written 'YYYY-MM-DD'
 * (never a Date in the browser's time zone), so a day never shifts by one.
 *
 *  - MiniCalendar: a small month (`.cb-cal`) with up to three dots per day; for cards
 *    and date picking.
 *  - MonthCalendar: the full month grid (`.cb-month`) with labelled items per day,
 *    "+N more", shaded days off; turns into a dot grid on phones.
 *  - AgendaList: items grouped by day (`.cb-agenda`); the default view on phones.
 *
 * Items carry a category colour (`category` 1–6 → `--chart-N`), always next to the item's
 * own words; status (tentative, cancelled) is shown with words, not colour.
 */

export type CalendarCategory = 1 | 2 | 3 | 4 | 5 | 6

export type CalendarEntry = {
  id: string
  startDate: string
  endDate?: string
  title: string
  startTime?: string | null
  category?: CalendarCategory
  /** Short qualifier shown after the title, e.g. "Tentative", "For Riya". */
  note?: string
  muted?: boolean
}

export type CalendarDayInfo = {
  /** Not a working day: shaded, with the label shown in the cell. */
  off?: boolean
  label?: string
  /** Up to three dots for MiniCalendar. */
  tones?: Array<Tone | 'accent'>
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = MONTH_NAMES.map((name) => name.slice(0, 3))
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const utc = (key: string) => new Date(`${key}T00:00:00.000Z`)
export const dayKeyAdd = (key: string, days: number) => new Date(utc(key).getTime() + days * 86400000).toISOString().slice(0, 10)
export const dayKeyWeekday = (key: string) => utc(key).getUTCDay()
export const monthOf = (key: string) => key.slice(0, 7)
export const monthAdd = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

/** "14 Nov", "Fri 14 Nov", "Friday 14 November 2026" for a day key. */
export const formatDayKey = (key: string, opts: { weekday?: 'short' | 'long'; year?: boolean; month?: 'short' | 'long' } = {}) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '—'
  const d = utc(key)
  const day = d.getUTCDate()
  const month = opts.month === 'long' ? MONTH_NAMES[d.getUTCMonth()] : MONTHS_SHORT[d.getUTCMonth()]
  const weekday = opts.weekday === 'long' ? WEEKDAYS_LONG[d.getUTCDay()] : opts.weekday === 'short' ? WEEKDAYS[d.getUTCDay()] : ''
  return [weekday, day, month, opts.year ? d.getUTCFullYear() : ''].filter((part) => part !== '').join(' ')
}

export const formatMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

/** Whole weeks covering a month, starting on `weekStartsOn`. */
export const monthGrid = (month: string, weekStartsOn = 0) => {
  const first = `${month}-01`
  const offset = (dayKeyWeekday(first) - weekStartsOn + 7) % 7
  const start = dayKeyAdd(first, -offset)
  const weeks: string[][] = []
  let cursor = start
  do {
    const week: string[] = []
    for (let i = 0; i < 7; i += 1) {
      week.push(cursor)
      cursor = dayKeyAdd(cursor, 1)
    }
    weeks.push(week)
  } while (monthOf(cursor) === month)
  return { weeks, from: start, to: dayKeyAdd(cursor, -1) }
}

const weekdayHeads = (weekStartsOn: number) => Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7)

const MonthNav: React.FC<{ month: string; onMonthChange?: (month: string) => void; className: string; extra?: React.ReactNode }> = ({
  month,
  onMonthChange,
  className,
  extra,
}) => (
  <div className={`${className}__head`}>
    <span className={`${className}__title`} aria-live="polite">{formatMonth(month)}</span>
    <div className={`${className}__nav`}>
      {extra}
      {onMonthChange ? (
        <>
          <Button variant="tertiary" size="sm" icon={ChevronLeft} aria-label="Previous month" onClick={() => onMonthChange(monthAdd(month, -1))} />
          <Button variant="tertiary" size="sm" icon={ChevronRight} aria-label="Next month" onClick={() => onMonthChange(monthAdd(month, 1))} />
        </>
      ) : null}
    </div>
  </div>
)

/** Small month with dots: a card's "what's coming" or a date to pick. */
export const MiniCalendar: React.FC<{
  month: string
  onMonthChange?: (month: string) => void
  today?: string
  selected?: string | null
  onSelect?: (key: string) => void
  days?: Record<string, CalendarDayInfo>
  legend?: Array<{ label: string; tone: Tone | 'accent' }>
  weekStartsOn?: number
  label?: string
  className?: string
}> = ({ month, onMonthChange, today, selected, onSelect, days = {}, legend, weekStartsOn = 0, label, className }) => {
  const { weeks } = useMemo(() => monthGrid(month, weekStartsOn), [month, weekStartsOn])
  return (
    <div className={cx('cb-cal', className)}>
      <MonthNav month={month} onMonthChange={onMonthChange} className="cb-cal" />
      <table className="cb-cal__grid" role="grid" aria-label={label || formatMonth(month)}>
        <thead>
          <tr>{weekdayHeads(weekStartsOn).map((d) => <th key={d} scope="col" abbr={WEEKDAYS_LONG[d]}>{WEEKDAYS[d].slice(0, 2)}</th>)}</tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]}>
              {week.map((key) => {
                const info = days[key] || {}
                const outside = monthOf(key) !== month
                return (
                  <td key={key}>
                    {outside ? null : (
                      <button
                        type="button"
                        className={cx('cb-cal__day', info.off && 'is-holiday', key === today && 'is-today', key === selected && 'is-selected')}
                        aria-current={key === today ? 'date' : undefined}
                        aria-pressed={onSelect ? key === selected : undefined}
                        aria-label={[formatDayKey(key, { weekday: 'long', month: 'long' }), info.label, info.tones?.length ? `${info.tones.length} item${info.tones.length === 1 ? '' : 's'}` : '']
                          .filter(Boolean).join(', ')}
                        title={info.label || undefined}
                        onClick={onSelect ? () => onSelect(key) : undefined}
                        tabIndex={onSelect ? undefined : -1}
                      >
                        {Number(key.slice(8))}
                        <span className="cb-cal__dots" aria-hidden="true">
                          {(info.tones || []).slice(0, 3).map((tone, i) => <span key={i} className={cx('cb-cal__dot', tone !== 'accent' && `cb-cal__dot--${tone}`)} />)}
                        </span>
                      </button>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {legend?.length ? (
        <div className="cb-cal__legend">
          {legend.map((item) => (
            <span key={item.label} className="cb-cal__legenditem">
              <span className={cx('cb-cal__dot', item.tone !== 'accent' && `cb-cal__dot--${item.tone}`)} aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const entriesByDay = (entries: CalendarEntry[], from: string, to: string) => {
  const map = new Map<string, CalendarEntry[]>()
  entries.forEach((entry) => {
    const end = entry.endDate && entry.endDate > entry.startDate ? entry.endDate : entry.startDate
    let key = entry.startDate < from ? from : entry.startDate
    const last = end > to ? to : end
    let guard = 0
    while (key <= last && guard < 62) {
      const list = map.get(key) || []
      list.push(entry)
      map.set(key, list)
      key = dayKeyAdd(key, 1)
      guard += 1
    }
  })
  return map
}

const EntryLabel: React.FC<{ entry: CalendarEntry; day: string }> = ({ entry, day }) => {
  const continued = entry.startDate < day
  return (
    <>
      <span className={cx('cb-month__swatch', entry.category && `cb-month__swatch--c${entry.category}`)} aria-hidden="true" />
      {!continued && entry.startTime ? <span className="cb-month__time">{formatTime(entry.startTime)}</span> : null}
      <span className="cb-month__text">{continued ? `… ${entry.title}` : entry.title}</span>
    </>
  )
}

/** The full month: what's on each day, by category, with days off shaded. */
export const MonthCalendar: React.FC<{
  month: string
  onMonthChange?: (month: string) => void
  today?: string
  selected?: string | null
  onSelect?: (key: string) => void
  entries: CalendarEntry[]
  onEntryClick?: (entry: CalendarEntry, day: string) => void
  days?: Record<string, CalendarDayInfo>
  maxPerDay?: number
  weekStartsOn?: number
  toolbar?: React.ReactNode
  loading?: boolean
  className?: string
}> = ({ month, onMonthChange, today, selected, onSelect, entries, onEntryClick, days = {}, maxPerDay = 3, weekStartsOn = 0, toolbar, loading, className }) => {
  const { weeks, from, to } = useMemo(() => monthGrid(month, weekStartsOn), [month, weekStartsOn])
  const byDay = useMemo(() => entriesByDay(entries, from, to), [entries, from, to])
  return (
    <div className={cx('cb-month', loading && 'is-loading', className)} aria-busy={loading || undefined}>
      <MonthNav month={month} onMonthChange={onMonthChange} className="cb-month" extra={toolbar} />
      <div className="cb-month__grid" role="grid" aria-label={formatMonth(month)}>
        <div className="cb-month__row cb-month__row--head" role="row">
          {weekdayHeads(weekStartsOn).map((d) => (
            <div key={d} role="columnheader" className="cb-month__weekday" aria-label={WEEKDAYS_LONG[d]}>{WEEKDAYS[d]}</div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="cb-month__row" role="row">
            {week.map((key) => {
              const info = days[key] || {}
              const list = byDay.get(key) || []
              const shown = list.slice(0, maxPerDay)
              const more = list.length - shown.length
              const outside = monthOf(key) !== month
              const dayLabel = [formatDayKey(key, { weekday: 'long', month: 'long' }), info.label,
                list.length ? `${list.length} item${list.length === 1 ? '' : 's'}` : 'nothing on'].filter(Boolean).join(', ')
              return (
                <div
                  key={key}
                  role="gridcell"
                  className={cx('cb-month__cell', outside && 'is-outside', info.off && 'is-off', key === today && 'is-today', key === selected && 'is-selected')}
                  aria-selected={key === selected || undefined}
                >
                  <button
                    type="button"
                    className="cb-month__date"
                    aria-label={dayLabel}
                    aria-current={key === today ? 'date' : undefined}
                    onClick={onSelect ? () => onSelect(key) : undefined}
                  >
                    {Number(key.slice(8))}
                  </button>
                  {info.label ? <span className="cb-month__daylabel" title={info.label}>{info.label}</span> : null}
                  <ul className="cb-month__items">
                    {shown.map((entry) => (
                      <li key={entry.id}>
                        <button
                          type="button"
                          className={cx('cb-month__item', entry.muted && 'is-muted')}
                          onClick={onEntryClick ? () => onEntryClick(entry, key) : onSelect ? () => onSelect(key) : undefined}
                          title={[entry.startTime ? formatTime(entry.startTime) : '', entry.title, entry.note].filter(Boolean).join(' · ')}
                        >
                          <EntryLabel entry={entry} day={key} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {more > 0 ? (
                    <button type="button" className="cb-month__more" onClick={onSelect ? () => onSelect(key) : undefined}>
                      {more} more
                    </button>
                  ) : null}
                  {list.length ? (
                    <span className="cb-month__dots" aria-hidden="true">
                      {list.slice(0, 4).map((entry) => (
                        <span key={entry.id} className={cx('cb-month__swatch', entry.category && `cb-month__swatch--c${entry.category}`)} />
                      ))}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export type AgendaGroup = {
  date: string
  /** e.g. "Holiday: Diwali" for a day off. */
  dayLabel?: string
  off?: boolean
  entries: Array<CalendarEntry & { meta?: React.ReactNode; aside?: React.ReactNode }>
}

/** Items grouped by day. The phone view of the calendar and the dashboard's "Coming up". */
export const AgendaList: React.FC<{
  groups: AgendaGroup[]
  today?: string
  onEntryClick?: (entry: CalendarEntry, day: string) => void
  empty?: React.ReactNode
  compact?: boolean
  className?: string
}> = ({ groups, today, onEntryClick, empty, compact, className }) => {
  if (!groups.length) return <>{empty || null}</>
  const tomorrow = today ? dayKeyAdd(today, 1) : ''
  const heading = (key: string) => {
    if (key === today) return `Today · ${formatDayKey(key, { weekday: 'short' })}`
    if (key === tomorrow) return `Tomorrow · ${formatDayKey(key, { weekday: 'short' })}`
    return formatDayKey(key, { weekday: 'long', month: 'short' })
  }
  return (
    <div className={cx('cb-agenda', compact && 'cb-agenda--compact', className)}>
      {groups.map((group) => (
        <section key={group.date} className={cx('cb-agenda__day', group.off && 'is-off')} aria-label={heading(group.date)}>
          <h4 className="cb-agenda__date">
            <span>{heading(group.date)}</span>
            {group.dayLabel ? <span className="cb-agenda__daylabel">{group.dayLabel}</span> : null}
          </h4>
          {group.entries.length ? (
            <ul className="cb-agenda__list">
              {group.entries.map((entry) => {
                const content = (
                  <>
                    <span className="cb-agenda__time">{entry.startTime && entry.startDate === group.date ? formatTime(entry.startTime) : 'All day'}</span>
                    <span className={cx('cb-month__swatch', entry.category && `cb-month__swatch--c${entry.category}`)} aria-hidden="true" />
                    <span className="cb-agenda__body">
                      <span className="cb-agenda__title">{entry.title}{entry.note ? <span className="cb-agenda__note"> · {entry.note}</span> : null}</span>
                      {entry.meta ? <span className="cb-agenda__meta">{entry.meta}</span> : null}
                    </span>
                    {entry.aside ? <span className="cb-agenda__aside">{entry.aside}</span> : null}
                  </>
                )
                return (
                  <li key={entry.id}>
                    {onEntryClick ? (
                      <button type="button" className={cx('cb-agenda__item', entry.muted && 'is-muted')} onClick={() => onEntryClick(entry, group.date)}>
                        {content}
                      </button>
                    ) : (
                      <div className={cx('cb-agenda__item', entry.muted && 'is-muted')}>{content}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  )
}
