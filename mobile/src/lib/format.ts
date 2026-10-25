// Display formats from the design system. Same rules as client/src/components/ui/format.ts,
// client/src/components/ui/calendar.tsx (day keys) and client/src/utils/classLabel.ts;
// move them to packages/shared once both apps import from there.

/** "10th", "Class X" → "10"; keeps names like "Nursery". */
export const shortClass = (className?: string | null) =>
  String(className || '')
    .trim()
    .replace(/^class\s*/i, '')
    .replace(/^(\d+)\s*(st|nd|rd|th)$/i, '$1')

/** School style: "Class 7-A" (never "7th-A"). */
export const classLabel = (className?: string | null, section?: string | null) => {
  const cls = shortClass(className)
  if (!cls) return '—'
  return `Class ${cls}${section ? `-${section}` : ''}`
}

/** ₹12,400 · ₹1,25,000 · compact: ₹18.4 L, ₹1.2 Cr */
export const formatINR = (n: number | null | undefined, opts: { compact?: boolean } = {}) => {
  if (n == null || Number.isNaN(n)) return '—'
  if (opts.compact) {
    const a = Math.abs(n)
    if (a >= 1e7) return `₹${(n / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`
    if (a >= 1e5) return `₹${(n / 1e5).toFixed(2).replace(/\.?0+$/, '')} L`
  }
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** 7 Oct 2026 · { year: false } → 7 Oct. Missing or invalid values show as "—". */
export const formatDate = (d: Date | string | number | null | undefined, opts: { year?: boolean } = {}) => {
  if (d == null || d === '') return '—'
  const x = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(x.getTime())) return '—'
  let s = `${x.getDate()} ${MONTHS[x.getMonth()]}`
  if (opts.year !== false) s += ` ${x.getFullYear()}`
  return s
}

/** "09:45" / "14:30" → "9:45 am" / "2:30 pm". */
export const formatTime = (value: string | null | undefined) => {
  const [h, m] = String(value || '').split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value || '—'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`
}

/** "Just now", "5 min ago", "3 hours ago", "Yesterday", then the date. */
export const formatRelative = (d: Date | string | number | null | undefined, now: Date = new Date()) => {
  if (d == null || d === '') return '—'
  const x = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(x.getTime())) return '—'
  const minutes = Math.floor((now.getTime() - x.getTime()) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24 && x.getDate() === now.getDate()) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (x.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return formatDate(x, { year: x.getFullYear() !== now.getFullYear() })
}

// School days are 'YYYY-MM-DD' keys, never a device Date (the device may not be in India).
const utc = (key: string) => new Date(`${key}T00:00:00.000Z`)

/** Today in the school's time zone, as a day key. */
export const schoolToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

export const dayKeyAdd = (key: string, days: number) => new Date(utc(key).getTime() + days * 86400000).toISOString().slice(0, 10)
export const monthOf = (key: string) => key.slice(0, 7)
export const monthAdd = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7)
}
/** Last day of a month, as a day key. */
export const monthEnd = (month: string) => dayKeyAdd(`${monthAdd(month, 1)}-01`, -1)

/** "14 Nov", "Fri 14 Nov", "Friday 14 November 2026" for a day key. */
export const formatDayKey = (key: string, opts: { weekday?: 'short' | 'long'; year?: boolean; month?: 'short' | 'long' } = {}) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return '—'
  const d = utc(key)
  const month = opts.month === 'long' ? MONTH_NAMES[d.getUTCMonth()] : MONTHS[d.getUTCMonth()]
  const weekday = opts.weekday === 'long' ? WEEKDAYS_LONG[d.getUTCDay()] : opts.weekday === 'short' ? WEEKDAYS[d.getUTCDay()] : ''
  return [weekday, d.getUTCDate(), month, opts.year ? d.getUTCFullYear() : ''].filter((part) => part !== '').join(' ')
}

/** "November 2026" */
export const formatMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}
