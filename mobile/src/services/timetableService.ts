import { api } from '@/lib/api'

// The school's published timetable, as the website's Class wise and Teacher wise pages read it
// (needs timetable.timetable.read). The phone works out one class's or teacher's week from it.

export interface BellRow {
  id: string
  type: 'period' | 'break' | string
  label?: string
  /** Minutes. */
  duration: number
}

export interface TimetableClass {
  id: string
  className: string
  section: string
  incharge?: string
}

export interface TimetableTeacher {
  id: string
  name: string
}

/** One cell: a subject and the teacher (two for a shared period: "Ms Rao/Mr Sen"). */
export type GridCell = { subject?: string; teacher?: string }
/** classId → weekday name ("Monday") → teachable period index ("0", "1"…) or bell row id → cell. */
export type TimetableGrid = Record<string, Record<string, Record<string, GridCell>>>

export interface SchoolTimetable {
  classes: TimetableClass[]
  teachers: TimetableTeacher[]
  bellTimings: { startTime: string; rows: BellRow[] }
  /** null until a version is published. */
  published: { name: string; publishedAt: string; grid: TimetableGrid } | null
}

export interface SchoolDay {
  working: boolean
  kind: string
  label: string
  halfDayEndTime?: string | null
  weekday: number
}

export const timetableService = {
  school: async (): Promise<SchoolTimetable> => {
    const [state, versions] = await Promise.all([
      api.get<{ classes?: TimetableClass[]; teachers?: TimetableTeacher[]; bellTimings?: SchoolTimetable['bellTimings'] }>('/timetable/state'),
      api.get<{ _id: string; status: string; publishedAt?: string }[]>('/timetable/versions'),
    ])
    const live = (versions ?? []).filter((version) => version.status === 'published').sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))[0]
    const published = live ? await api.get<{ name: string; publishedAt: string; grid: TimetableGrid }>(`/timetable/versions/${encodeURIComponent(live._id)}`) : null
    return {
      classes: state?.classes ?? [],
      teachers: state?.teachers ?? [],
      bellTimings: state?.bellTimings ?? { startTime: '08:00', rows: [] },
      published: published ? { name: published.name, publishedAt: published.publishedAt, grid: published.grid ?? {} } : null,
    }
  },
  /** Which days are school days (holidays, closures, half days), for any staff login. */
  days: (from: string, to: string) => api.get<{ days: Record<string, SchoolDay> }>('/calendar/days', { from, to }),
}
