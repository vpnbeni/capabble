import { api } from '@/lib/api'

// Appointments for staff (/api/appnt), the same endpoints as the website's
// (client/src/services/appntService.ts). Hosts see and act on their own meetings only.

export type AppointmentStatus = 'requested' | 'confirmed' | 'checked_in' | 'completed' | 'declined' | 'cancelled' | 'no_show'
export type VisitorType = 'parent' | 'visitor' | 'staff' | 'vendor' | 'other'
export type AppointmentMode = 'in_person' | 'phone' | 'video'
export type AppointmentAction = 'confirm' | 'decline' | 'check-in' | 'complete' | 'no-show' | 'cancel'

export interface Appointment {
  _id: string
  refNo: string
  date: string
  startTime: string
  endTime: string
  host: string
  hostName: string
  mode: AppointmentMode
  location?: string
  visitorType: VisitorType
  visitor: { name: string; phone?: string; email?: string; relation?: string; organisation?: string; count?: number }
  studentSnapshot?: { name?: string; rollNumber?: string; className?: string; section?: string }
  purpose: string
  agenda?: string
  status: AppointmentStatus
  outcomeNotes?: string
  cancelReason?: string
  canSeeNotes: boolean
  canAct: boolean
  hostAbsent?: boolean
}

export interface AppointmentDay {
  date: string
  items: Appointment[]
  total: number
  waiting: number
  pendingRequests: number
  isHostView: boolean
}

export interface AppointmentList {
  items: Appointment[]
  counts: Partial<Record<AppointmentStatus, number>>
  pagination: { page: number; limit: number; total: number; pages: number }
}

export type WeeklyWindow = { day: number; start: string; end: string }

export interface MyHost {
  _id: string
  displayName: string
  location?: string
  slotMinutes: number
  weeklyAvailability: WeeklyWindow[]
  blockedDates: { date: string; reason?: string }[]
}

/** A person who takes meetings, as the front desk sees them. */
export interface Host extends MyHost {
  title?: string
  isActive: boolean
  teacher?: string | null
  absentToday: boolean
  mine: boolean
}

export interface HostSlots {
  date: string
  /** Only `free` slots can be booked; teaching periods and booked times show why not. */
  slots: { start: string; end: string; state: 'free' | 'past' | 'taken' | 'teaching'; reason: string }[]
  closed?: boolean
  reason?: string
  hostAbsent?: boolean
}

export interface DeskSettings {
  purposes: string[]
}

/** A student as the front desk looks them up, with the guardian to call. */
export interface DeskStudent {
  _id: string
  name: string
  rollNumber?: string
  class?: string
  section?: string
  fatherName?: string
  motherName?: string
  guardianName?: string
  guardianPhone?: string
}

export interface BookingInput {
  hostId: string
  date?: string
  startTime?: string
  visitorType: VisitorType
  visitor: { name: string; phone?: string; relation?: string; organisation?: string; count?: number }
  studentId?: string
  purpose: string
  agenda?: string
  mode: AppointmentMode
}

export const appntService = {
  /** One day's meetings (today by default) with the count of requests still to answer. */
  day: (date: string) => api.get<AppointmentDay>('/appnt/today', { date }),
  list: (params: { status?: string; from?: string; to?: string; limit?: number; sort?: 'upcoming' }) =>
    api.get<AppointmentList>('/appnt/appointments', { ...params, limit: params.limit ?? 50 }),
  act: (id: string, action: AppointmentAction, note?: string) =>
    api.post<Appointment>(`/appnt/appointments/${encodeURIComponent(id)}/${action}`, note ? { note } : {}),
  saveNotes: (id: string, outcomeNotes: string) => api.put<Appointment>(`/appnt/appointments/${encodeURIComponent(id)}/notes`, { outcomeNotes }),
  myHost: () => api.get<MyHost>('/appnt/hosts/me'),
  saveMyHours: (changes: Pick<MyHost, 'weeklyAvailability' | 'blockedDates'>) => api.put<MyHost>('/appnt/hosts/me/availability', changes),

  // Front desk (book, manage) and the principal (settings).
  hosts: () => api.get<Host[]>('/appnt/hosts'),
  /** Including hosts turned off (settings permission). */
  allHosts: () => api.get<Host[]>('/appnt/hosts', { all: '1' }),
  staff: () => api.get<{ _id: string; name: string; designation?: string; isHost: boolean }[]>('/appnt/lookup/staff'),
  /** Makes a staff member a host; they get the host role and set their own hours. */
  createHost: (teacherId: string) => api.post<Host>('/appnt/hosts', { teacherId }),
  slots: (hostId: string, date: string) => api.get<HostSlots>(`/appnt/hosts/${encodeURIComponent(hostId)}/slots`, { date }),
  settings: () => api.get<DeskSettings>('/appnt/settings'),
  students: () => api.get<{ available: boolean; items: DeskStudent[] }>('/appnt/lookup/students'),
  /** A booking is confirmed at once; a walk-in is checked in now. */
  book: (input: BookingInput) => api.post<Appointment>('/appnt/appointments', input),
  walkIn: (input: BookingInput) => api.post<Appointment>('/appnt/appointments/walk-in', input),
  reschedule: (id: string, date: string, startTime: string) => api.post<Appointment>(`/appnt/appointments/${encodeURIComponent(id)}/reschedule`, { date, startTime }),
  /** Only the fields given change (taking meetings on or off, hours, days off). */
  updateHost: (id: string, changes: Partial<Pick<Host, 'isActive' | 'weeklyAvailability' | 'blockedDates'>>) => api.put<Host>(`/appnt/hosts/${encodeURIComponent(id)}`, changes),
}
