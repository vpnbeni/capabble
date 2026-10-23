// The calendar API's shapes that the family app reads. Mirrors client/src/services/calendarService.ts.

export type CalendarLayerKey = 'school_days' | 'events' | 'exams' | 'duties' | 'fees' | 'appointments' | 'activities'
export type DayKind = 'working' | 'weekly_off' | 'holiday' | 'vacation' | 'closure' | 'half_day'
export type EventRole = 'incharge' | 'duty' | 'participant' | 'attendee' | 'fyi'
export type EventStatus = 'draft' | 'pending_approval' | 'scheduled' | 'published' | 'cancelled'
export type EventCategory =
  | 'exam' | 'holiday' | 'ptm' | 'celebration' | 'sports' | 'trip' | 'meeting' | 'duty' | 'health' | 'deadline' | 'other'
export type ResponseType = 'none' | 'acknowledge' | 'rsvp' | 'consent'
export type ResponseValue = 'acknowledged' | 'yes' | 'no' | 'maybe' | 'given' | 'declined'

export type CalendarDay = {
  working: boolean
  kind: DayKind
  label: string
  partial: string[]
}

export type CalendarChild = { studentId: string; name: string; className?: string; section?: string }

export type CalendarPart = {
  segmentKey: string
  label: string
  role: EventRole
  instructions: string
  attachments: { name: string; url: string }[]
  response: ResponseType | string
  responseDeadline?: string | null
  child?: { studentId: string; name: string } | null
  myResponse?: { value: ResponseValue; count?: number; note?: string; respondedAt: string } | null
}

export type CalendarItem = {
  id: string
  layer: CalendarLayerKey
  title: string
  startDate: string
  endDate: string
  allDay: boolean
  startTime?: string | null
  endTime?: string | null
  venue?: string
  detail?: string
  child?: { studentId: string; name: string } | null
  tentative?: boolean
  eventId?: string
  occurrence?: string
  category?: EventCategory
  critical?: boolean
  status?: EventStatus
  parts?: CalendarPart[]
  recurring?: boolean
  createdByName?: string
}

export type CalendarData = {
  from: string
  to: string
  today: string
  days: Record<string, CalendarDay>
  items: CalendarItem[]
  children: CalendarChild[]
}

export type CalendarEventView = {
  id: string
  title: string
  description: string
  attachments: { name: string; url: string }[]
  parts: CalendarPart[]
}

export type ReplyInput = { segmentKey: string; studentId?: string | null; value: ResponseValue; count?: number; note?: string }
