export interface BillingSnapshot {
  /** setup_required: no plan yet; the school opts in to a trial (or pays) on Get started. */
  accessMode: 'full' | 'core_only' | 'read_only' | 'setup_required'
  state: string
  planCode: string | null
  trialEndsAt: string | null
  graceEndsAt: string | null
  periodEndsAt?: string | null
  cancelAtPeriodEnd?: boolean
  /** Module codes the school pays for, or ['*'] during a trial or complimentary period. */
  entitledModules?: string[]
  /** Module codes the school chose. During a trial everything is open; these stay on after it. */
  plannedModules?: string[]
  /** The first charge after a trial is collected by an authorised autopay mandate. */
  autopay?: boolean
  isReadOnly: boolean
}

/** Staff use the school panel; parents and students use the family portal. */
export type UserKind = 'staff' | 'parent' | 'student'

export type PermissionScope = 'all' | 'assigned'

export interface PermissionGrant {
  key: string
  scope: PermissionScope
}

export interface LinkedStudent {
  studentId: string
  rollNumber: string
  relation: string
  name: string
  className: string
  section: string
  profileImage?: string | null
}

// Signed-in user (from /auth/me). Contains no tokens: the session is in httpOnly cookies.
export interface User {
  _id: string
  email: string | null
  username?: string | null
  name?: string
  displayName?: string
  kind: UserKind
  /** Legacy single role kept by the server for older screens. */
  role: string
  roles: Array<{ key: string; name: string }>
  isAdmin: boolean
  permissions: PermissionGrant[]
  linkedStudents: LinkedStudent[]
  mustChangePassword: boolean
  isActive: boolean
  createdAt: string
  updatedAt?: string
  lastLogin?: string | null
  billing?: BillingSnapshot | null
  featureToggles?: Record<string, boolean> | null
  /** brandColor: the school's colour (#rrggbb), empty for Capabble blue. */
  tenant?: { slug: string; name: string; brandColor?: string } | null
  /** Set while an administrator is viewing as this person (read-only). */
  viewAs?: ViewAsInfo | null
}

export interface ViewAsInfo {
  /** The administrator doing the viewing. */
  by: { _id: string; name: string; email: string | null }
  expiresAt: string
}

// Login credentials interface
export interface LoginCredentials {
  /** Email, or a student's login ID (optionally `id@schoolcode`). */
  email: string
  password: string
  rememberMe?: boolean
}

// Auth response interface
export interface AuthResponse {
  success: boolean
  message: string
  data: {
    user: User
    billing?: BillingSnapshot | null
  }
}

// Profile update data interface
export interface ProfileUpdateData {
  name?: string
}

// Password change data interface
export interface PasswordChangeData {
  currentPassword: string
  newPassword: string
  confirmNewPassword: string
}

export interface ForgotPasswordData {
  email: string
}

export interface ResetPasswordData {
  email: string
  otp: string
  newPassword: string
  confirmNewPassword: string
}

// API response interface
export interface ApiResponse<T = any> {
  success: boolean
  message: string
  data?: T
  error?: string
  meta?: {
    pagination?: {
      currentPage: number
      totalPages: number
      totalCount: number
      limit: number
      hasNextPage: boolean
      hasPrevPage: boolean
    }
  }
}

// Error response interface
export interface ErrorResponse {
  success: false
  error: string
  details?: Array<{
    field: string
    message: string
    value?: any
  }>
}
