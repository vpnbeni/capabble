import type { AxiosRequestConfig } from 'axios'
import api from './api'
import type { BillingSnapshot } from '@/types/auth'

// Capabble's own billing for the school. Money is integer paise.

export type BillingInterval = 'month' | 'year'

export interface BillingAccount {
  id: string
  tenantSlug: string
  tenantName: string
  billingEmail: string
  legalName: string
  gstin: string | null
  addressLine1: string
  addressLine2: string
  city: string
  postalCode: string
  stateCode: string | null
}

export interface SubscriptionItem {
  id: string
  moduleCode: string
  name: string
  startedAt: string
  endsAtPeriodEnd: boolean
}

export interface BillingSubscription {
  id: string
  state: string
  interval: BillingInterval
  bundleCode: string | null
  couponCode: string | null
  declaredStudents: number
  billedStudents: number
  trialEndsAt: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  graceEndsAt: string | null
  grandfatherEndsAt: string | null
  cancelAtPeriodEnd: boolean
  nextDeadline: string | null
  items: SubscriptionItem[]
  collectionMode?: string
  /** Opt-in trial: when the school agreed and the words it agreed to. */
  trialConsentAt?: string | null
  trialConsentText?: string | null
  trialStartedAt?: string | null
  autopayAmountPaise?: number | null
  autopayMethod?: string | null
}

export interface Totals {
  subtotalPaise: number
  discountPaise: number
  taxablePaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  totalPaise: number
}

export interface BillingInvoice extends Totals {
  id: string
  number: string
  reason: string
  status: 'open' | 'paid' | 'void' | 'draft' | 'uncollectible'
  issuedAt: string
  dueAt: string
  paidAt: string | null
  periodStart: string | null
  periodEnd: string | null
  amountPaidPaise: number
  amountCreditedPaise: number
  outstandingPaise: number
  paymentLinkUrl: string | null
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
  reference: string
}

export interface SettledPayment {
  payment: BillingPayment
  invoice: { id: string; number: string; status: string; totalPaise: number; outstandingPaise: number }
}

export interface ReconcileResult {
  recorded: BillingPayment[]
  settled: SettledPayment | null
}

export interface CreditNote {
  id: string
  number: string
  invoiceId: string
  reason: string
  issuedAt: string
  totalPaise: number
  refundPaise: number
  refundStatus: string
}

export interface ModulePrice {
  basePaise: number
  includedStudents: number
  perStudentPaise: number
}

export interface CatalogModule {
  code: string
  name: string
  description: string
  prices: { month: ModulePrice | null; year: ModulePrice | null }
}

export interface Bundle {
  code: string
  name: string
  discountBps: number
  moduleCodes: string[]
}

export interface Catalog {
  modules: CatalogModule[]
  bundles: Bundle[]
}

export interface Selection {
  modules: string[]
  interval: BillingInterval
  bundleCode?: string | null
  declaredStudents?: number
  couponCode?: string | null
}

export interface Quote {
  effective: 'new_period' | 'mid_period'
  interval: BillingInterval
  students: number
  modules: Array<{ code: string; name: string }>
  dueNow: (Totals & { reason: string; periodStart: string; periodEnd: string; dueAt: string }) | null
  perPeriod: Totals | null
}

/** What a trial with a selection costs when it ends, and the dates the school sees before agreeing. */
export interface TrialPreview {
  trialDays: number
  autopay: boolean
  firstChargePaise: number
  startsAt: string
  reminderOn: string
  noticeOn: string
  trialEndsAt: string
  consentText: string
  quote: Quote
}

export interface TrialStartResult extends TrialPreview {
  state: string
  /** Set when autopay must be authorised before the trial starts (or again after a plan change). */
  authorizeUrl?: string
}

export interface BillingMeResponse {
  account?: BillingAccount
  subscription?: BillingSubscription | null
  entitlement?: BillingSnapshot
  openInvoices?: BillingInvoice[]
  upcomingRenewal?: (Totals & { periodStart: string; periodEnd: string; dueAt: string }) | null
  liveStudents?: number | null
  /** An opt-in trial: what is charged (or invoiced) when it ends. */
  trial?: { firstChargePaise: number | null; trialEndsAt: string; consentText: string | null } | null
}

