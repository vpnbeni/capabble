export const LOCATION_TYPES = ['Campus', 'Block', 'Floor', 'Room'] as const
export type LocationType = typeof LOCATION_TYPES[number]

export const ROOM_TYPES = [
  'Classroom',
  'Laboratory',
  'Office',
  'Staff Room',
  'Store',
  'Library',
  'Activity Room',
  'Hall',
  'Auditorium',
  'Reception',
  'Other',
] as const

export const LOCATION_TYPE_META: Record<string, { label: string; icon: string; badge: string }> = {
  Campus: { label: 'CAMPUS', icon: '🏫', badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' },
  Block: { label: 'BLOCK', icon: '🏢', badge: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
  Floor: { label: 'FLOOR', icon: '▱', badge: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
  Room: { label: 'ROOM', icon: '🚪', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
}

export function normalizeLocationType(type?: string): LocationType | string {
  if (!type) return 'Room'
  if (type === 'Campus' || type === 'Block' || type === 'Floor' || type === 'Room') return type
  return 'Room'
}

export function childTypeForParent(parentType?: string): LocationType | null {
  if (parentType === 'Campus') return 'Block'
  if (parentType === 'Block') return 'Floor'
  if (parentType === 'Floor') return 'Room'
  return null
}

export function addFormTitle(type: LocationType): string {
  if (type === 'Campus') return 'Add Campus'
  if (type === 'Block') return 'Add Block'
  if (type === 'Floor') return 'Add Floor'
  return 'Add Room'
}
