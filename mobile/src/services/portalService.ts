import { api, ApiError, getTenantSlug } from '@/lib/api'
import { API_BASE_URL } from '@/lib/config'

import type { CalendarData, CalendarEventView, ReplyInput } from './calendarTypes'

// Family portal API (/api/portal), shared with the web portal (client/src/portal/portalService.ts).

export type PortalSection =
  | 'profile'
  | 'calendar'
  | 'attendance'
  | 'timetable'
  | 'results'
  | 'fees'
  | 'notices'
  | 'transport'
  | 'appointments'

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
  /** Sections the school has turned on for this kind of login (Fees is parents only). */
  sections: PortalSection[]
  students: PortalChild[]
}

export type FeeStatus = 'due' | 'partial' | 'paid' | 'waived'

export interface PortalFees {
  totals: { demanded: number; paid: number; balance: number }
  demands: {
    _id: string
    label: string
    dueDate: string
    total: number
    paid: number
    balance: number
    status: FeeStatus
    isOverdue: boolean
    lines: { name: string; amount: number }[]
  }[]
  payments: { _id: string; receiptNo: string; date: string; mode: string; amount: number }[]
  /** Whether the school takes fees online (its own Razorpay account). */
  onlinePayment?: { enabled: boolean; mode?: 'test' | 'live' | null }
}

/** A started online payment. The app pays on `checkoutUrl` in the browser. */
export interface PortalPaymentOrder {
  orderId: string
  amount: number
  installments: { _id: string; label: string; amount: number }[]
  checkoutUrl: string
}

export interface PortalPaymentResult {
  orderId: string
  /** created: not paid yet · processing: being recorded · review: paid, the office makes the receipt */
  status: 'created' | 'processing' | 'paid' | 'review'
  amount: number
  receiptNo: string | null
  feePaymentId: string | null
  paidAt: string | null
  method: string
  paymentId: string | null
  message: string
}

export interface PortalNotice {
  _id: string
  title: string
  circularDate: string
  publishedAt?: string
  referenceSeries?: string
  referenceNumber?: string
  /** HTML written by the school. */
  content?: string
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
  address: { street?: string; city?: string; state?: string; pincode?: string } | null
  profileImage: string | null
}

export type AttendanceDayStatus = 'present' | 'absent' | 'half_day' | 'holiday' | 'weekly_off' | 'upcoming'

export interface PortalAttendance {
  month: string
  days: { date: string; status: AttendanceDayStatus; label?: string }[]
  summary: { schoolDays: number; present: number; absent: number; halfDays: number; holidays: number; percentage: number | null }
}

export interface PortalTimetable {
  className: string
  section: string
  classTeacher: string
  publishedAt: string
  periods: { id: string; label: string; startTime: string; endTime: string; isBreak: boolean }[]
  days: { name: string; slots: { isBreak: boolean; subject?: string; teacher?: string }[] }[]
}

export interface PortalResult {
  examId: string
  examName: string
  publishedAt: string | null
  absent: boolean
  absentSubjects: string[]
  subjects: { name: string; role: string; maxMarks: number; marksObtained: number; grade: string }[]
  total: number
  maxTotal: number
  percentage: string
  grade: string
}

export interface PortalTransport {
  usesSchoolTransport: boolean
  commuteMode?: string
  busNo?: string
  vehicle?: { registrationNumber: string; driverName: string; driverPhone: string; conductorName: string; conductorPhone: string } | null
  myStop?: { id: string; name: string; shift: 'pickup' | 'drop' | 'both' } | null
  routes?: { name: string; stops: { id?: string; name: string; landmark?: string; pickupTime?: string; dropTime?: string }[] }[]
}

/** Where the child's bus is. `trip` is set only while the bus is on a trip on the child's route. */
export interface PortalBusLive {
  active: boolean
  assigned: boolean
  busNo?: string
  route?: { name: string; code: string }
  stops?: { id: string; name: string; pickupTime?: string; dropTime?: string }[]
  myStopId?: string
  trip?: { direction: 'pickup' | 'drop'; startedAt: string; bus: { at: string } | null; staleSeconds: number | null } | null
  today?: { event: 'boarded' | 'dropped' | 'absent'; at: string }[]
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
  slots: { start: string; end: string; open: boolean }[]
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

export const portalService = {
  home: () => api.get<PortalHome>('/portal/home'),
  /** null when the school hasn't set up this session's fees for the child. */
  fees: (studentId: string) => api.get<PortalFees | null>(`${student(studentId)}/fees`),
  notices: () => api.get<PortalNotice[]>('/portal/notices'),
  notice: (id: string) => api.get<PortalNotice>(`/portal/notices/${encodeURIComponent(id)}`),
  calendar: (from: string, to: string) => api.get<CalendarData>('/portal/calendar', { from, to }),
  calendarEvent: (id: string) => api.get<CalendarEventView>(`/portal/calendar/events/${encodeURIComponent(id)}`),
  respondToEvent: (id: string, input: ReplyInput) =>
    api.post<ReplyInput>(`/portal/calendar/events/${encodeURIComponent(id)}/respond`, input),
  profile: (studentId: string) => api.get<PortalProfile>(`${student(studentId)}/profile`),
  attendance: (studentId: string, month: string) => api.get<PortalAttendance>(`${student(studentId)}/attendance`, { month }),
  /** null until the school publishes a timetable for the child's class. */
  timetable: (studentId: string) => api.get<PortalTimetable | null>(`${student(studentId)}/timetable`),
  results: (studentId: string) => api.get<PortalResult[]>(`${student(studentId)}/results`),
  transport: (studentId: string) => api.get<PortalTransport>(`${student(studentId)}/transport`),
  busLive: (studentId: string) => api.get<PortalBusLive>(`${student(studentId)}/transport/live`),
  appointments: () => api.get<PortalAppointments>('/portal/appointments'),
  appointmentHosts: (studentId: string) => api.get<PortalAppointmentHost[]>(`${student(studentId)}/appointment-hosts`),
  appointmentSlots: (studentId: string, hostId: string, date: string) =>
    api.get<PortalSlotDay>(`${student(studentId)}/appointment-hosts/${encodeURIComponent(hostId)}/slots`, { date }),
  requestAppointment: (studentId: string, payload: PortalAppointmentRequest) =>
    api.post<PortalAppointment>(`${student(studentId)}/appointments`, payload),
  cancelAppointment: (id: string, reason?: string) =>
    api.post<PortalAppointment>(`/portal/appointments/${encodeURIComponent(id)}/cancel`, { reason: reason || '' }),

  startPayment: (studentId: string, demandIds: string[]) =>
    api.post<PortalPaymentOrder>(`${student(studentId)}/fees/pay`, { demandIds, source: 'app' }),
  payment: (studentId: string, orderId: string) =>
    api.get<PortalPaymentResult>(`${student(studentId)}/fees/pay/${encodeURIComponent(orderId)}`),

  /** A fee receipt as PDF bytes (the session cookie goes with the request). */
  receiptPdf: async (studentId: string, paymentId: string): Promise<ArrayBuffer> => {
    const response = await fetch(`${API_BASE_URL}${student(studentId)}/fees/receipts/${encodeURIComponent(paymentId)}`, {
      headers: { 'x-tenant-slug': getTenantSlug() ?? '', 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/pdf' },
      credentials: 'include',
    })
    if (!response.ok) throw new ApiError("Couldn't download the receipt. Try again.", response.status)
    return response.arrayBuffer()
  },
}
