import { api } from '@/lib/api'

// Clinic visits (/api/mdcl/cases), the website's Clinic → Cases. Same fields as the web form.

export interface ClinicVisit {
  _id: string
  /** 'YYYY-MM-DD' */
  date: string
  studentName: string
  className?: string
  section?: string
  complaint: string
  firstAid?: string
  treatment?: string
  prescription?: string
  suppliesUsed?: string
  attendedBy?: string
  notes?: string
  createdAt?: string
  updatedAt?: string
}

export type ClinicVisitInput = Omit<ClinicVisit, '_id' | 'createdAt' | 'updatedAt'>

export const clinicService = {
  list: () => api.get<ClinicVisit[]>('/mdcl/cases'),
  create: (visit: ClinicVisitInput) => api.post<ClinicVisit>('/mdcl/cases', visit),
  update: (id: string, visit: ClinicVisitInput) => api.put<ClinicVisit>(`/mdcl/cases/${encodeURIComponent(id)}`, visit),
}
