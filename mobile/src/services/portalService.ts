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
