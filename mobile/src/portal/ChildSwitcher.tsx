import { classLabel } from '@/lib/format'
import { ChildSwitcher as KitChildSwitcher } from '@/ui'

import { usePortal } from './PortalProvider'

/** Header control for parents with more than one child: shows who is selected, opens a sheet to switch. */
export function ChildSwitcher() {
  const { home, child, setChildId, isParent } = usePortal()
  if (!isParent || !home || home.students.length < 2 || !child) return null

  return (
    <KitChildSwitcher
      value={child.studentId}
      onChange={setChildId}
      students={home.students.map((entry) => ({
        id: entry.studentId,
        name: entry.name,
        meta: classLabel(entry.className, entry.section),
        src: entry.profileImage,
      }))}
    />
  )
}
