import type { AxiosRequestConfig } from 'axios'
import baseApi from './api'
import type { PermissionGrant, UserKind } from '@/types/auth'

// These pages show their own toasts, so opt out of the global interceptor toasts.
type Config = AxiosRequestConfig
const silent = (config?: Config): Config => ({ ...(config || {}), _silent: true } as Config)
const api = {
  get: (url: string, config?: Config) => baseApi.get(url, silent(config)),
  delete: (url: string, config?: Config) => baseApi.delete(url, silent(config)),
  post: (url: string, data?: unknown, config?: Config) => baseApi.post(url, data, silent(config)),
  put: (url: string, data?: unknown, config?: Config) => baseApi.put(url, data, silent(config)),
  patch: (url: string, data?: unknown, config?: Config) => baseApi.patch(url, data, silent(config)),
}

export type CredentialMethod = 'invite' | 'temporary'

export interface ClassSection {
  className: string
  section: string
}

export interface ManagedUser {
  _id: string
  kind: UserKind
  name: string
  email: string | null
  username: string | null
  loginId: string
  roles: Array<{ key: string; name: string }>
  teacher: { _id: string; name: string; designation: string } | null
  assignedSections: ClassSection[]
  linkedStudents: Array<{
    studentId: string
    rollNumber: string
    relation: string
    name: string
    className: string
    section: string
  }>
  isActive: boolean
  mustChangePassword: boolean
  invitePending: boolean
  inviteExpiresAt: string | null
  lockedUntil: string | null
  lastLogin: string | null
  createdAt: string
}

export interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

export interface UserListParams {
  kind?: UserKind
  status?: '' | 'active' | 'inactive' | 'invited'
  search?: string
  page?: number
  limit?: number
}

export interface CreateUserPayload {
  kind: UserKind
  name?: string
  email?: string | null
  username?: string | null
  roles?: string[]
  teacherId?: string | null
  assignedSections?: ClassSection[]
  students?: Array<{ studentId: string; relation?: string }>
  credential: { method: CredentialMethod; password?: string }
}

export type UpdateUserPayload = Partial<Omit<CreateUserPayload, 'kind' | 'credential'>> & { isActive?: boolean }

/** What the admin sees once after creating a login or resetting a password. */
export interface CredentialDelivery {
  temporaryPassword?: string
  inviteUrl?: string
  emailSent?: boolean
}

export interface StaffCandidate {
  _id: string
  name: string
  designation: string
  email: string
  employeeId: string
  hasLogin: boolean
  suggestedRole: string | null
}

export interface StudentCandidate {
  _id: string
  name: string
  rollNumber: string
  className: string
  section: string
  guardianEmail: string
  guardianName: string
  hasStudentLogin: boolean
  hasParentLogin: boolean
}

/** Students in a class or section, and how many still need a login of the chosen kind. */
export interface BulkClassCounts {
  total: number
  withoutLogin: number
  /** Parents only: of those without a login, how many have no guardian email (they get skipped). */
  missingGuardianEmail: number
}

export interface BulkClassOption extends BulkClassCounts {
  className: string
  sections: Array<BulkClassCounts & { section: string }>
}

/** A class and its sections, as set up in the timetable or enrolled by students. */
export interface SectionOption {
  className: string
  sections: string[]
}

export interface BulkPortalResult {
  created: Array<{
    userId: string
    name: string
    loginId: string
    studentName: string
    className: string
    section: string
  } & CredentialDelivery>
  linked: Array<{ userId: string; name: string; loginId: string; studentName: string }>
  skipped: Array<{ studentName: string; className: string; section: string; reason: string }>
}

export interface Role {
  key: string
  _id?: string
  name: string
  description: string
  basedOn?: string
  isSystem: boolean
  locked: boolean
  permissions: PermissionGrant[]
  userCount: number
  updatedAt?: string
}

export interface PermissionResource {
  key: string
  module: string
  label: string
  actions: string[]
  scopable: boolean
}

export interface PermissionCatalog {
  modules: Array<{ key: string; label: string }>
  resources: PermissionResource[]
  actionLabels: Record<string, string>
}

export interface AuditEvent {
  _id: string
  event: string
  actor: { userId: string | null; label: string }
  target: { userId: string | null; label: string }
  details: Record<string, unknown>
  ip: string
  userAgent: string
  createdAt: string
}

const userAdminService = {
  async listUsers(params: UserListParams): Promise<{ users: ManagedUser[]; pagination: Pagination }> {
    const response = await api.get('/users', { params })
    return response.data.data
  },
  async getUser(id: string): Promise<ManagedUser> {
    const response = await api.get(`/users/${id}`)
    return response.data.data
  },
  async createUser(payload: CreateUserPayload): Promise<{ user: ManagedUser } & CredentialDelivery> {
    const response = await api.post('/users', payload)
    return response.data.data
  },
  async updateUser(id: string, payload: UpdateUserPayload): Promise<ManagedUser> {
    const response = await api.patch(`/users/${id}`, payload)
    return response.data.data
  },
  async resetPassword(id: string, credential: { method: CredentialMethod; password?: string }): Promise<CredentialDelivery> {
    const response = await api.post(`/users/${id}/reset-password`, credential)
    return response.data.data
  },
  async signOutEverywhere(id: string): Promise<void> {
    await api.post(`/users/${id}/sign-out`)
  },
  async bulkPortal(payload: {
    kind: 'parent' | 'student'
    className?: string
    section?: string
    studentIds?: string[]
    method: CredentialMethod
  }): Promise<BulkPortalResult> {
    const response = await api.post('/users/bulk-portal', payload)
    return response.data.data
  },
  async staffCandidates(search: string): Promise<StaffCandidate[]> {
    const response = await api.get('/users/candidates/staff', { params: { search } })
    return response.data.data
  },
  async studentCandidates(params: { search?: string; className?: string; section?: string }): Promise<StudentCandidate[]> {
    const response = await api.get('/users/candidates/students', { params })
    return response.data.data
  },
  async classOptions(kind: 'parent' | 'student'): Promise<BulkClassOption[]> {
    const response = await api.get('/users/candidates/classes', { params: { kind } })
    return response.data.data.classOptions
  },
  async sectionOptions(): Promise<SectionOption[]> {
    const response = await api.get('/users/candidates/sections')
    return response.data.data.classOptions
  },
  async auditLog(params: { userId?: string; page?: number }): Promise<{ events: AuditEvent[]; pagination: Pagination }> {
    const response = await api.get('/users/audit', { params })
    return response.data.data
  },
  async listRoles(): Promise<Role[]> {
    const response = await api.get('/roles')
    return response.data.data
  },
  async getCatalog(): Promise<PermissionCatalog> {
    const response = await api.get('/roles/catalog')
    return response.data.data
  },
  async createRole(payload: { name: string; description: string; basedOn?: string; permissions: PermissionGrant[] }): Promise<Role> {
    const response = await api.post('/roles', payload)
    return response.data.data
  },
  async updateRole(id: string, payload: { name: string; description: string; permissions: PermissionGrant[] }): Promise<Role> {
    const response = await api.put(`/roles/${id}`, payload)
    return response.data.data
  },
  async deleteRole(id: string): Promise<void> {
    await api.delete(`/roles/${id}`)
  },
}

export default userAdminService
