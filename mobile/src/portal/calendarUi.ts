import type { AgendaEntry, AgendaGroup } from '@/ui'
import { dayKeyAdd } from '@/lib/format'
import type { CalendarData, CalendarItem, CalendarLayerKey, EventCategory, EventRole, EventStatus, ResponseValue } from '@/services/calendarTypes'

// Labels and mapping for calendar items. Same as client/src/components/calendar/calendarUi.ts.

/** Fixed chart colour per layer, always shown with the item's own words. */
export const LAYER_CATEGORY: Record<CalendarLayerKey, AgendaEntry['category']> = {
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

export const STATUS_LABELS: Record<EventStatus, { label: string; tone: 'neutral' | 'warning' | 'info' | 'success' | 'danger' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending_approval: { label: 'Waiting for approval', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  published: { label: 'Published', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
}

export const ANSWER_LABELS: Record<ResponseValue, string> = {
  acknowledged: 'Acknowledged',
  yes: 'Coming',
  no: 'Not coming',
  maybe: 'Maybe',
  given: 'Consent given',
  declined: 'Consent declined',
}

export const ANSWER_TONE: Record<ResponseValue, 'success' | 'danger' | 'warning'> = {
  acknowledged: 'success', yes: 'success', no: 'danger', maybe: 'warning', given: 'success', declined: 'danger',
}

export const toEntry = (item: CalendarItem): AgendaEntry => {
  const notes: string[] = []
  if (item.child) notes.push(`For ${item.child.name.split(' ')[0]}`)
  if (item.tentative) notes.push('Tentative')
  if (item.status === 'cancelled') notes.push('Cancelled')
  return {
    id: item.id,
    title: item.title,
    startTime: item.allDay ? null : item.startTime,
    category: LAYER_CATEGORY[item.layer] ?? 1,
    note: notes.join(' · ') || undefined,
    meta: [item.venue, item.detail].filter(Boolean).join(' · ') || undefined,
    muted: item.status === 'cancelled',
  }
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
      key = dayKeyAdd(key, 1)
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
        entries: list.map(toEntry),
      }
    })
}

/** Whether an item concerns one child (or everyone, when it isn't tied to a child). */
export const isForChild = (item: CalendarItem, studentId: string) => {
  if (item.child) return item.child.studentId === studentId
  if (item.parts?.length) return item.parts.some((part) => !part.child || part.child.studentId === studentId)
  return true
}