export type BillingProfile = Pick<BillingAccount, 'billingEmail' | 'legalName' | 'gstin' | 'addressLine1' | 'addressLine2' | 'city' | 'postalCode' | 'stateCode'>

// Billing reads show their own empty or error state; don't toast for them.
const quiet = { _silent: true } as AxiosRequestConfig

const billingService = {
  async getMe(): Promise<BillingMeResponse> {
    const response = await api.get('/billing/me', quiet)
    return response.data.data
  },
  async getInvoices(): Promise<BillingInvoice[]> {
    const response = await api.get('/billing/me/invoices', quiet)
    return response.data.data || []
  },
  async getPayments(): Promise<BillingPayment[]> {
    const response = await api.get('/billing/me/payments', quiet)
    return response.data.data || []
  },
  async getCreditNotes(): Promise<CreditNote[]> {
    const response = await api.get('/billing/me/credit-notes', quiet)
    return response.data.data || []
  },
  async getCatalog(): Promise<Catalog> {
    const response = await api.get('/billing/me/catalog', quiet)
    return response.data.data
  },
  async preview(selection: Selection): Promise<Quote> {
    const response = await api.post('/billing/me/subscription/preview', selection, quiet)
    return response.data.data
  },
  /** During an opt-in trial this only changes the plan (and may need autopay authorised again). */
  async subscribe(selection: Selection): Promise<{ invoice?: BillingInvoice | null; authorizeUrl?: string }> {
    const response = await api.post('/billing/me/subscription', selection)
    return response.data.data
  },
  async trialPreview(selection: Selection): Promise<TrialPreview> {
    const response = await api.post('/billing/me/trial/preview', selection, quiet)
    return response.data.data
  },
  async startTrial(selection: Selection): Promise<TrialStartResult> {
    const response = await api.post('/billing/me/trial/start', { ...selection, consent: true })
    return response.data.data
  },
  /** Back from authorising autopay: ask whether it went through. */
  async reconcileTrial(): Promise<{ state: string | null; autopay: boolean; trialEndsAt: string | null }> {
    const response = await api.post('/billing/me/trial/reconcile', {}, quiet)
    return response.data.data
  },
  async cancel(): Promise<void> {
    await api.post('/billing/me/cancel', { immediately: false })
  },
  /** Withdraw a cancellation. A trial's autopay was cancelled with it, so it may need authorising again. */
  async resume(): Promise<{ authorizeUrl?: string } | undefined> {
    const response = await api.post('/billing/me/resume', {})
    return response.data?.data
  },
  async payNow(invoiceId?: string): Promise<{ paymentLink: { id: string; url: string } }> {
    const response = await api.post('/billing/me/pay-now', invoiceId ? { invoiceId } : {})
    return response.data.data
  },
  /** After Razorpay: records the payment if the webhook hasn't yet, and returns the one for this link. */
  async reconcile(paymentLinkId?: string | null): Promise<ReconcileResult> {
    const response = await api.post('/billing/me/pay-now/reconcile', paymentLinkId ? { paymentLinkId } : {}, quiet)
    return response.data.data
  },
  async updateProfile(payload: Partial<BillingProfile>): Promise<BillingAccount> {
    const response = await api.post('/billing/me/profile', payload)
    return response.data.data
  },
  /** PDFs go through the API (it needs the school header), then open in a new tab or download. */
  async openPdf(kind: 'invoices' | 'receipts' | 'credit-notes', id: string, filename: string) {
    const win = window.open('', '_blank')
    const response = await api.get(`/billing/me/${kind}/${id}/pdf`, { responseType: 'blob' })
    const url = URL.createObjectURL(response.data as Blob)
    if (win) {
      win.location.href = url
    } else {
      const link = document.createElement('a')
      link.href = url
      link.download = `${filename}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
}

export { GST_STATES, stateName } from '@capabble/shared/gstStates'

export default billingService
