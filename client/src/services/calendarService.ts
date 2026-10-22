import type { AxiosRequestConfig } from 'axios'
import baseApi from './api'

// Calendar screens show their own toasts, so opt out of the global interceptor ones.
type Config = AxiosRequestConfig
const silent = (config?: Config): Config => ({ ...(config || {}), _silent: true } as Config)
const api = {
  get: (url: string, config?: Config) => baseApi.get(url, silent(config)),
  post: (url: string, data?: unknown, config?: Config) => baseApi.post(url, data, silent(config)),
  patch: (url: string, data?: unknown, config?: Config) => baseApi.patch(url, data, silent(config)),
  delete: (url: string, config?: Config) => baseApi.delete(url, silent(config)),
}

export type CalendarLayerKey = 'school_days' | 'events' | 'exams' | 'duties' | 'fees' | 'appointments' | 'activities'
export type DayKind = 'working' | 'weekly_off' | 'holiday' | 'vacation' | 'closure' | 'half_day'
export type PersonType = 'parent' | 'student' | 'staff'
export type ScopeType = 'all' | 'class' | 'section' | 'classteacher' | 'house' | 'route' | 'role' | 'student' | 'user'
export type EventRole = 'incharge' | 'duty' | 'participant' | 'attendee' | 'fyi'
export type NotifyLevel = 'now' | 'in_app' | 'silent'
export type ReminderPreset = 'day_before_18' | 'morning_07'
export type EventStatus = 'draft' | 'pending_approval' | 'scheduled' | 'published' | 'cancelled'
export type EventCategory =
  | 'exam' | 'holiday' | 'ptm' | 'celebration' | 'sports' | 'trip' | 'meeting' | 'duty' | 'health' | 'deadline' | 'other'

export type CalendarDay = {
  working: boolean
  kind: DayKind
  label: string
  mode?: 'closed' | 'online' | 'hybrid'
  halfDayEndTime?: string
  tentative?: boolean
  partial: string[]
}

export type CalendarChild = { studentId: string; name: string; className?: string; section?: string }

export type CalendarPart = {
  segmentKey: string
  label: string
  role: EventRole
  instructions: string
  attachments: Array<{ name: string; url: string }>
  response: string
  responseDeadline?: string | null
  child?: { studentId: string; name: string } | null
}

export type CalendarItem = {
  id: string
  source: string
  layer: CalendarLayerKey
  title: string
  startDate: string
  endDate: string
  allDay: boolean
  startTime?: string | null
  endTime?: string | null
  venue?: string
  detail?: string
  link?: string
  child?: { studentId: string; name: string } | null
  tentative?: boolean
  readOnly?: boolean
  // Calendar events only
  eventId?: string
  occurrence?: string
  category?: EventCategory
  critical?: boolean
  status?: EventStatus
  parts?: CalendarPart[]
  recurring?: boolean
  canEdit?: boolean
  createdByName?: string
  // School days only
  kind?: DayKind
  mode?: string
  partial?: boolean
}

export type CalendarLayer = { key: CalendarLayerKey; label: string; tone: string }

export type CalendarData = {
  from: string
  to: string
  timeZone: string
  today: string
  days: Record<string, CalendarDay>
  items: CalendarItem[]
  failedSources: string[]
  layers: CalendarLayer[]
  children: CalendarChild[]
}

export type CalendarEventView = {
  id: string
  uid: string
  revision: number
  title: string
  description: string
  category: EventCategory
  allDay: boolean
  startDate: string
  endDate: string
  startTime?: string | null
  endTime?: string | null
  venue: string
  critical: boolean
  circularNo: string
  status: EventStatus
  attachments: Array<{ name: string; url: string }>
  recurring: boolean
  createdByName: string
  parts: CalendarPart[]
  canEdit: boolean
}

export type Scope = { type: ScopeType; value: string; label?: string }

export type Segment = {
  key?: string
  label: string
  personType: PersonType
  scopes: Scope[]
  exclude: Scope[]
  role: EventRole
  instructions: string
  attachments?: Array<{ name: string; url: string }>
  notify: NotifyLevel
  email: boolean
  reminders: ReminderPreset[]
  response?: string
}

export type Recurrence = {
  freq: 'daily' | 'weekly' | 'monthly' | null
  interval?: number
  byDay?: number[]
  until?: string | null
  exDates?: string[]
  skipNonWorking?: boolean
}

export type EventInput = {
  title: string
  description?: string
  category?: EventCategory
  allDay?: boolean
  startDate: string
  endDate?: string | null
  startTime?: string | null
  endTime?: string | null
  venue?: string
  recurrence?: Recurrence | null
  visibility?: 'segments' | 'all_staff' | 'whole_school'
  critical?: boolean
  circularNo?: string
  segments: Segment[]
  publishAt?: string | null
  publish?: boolean
}

export type SendRun = {
  _id: string
  change: string
  status: 'queued' | 'sending' | 'sent' | 'failed'
  at: string
  recipients: number
  notified: number
  emailsQueued: number
  occurrence?: string
  stats?: unknown
}

export type CalendarEventFull = Omit<EventInput, 'segments'> & {
  id: string
  _id: string
  uid: string
  revision: number
  status: EventStatus
  segments: Array<Segment & { key: string }>
  createdBy?: string
  createdByName?: string
  rejectionNote?: string
  publishedAt?: string | null
  sendLog: SendRun[]
  mine: boolean
}

