import { api, request } from '@/lib/api'

import type { CalendarData, CalendarEventView, EventCategory, EventStatus, ReplyInput, ResponseType } from './calendarTypes'

// Staff API: the same endpoints the website uses, plus the two the phone needed
// (GET /timetable/me and GET /attnd/student-registers).

export type PeriodKind = 'class' | 'free' | 'break'

export interface MyPeriod {
  id: string
  label: string
  /** 'HH:MM' */
  start: string
  end: string
  kind: PeriodKind
  subject?: string
  className?: string
  section?: string
  /** A class's timetable names who teaches each period. */
  teacher?: string
}

export interface MyDay {
  date: string
  weekday: number
  working: boolean
  /** working, holiday, weekly_off, vacation, closure, half_day… */
  kind: string
  /** The holiday or closure's name, empty on ordinary days. */
  label: string
  halfDayEndTime: string | null
  /** Empty on days off and on days with nothing timetabled for this teacher. */
  periods: MyPeriod[]
}

export interface MyTimetable {
  /** null when the login isn't linked to a staff record in the timetable. */
  teacher: { id: string; name: string } | null
  publishedAt: string | null
  days: MyDay[]
}

export interface ClassRegister {
  className: string
  section: string
  /** The login teaches this section or is its class teacher. */
  mine: boolean
  /** The login may save this register. */
  canMark: boolean
  marked: boolean
  markedAt: string | null
  absent: number
  students: number
}

export interface RegisterDay {
  date: string
  day: { working: boolean; kind: string; label: string } | null
  registers: ClassRegister[]
}

export interface RosterStudent {
  _id: string
  name: string
  rollNumber?: string | number | null
}

export interface RegisterRecords {
  /** Only absences are stored: everyone else in the class was present. */
  records: { studentId: string; status: 'P' | 'A' }[]
}

export interface RegisterSave {
  date: string
  className: string
  section: string
  /** Every student in the register with their mark. */
  records: { studentId: string; status: 'P' | 'A' }[]
}

export interface AudienceSection {
  /** "7|A": the value a section scope takes. */
  key: string
  className: string
  section: string
  students: number
}

export interface AudienceOptions {
  /** May send to the whole school, roles, houses and routes (principal, office). */
  wide: boolean
  assignedOnly: boolean
  canApprove: boolean
  needsApprovalForFamilies: boolean
  sections: AudienceSection[]
  /** Class names of those sections ("7", "10"), in school order. */
  classes: string[]
}

export interface MyEvent {
  id: string
  title: string
  category: EventCategory
  startDate: string
  endDate: string
  startTime?: string | null
  allDay: boolean
  status: EventStatus
  rejectionNote?: string
  audiences: string[]
  updatedAt: string
}

export interface NewEvent {
  title: string
  description: string
  category: EventCategory
  allDay: boolean
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  venue: string
  visibility: 'segments'
  segments: {
    label: string
    personType: 'parent' | 'student'
    scopes: { type: 'section'; value: string; label: string }[]
    instructions: string
    response: ResponseType
    notify: 'now'
  }[]
  publish: true
}

/** GET /attnd/dashboard: the parts the principal's glance reads. */
export interface AttendanceGlance {
  date: string
  today: { working: boolean; label: string }
  staff: { strength: number; todayPresent: number; todayAbsent: number; todayHalfDay: number }
  students: { strength: number; todayPresent: number; todayAbsent: number; attendancePercent: number }
  classMatrix: { className: string; sections: { section: string; strength: number; todayAbsent: number }[] }[]
}

/** GET /cpitl/dashboard: the parts the principal's glance reads (money in rupees). */
export interface FeesGlance {
  totals: { expected: number; collected: number; pending: number; overdue: number; collectionRate: number; dueSoFar: number }
  payments: { total: number; today: number; todayCount: number }
  byMonth: { month: string; amount: number; count: number }[]
  byClass: {
    class: string
    expected: number
    collected: number
    pending: number
    overdue: number
    students: number
    defaulters: number
    collectionRate: number
  }[]
}

/** One event as its creator and approvers see it (GET /calendar/events/:id). */
export interface EventRecord extends MyEvent {
  description?: string
  venue?: string
  endTime?: string | null
  createdByName?: string
  segments: { key: string; label: string; personType: string; instructions?: string; response?: ResponseType }[]
}

export interface StaffMember {
  _id: string
  name: string
  employeeId?: string | null
  designation?: string
  dutyType?: string
  isActive?: boolean
}

