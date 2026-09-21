import { normalizeLocationType } from '@/constants/locationConstants'

export type RoomSortableNode = {
  name?: string
  type?: string
  code?: string
  roomNumber?: string
}

export function getRoomDisplayNumber(node: RoomSortableNode): string {
  return String(node.roomNumber || node.code || '').trim()
}

export function getRoomSortKey(node: RoomSortableNode): string {
  const explicit = getRoomDisplayNumber(node)
  if (explicit) return explicit
  const fromName = String(node.name || '').trim().match(/^(\d+)/)
  return fromName ? fromName[1] : ''
}

export function compareRoomLocations(a: RoomSortableNode, b: RoomSortableNode): number {
  const left = getRoomSortKey(a)
  const right = getRoomSortKey(b)
  if (!left && !right) return 0
  if (!left) return 1
  if (!right) return -1
  const numericCompare = left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
  if (numericCompare !== 0) return numericCompare
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
}

export function sortLocationChildren<T extends RoomSortableNode>(
  children: T[],
  parentType?: string,
): T[] {
  if (normalizeLocationType(parentType) !== 'Floor') return children
  return [...children].sort(compareRoomLocations)
}
