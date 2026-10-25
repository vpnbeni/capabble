import { api } from '@/lib/api'

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
}
