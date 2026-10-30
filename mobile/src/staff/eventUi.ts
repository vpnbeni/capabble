import { formatDayKey, formatTime } from '@/lib/format'
import { STATUS_LABELS } from '@/portal/calendarUi'
import type { EventRow } from '@/services/eventService'
import type { Tone } from '@/theme/tokens'

/** "Sat 31 Oct · 9:00 am", "Fri 6 Nov to Wed 11 Nov". */
export const eventWhen = (row: Pick<EventRow, 'startDate' | 'endDate' | 'startTime' | 'allDay'>) => {
  const day = formatDayKey(row.startDate, { weekday: 'short' })
  const until = row.endDate && row.endDate !== row.startDate ? ` to ${formatDayKey(row.endDate, { weekday: 'short' })}` : ''
  return `${day}${until}${!row.allDay && row.startTime ? ` · ${formatTime(row.startTime)}` : ''}`
}

/** The status badge, as on the website; a draft the principal sent back says so. */
export const eventBadge = (row: Pick<EventRow, 'status' | 'rejectionNote'>): { label: string; tone: Tone } =>
  row.status === 'draft' && row.rejectionNote ? { label: 'Not approved', tone: 'danger' } : STATUS_LABELS[row.status]
