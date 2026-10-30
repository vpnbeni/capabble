import { api } from '@/lib/api'

// School setup (/api/mail-settings, /api/cpitl/payment-settings, /api/roles), the website's Settings →
// School email, Payments and Roles. Passwords and secrets are write-only: the server says whether
// one is saved and never sends it back; leaving the field empty keeps it.

export interface MailSettings {
  enabled: boolean
  host: string
  port: number
  secure: boolean
  user: string
  hasPassword: boolean
  fromName: string
  fromEmail: string
  replyTo: string
  dailyLimit: number
  lastTestAt: string | null
  lastTestOk: boolean | null
  lastError: string
  fallback: { fromEmail: string; dailyLimit: number } | null
  usage: { sentToday: number; queued: number; failedWeek: number }
}

export type MailInput = Pick<MailSettings, 'enabled' | 'host' | 'port' | 'secure' | 'user' | 'fromName' | 'fromEmail' | 'replyTo' | 'dailyLimit'> & { password: string }

export interface PaymentSettings {
  enabled: boolean
  keyId: string
  mode: 'test' | 'live' | null
  hasKeySecret: boolean
  hasWebhookSecret: boolean
  connected: boolean
  webhookUrl: string
  lastTestAt: string | null
  lastTestOk: boolean | null
  lastError: string
  lastWebhookAt: string | null
  needsReview: number
}

export interface PaymentInput {
  enabled: boolean
  keyId: string
  keySecret: string
  webhookSecret: string
}

export type Scope = 'all' | 'assigned'
export interface Grant {
  key: string
  scope: Scope
}

export interface RoleRecord {
  key: string
  _id?: string
  name: string
  description?: string
  basedOn?: string
  isSystem: boolean
  locked?: boolean
  permissions: (Grant | string)[]
  userCount: number
}

export interface RoleInput {
  name: string
  description: string
  basedOn: string
  permissions: Grant[]
}

export interface PermissionCatalog {
  modules: { key: string; label: string }[]
  resources: { key: string; module: string; label: string; actions: string[]; scopable: boolean }[]
  actionLabels: Record<string, string>
}

/** A role's grants as { key, scope } (built-in roles may list plain keys or the "*" wildcard). */
export const grantsOf = (role: Pick<RoleRecord, 'permissions'>): Grant[] =>
  role.permissions.map((grant) => (typeof grant === 'string' ? { key: grant, scope: 'all' as Scope } : { key: grant.key, scope: grant.scope === 'assigned' ? 'assigned' : 'all' }))

export const schoolSetupService = {
  mail: () => api.get<MailSettings>('/mail-settings'),
  /** The server sets every field, so send them all; an empty password keeps the saved one. */
  saveMail: (input: MailInput) => api.put<MailSettings>('/mail-settings', input),
  testMail: () => api.post<{ sentTo: string }>('/mail-settings/test', {}),

  payments: () => api.get<PaymentSettings>('/cpitl/payment-settings'),
  savePayments: (input: PaymentInput) => api.put<PaymentSettings>('/cpitl/payment-settings', input),
  testPayments: () => api.post<PaymentSettings>('/cpitl/payment-settings/test', {}),

  roles: () => api.get<RoleRecord[]>('/roles'),
  catalog: () => api.get<PermissionCatalog>('/roles/catalog'),
  /** The server replaces the role whole, and signs out everyone who holds it. */
  saveRole: ({ id, input }: { id?: string; input: RoleInput }) => (id ? api.put<RoleRecord>(`/roles/${id}`, input) : api.post<RoleRecord>('/roles', input)),
  removeRole: (id: string) => api.delete<unknown>(`/roles/${id}`),
}
