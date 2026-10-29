import { api } from '@/lib/api'

// Logins and roles (/api/users, /api/roles), the website's Settings → Users and access.

export type LoginKind = 'staff' | 'parent' | 'student'

export interface Login {
  _id: string
  kind: LoginKind
  name: string
  email: string | null
  username: string | null
  /** What the person types to sign in: their email, or "loginid@school". */
  loginId: string
  roles: { key: string; name: string }[]
  teacher: { _id: string; name: string; designation: string } | null
  linkedStudents: { studentId: string; rollNumber: string; relation: string; name: string; className: string; section: string }[]
  isActive: boolean
  mustChangePassword: boolean
  invitePending: boolean
  lockedUntil: string | null
  lastLogin: string | null
}

export interface Role {
  key: string
  name: string
  description?: string
  isSystem: boolean
  locked?: boolean
  userCount: number
}

/** "invite" emails a link to set a password; "temporary" makes one to give the person (shown once). */
export type CredentialMethod = 'invite' | 'temporary'
export type Delivery = { temporaryPassword?: string; inviteUrl?: string; emailSent?: boolean }

export interface NewLogin {
  kind: LoginKind
  name: string
  email?: string
  username?: string
  roles?: string[]
  teacherId?: string
  students?: { studentId: string; relation: string }[]
  credential: { method: CredentialMethod }
}

export interface StaffCandidate {
  _id: string
  name: string
  designation: string
  email: string
  hasLogin: boolean
  suggestedRole?: string
}

export interface StudentCandidate {
  _id: string
  name: string
  rollNumber: string
  className: string
  section: string
  guardianEmail?: string
  guardianName?: string
  fatherName?: string
  hasParentLogin?: boolean
  hasStudentLogin?: boolean
}

const one = (id: string) => `/users/${encodeURIComponent(id)}`

export const usersService = {
  list: (params: { kind?: LoginKind; search?: string }) =>
    api.get<{ users: Login[]; pagination: { total: number } }>('/users', { limit: 100, ...params }),
  get: (id: string) => api.get<Login>(one(id)),
  create: (input: NewLogin) => api.post<{ user: Login } & Delivery>('/users', input),
  /** Only the fields given change (roles, active). */
  update: (id: string, changes: { roles?: string[]; isActive?: boolean; name?: string }) => api.patch<Login>(one(id), changes),
  /** Signs the person out everywhere and emails a reset link, or makes a temporary password. */
  resetPassword: (id: string, method: CredentialMethod) => api.post<Delivery>(`${one(id)}/reset-password`, { method }),
  signOutEverywhere: (id: string) => api.post<unknown>(`${one(id)}/sign-out`, {}),
  /** Administrators: see the app as this person, read-only, for 30 minutes. */
  startViewAs: (id: string) => api.post<unknown>(`${one(id)}/view-as`, {}),
  /** The school owner, testing only: act as this person for 30 minutes. */
  switchTo: (id: string) => api.post<unknown>(`${one(id)}/switch`, {}),
  roles: () => api.get<Role[]>('/roles'),
  staffCandidates: (search: string) => api.get<StaffCandidate[]>('/users/candidates/staff', { search: search || undefined }),
  studentCandidates: (search: string) => api.get<StudentCandidate[]>('/users/candidates/students', { search: search || undefined }),
}
