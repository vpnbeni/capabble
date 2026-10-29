import { api, requestBytes } from '@/lib/api'

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

/** The working timetable as the timetable pages edit it (one per academic session). */
export interface TimetableSetup {
  classes: { id: string; className: string; section: string; floor: string; subjects: string[]; incharge?: string }[]
  subjects: { id: string; name: string }[]
  periodsPerWeek: number
  periodAllocation: Record<string, Record<string, number>>
  /** Who can teach what (`subjects`), and who teaches which subjects in which class-section. */
  teachers: { id: string; name: string; shortName?: string; subjects: string[] }[]
  teacherSubjectAllocations: { teacherId: string; teacherName: string; assignments: { classId: string; className: string; section: string; subjects: string[] }[] }[]
  /** Sections of a class taught a subject together: their periods count once in a teacher's load. */
  commonPeriods: { className: string; subject: string; sections: string[] }[]
  updatedAt: string | null
}

export interface BellTimings {
  meta?: Record<string, string>
  startTime: string
  rows: BellRow[]
}

export interface TimetableVersion {
  _id: string
  name: string
  status: 'draft' | 'published' | 'archived' | string
  generatedAt?: string
  publishedAt?: string | null
  conflictCount?: number
}

export interface Conflict {
  classId: string
  className: string
  subjectName: string
  type: 'underallocated' | 'unfilled' | string
  expected: number
  actual: number
  message: string
}

const versionPath = (id: string) => `/timetable/versions/${encodeURIComponent(id)}`

export const timetableService = {
  setup: () => api.get<TimetableSetup>('/timetable/state'),
  bellTimings: () => api.get<BellTimings>('/timetable/bell-timings'),
  /** Replaces the bell timings (only them): send what was loaded with the changes. */
  saveBellTimings: (timings: BellTimings) => api.put<BellTimings>('/timetable/bell-timings', timings),
  /** One class's periods a week per subject; the rest of the timetable is left alone. */
  setClassPeriods: (classId: string, subjects: Record<string, number>) => api.put<TimetableSetup>(`/timetable/state/period-allocation/${encodeURIComponent(classId)}`, { subjects }),
  addClassSection: (input: { className: string; section: string; floor?: string }) => api.post<TimetableSetup>('/timetable/state/class-sections', input),
  /** Floor, class teacher, or the class's subjects (for every section of the class). */
  updateClassSection: (id: string, input: { floor?: string; incharge?: string; subjects?: string[] }) => api.patch<TimetableSetup>(`/timetable/state/class-sections/${encodeURIComponent(id)}`, input),
  /** Refused while teachers, periods or timetable cells use it. */
  removeClassSection: (id: string) => api.delete<TimetableSetup>(`/timetable/state/class-sections/${encodeURIComponent(id)}`),
  /** Who teaches each named subject in one class-section; a teacher not listing the subject gets it. */
  setClassTeachers: (classId: string, subjects: Record<string, string[]>) => api.put<TimetableSetup>(`/timetable/state/teacher-allocation/${encodeURIComponent(classId)}`, { subjects }),
  /** The subjects a teacher can teach; one taken away also leaves the classes they taught it in. */
  setTeacherSubjects: (teacherId: string, subjects: string[]) => api.put<TimetableSetup>(`/timetable/state/teachers/${encodeURIComponent(teacherId)}/subjects`, { subjects }),
  addSubject: (name: string) => api.post<TimetableSetup>('/timetable/state/subjects', { name }),
  /** Works out a new draft timetable from the saved setup, and what didn't fit. */
  generate: (name: string) => api.post<{ version: TimetableVersion; conflictReport: Conflict[] }>('/timetable/generate', { name }),
  versions: () => api.get<TimetableVersion[]>('/timetable/versions'),
  /** Teachers and families see the published one. */
  publish: (id: string) => api.put<TimetableVersion>(`${versionPath(id)}/publish`, {}),
  archive: (id: string) => api.put<TimetableVersion>(`${versionPath(id)}/archive`, {}),
  removeVersion: (id: string) => api.delete<unknown>(versionPath(id)),
  classPdf: (id: string) => requestBytes(`${versionPath(id)}/export/class-pdf`),
  teacherPdf: (id: string) => requestBytes(`${versionPath(id)}/export/teacher-pdf`),
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
