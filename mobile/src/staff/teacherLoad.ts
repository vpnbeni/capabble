import type { TimetableSetup } from '@/services/timetableService'

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** A class-section's periods a week for a subject. */
export const periodsOf = (setup: TimetableSetup, classId: string, subject: string) => {
  const counts = setup.periodAllocation[classId] ?? {}
  const key = Object.keys(counts).find((name) => same(name, subject))
  return key ? Number(counts[key]) || 0 : 0
}

/** Who teaches a subject in a class-section (teacher ids). */
export const teachersOf = (setup: TimetableSetup, classId: string, subject: string) =>
  (setup.teacherSubjectAllocations ?? [])
    .filter((entry) => entry.assignments.some((row) => row.classId === classId && row.subjects.some((name) => same(name, subject))))
    .map((entry) => entry.teacherId)

/** What a teacher teaches: each class-section and subject with its periods a week. */
export const teachingOf = (setup: TimetableSetup, teacherId: string) =>
  ((setup.teacherSubjectAllocations ?? []).find((entry) => entry.teacherId === teacherId)?.assignments ?? []).flatMap((row) =>
    row.subjects.map((subject) => ({ classId: row.classId, className: row.className, section: row.section, subject, periods: periodsOf(setup, row.classId, subject) })),
  )

/**
 * A teacher's periods a week, worked out as the website's Departments page does: sections of a class
 * taught a subject together (common periods) count once, at the largest of their counts.
 */
export function teacherLoad(setup: TimetableSetup, teacherId: string) {
  const rows = teachingOf(setup, teacherId)
  const counted = new Set<string>()
  let load = 0
  for (const group of setup.commonPeriods ?? []) {
    if (!group.className || !group.subject || (group.sections ?? []).length < 2) continue
    const together = rows.filter(
      (row) =>
        !counted.has(`${row.classId}|${row.subject}`) && same(row.className, group.className) && same(row.subject, group.subject) && group.sections.some((section) => same(section, row.section)),
    )
    if (together.length < 2) continue
    load += Math.max(...together.map((row) => row.periods))
    together.forEach((row) => counted.add(`${row.classId}|${row.subject}`))
  }
  rows.forEach((row) => {
    if (!counted.has(`${row.classId}|${row.subject}`)) load += row.periods
  })
  return load
}
