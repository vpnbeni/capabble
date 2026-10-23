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
  mustChangePassword: boolean
  tenant?: { slug: string; name: string } | null
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
}
