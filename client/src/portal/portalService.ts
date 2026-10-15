import type { AxiosRequestConfig } from 'axios'
import baseApi from '@/services/api'

// Portal pages show their own empty/error states; skip the global toasts.
const silent = (config?: AxiosRequestConfig): AxiosRequestConfig => ({ ...(config || {}), _silent: true } as AxiosRequestConfig)
const get = (url: string, config?: AxiosRequestConfig) => baseApi.get(url, silent(config))

export type PortalSection = 'profile' | 'attendance' | 'timetable' | 'results' | 'fees' | 'notices' | 'transport'

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
  routes?: Array<{ name: string; stops: Array<{ name: string; landmark?: string; pickupTime?: string; dropTime?: string }> }>
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
  notices: async (): Promise<PortalNotice[]> => (await get('/portal/notices')).data.data,
  notice: async (id: string): Promise<PortalNotice> => (await get(`/portal/notices/${encodeURIComponent(id)}`)).data.data,
  receiptPdf: async (studentId: string, paymentId: string): Promise<Blob> =>
    (await get(`${student(studentId)}/fees/receipts/${encodeURIComponent(paymentId)}`, { responseType: 'blob' })).data,
}

export default portalService
