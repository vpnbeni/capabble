import { api } from '@/lib/api'

import type { EventCategory, EventStatus, ResponseType } from './calendarTypes'

/** A row of the events list (GET /calendar/events): this login's, or everyone's for managers. */
export interface EventRow {
  id: string
  title: string
  category: EventCategory
  startDate: string
  endDate: string
  startTime?: string | null
  endTime?: string | null
  allDay: boolean
  status: EventStatus
  rejectionNote?: string
  createdByName?: string
  audiences: string[]
  mine: boolean
  updatedAt: string
  cancelledAt?: string | null
}

export interface EventScope {
  type: string
  value: string
  label: string
}

/** An audience of an event, exactly as stored: sent back whole (with its key) when it changes. */
export interface EventSegment {
  key: string
  label: string
  personType: 'parent' | 'student' | 'staff'
  scopes: EventScope[]
  exclude?: EventScope[]
  role?: string
  instructions?: string
  attachments?: { name: string; url: string }[]
  notify?: string
  email?: boolean
  reminders?: string[]
  response?: ResponseType
  responseDeadline?: string | null
}

/** One event as its creator and the principal see it (GET /calendar/events/:id). */
export interface EventDetail extends EventRow {
  description?: string
  venue?: string
  visibility: 'segments' | 'staff' | 'school'
  segments: EventSegment[]
  cancelReason?: string
  publishedAt?: string | null
  recurrence?: { freq?: string | null }
}

/** Who has and hasn't replied to one audience (GET /calendar/events/:id/responses). */
export interface ReplyTracker {
  key: string
  label: string
  type: Exclude<ResponseType, 'none'>
  deadline: string | null
  expected: number
  counts: Partial<Record<string, number>>
  headcount: number
  responded: { name: string; child: string; value: string; count?: number; note?: string; at: string }[]
  pending: { userId: string; name: string; child: string; studentId: string }[]
}

/** Only the fields that changed; `segments` is sent whole when an audience changes. */
export type EventPatch = Partial<{
  title: string
  category: EventCategory
  allDay: boolean
  startDate: string
  endDate: string
  startTime: string | null
  endTime: string | null
  venue: string
  segments: EventSegment[]
}> & { notify?: 'affected' | 'everyone' | 'none' }

const path = (id: string) => `/calendar/events/${encodeURIComponent(id)}`

/** The fields a segment may be sent back with (the server refuses others, such as `_id`). */
export const segmentForSave = (segment: EventSegment): EventSegment => ({
  key: segment.key,
  label: segment.label,
  personType: segment.personType,
  scopes: segment.scopes.map(({ type, value, label }) => ({ type, value, label })),
  exclude: (segment.exclude ?? []).map(({ type, value, label }) => ({ type, value, label })),
  role: segment.role,
  instructions: segment.instructions ?? '',
  attachments: (segment.attachments ?? []).map(({ name, url }) => ({ name, url })),
  notify: segment.notify,
  email: segment.email,
  reminders: segment.reminders ?? [],
  response: segment.response ?? 'none',
  responseDeadline: segment.responseDeadline || null,
})

export const eventService = {
  /** This login's events; `everyone` for logins that manage the calendar. */
  list: (everyone: boolean) => api.get<EventRow[]>('/calendar/events', everyone ? {} : { mine: '1' }),
  get: (id: string) => api.get<EventDetail>(path(id)),
  update: (id: string, patch: EventPatch) => api.patch<{ id: string; status: EventStatus }>(path(id), patch),
  /** Drafts and rejected events go to the principal (or out at once when this login may publish). */
  publish: (id: string) => api.post<{ id: string; status: EventStatus }>(`${path(id)}/publish`, {}),
  cancel: (id: string, reason: string, notify: boolean) => api.post<{ id: string; status: EventStatus }>(`${path(id)}/cancel`, { reason, notify }),
  /** Drafts and events still waiting for approval only. */
  remove: (id: string) => api.delete<unknown>(path(id)),
  replies: (id: string) => api.get<ReplyTracker[]>(`${path(id)}/responses`),
  /** Notifies everyone in the audience (or all audiences) who hasn't replied yet. */
  remind: (id: string, segmentKey?: string) => api.post<{ reminded: number }>(`${path(id)}/remind-pending`, segmentKey ? { segmentKey } : {}),
}
