export const ASSET_STATUSES = [
  'PROCURED',
  'RECEIVED',
  'IN_STOCK',
  'ALLOCATED',
  'IN_USE',
  'UNDER_MAINTENANCE',
  'DAMAGED',
  'LOST',
  'RETIRED',
  'DISPOSED',
] as const

export const ASSET_CONDITIONS = [
  'New',
  'Excellent',
  'Good',
  'Fair',
  'Poor',
  'Damaged',
  'Beyond Repair',
] as const

export const MAINTENANCE_STATUSES = [
  'Reported',
  'Assigned',
  'In Progress',
  'Awaiting Parts',
  'Completed',
  'Closed',
] as const

export const DISPOSAL_REASONS = [
  'Beyond repair',
  'Obsolete',
  'Damaged',
  'Lost',
  'Sold',
  'Donated',
  'Scrapped',
  'Other',
] as const

export const statusBadgeClass = (status: string) => {
  const map: Record<string, string> = {
    IN_STOCK: 'bg-sky-50 text-sky-700 ring-sky-200',
    IN_USE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    ALLOCATED: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    UNDER_MAINTENANCE: 'bg-amber-50 text-amber-700 ring-amber-200',
    DAMAGED: 'bg-orange-50 text-orange-700 ring-orange-200',
    LOST: 'bg-rose-50 text-rose-700 ring-rose-200',
    RETIRED: 'bg-slate-100 text-slate-600 ring-slate-200',
    DISPOSED: 'bg-slate-200 text-slate-500 ring-slate-300',
    PROCURED: 'bg-violet-50 text-violet-700 ring-violet-200',
    RECEIVED: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  }
  return map[status] || 'bg-slate-50 text-slate-600 ring-slate-200'
}

export const formatMoney = (value?: number | null) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(value || 0)
  )

export const formatDate = (value?: string | Date | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB')
}
