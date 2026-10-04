import React from 'react'
import type { LucideIcon } from 'lucide-react'

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

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-300',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-300',
  valid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-300',
  cleared: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/30 dark:text-emerald-300',
  partial: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-300',
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-300',
  draft: 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-700 dark:text-slate-200',
  due: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-900/30 dark:text-sky-300',
  overdue: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-900/30 dark:text-rose-300',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-900/30 dark:text-rose-300',
  bounced: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-900/30 dark:text-rose-300',
  archived: 'bg-slate-100 text-slate-500 ring-slate-500/20 dark:bg-slate-700 dark:text-slate-400',
  waived: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-900/30 dark:text-violet-300',
}

export const CpitlBadge: React.FC<{ status?: string; label?: string }> = ({ status = '', label }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset ${
      STATUS_STYLES[status] || STATUS_STYLES.draft
    }`}
  >
    {label || status.replace(/_/g, ' ') || '—'}
  </span>
)

export const CpitlPageShell: React.FC<{
  title?: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}> = ({ title, subtitle, actions, children }) => (
  <div className="space-y-6 p-4 sm:p-6">
    {(title || actions) && (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {title ? <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2> : null}
          {subtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    )}
    {children}
  </div>
)

export const CpitlCard: React.FC<{ children: React.ReactNode; className?: string; title?: string; actions?: React.ReactNode }> = ({
  children,
  className = '',
  title,
  actions,
}) => (
  <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}>
    {(title || actions) && (
      <div className="mb-4 flex items-center justify-between gap-3">
        {title ? <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3> : <span />}
        {actions}
      </div>
    )}
    {children}
  </section>
)

export const CpitlEmpty: React.FC<{ message: string; action?: React.ReactNode }> = ({ message, action }) => (
  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
    <p>{message}</p>
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
)

const TONES: Record<string, string> = {
  indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300',
}

export const StatCard: React.FC<{
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon: LucideIcon
  tone?: keyof typeof TONES
}> = ({ label, value, hint, icon: Icon, tone = 'indigo' }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1.5 truncate text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
        {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
      </div>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
    </div>
  </div>
)

export const ProgressBar: React.FC<{ value: number; className?: string }> = ({ value, className = '' }) => {
  const pct = Math.max(0, Math.min(100, value || 0))
  const color = pct >= 85 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700 ${className}`}>
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  )
}

/** Budget usage: fills as money is spent; amber near the limit, red when over. */
export const UsageBar: React.FC<{ pct: number; className?: string }> = ({ pct, className = '' }) => {
  const width = Math.max(0, Math.min(100, pct || 0))
  const color = pct > 100 ? 'bg-rose-500' : pct >= 85 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700 ${className}`}>
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${width}%` }} />
    </div>
  )
}

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({
  label,
  hint,
  children,
  className = '',
}) => (
  <label className={`block ${className}`}>
    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
    {children}
    {hint ? <span className="mt-1 block text-[11px] text-slate-400">{hint}</span> : null}
  </label>
)

export const inputClass =
  'mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white'

export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60'

export const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'

export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-700'

export const tableHead = 'bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/40 dark:text-slate-400'
