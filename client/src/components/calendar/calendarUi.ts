import type { AgendaGroup, CalendarCategory, CalendarDayInfo, CalendarEntry } from '@/components/ui'
import type {
  CalendarData,
  CalendarItem,
  CalendarLayerKey,
  EventCategory,
  EventRole,
  EventStatus,
  NotifyLevel,
  PersonType,
  ReminderPreset,
  ScopeType,
} from '@/services/calendarService'

/** Fixed category colour per layer (chart palette), always shown with the layer's name. */
export const LAYER_CATEGORY: Record<CalendarLayerKey, CalendarCategory> = {
  events: 1,
  exams: 3,
  duties: 4,
  fees: 5,
  appointments: 2,
  activities: 6,
  school_days: 6,
}

export const LAYER_LABELS: Record<CalendarLayerKey, string> = {
  school_days: 'Holidays and closures',
  events: 'School events',
  exams: 'Exams',
  duties: 'My duties',
  fees: 'Fees',
  appointments: 'Meetings',
  activities: 'Activities',
}

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  exam: 'Exam',
  holiday: 'Holiday',
  ptm: 'PTM',
  celebration: 'Celebration',
  sports: 'Sports',
  trip: 'Trip',
  meeting: 'Meeting',
  duty: 'Duty',
  health: 'Health camp',
  deadline: 'Deadline',
  other: 'Other',
}

export const ROLE_LABELS: Record<EventRole, string> = {
  incharge: 'In charge',
  duty: 'On duty',
  participant: 'Taking part',
  attendee: 'Attending',
  fyi: 'For information',
}

export const NOTIFY_LABELS: Record<NotifyLevel, string> = {
  now: 'Notify now',
  in_app: 'Notify in the app only',
  silent: 'Show on the calendar, no notification',
}

export const REMINDER_LABELS: Record<ReminderPreset, string> = {
  day_before_18: 'Remind at 6 pm the day before',
  morning_07: 'Remind at 7 am on the day',
}

export const PERSON_LABELS: Record<PersonType, string> = { parent: 'Parents', student: 'Students', staff: 'Staff' }

export const SCOPE_LABELS: Record<ScopeType, string> = {
  all: 'Everyone',
  class: 'Class',
  section: 'Class and section',
  classteacher: 'Class teachers of',
  house: 'House',
  route: 'Bus route',
  role: 'Role',
  student: 'Student',
  user: 'Named person',
}

export const STATUS_LABELS: Record<EventStatus, { label: string; tone: 'neutral' | 'warning' | 'info' | 'success' | 'danger' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending_approval: { label: 'Waiting for approval', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  published: { label: 'Published', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
}

const DAY_KIND_PREFIX: Record<string, string> = {
  holiday: 'Holiday',
  vacation: 'Vacation',
  closure: 'Closure',
  half_day: 'Half day',
  weekly_off: 'Day off',
}

/** Calendar item → kit entry. */
export const toEntry = (item: CalendarItem): CalendarEntry => {
  const notes: string[] = []
  if (item.child) notes.push(`For ${item.child.name.split(' ')[0]}`)
  if (item.tentative) notes.push('Tentative')
  if (item.status === 'cancelled') notes.push('Cancelled')
  return {
    id: item.id,
    startDate: item.startDate,
    endDate: item.endDate,
    title: item.title,
    startTime: item.allDay ? null : item.startTime,
    category: LAYER_CATEGORY[item.layer],
    note: notes.join(' · ') || undefined,
    muted: item.status === 'cancelled',
  }
}

/** Day shading and labels for the month views. */
export const dayInfoFrom = (data?: CalendarData): Record<string, CalendarDayInfo> => {
  const out: Record<string, CalendarDayInfo> = {}
  Object.entries(data?.days || {}).forEach(([key, day]) => {
    const label = day.kind === 'working'
      ? (day.partial.length ? day.partial.join(', ') : '')
      : day.kind === 'weekly_off' ? '' : day.label || DAY_KIND_PREFIX[day.kind] || ''
    out[key] = { off: !day.working, label: label || undefined }
  })
  return out
}

/** Items grouped by each day they cover, within [from, to]. */
export const groupByDay = (items: CalendarItem[], from: string, to: string, data?: CalendarData): AgendaGroup[] => {
  const groups = new Map<string, CalendarItem[]>()
  items.forEach((item) => {
    let key = item.startDate < from ? from : item.startDate
    const last = item.endDate > to ? to : item.endDate
    let guard = 0
    while (key <= last && guard < 62) {
      groups.set(key, [...(groups.get(key) || []), item])
      const d = new Date(`${key}T00:00:00.000Z`)
      d.setUTCDate(d.getUTCDate() + 1)
      key = d.toISOString().slice(0, 10)
      guard += 1
    }
  })
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const day = data?.days?.[date]
      return {
        date,
        off: day ? !day.working : false,
        dayLabel: day && day.kind !== 'working' && day.kind !== 'weekly_off' ? day.label : undefined,
        entries: list.map((item) => ({ ...toEntry(item), meta: [item.venue, item.detail].filter(Boolean).join(' · ') || undefined })),
      }
    })
}

export const findItem = (data: CalendarData | undefined, entryId: string) => data?.items.find((item) => item.id === entryId)
