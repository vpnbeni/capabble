import { api } from '@/lib/api'

export type DayKind = 'weekly_off' | 'holiday' | 'vacation' | 'half_day' | 'closure' | 'working_day'
export type HolidayCategory = 'national' | 'state' | 'school' | 'religious' | 'other'
export type ClosureMode = 'closed' | 'online' | 'hybrid'

/** A holiday, vacation, closure, half day, extra working day or weekly day off. */
export interface SchoolDayRule {
  id: string
  kind: DayKind
  title?: string
  startDate: string
  endDate: string
  status: 'active' | 'cancelled'
  category?: HolidayCategory
  weekly?: { weekday: number; weeksOfMonth: number[] }
  /** Sections are "7|A". */
  appliesTo?: { scope: 'school' | 'classes'; classes: string[]; sections: string[] }
  mode?: ClosureMode
  halfDayEndTime?: string
  reason?: string
  eventId?: string | null
}

export interface SchoolDaysData {
  from: string
  to: string
  today: string
  rules: SchoolDayRule[]
  summary: { days: number; working: number; off: number }
}

export type RuleInput = Partial<{
  kind: DayKind
  title: string
  startDate: string
  endDate: string
  category: HolidayCategory
  appliesTo: { scope: 'school' | 'classes'; classes: string[]; sections: string[] }
  mode: ClosureMode
  halfDayEndTime: string | null
  reason: string
  /** Also puts it on everyone's calendar and notifies (principal and office only). */
  announce: { families: boolean; staff: boolean; email: boolean; note: string } | null
}>

export const schoolDaysService = {
  /** This session's school-day rules (active only). */
  list: () => api.get<SchoolDaysData>('/school-days'),
  create: (input: RuleInput) => api.post<{ id: string; eventId: string | null }>('/school-days/rules', input),
  update: (id: string, input: RuleInput) => api.patch<{ id: string }>(`/school-days/rules/${encodeURIComponent(id)}`, input),
  /** The days become working days again; an announced day tells people. */
  remove: (id: string) => api.post<unknown>(`/school-days/rules/${encodeURIComponent(id)}/cancel`, {}),
}
