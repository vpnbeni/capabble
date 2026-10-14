import { getSectionDisplayName } from '../../constants/sectionMetadata'
import { resolveApiBaseUrl } from '../../utils/tenantRuntime'

/** "LILY" → "Lily"; mixed-case names and short codes like "A" are left as they are. */
export const sectionLabel = (section?: string | null) => {
  const name = getSectionDisplayName(String(section || ''))
  if (!name) return ''
  if (name.length > 2 && name === name.toUpperCase()) {
    return name.charAt(0) + name.slice(1).toLowerCase()
  }
  return name
}

/** "4th" → "Class 4th". Values that already say "Class" are kept. */
export const classLabel = (className?: string | null) => {
  const name = String(className || '').trim()
  if (!name) return '—'
  return /^class\b/i.test(name) ? name : `Class ${name}`
}

/** "Class 4th · Lily" */
export const classSectionLabel = (className?: string | null, section?: string | null) => {
  const s = sectionLabel(section)
  return s ? `${classLabel(className)} · ${s}` : classLabel(className)
}

export const normalizeGender = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'male' || normalized === 'boy') return 'Boy'
  if (normalized === 'female' || normalized === 'girl') return 'Girl'
  if (normalized === 'other') return 'Other'
  if (normalized === 'unspecified' || !normalized) return 'Not recorded'
  return String(value)
}

export const studentPhotoUrl = (profileImage?: string | null) => {
  if (!profileImage) return null
  if (/^(https?:|data:|blob:)/.test(profileImage)) return profileImage
  return `${resolveApiBaseUrl().replace(/\/api\/?$/, '')}${profileImage}`
}

export const formatAddress = (
  address?: { street?: string; city?: string; state?: string; pincode?: string } | null
) => {
  if (!address) return ''
  return [address.street, address.city, address.state, address.pincode]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ')
}

const numberFormat = new Intl.NumberFormat('en-IN')
/** Indian digit grouping: 1,090 · 1,25,000 */
export const formatCount = (n: number | null | undefined) => numberFormat.format(Number(n) || 0)
