import { Badge, Progress, type Tone } from '@/components/ui'
import React from 'react'

export const inr = (value: number | null | undefined, opts: { decimals?: boolean } = {}) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: opts.decimals ? 2 : 0,
    maximumFractionDigits: opts.decimals ? 2 : 0,
  })}`

/** Compact Indian notation: ₹1.2 L, ₹3.4 Cr. */
export const inrShort = (value: number | null | undefined) => {
  const n = Number(value || 0)
  const abs = Math.abs(n)
  // Drop trailing decimal zeros only ("1.50" → "1.5", "50" stays "50").
  const trim = (v: number, digits: number) => v.toFixed(digits).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  if (abs >= 1e7) return `₹${trim(n / 1e7, abs >= 1e8 ? 1 : 2)} Cr`
  if (abs >= 1e5) return `₹${trim(n / 1e5, abs >= 1e6 ? 1 : 2)} L`
  if (abs >= 1e3) return `₹${trim(n / 1e3, abs >= 1e4 ? 0 : 1)}K`
  return inr(n)
}

export const fmtDate = (value?: string | Date | null) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

export const FREQUENCY_LABELS: Record<string, string> = {
  one_time: 'One-time',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  annual: 'Annual',
}

export const MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  upi: 'UPI',
  cheque: 'Cheque',
  dd: 'Demand Draft',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Extract a readable message from an axios error, including blob (PDF) responses. */
export const errorMessage = async (error: any, fallback = 'Something went wrong.') => {
  const data = error?.response?.data
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text())
      return parsed?.message || fallback
    } catch {
      return fallback
    }
  }
  return data?.message || error?.message || fallback
}

const STATUS_TONE: Record<string, Tone | 'accent'> = {
  active: 'success',
  paid: 'success',
  valid: 'success',
  cleared: 'success',
  approved: 'success',
  completed: 'success',
  processed: 'success',
  partial: 'warning',
  pending: 'warning',
  draft: 'neutral',
  due: 'info',
  upcoming: 'info',
  in_progress: 'info',
  overdue: 'danger',
  cancelled: 'danger',
  bounced: 'danger',
  rejected: 'danger',
  archived: 'neutral',
  waived: 'accent',
}

/** Status as a kit badge — words plus a tone. Renders inside a `.cb-app` page. */
export const cpitlStatusTone = (status = ''): Tone | 'accent' =>
  STATUS_TONE[status.trim().toLowerCase().replace(/[\s-]+/g, '_')] || 'neutral'

export const CpitlBadge: React.FC<{ status?: string; label?: string }> = ({ status = '', label }) => {
  const words = label || status.replace(/_/g, ' ')
  if (!words) return <span className="cb-subtle">—</span>
  return <Badge tone={cpitlStatusTone(status)}>{words.charAt(0).toUpperCase() + words.slice(1)}</Badge>
}

/** Collection-style progress: green when healthy, amber midway, red when low. */
export const ProgressBar: React.FC<{ value: number; className?: string }> = ({ value, className }) => {
  const pct = Math.max(0, Math.min(100, value || 0))
  return (
    <Progress value={pct} showValue={false} size="sm" tone={pct >= 85 ? 'success' : pct >= 50 ? 'warning' : 'danger'} className={className} />
  )
}

/** Budget usage: fills as money is spent; amber near the limit, red when over. */
export const UsageBar: React.FC<{ pct: number; className?: string }> = ({ pct, className }) => (
  <Progress
    value={Math.max(0, Math.min(100, pct || 0))}
    showValue={false}
    size="sm"
    tone={pct > 100 ? 'danger' : pct >= 85 ? 'warning' : 'success'}
    className={className}
  />
)