/** A colleague as the staff directory shows them (`GET /teachers?lite=true`: no bank or ID details). */
export interface DirectoryEntry extends StaffMember {
  department?: string
  mobileNo?: string
  phone?: string
  email?: string
  profileImage?: string | null
}

export interface StaffAttendanceDay {
  /** Only absences are stored: everyone else was present. */
  absentIds: string[]
  day: { working: boolean; label: string } | null
}

export const staffService = {
  myTimetable: (from: string, to: string) => api.get<MyTimetable>('/timetable/me', { from, to }),
  registers: (date: string) => api.get<RegisterDay>('/attnd/student-registers', { date }),
  /** The active students of a class-section (own sections only for "own classes" logins). */
  roster: (className: string, section: string) => api.get<RosterStudent[]>('/attnd/student-directory', { className, section }),
  /** A class's marks for one day. */
  register: (date: string, className: string, section: string) =>
    api.get<RegisterRecords>('/attnd/students', { date, className, section }),
  /** Saves one class's register for one day (replaces that day's marks; last save wins, as on the website). */
  saveRegister: ({ date, className, section, records }: RegisterSave) =>
    api.put<unknown>('/attnd/students', {
      date,
      className,
      section,
      records,
      daySettings: [{ attendanceDate: date, category: 'academic' }],
    }),

  /** Everything on this login's calendar between two days (school days, events, exams, duties…). */
  calendar: (from: string, to: string) => api.get<CalendarData>('/calendar/me', { from, to }),
  calendarEvent: (id: string) => api.get<CalendarEventView>(`/calendar/view/${encodeURIComponent(id)}`),
  respondToEvent: (id: string, input: ReplyInput) => api.post<ReplyInput>(`/calendar/view/${encodeURIComponent(id)}/respond`, input),
  /** Classes this login may send an event to, and whether families' events need the principal. */
  audienceOptions: () => api.get<AudienceOptions>('/calendar/audience/options'),
  /** Events this login created (drafts, waiting for approval, rejected, published). */
  myEvents: () => api.get<MyEvent[]>('/calendar/events', { mine: '1' }),
  /** Creates and publishes an event; families' events from a teacher wait for the principal. */
  createEvent: (event: NewEvent) => api.post<{ id: string; status: EventStatus }>('/calendar/events', event),

  /** Events teachers sent that wait for the principal (approvers see everyone's). */
  pendingEvents: () => api.get<(MyEvent & { createdByName?: string })[]>('/calendar/events', { status: 'pending_approval' }),
  eventRecord: (id: string) => api.get<EventRecord>(`/calendar/events/${encodeURIComponent(id)}`),
  approveEvent: (id: string) => api.post<unknown>(`/calendar/events/${encodeURIComponent(id)}/approve`),
  rejectEvent: (id: string, note: string) => api.post<unknown>(`/calendar/events/${encodeURIComponent(id)}/reject`, { note }),

  staffDirectory: () => api.get<StaffMember[]>('/attnd/staff-directory'),
  /** Active staff with their phone numbers, by name; `search` matches name, ID, designation or phone. */
  directory: async (search: string) =>
    (await api.get<{ data: DirectoryEntry[] }>('/teachers', { lite: 'true', isActive: 'true', limit: 100, sort: 'name', search: search || undefined })).data,
  /** One day's staff absences, with whether the school is open. */
  staffAttendance: async (date: string): Promise<StaffAttendanceDay> => {
    const response = await request<{ data: { staffId: string; status: string }[]; schoolDays?: Record<string, { working: boolean; label: string }> }>(
      '/attnd/staff',
      { params: { date }, raw: true },
    )
    return {
      absentIds: response.data.filter((record) => record.status === 'A').map((record) => String(record.staffId)),
      day: response.schoolDays?.[date] ?? null,
    }
  },
  /** Saves one day for these staff (replaces their marks for the day; others stay as they are). */
  saveStaffAttendance: (date: string, staffIds: string[], absentIds: string[]) =>
    api.put<unknown>('/attnd/staff', { date, staffIds, absences: absentIds.map((staffId) => ({ staffId, attendanceDate: date })) }),

  attendanceGlance: (date: string) => api.get<AttendanceGlance>('/attnd/dashboard', { date, month: date.slice(0, 7) }),
  feesGlance: () => api.get<FeesGlance>('/cpitl/dashboard'),
}
