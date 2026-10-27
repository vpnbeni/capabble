import { api, requestBytes } from '@/lib/api'

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

export interface StudentAddress {
  street: string
  city: string
  state: string
  pincode: string
}

export interface StudentRecord extends StudentRow {
  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
  phone?: string
  email?: string
  dateOfBirth?: string | null
  admissionDate?: string | null
  busNo?: string
  fullAddress?: string
  address?: StudentAddress
  category?: string
  religion?: string
  nationality?: string
  notes?: string
  isActive: boolean
  idCardIssuedAt?: string | null
  documents?: { _id: string; name?: string; type?: string; url: string; uploadedAt?: string }[]
}

/** The fields the phone edits. `gender`, `nationality` and `isActive` always go with an edit: the
 * server fills them with defaults ("Unspecified", "Indian", active) when they are left out. */
export interface StudentInput {
  rollNumber?: string
  name?: string
  class?: string
  section?: string
  gender?: string
  dateOfBirth?: string
  admissionDate?: string
  fatherName?: string
  motherName?: string
  guardianName?: string
  guardianPhone?: string
  guardianEmail?: string
  phone?: string
  email?: string
  /** Sent whole: every part is required when the address changes. */
  address?: StudentAddress
  busNo?: string
  category?: string
  religion?: string
  nationality?: string
  notes?: string
  isActive?: boolean
}

export interface Alumnus {
  _id: string
  name: string
  rollNumber?: string
  section?: string
  batchSession?: string
  phone?: string
  email?: string
  fatherName?: string
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
  /** Only the fields given change (with gender, nationality and active, see StudentInput). */
  update: (id: string, input: StudentInput) => api.put<StudentRecord>(`/students/${encodeURIComponent(id)}`, input),
  create: (input: StudentInput) => api.post<StudentRecord>('/students', input),
  /** The next admission number the school would use (from its numbering). */
  nextAdmissionNo: (className: string, section: string) => api.get<{ rollNumber?: string; nextRollNumber?: string }>('/students/next-roll-number', { class: className, section }),
  alumni: (search: string) => api.get<{ records: Alumnus[]; total: number }>('/almni', { search: search || undefined }),
  /** The student's ID card as a PDF (the school's design; issues a card the first time). */
  idCard: (id: string) => requestBytes('/id-cards/generate', { method: 'POST', body: { studentIds: [id] } }),
}
