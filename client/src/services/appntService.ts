import type { AxiosRequestConfig } from 'axios'
import baseApi from './api'

// Appointment pages show their own success/error toasts, so opt out of the global
// interceptor toasts (`_silent`) to avoid showing every message twice.
type Config = AxiosRequestConfig
const silent = (config?: Config): Config => ({ ...(config || {}), _silent: true } as Config)
const api = {
  get: (url: string, config?: Config) => baseApi.get(url, silent(config)),
  post: (url: string, data?: unknown, config?: Config) => baseApi.post(url, data, silent(config)),
  put: (url: string, data?: unknown, config?: Config) => baseApi.put(url, data, silent(config)),
}

export type AppointmentStatus = 'requested' | 'confirmed' | 'checked_in' | 'completed' | 'declined' | 'cancelled' | 'no_show'
export type VisitorType = 'parent' | 'visitor' | 'staff' | 'vendor' | 'other'
export type AppointmentMode = 'in_person' | 'phone' | 'video'
export type AppointmentAction = 'confirm' | 'decline' | 'check-in' | 'complete' | 'no-show' | 'cancel'

export type Appointment = {
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
  student?: string | null
  studentSnapshot?: { name?: string; rollNumber?: string; className?: string; section?: string }
  purpose: string
  agenda?: string
  status: AppointmentStatus
  source: 'front_desk' | 'host' | 'portal' | 'walk_in'
  overrideTeaching?: boolean
  checkInAt?: string | null
  checkOutAt?: string | null
  outcomeNotes?: string
  cancelReason?: string
  timeline: Array<{ status: AppointmentStatus; at: string; by?: string; note?: string }>
  createdAt: string
  canSeeNotes: boolean
  canAct: boolean
  hostAbsent?: boolean
}

export type WeeklyWindow = { day: number; start: string; end: string }

export type AppointmentHost = {
  _id: string
  teacher?: string | null
  user?: string | null
  displayName: string
  title?: string
  email?: string
  location?: string
  slotMinutes: number
  bufferMinutes: number
  maxPerDay: number
  weeklyAvailability: WeeklyWindow[]
  blockedDates: Array<{ date: string; reason?: string }>
  requiresApproval: boolean
  parentBookable: boolean
  parentVisibility: 'all' | 'linked'
  isActive: boolean
  mine?: boolean
  absentToday?: boolean
}

export type SlotState = 'free' | 'taken' | 'teaching' | 'past'
export type Slot = { start: string; end: string; state: SlotState; reason: string }
export type SlotDay = {
  date: string
  closed: boolean
  reason: string
  slots: Slot[]
  hostAbsent: boolean
  timetableLinked: boolean
}

export type TodayData = {
  date: string
  items: Appointment[]
  counts: Partial<Record<AppointmentStatus, number>>
  total: number
  waiting: number
  pendingRequests: number
  next: { _id: string; startTime: string; visitorName: string; hostName: string } | null
  isHostView: boolean
}

export type AppointmentList = {
  items: Appointment[]
  counts: Partial<Record<AppointmentStatus, number>>
  pagination: { page: number; limit: number; total: number; pages: number }
}

export type AppointmentSettings = {
  allowParentRequests: boolean
  minNoticeHours: number
  maxAdvanceDays: number
  maxOpenRequestsPerParent: number
  purposes: string[]
  emailNotifications: boolean
}

export type StaffOption = { _id: string; name: string; designation?: string; employeeId?: string; email?: string; department?: string; isHost: boolean }
export type StudentOption = {
  _id: string
  name: string
  rollNumber: string
  class?: string
  section?: string
  fatherName?: string
  motherName?: string
  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
}

export type ReportRow = { name: string; total: number; completed: number; noShow: number; cancelled: number }
export type ReportSummary = {
  from: string
  to: string
  total: number
  status: Partial<Record<AppointmentStatus, number>>
  noShowRate: number
  byHost: ReportRow[]
  byPurpose: ReportRow[]
  byVisitorType: ReportRow[]
}

export type BookingPayload = {
  hostId: string
  date?: string
  startTime?: string
  visitorType: VisitorType
  visitor: { name: string; phone?: string; email?: string; relation?: string; organisation?: string; count?: number }
  studentId?: string
  staffId?: string
  purpose: string
  agenda?: string
  mode?: AppointmentMode
  location?: string
  overrideTeaching?: boolean
}

export type HostPayload = Partial<Omit<AppointmentHost, '_id' | 'teacher' | 'user' | 'mine' | 'absentToday'>> & {
  teacherId?: string | null
  userId?: string | null
}

export type ListParams = {
  q?: string
  status?: string
  hostId?: string
  from?: string
  to?: string
  visitorType?: string
  sort?: 'upcoming' | 'recent'
  page?: number
  limit?: number
}

const data = <T,>(promise: Promise<{ data: { data: T } }>) => promise.then((res) => res.data.data)
const clean = (params: object) => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null))

const appntService = {
  today: (date?: string) => data<TodayData>(api.get('/appnt/today', { params: date ? { date } : {} })),
  list: (params: ListParams) => data<AppointmentList>(api.get('/appnt/appointments', { params: clean(params) })),
  get: (id: string) => data<Appointment>(api.get(`/appnt/appointments/${id}`)),
  book: (payload: BookingPayload) => data<Appointment>(api.post('/appnt/appointments', payload)),
  walkIn: (payload: BookingPayload) => data<Appointment>(api.post('/appnt/appointments/walk-in', payload)),
  act: (id: string, action: AppointmentAction, note?: string) => data<Appointment>(api.post(`/appnt/appointments/${id}/${action}`, { note: note || '' })),
  reschedule: (id: string, payload: { date: string; startTime: string; overrideTeaching?: boolean; note?: string }) =>
    data<Appointment>(api.post(`/appnt/appointments/${id}/reschedule`, payload)),
  saveNotes: (id: string, outcomeNotes: string) => data<Appointment>(api.put(`/appnt/appointments/${id}/notes`, { outcomeNotes })),

  hosts: (all = false) => data<AppointmentHost[]>(api.get('/appnt/hosts', { params: all ? { all: 1 } : {} })),
  myHost: () => data<AppointmentHost>(api.get('/appnt/hosts/me')),
  slots: (hostId: string, date: string) => data<SlotDay>(api.get(`/appnt/hosts/${hostId}/slots`, { params: { date } })),
  createHost: (payload: HostPayload) => data<AppointmentHost>(api.post('/appnt/hosts', payload)),
  updateHost: (id: string, payload: HostPayload) => data<AppointmentHost>(api.put(`/appnt/hosts/${id}`, payload)),
  updateMyAvailability: (payload: HostPayload) => data<AppointmentHost>(api.put('/appnt/hosts/me/availability', payload)),

  settings: () => data<AppointmentSettings>(api.get('/appnt/settings')),
  saveSettings: (payload: Partial<AppointmentSettings>) => data<AppointmentSettings>(api.put('/appnt/settings', payload)),

  staff: () => data<StaffOption[]>(api.get('/appnt/lookup/staff')),
  students: () => data<{ available: boolean; items: StudentOption[] }>(api.get('/appnt/lookup/students')),
  report: (params: { from?: string; to?: string }) => data<ReportSummary>(api.get('/appnt/reports/summary', { params: clean(params) })),
}

export default appntService
