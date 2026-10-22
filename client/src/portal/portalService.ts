import type { AxiosRequestConfig } from 'axios'
import baseApi from '@/services/api'
import type { CalendarData, CalendarEventView, FeedStatus, ReplyInput } from '@/services/calendarService'

// Portal pages show their own empty/error states; skip the global toasts.
const silent = (config?: AxiosRequestConfig): AxiosRequestConfig => ({ ...(config || {}), _silent: true } as AxiosRequestConfig)
const get = (url: string, config?: AxiosRequestConfig) => baseApi.get(url, silent(config))
const post = (url: string, data?: unknown) => baseApi.post(url, data, silent())

export type PortalSection = 'profile' | 'calendar' | 'attendance' | 'timetable' | 'results' | 'fees' | 'notices' | 'transport' | 'appointments'

export interface PortalChild {
  studentId: string
  rollNumber: string
  relation: string
  name: string
  className: string
  section: string
  profileImage: string | null
}

export interface PortalHome {
  kind: 'parent' | 'student'
  academicSession: string | null
  school: { name: string; logoUrl?: string | null; address?: string; phone?: string; email?: string }
  sections: PortalSection[]
  students: PortalChild[]
}

export interface PortalProfile {
  studentId: string
  name: string
  rollNumber: string
  className: string
  section: string
  classRollNo: number | null
  gender: string
  dateOfBirth: string | null
  admissionDate: string | null
  house: string
  busNo: string
  fatherName: string
  motherName: string
  guardianName: string
  guardianPhone: string
  guardianEmail: string
  email: string
  phone: string
  address: { street?: string; city?: string; state?: string; pincode?: string } | null
  profileImage: string | null
}

export type AttendanceDayStatus = 'present' | 'absent' | 'half_day' | 'holiday' | 'weekly_off' | 'upcoming'

export interface PortalAttendance {
  month: string
  days: Array<{ date: string; status: AttendanceDayStatus }>
  summary: {
    schoolDays: number
    present: number
    absent: number
    halfDays: number
    holidays: number
    percentage: number | null
  }
}

export interface PortalTimetable {
  className: string
  section: string
  classTeacher: string
  publishedAt: string
  periods: Array<{ id: string; label: string; startTime: string; endTime: string; isBreak: boolean }>
  days: Array<{ name: string; slots: Array<{ isBreak: boolean; subject?: string; teacher?: string }> }>
}

export interface PortalResult {
  examId: string
  examName: string
  publishedAt: string | null
  absent: boolean
  absentSubjects: string[]
  subjects: Array<{ name: string; role: string; maxMarks: number; marksObtained: number; grade: string }>
  total: number
  maxTotal: number
  percentage: string
  grade: string
}

export interface PortalFees {
  totals: { demanded: number; paid: number; balance: number }
  demands: Array<{
    _id: string
    label: string
    dueDate: string
    total: number
    paid: number
    balance: number
    status: 'due' | 'partial' | 'paid' | 'waived'
    isOverdue: boolean
    lines: Array<{ name: string; amount: number }>
  }>
  payments: Array<{ _id: string; receiptNo: string; date: string; mode: string; amount: number }>
}

export interface PortalNotice {
  _id: string
  title: string
  circularDate: string
  publishedAt?: string
  referenceSeries?: string
  referenceNumber?: string
  content?: string
}

export interface PortalTransport {
  usesSchoolTransport: boolean
  commuteMode?: string
  busNo?: string
  vehicle?: {
    registrationNumber: string
    driverName: string
    driverPhone: string
    conductorName: string
    conductorPhone: string
  } | null
  myStop?: { id: string; name: string; shift: 'pickup' | 'drop' | 'both' } | null
  routes?: Array<{ name: string; stops: Array<{ id?: string; name: string; landmark?: string; pickupTime?: string; dropTime?: string }> }>
}

export interface PortalBusStop {
  id: string
  name: string
  landmark?: string
  pickupTime?: string
  dropTime?: string
  lat: number | null
  lng: number | null
}

/** Where the child's bus is. `trip` is set only while the bus is on a trip on the child's route. */
export interface PortalBusLive {
  active: boolean
  assigned: boolean
  busNo?: string
  route?: { name: string; code: string }
  stops?: PortalBusStop[]
  myStopId?: string
  trip?: {
    direction: 'pickup' | 'drop'
    startedAt: string
    bus: { lat: number; lng: number; heading: number | null; speed: number | null; at: string } | null
    staleSeconds: number | null
  } | null
  today?: Array<{ event: 'boarded' | 'dropped' | 'absent'; at: string }>
}

