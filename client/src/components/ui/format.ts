/**
 * Capabble formatting helpers (en-IN), matching the design system's
 * `formatINR` and `formatDate`.
 */

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

/** ₹12,400 · ₹1,25,000 · compact: ₹18.4 L, ₹1.2 Cr */
export const formatINR = (n: number | null | undefined, opts: { compact?: boolean; decimals?: number } = {}) => {
  if (n == null || Number.isNaN(n)) return '—'
  if (opts.compact) {
    const a = Math.abs(n)
    if (a >= 1e7) return `₹${(n / 1e7).toFixed(2).replace(/\.?0+$/, '')} Cr`
    if (a >= 1e5) return `₹${(n / 1e5).toFixed(2).replace(/\.?0+$/, '')} L`
  }
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: opts.decimals || 0 })}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 7 Oct 2026 · { year: false } → 7 Oct. Missing or invalid values show as "—". */
export const formatDate = (d: Date | string | number | null | undefined, opts: { year?: boolean } = {}) => {
  if (d == null || d === '') return '—'
  const x = d instanceof Date ? d : new Date(d)
  if (Number.isNaN(x.getTime())) return '—'
  let s = `${x.getDate()} ${MONTHS[x.getMonth()]}`
  if (opts.year !== false) s += ` ${x.getFullYear()}`
  return s
}

/** 24-hour "09:45" or "14:30" → "9:45 am" / "2:30 pm". Unparseable values come back as given ("—" when empty). */
export const formatTime = (value: string | null | undefined) => {
  const [h, m] = String(value || '').split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value || '—'
  const suffix = h >= 12 ? 'pm' : 'am'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

/** Shows "—" for empty values, as the design system asks. */
export const orDash = (value: unknown) => {
  if (value == null) return '—'
  const text = String(value).trim()
  return text && text !== '-' ? text : '—'
}

export const initials = (name: string) => {
  const parts = String(name || '').trim().split(/\s+/)
  return (
    ((parts[0] || '')[0] || '').toUpperCase() +
    ((parts.length > 1 ? parts[parts.length - 1][0] : '') || '').toUpperCase()
  )
}
