import type { MyDay, MyPeriod, MyTimetable } from '@/services/staffService'
import type { BellRow, SchoolDay, SchoolTimetable } from '@/services/timetableService'

// The same reading of the grid as the server's modules/timetable/teacherSchedule.js (used by
// GET /timetable/me), for a class or a teacher other than the signed-in one.

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const toMinutes = (time: string) => {
  const [h, m] = String(time || '08:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
const toTime = (total: number) => `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`

/** Bell rows with clock times. */
const periodTimes = (bell: SchoolTimetable['bellTimings']) => {
  let cursor = toMinutes(bell.startTime)
  return (bell.rows ?? []).map((row: BellRow) => {
    const entry = { id: row.id, type: row.type, label: row.label ?? '', start: toTime(cursor), end: toTime(cursor + (Number(row.duration) || 0)) }
    cursor += Number(row.duration) || 0
    return entry
  })
}

/** A cell names one teacher, or two for a shared period ("Ms Rao/Mr Sen"). */
const cellHasTeacher = (cellTeacher: string | undefined, name: string) =>
  String(cellTeacher || '')
    .split('/')
    .some((part) => part.trim().toLowerCase() === name.trim().toLowerCase())

export type TimetableTarget = { type: 'class'; id: string } | { type: 'teacher'; id: string }

/** One weekday for a class (subject and teacher per period) or a teacher (class and subject). */
const dayPeriods = (school: SchoolTimetable, target: TimetableTarget, dayName: string): MyPeriod[] => {
  const grid = school.published?.grid ?? {}
  const teacher = target.type === 'teacher' ? school.teachers.find((row) => String(row.id) === target.id) : undefined
  let teachable = 0
  return periodTimes(school.bellTimings).map((row) => {
    const base = { id: row.id, label: row.label, start: row.start, end: row.end }
    if (row.type === 'break') return { ...base, kind: 'break' as const }
    const slot = String(teachable++)
    if (target.type === 'class') {
      const cell = grid[target.id]?.[dayName] ?? {}
      const entry = cell[slot] ?? cell[row.id]
      return entry?.subject ? { ...base, kind: 'class' as const, subject: entry.subject, teacher: entry.teacher ?? '' } : { ...base, kind: 'free' as const }
    }
    for (const [classId, days] of Object.entries(grid)) {
      const cell = days?.[dayName] ?? {}
      const entry = cell[slot] ?? cell[row.id]
      if (entry && teacher && cellHasTeacher(entry.teacher, teacher.name)) {
        const cls = school.classes.find((item) => item.id === classId)
        return { ...base, kind: 'class' as const, subject: entry.subject ?? '', className: cls?.className ?? '', section: cls?.section ?? '' }
      }
    }
    return { ...base, kind: 'free' as const }
  })
}

/** A week (or any run of days) for a class or a teacher, shaped like GET /timetable/me. */
export const weekFor = (school: SchoolTimetable, target: TimetableTarget, days: Record<string, SchoolDay>, dates: string[]): MyTimetable => {
  const teacher = target.type === 'teacher' ? school.teachers.find((row) => String(row.id) === target.id) : null
  const cls = target.type === 'class' ? school.classes.find((row) => row.id === target.id) : null
  const result: MyDay[] = dates.map((date) => {
    const day = days[date]
    const working = day ? day.working : true
    let periods = school.published && working ? dayPeriods(school, target, DAY_NAMES[new Date(`${date}T00:00:00Z`).getUTCDay()]) : []
    if (day?.halfDayEndTime) periods = periods.filter((period) => period.start < (day.halfDayEndTime as string))
    if (!periods.some((period) => period.kind === 'class')) periods = []
    return { date, weekday: day?.weekday ?? new Date(`${date}T00:00:00Z`).getUTCDay(), working, kind: day?.kind ?? 'working', label: day?.label ?? '', halfDayEndTime: day?.halfDayEndTime ?? null, periods }
  })
  return {
    teacher: teacher ? { id: String(teacher.id), name: teacher.name } : cls ? { id: cls.id, name: `${cls.className}-${cls.section}` } : null,
    publishedAt: school.published?.publishedAt ?? null,
    days: result,
  }
}
