import { platformApi } from './platformApi'
import type {
  AdminCatalog,
  AuditEntry,
  BillingTenantDetails,
  BillingTenantListResponse,
  Bundle,
  Coupon,
  Addon,
  ModulePrice,
  Quote,
  Selection,
} from '../types/billing'

interface Envelope<T> { success: boolean; message?: string; data: T }

const tenant = (id: string) => `/billing/tenants/${encodeURIComponent(id)}`
const data = <T,>(promise: Promise<{ data: Envelope<T> }>) => promise.then((res) => res.data)

export const billingApi = {
  listTenants: (search = '', page = 1, limit = 25) =>
    data<BillingTenantListResponse>(platformApi.get('/billing/tenants', { params: { search: search || undefined, page, limit } })),
  getTenant: (id: string) => data<BillingTenantDetails>(platformApi.get(tenant(id))),
  previewPlan: (id: string, selection: Selection) => data<Quote>(platformApi.post(`${tenant(id)}/change-plan/preview`, selection)),
  changePlan: (id: string, selection: Selection) => data<unknown>(platformApi.post(`${tenant(id)}/change-plan`, selection)),
  grantExtension: (id: string, days: number) => data<unknown>(platformApi.post(`${tenant(id)}/grant-extension`, { days })),
  setStudents: (id: string, declaredStudents: number) => data<unknown>(platformApi.post(`${tenant(id)}/students`, { declaredStudents })),
  sendTrialInvite: (id: string) => data<{ status: string }>(platformApi.post(`${tenant(id)}/trial-invite`)),
  startTrial: (id: string, body: { reason: string; days?: number }) => data<unknown>(platformApi.post(`${tenant(id)}/trial`, body)),
  cancel: (id: string, immediately: boolean) => data<unknown>(platformApi.post(`${tenant(id)}/cancel`, { immediately })),
  recordOfflinePayment: (id: string, invoiceId: string, body: { amountPaise: number; method: string; reference: string; receivedAt?: string }) =>
    data<unknown>(platformApi.post(`${tenant(id)}/invoices/${invoiceId}/payments/offline`, body)),
  voidInvoice: (id: string, invoiceId: string, reason: string) =>
    data<unknown>(platformApi.post(`${tenant(id)}/invoices/${invoiceId}/void`, { reason })),
  createCreditNote: (id: string, invoiceId: string, body: { amountPaise: number; reason: string; refundPaise: number }) =>
    data<unknown>(platformApi.post(`${tenant(id)}/invoices/${invoiceId}/credit-notes`, body)),
  audit: (accountId: string) => data<AuditEntry[]>(platformApi.get('/billing/audit', { params: { accountId, limit: 100 } })),
  runJobs: () => data<Record<string, unknown>>(platformApi.post('/billing/jobs/run')),

  catalog: () => data<AdminCatalog>(platformApi.get('/billing/catalog')),
  priceHistory: (code: string) => data<ModulePrice[]>(platformApi.get(`/billing/modules/${code}/prices`)),
  setPrice: (code: string, body: { interval: string; basePaise: number; includedStudents: number; perStudentPaise: number; effectiveFrom?: string }) =>
    data<ModulePrice>(platformApi.post(`/billing/modules/${code}/prices`, body)),
  saveModule: (body: { code: string; name: string; active: boolean }) => data<unknown>(platformApi.post('/billing/modules', body)),
  saveBundle: (body: Omit<Bundle, 'description'> & { description?: string }) => data<Bundle>(platformApi.post('/billing/bundles', body)),
  saveCoupon: (body: Partial<Coupon> & { code: string }) => data<Coupon>(platformApi.post('/billing/coupons', body)),
  saveAddon: (body: Omit<Addon, 'description'> & { description?: string }) => data<Addon>(platformApi.post('/billing/addons', body)),

  /** PDFs need the admin session, so fetch them and show the file; download it if pop-ups are blocked. */
  async openPdf(path: string, filename = 'document.pdf') {
    const win = window.open('', '_blank')
    const res = await platformApi.get(path, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    if (win) {
      win.location.href = url
    } else {
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  },
  invoicePdfPath: (id: string, invoiceId: string) => `${tenant(id)}/invoices/${invoiceId}/pdf`,
  receiptPdfPath: (id: string, paymentId: string) => `${tenant(id)}/receipts/${paymentId}/pdf`,
  creditNotePdfPath: (id: string, noteId: string) => `${tenant(id)}/credit-notes/${noteId}/pdf`,
}

export const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { message?: string; details?: Array<{ message: string }> } } })?.response?.data?.details?.[0]?.message
  || (err as { response?: { data?: { message?: string } } })?.response?.data?.message
  || fallback
