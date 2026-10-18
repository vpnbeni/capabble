import axios from 'axios'
import { resolvePlatformAdminApiBaseUrl } from '@/utils/tenantRuntime'
import type { User } from '@/types/auth'
import type { BillingSnapshot } from '@/types/auth'

// The exchange step signs the new admin in with httpOnly cookies, so send credentials.
const tenantSignupApi = axios.create({
  baseURL: resolvePlatformAdminApiBaseUrl(),
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
})

export interface TenantSignupStartPayload {
  udiseCode: string
  name: string
  slug: string
  adminEmail: string
  adminPassword: string
  confirmPassword: string
}

export interface TenantSignupStartResponse {
  ticket: string
  tenantSlug: string
  expiresAt: string
  otpExpiresAt: string
  otpDeliveryStatus: 'sent' | 'failed' | 'queued'
}

export interface TenantSignupExchangePayload {
  ticket: string
  tenantSlug: string
  otp: string
}

export interface TenantSignupResendOtpPayload {
  ticket: string
  tenantSlug: string
}

export interface TenantSignupResendOtpResponse {
  otpExpiresAt: string
}

export interface TenantSignupExchangeResponse {
  user: User
  billing?: BillingSnapshot | null
  tenant: {
    slug: string
    name: string
    status: 'active' | 'suspended'
  }
}

const tenantSignupService = {
  async startSignup(payload: TenantSignupStartPayload): Promise<TenantSignupStartResponse> {
    const response = await tenantSignupApi.post('/public/tenant-signup/start', payload)
    return response.data.data
  },

  async exchangeTicket(payload: TenantSignupExchangePayload): Promise<TenantSignupExchangeResponse> {
    const response = await tenantSignupApi.post('/public/tenant-signup/exchange', payload)
    return response.data.data
  },

  async resendOtp(payload: TenantSignupResendOtpPayload): Promise<TenantSignupResendOtpResponse> {
    const response = await tenantSignupApi.post('/public/tenant-signup/resend-otp', payload)
    return response.data.data
  },
}

export default tenantSignupService
