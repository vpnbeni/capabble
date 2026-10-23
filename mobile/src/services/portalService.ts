import { api } from '@/lib/api'

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
  sections: PortalSection[]
  students: PortalChild[]
}

export const portalService = {
  home: () => api.get<PortalHome>('/portal/home'),
}
