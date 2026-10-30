import { api, requestBytes } from '@/lib/api'

// The school's Capabble plan (/api/billing/me), the website's Billing page: read only apart from the
// billing details printed on invoices. Money is in paise. Paying and changing the plan are not in the
// app, and nothing in it may point to where they are done (App Store 3.1.1(a) and 3.1.3, Play's
// Payments policy: see docs/requirements/mobile-staff-setup-next.md).

export interface BillingSubscription {
  state: string
  interval: 'month' | 'year'
  bundleCode: string | null
  couponCode: string | null
  billedStudents: number
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  graceEndsAt: string | null
  cancelAtPeriodEnd: boolean
  nextDeadline: string | null
  items: { id: string; moduleCode: string; name: string; endsAtPeriodEnd: boolean }[]
}

export interface BillingInvoice {
  id: string
  number: string
  reason: string
  status: 'open' | 'paid' | 'void' | 'draft' | 'uncollectible'
  issuedAt: string
  dueAt: string
  paidAt: string | null
  totalPaise: number
  outstandingPaise: number
}

export interface BillingPayment {
  id: string
  invoiceNumber: string | null
  method: string
  status: 'initiated' | 'captured' | 'failed' | 'refunded'
  amountPaise: number
  receiptNumber: string | null
  capturedAt: string | null
  createdAt: string
}

export interface CreditNote {
  id: string
  number: string
  reason: string
  issuedAt: string
  totalPaise: number
  refundPaise: number
}

export interface BillingProfile {
  billingEmail: string
  legalName: string
  gstin: string | null
  addressLine1: string
  addressLine2: string
  city: string
  postalCode: string
  stateCode: string | null
}

export type BillingAccount = BillingProfile & { tenantName: string }

export interface BillingMe {
  account?: BillingAccount
  subscription?: BillingSubscription | null
  openInvoices?: BillingInvoice[]
  upcomingRenewal?: { totalPaise: number; dueAt: string } | null
  trial?: { firstChargePaise: number | null; trialEndsAt: string } | null
}

export type BillingPdf = 'invoices' | 'receipts' | 'credit-notes'

export const billingService = {
  me: () => api.get<BillingMe>('/billing/me'),
  invoices: () => api.get<BillingInvoice[]>('/billing/me/invoices'),
  payments: () => api.get<BillingPayment[]>('/billing/me/payments'),
  creditNotes: () => api.get<CreditNote[]>('/billing/me/credit-notes'),
  saveProfile: (profile: BillingProfile) => api.post<BillingAccount>('/billing/me/profile', profile),
  pdf: (kind: BillingPdf, id: string) => requestBytes(`/billing/me/${kind}/${encodeURIComponent(id)}/pdf`),
}
