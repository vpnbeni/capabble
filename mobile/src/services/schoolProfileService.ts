import { api } from '@/lib/api'

/** The school's own details (GET/PUT /school-profile), as on receipts, report cards and emails. */
export interface SchoolProfile {
  name: string
  schoolCode: string
  affiliationNo: string
  udiseCode: string
  tagline: string
  address: string
  contact: string
  email: string
  logoUrl: string
  /** #RRGGBB, or empty for Capabble's colour. */
  brandColor: string
}

export type SchoolProfileInput = Partial<{ schoolName: string; tagline: string; address: string; contact: string; email: string; affiliationNo: string; udiseCode: string; brandColor: string }>

export const schoolProfileService = {
  get: () => api.get<SchoolProfile>('/school-profile'),
  /** Only the fields given change. */
  update: (input: SchoolProfileInput) => api.put<SchoolProfile>('/school-profile', input),
}