export type PortalAppointmentStatus = 'requested' | 'confirmed' | 'checked_in' | 'completed' | 'declined' | 'cancelled' | 'no_show'

export interface PortalAppointment {
  _id: string
  refNo: string
  date: string
  startTime: string
  endTime: string
  hostName: string
  mode: 'in_person' | 'phone' | 'video'
  location?: string
  purpose: string
  agenda?: string
  status: PortalAppointmentStatus
  cancelReason?: string
  studentSnapshot?: { name?: string; className?: string; section?: string }
}

export interface PortalAppointments {
  items: PortalAppointment[]
  allowRequests: boolean
  purposes: string[]
  minNoticeHours: number
  maxAdvanceDays: number
}

export interface PortalAppointmentHost {
  _id: string
  displayName: string
  title?: string
  location?: string
  slotMinutes: number
  days: number[]
}

export interface PortalSlotDay {
  date: string
  closed: boolean
  reason: string
  slots: Array<{ start: string; end: string; open: boolean }>
}

export interface PortalAppointmentRequest {
  hostId: string
  date: string
  startTime: string
  purpose: string
  agenda?: string
  mode?: 'in_person' | 'phone' | 'video'
  phone?: string
}

const student = (id: string) => `/portal/students/${encodeURIComponent(id)}`

const portalService = {
  home: async (): Promise<PortalHome> => (await get('/portal/home')).data.data,
  profile: async (id: string): Promise<PortalProfile> => (await get(`${student(id)}/profile`)).data.data,
  attendance: async (id: string, month: string): Promise<PortalAttendance> =>
    (await get(`${student(id)}/attendance`, { params: { month } })).data.data,
  timetable: async (id: string): Promise<PortalTimetable | null> => (await get(`${student(id)}/timetable`)).data.data,
  results: async (id: string): Promise<PortalResult[]> => (await get(`${student(id)}/results`)).data.data,
  fees: async (id: string): Promise<PortalFees | null> => (await get(`${student(id)}/fees`)).data.data,
  transport: async (id: string): Promise<PortalTransport> => (await get(`${student(id)}/transport`)).data.data,
  busLive: async (id: string): Promise<PortalBusLive> => (await get(`${student(id)}/transport/live`)).data.data,
  notices: async (): Promise<PortalNotice[]> => (await get('/portal/notices')).data.data,
  notice: async (id: string): Promise<PortalNotice> => (await get(`/portal/notices/${encodeURIComponent(id)}`)).data.data,
  appointments: async (): Promise<PortalAppointments> => (await get('/portal/appointments')).data.data,
  appointmentHosts: async (id: string): Promise<PortalAppointmentHost[]> => (await get(`${student(id)}/appointment-hosts`)).data.data,
  appointmentSlots: async (id: string, hostId: string, date: string): Promise<PortalSlotDay> =>
    (await get(`${student(id)}/appointment-hosts/${encodeURIComponent(hostId)}/slots`, { params: { date } })).data.data,
  requestAppointment: async (id: string, payload: PortalAppointmentRequest): Promise<PortalAppointment> =>
    (await post(`${student(id)}/appointments`, payload)).data.data,
  cancelAppointment: async (appointmentId: string, reason?: string): Promise<PortalAppointment> =>
    (await post(`/portal/appointments/${encodeURIComponent(appointmentId)}/cancel`, { reason: reason || '' })).data.data,
  calendar: async (from: string, to: string): Promise<CalendarData> => (await get('/portal/calendar', { params: { from, to } })).data.data,
  calendarEvent: async (id: string): Promise<CalendarEventView> => (await get(`/portal/calendar/events/${encodeURIComponent(id)}`)).data.data,
  calendarFeed: async (): Promise<FeedStatus> => (await get('/portal/calendar/feed')).data.data,
  resetCalendarFeed: async (): Promise<FeedStatus> => (await post('/portal/calendar/feed')).data.data,
  calendarFeedOff: async (): Promise<FeedStatus> => (await baseApi.delete('/portal/calendar/feed', silent())).data.data,
  respondToEvent: async (id: string, input: ReplyInput): Promise<ReplyInput> =>
    (await post(`/portal/calendar/events/${encodeURIComponent(id)}/respond`, input)).data.data,
  receiptPdf: async (studentId: string, paymentId: string): Promise<Blob> =>
    (await get(`${student(studentId)}/fees/receipts/${encodeURIComponent(paymentId)}`, { responseType: 'blob' })).data,
}

export default portalService
