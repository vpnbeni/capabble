import api, { refreshSession } from './api'
import axios from 'axios'
import { resolvePlatformAdminApiBaseUrl } from '../utils/tenantRuntime'
import { clearAuthData } from '../utils/authStorage'
import type {
  LoginCredentials,
  User,
  AuthResponse,
  ProfileUpdateData,
  PasswordChangeData,
  ResetPasswordData,
  ApiResponse,
} from '../types/auth'

interface TenantResolutionResponse {
  slug: string
  name: string
}

export interface InvitePreview {
  name: string
  email: string | null
  username: string | null
  kind: User['kind']
  schoolName: string
}

const platformPublicAuthApi = axios.create({
  baseURL: resolvePlatformAdminApiBaseUrl(),
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
})

/** `2024017@dps` → `dps`: a student login ID carries the school code after the @. */
export const schoolCodeFromLoginId = (identifier: string): string | null => {
  const match = String(identifier || '').trim().toLowerCase().match(/^[^@\s]+@([a-z0-9][a-z0-9-]*)$/)
  return match ? match[1] : null
}

class AuthService {
  async resolveTenantByEmail(email: string): Promise<TenantResolutionResponse> {
    const response = await platformPublicAuthApi.post('/public/auth/resolve-tenant', { email })
    return response.data.data
  }

  // Sign in. The API sets httpOnly session cookies; the body only carries the profile.
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post('/auth/login', credentials, { _silent: true } as any)
    return response.data
  }

  // Sign out this device (always clears local state, even if the call fails).
  async logout(): Promise<ApiResponse> {
    try {
      const response = await api.post('/auth/logout', {}, { _silent: true } as any)
      return response.data
    } finally {
      clearAuthData()
    }
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    const response = await api.get('/auth/me')
    return response.data
  }

  async updateProfile(userData: ProfileUpdateData): Promise<ApiResponse<User>> {
    const response = await api.put('/auth/me', userData)
    return response.data
  }

  // Change password. Other devices are signed out; this one stays signed in.
  async changePassword(passwordData: PasswordChangeData): Promise<AuthResponse> {
    const response = await api.put('/auth/change-password', passwordData, { _silent: true } as any)
    return response.data
  }

  async refreshSession(): Promise<boolean> {
    return refreshSession()
  }

  async previewInvite(token: string): Promise<InvitePreview> {
    const response = await api.post('/auth/invite/preview', { token }, { _silent: true } as any)
    return response.data.data
  }

  async acceptInvite(payload: { token: string; password: string; confirmPassword: string }): Promise<AuthResponse> {
    const response = await api.post('/auth/accept-invite', payload, { _silent: true } as any)
    return response.data
  }

  async forgotPassword(email: string): Promise<ApiResponse> {
    const response = await api.post('/auth/forgot-password', { email })
    return response.data
  }

  async resendForgotPasswordOtp(email: string): Promise<ApiResponse> {
    const response = await api.post('/auth/forgot-password/resend-otp', { email })
    return response.data
  }

  async resetPassword(payload: ResetPasswordData): Promise<ApiResponse> {
    const response = await api.post('/auth/reset-password', payload)
    return response.data
  }

  // Verify email with OTP (for unverified accounts blocked at login); signs in on success.
  async verifyEmail(email: string, otp: string): Promise<AuthResponse> {
    const response = await api.post('/auth/verify-email', { email, otp })
    return response.data
  }

  async resendEmailVerificationOtp(email: string): Promise<ApiResponse> {
    const response = await api.post('/auth/resend-email-verification', { email })
    return response.data
  }
}

const authService = new AuthService()
export default authService
