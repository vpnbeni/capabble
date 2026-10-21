// Money in billing is integer paise; people type and read rupees.

/** 12345678 → "₹1,23,456.78"; whole rupees drop the paise: 150000 → "₹1,500". */
export function formatINR(paise: number | null | undefined, { paiseAlways = false } = {}): string {
  if (paise == null) return '—'
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  const rupees = Math.floor(abs / 100).toLocaleString('en-IN')
  const rest = abs % 100
  return `${sign}₹${rupees}${rest || paiseAlways ? `.${String(rest).padStart(2, '0')}` : ''}`
}

/** "1,500.5" → 150050. Returns null for anything that isn't a valid amount. */
export function rupeesToPaise(input: string): number | null {
  const text = input.replace(/[,\s₹]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return null
  const [whole, fraction = ''] = text.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export const paiseToRupeesInput = (paise: number | null | undefined) =>
  paise == null ? '' : (paise % 100 ? (paise / 100).toFixed(2) : String(paise / 100))

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(value))
}

/** The last day a period covers ([start, end) → end − 1 ms). */
export const formatPeriodEnd = (value: string | null | undefined) =>
  value ? formatDate(new Date(new Date(value).getTime() - 1).toISOString()) : '—'
