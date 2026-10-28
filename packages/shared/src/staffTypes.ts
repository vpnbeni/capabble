// Staff groups for attendance (Teaching, Admin, Drivers…), worked out from duty type and designation.
// Used by the website (client/src/utils/attndStaffTypes.ts) and the app (staff attendance).

export type StaffTypeId =
  | 'teaching'
  | 'sports-coach'
  | 'admin'
  | 'class-iv'
  | 'drivers'
  | 'conductors'
  | 'security'
  | 'other'

export const STAFF_TYPE_OPTIONS: Array<{ id: StaffTypeId; label: string }> = [
  { id: 'teaching', label: 'Teaching' },
  { id: 'sports-coach', label: 'Sports coach' },
  { id: 'admin', label: 'Admin' },
  { id: 'class-iv', label: 'Class IV' },
  { id: 'drivers', label: 'Drivers' },
  { id: 'conductors', label: 'Conductors' },
  { id: 'security', label: 'Security' },
  { id: 'other', label: 'Other' },
]

type StaffLike = { designation?: string; dutyType?: string }

const normalize = (value?: string) => String(value || '').trim().toLowerCase()

export const getStaffTypeId = (staff: StaffLike): StaffTypeId => {
  const type = normalize(staff.dutyType)
  const designation = normalize(staff.designation)
  const text = `${type} ${designation}`

  if (type.includes('coach') || type === 'pet' || designation.includes('coach') || designation === 'pet') {
    return 'sports-coach'
  }
  if (type === 'driver' || designation.includes('driver')) return 'drivers'
  if (type === 'conductor' || designation.includes('conductor')) return 'conductors'
  if (type === 'security' || text.includes('guard') || designation.includes('security')) return 'security'
  if (type === 'class iv' || type === 'peon' || type === 'sweaper' || type === 'sweeper') return 'class-iv'
  if (type === 'admin' || type === 'clerk' || designation.includes('admin') || designation.includes('clerk')) {
    return 'admin'
  }
  if (type === 'teacher' || /\bprt\b/.test(text) || /\btgt\b/.test(text) || /\bpgt\b/.test(text)) {
    return 'teaching'
  }
  return 'other'
}

export const designationOf = (staff: StaffLike) => String(staff.designation || '').trim() || 'General'

export const staffTypeLabel = (id: StaffTypeId) =>
  STAFF_TYPE_OPTIONS.find((item) => item.id === id)?.label || 'Other'
