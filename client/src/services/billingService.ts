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

export interface BillingMeResponse {
  account?: BillingAccount
  subscription?: BillingSubscription | null
  entitlement?: BillingSnapshot
  openInvoices?: BillingInvoice[]
  upcomingRenewal?: (Totals & { periodStart: string; periodEnd: string; dueAt: string }) | null
  liveStudents?: number | null
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
  async subscribe(selection: Selection): Promise<{ invoice: BillingInvoice | null }> {
    const response = await api.post('/billing/me/subscription', selection)
    return response.data.data
  },
  async cancel(): Promise<void> {
    await api.post('/billing/me/cancel', { immediately: false })
  },
  async resume(): Promise<void> {
    await api.post('/billing/me/resume', {})
  },
  async payNow(invoiceId?: string): Promise<{ paymentLink: { id: string; url: string } }> {
    const response = await api.post('/billing/me/pay-now', invoiceId ? { invoiceId } : {})
    return response.data.data
  },
  async reconcile(): Promise<{ recorded: BillingPayment[] }> {
    const response = await api.post('/billing/me/pay-now/reconcile', {}, quiet)
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

/** Indian states and union territories by GST state code. */
export const GST_STATES: Array<{ value: string; label: string }> = [
  ['35', 'Andaman and Nicobar Islands'], ['37', 'Andhra Pradesh'], ['12', 'Arunachal Pradesh'], ['18', 'Assam'],
  ['10', 'Bihar'], ['04', 'Chandigarh'], ['22', 'Chhattisgarh'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'],
  ['07', 'Delhi'], ['30', 'Goa'], ['24', 'Gujarat'], ['06', 'Haryana'], ['02', 'Himachal Pradesh'],
  ['01', 'Jammu and Kashmir'], ['20', 'Jharkhand'], ['29', 'Karnataka'], ['32', 'Kerala'], ['38', 'Ladakh'],
  ['31', 'Lakshadweep'], ['23', 'Madhya Pradesh'], ['27', 'Maharashtra'], ['14', 'Manipur'], ['17', 'Meghalaya'],
  ['15', 'Mizoram'], ['13', 'Nagaland'], ['21', 'Odisha'], ['34', 'Puducherry'], ['03', 'Punjab'], ['08', 'Rajasthan'],
  ['11', 'Sikkim'], ['33', 'Tamil Nadu'], ['36', 'Telangana'], ['16', 'Tripura'], ['09', 'Uttar Pradesh'],
  ['05', 'Uttarakhand'], ['19', 'West Bengal'],
].map(([value, label]) => ({ value, label }))

export const stateName = (code: string | null | undefined) => GST_STATES.find((s) => s.value === code)?.label || null

export default billingService