export type EventListRow = {
  id: string
  title: string
  category: EventCategory
  startDate: string
  endDate: string
  startTime?: string
  allDay: boolean
  status: EventStatus
  publishAt?: string | null
  revision: number
  createdByName?: string
  rejectionNote?: string
  audiences: string[]
  recurrence?: { freq?: string | null }
  updatedAt: string
  mine: boolean
}

export type SegmentStats = {
  key: string
  label: string
  personType: PersonType
  people: number
  students?: number
  noLogin: number
  noEmail: number
}

export type AudiencePreview = {
  total: number
  byKind: Partial<Record<PersonType, number>>
  inSeveral: number
  segments: SegmentStats[]
  people: Array<{ id: string; name: string; kind: PersonType; hasEmail: boolean; segments: string[]; children: string[] }>
}

export type AudienceOptions = {
  wide: boolean
  assignedOnly: boolean
  canApprove: boolean
  needsApprovalForFamilies: boolean
  classes: string[]
  sections: Array<{ key: string; className: string; section: string; students: number }>
  houses: Array<{ id: string; name: string }>
  routes: Array<{ id: string; name: string }>
  roles: Array<{ key: string; name: string }>
}

export type PersonOption = { type: 'user' | 'student'; value: string; label: string }

export type SchoolDayRule = {
  id: string
  _id: string
  kind: Exclude<DayKind, 'working'> | 'working_day'
  title: string
  startDate: string
  endDate: string
  weekly?: { weekday: number; weeksOfMonth: number[] }
  category: 'national' | 'state' | 'school' | 'religious' | 'other'
  appliesTo: { scope: 'school' | 'classes'; classes: string[]; sections: string[] }
  mode: 'closed' | 'online' | 'hybrid'
  halfDayEndTime?: string
  authority?: string
  orderNo?: string
  reason?: string
  tentative: boolean
  status: 'active' | 'cancelled'
  eventId?: string | null
}

export type SchoolDaysData = {
  from: string
  to: string
  today: string
  rules: SchoolDayRule[]
  summary: { days: number; working: number; off: number }
  usingDefaultSunday: boolean
}

export type RuleInput = Partial<Omit<SchoolDayRule, 'id' | '_id' | 'status' | 'eventId'>> & {
  announce?: { families: boolean; staff: boolean; email: boolean; note?: string } | null
}

const data = <T,>(promise: Promise<{ data: { data: T } }>) => promise.then((res) => res.data.data)

const calendarService = {
  mine: (params: { from: string; to: string; layers?: string[] }) =>
    data<CalendarData>(api.get('/calendar/me', { params: { ...params, layers: params.layers?.join(',') || undefined } })),
  days: (params: { from: string; to: string; class?: string; section?: string }) =>
    data<{ from: string; to: string; days: Record<string, CalendarDay & { date: string }> }>(api.get('/calendar/days', { params })),
  view: (id: string) => data<CalendarEventView>(api.get(`/calendar/view/${id}`)),

  events: (params: { status?: string; mine?: boolean } = {}) =>
    data<EventListRow[]>(api.get('/calendar/events', { params: { status: params.status, mine: params.mine ? '1' : undefined } })),
  event: (id: string) => data<CalendarEventFull>(api.get(`/calendar/events/${id}`)),
  create: (input: EventInput) => data<{ id: string; status: EventStatus }>(api.post('/calendar/events', input)),
  update: (id: string, input: Partial<EventInput> & { notify?: 'affected' | 'everyone' | 'none' }) =>
    data<{ id: string; status: EventStatus }>(api.patch(`/calendar/events/${id}`, input)),
  publish: (id: string, publishAt?: string | null) =>
    data<{ id: string; status: EventStatus }>(api.post(`/calendar/events/${id}/publish`, { publishAt: publishAt || null })),
  approve: (id: string) => data<{ id: string; status: EventStatus }>(api.post(`/calendar/events/${id}/approve`)),
  reject: (id: string, note: string) => data<{ id: string; status: EventStatus }>(api.post(`/calendar/events/${id}/reject`, { note })),
  cancel: (id: string, input: { reason?: string; occurrence?: string | null; notify?: boolean }) =>
    data<{ id: string; status: EventStatus }>(api.post(`/calendar/events/${id}/cancel`, input)),
  remove: (id: string) => data<{ id: string }>(api.delete(`/calendar/events/${id}`)),

  audienceOptions: () => data<AudienceOptions>(api.get('/calendar/audience/options')),
  people: (q: string, kind: PersonType, by?: 'student') =>
    data<PersonOption[]>(api.get('/calendar/audience/people', { params: { q, kind, by } })),
  preview: (segments: Segment[]) => data<AudiencePreview>(api.post('/calendar/audience/preview', { segments })),

  schoolDays: (params: { from?: string; to?: string; all?: boolean } = {}) =>
    data<SchoolDaysData>(api.get('/school-days', { params: { ...params, all: params.all ? '1' : undefined } })),
  createRule: (input: RuleInput) => data<{ id: string; eventId: string | null }>(api.post('/school-days/rules', input)),
  createRules: (rules: RuleInput[]) => data<{ created: number }>(api.post('/school-days/rules/bulk', { rules })),
  updateRule: (id: string, input: RuleInput) => data<{ id: string }>(api.patch(`/school-days/rules/${id}`, input)),
  cancelRule: (id: string, reason?: string) => data<{ id: string }>(api.post(`/school-days/rules/${id}/cancel`, { reason })),
}

export const apiMessage = (error: unknown, fallback: string) => {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
  return message || fallback
}

export default calendarService
