import { CalendarDays, ClipboardList, GraduationCap, Trophy, Users, Wallet, type LucideIcon } from 'lucide-react-native'

import { dayKeyAdd, formatDayKey, formatTime } from '@/lib/format'
import type { CalendarData, CalendarItem, CalendarLayerKey, CalendarPart, EventCategory, EventRole, EventStatus, ResponseValue } from '@/services/calendarTypes'
import type { Palette, TileIndex } from '@/theme/tokens'
import type { AgendaDay } from '@/ui'

// Labels and mapping for calendar items. Same as client/src/components/calendar/calendarUi.ts.

/** Fixed chart colour per layer, always shown with the item's own words. */
export const LAYER_CATEGORY: Record<CalendarLayerKey, TileIndex> = {
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

/** A layer's identity tile and glyph in rails and rows (tiles are identity, never status). */
export const LAYER_TILE: Record<CalendarLayerKey, TileIndex> = {
  events: 1,
  exams: 6,
  duties: 4,
  fees: 3,
  appointments: 2,
  activities: 5,
  school_days: 1,
}

export const LAYER_ICON: Record<CalendarLayerKey, LucideIcon> = {
  events: CalendarDays,
  exams: GraduationCap,
  duties: ClipboardList,
  fees: Wallet,
  appointments: Users,
  activities: Trophy,
  school_days: CalendarDays,
}

/** An event part still waiting for this family's answer (and replies haven't closed). */
export const needsReply = (item: CalendarItem, today: string) =>
  item.status !== 'cancelled' &&
  Boolean(
    item.parts?.some(
      (part) => part.response && part.response !== 'none' && !part.myResponse && !(part.responseDeadline && today > part.responseDeadline),
    ),
  )

const itemMeta = (item: CalendarItem) => {
  const notes: string[] = []
  if (item.child) notes.push(`For ${item.child.name.split(' ')[0]}`)
  if (item.tentative) notes.push('Tentative')
  if (item.status === 'cancelled') notes.push('Cancelled')
  return [...notes, item.venue, item.detail].filter(Boolean).join(' · ') || undefined
}

/** Items keyed by each day they cover, within [from, to], days in order. */
export const itemsByDay = (items: CalendarItem[], from: string, to: string) => {
  const days = new Map<string, CalendarItem[]>()
  items.forEach((item) => {
    let key = item.startDate < from ? from : item.startDate
    const last = item.endDate > to ? to : item.endDate
    let guard = 0
    while (key <= last && guard < 62) {
      days.set(key, [...(days.get(key) || []), item])
      key = dayKeyAdd(key, 1)
      guard += 1
    }
  })
  return new Map([...days.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

/** The Agenda's days: "Today", "Tomorrow", then dates; a day without school says why. */
export const agendaDays = (
  byDay: Map<string, CalendarItem[]>,
  today: string,
  data: CalendarData | undefined,
  colors: Palette,
  onOpen: (item: CalendarItem) => void,
): AgendaDay[] =>
  [...byDay.entries()].map(([date, list]) => {
    const day = data?.days?.[date]
    const off = day && !day.working && day.kind !== 'weekly_off' ? day.label || 'No school' : undefined
    return {
      label: date === today ? 'Today' : date === dayKeyAdd(today, 1) ? 'Tomorrow' : formatDayKey(date, { weekday: 'short' }),
      off,
      items: list.map((item) => ({
        time: item.allDay || !item.startTime ? 'All day' : formatTime(item.startTime),
        end: !item.allDay && item.endTime ? formatTime(item.endTime) : undefined,
        title: item.title,
        meta: itemMeta(item),
        color: colors[`chart-${LAYER_CATEGORY[item.layer] ?? 1}`],
        badge: needsReply(item, today) ? { label: 'Reply', tone: 'warning' as const } : undefined,
        onPress: () => onOpen(item),
      })),
    }
  })

/** "For Aarav", "For Aarav and Diya" (first names when there are several), else the audience's name. */
export const partFor = (part: CalendarPart) => {
  const kids = part.children?.length ? part.children : part.child ? [part.child] : []
  if (!kids.length) return part.label || 'For you'
  if (kids.length === 1) return `For ${kids[0].name}`
  const names = kids.map((kid) => kid.name.split(' ')[0])
  return `For ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** Whether an item concerns one child (or everyone, when it isn't tied to a child). */
export const isForChild = (item: CalendarItem, studentId: string) => {
  if (item.child) return item.child.studentId === studentId
  if (item.parts?.length) {
    return item.parts.some((part) => {
      const kids = part.children?.length ? part.children : part.child ? [part.child] : []
      return !kids.length || kids.some((kid) => kid.studentId === studentId)
    })
  }
  return true
}
