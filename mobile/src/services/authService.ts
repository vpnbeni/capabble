import { api, request } from '@/lib/api'
import { API_BASE_URL } from '@/lib/config'

// Mirrors client/src/types/auth.ts (the fields the app reads).
export type UserKind = 'staff' | 'parent' | 'student'

export interface LinkedStudent {
  studentId: string
  rollNumber: string
  relation: string
  name: string
  className: string
  section: string
  profileImage?: string | null
}

export interface User {
  _id: string
  email: string | null
  username?: string | null
  name?: string
  displayName?: string
  kind: UserKind
  roles: { key: string; name: string }[]
  isAdmin: boolean
  permissions: { key: string; scope: 'all' | 'assigned' }[]
  linkedStudents: LinkedStudent[]
  /** Staff: the staff record linked to this login (their timetable and classes come from it). */
  teacher?: string | null
  /** The modules the school has on; a missing key means on (see lib/permissions.ts). */
  featureToggles?: Record<string, boolean> | null
  mustChangePassword: boolean
  /** brandColor: the school's colour (#rrggbb), empty for Capabble blue. */
  tenant?: { slug: string; name: string; brandColor?: string } | null
}

export interface School {
  slug: string
  name: string
}

/** `2024017@dps` → `dps`: a student login ID carries the school code after the @. */
export const schoolCodeFromLoginId = (identifier: string): string | null => {
  const match = identifier.trim().toLowerCase().match(/^[^@\s]+@([a-z0-9][a-z0-9-]*)$/)
  return match ? match[1] : null
}

export const isEmail = (identifier: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifier.trim())

export const authService = {
  /** Finds the school an email belongs to (platform lookup, no tenant needed). */
  resolveSchoolByEmail: (email: string) =>
    request<School>('/public/auth/resolve-tenant', {
      method: 'POST',
      body: { email: email.trim().toLowerCase() },
      baseUrl: `${API_BASE_URL}/admin`,
      skipRefresh: true,
    }),

  login: (identifier: string, password: string) =>
    api.post<{ user: User }>('/auth/login', { email: identifier.trim(), password, rememberMe: true }, { skipRefresh: true }),

  me: () => api.get<User>('/auth/me'),

  logout: () => api.post<unknown>('/auth/logout', {}, { skipRefresh: true }),

  /** Other devices are signed out; this one gets fresh session cookies. */
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put<{ user: User }>('/auth/change-password', { currentPassword, newPassword, confirmNewPassword: newPassword }),
}

/** Same rule as the server (server/src/validations/authValidation.js); null when the password is fine. */
export const passwordProblem = (password: string) => {
  if (password.length < 8) return 'Use at least 8 characters'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return 'Use both capital and small letters'
  if (!/[0-9]/.test(password)) return 'Add a number'
  if (!/[^A-Za-z0-9]/.test(password)) return 'Add a symbol, such as @ or #'
  return null
}
