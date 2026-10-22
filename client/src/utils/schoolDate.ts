/**
 * School-local calendar days, matching server/src/utils/schoolDate.js.
 * A day is a 'YYYY-MM-DD' key in the school's time zone (default India time),
 * never the browser's local day or the UTC day.
 */

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata'

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const isDateKey = (value: unknown): value is string => {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** The school-local day of an instant; day keys pass through unchanged, junk gives ''. */
export const dateKey = (value: Date | string | number = new Date(), timeZone = DEFAULT_TIME_ZONE): string => {
  if (isDateKey(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}

/** Weekday name of a day key or instant, or '' when it can't be read. */
export const weekdayName = (value: Date | string | number): string => {
  const key = dateKey(value)
  return key ? WEEKDAY_NAMES[new Date(`${key}T00:00:00.000Z`).getUTCDay()] : ''
}
