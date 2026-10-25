import { api } from '@/lib/api'

// Students for staff (/api/students). The server limits "own classes only" logins to their sections.

export interface StudentRow {
  _id: string
  name: string
  rollNumber: string
  classRollNo?: number | null
  class: string
  section: string
  gender?: string
  fatherName?: string
  motherName?: string
  profileImage?: string | null
}

export interface StudentRecord extends StudentRow {
  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
  phone?: string
  dateOfBirth?: string | null
  admissionDate?: string | null
  busNo?: string
  fullAddress?: string
  isActive: boolean
}

export interface StudentStats {
  byClassSection: { _id: { class: string; section: string }; active: number }[]
}

export const studentService = {
  /** Active students, lightest fields; `search` matches name, admission no. or father's name. */
  list: (params: { search?: string; class?: string; section?: string; limit?: number }) =>
    api.get<{ students: StudentRow[] }>('/students', { lite: 'true', isActive: 'true', limit: params.limit ?? 500, sort: 'classRollNo', ...params }),
  get: (id: string) => api.get<StudentRecord>(`/students/${encodeURIComponent(id)}`),
  /** Whole-school counts per class-section (for logins that see every class). */
  stats: () => api.get<StudentStats>('/students/stats'),
}
