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
  myResponse?: { value: ResponseValue; count?: number; note?: string; respondedAt: string } | null
}

export type ResponseType = 'none' | 'acknowledge' | 'rsvp' | 'consent'
export type ResponseValue = 'acknowledged' | 'yes' | 'no' | 'maybe' | 'given' | 'declined'
export type FeedStatus = { active: boolean; url?: string; webcal?: string }
export type ReplyInput = { segmentKey: string; studentId?: string | null; value: ResponseValue; count?: number; note?: string }

export type ReplyTracker = Array<{
  key: string
  label: string
  type: Exclude<ResponseType, 'none'>
  deadline: string | null
  expected: number
  counts: Partial<Record<ResponseValue, number>>
  headcount: number
  responded: Array<{ name: string; child: string; value: ResponseValue; count?: number; note?: string; at: string }>
  pending: Array<{ userId: string; name: string; child: string }>
}>

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
  response?: ResponseType
  responseDeadline?: string | null
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
  emails?: Partial<Record<'queued' | 'sending' | 'sent' | 'failed' | 'suppressed' | 'capped' | 'skipped', number>>
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

  feed: () => data<FeedStatus>(api.get('/calendar/feed')),
  resetFeed: () => data<FeedStatus>(api.post('/calendar/feed')),
  feedOff: () => data<FeedStatus>(api.delete('/calendar/feed')),
  respond: (eventId: string, input: ReplyInput) => data<ReplyInput>(api.post(`/calendar/view/${eventId}/respond`, input)),
  replies: (eventId: string) => data<ReplyTracker>(api.get(`/calendar/events/${eventId}/responses`)),
  remindPending: (eventId: string, segmentKey?: string) =>
    data<{ reminded: number }>(api.post(`/calendar/events/${eventId}/remind-pending`, { segmentKey })),

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

export type MailSettings = {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user: string
  hasPassword: boolean
  fromName: string
  fromEmail: string
  replyTo: string
  dailyLimit: number
  lastTestAt: string | null
  lastTestOk: boolean | null
  lastError: string
  fallback: { fromEmail: string; dailyLimit: number } | null
  usage: { sentToday: number; queued: number; failedWeek: number }
}

export type MailSettingsInput = Omit<MailSettings, 'hasPassword' | 'lastTestAt' | 'lastTestOk' | 'lastError' | 'fallback' | 'usage'> & { password?: string }

export const mailSettingsService = {
  get: () => data<MailSettings>(api.get('/mail-settings')),
  save: (input: MailSettingsInput) => data<MailSettings>(baseApi.put('/mail-settings', input, silent())),
  test: () => data<{ sentTo: string }>(api.post('/mail-settings/test')),
}

/**
 * The first working day on or after `key` for a class (or the whole school), from the
 * school calendar. Falls back to `key` when the calendar can't be read.
 */
export const firstWorkingDay = async (key: string, scope: { className?: string; section?: string } = {}) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key
  try {
    const end = new Date(`${key}T00:00:00Z`)
    end.setUTCDate(end.getUTCDate() + 21)
    const { days } = await calendarService.days({
      from: key, to: end.toISOString().slice(0, 10), class: scope.className || undefined, section: scope.section || undefined,
    })
    const found = Object.keys(days).sort().find((day) => days[day].working)
    return found || key
  } catch {
    return key
  }
}

export const apiMessage = (error: unknown, fallback: string) => {
  const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
  return message || fallback
}

export default calendarService
