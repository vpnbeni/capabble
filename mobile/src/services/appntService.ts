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
}
