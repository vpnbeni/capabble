// Shapes returned by /api/admin/billing (server billing module). Money is always integer paise.

export type SubscriptionState =
  | 'trialing'
  | 'active'
  | 'past_due_grace'
  | 'suspended_read_only'
  | 'grandfathered'
  | 'canceled'

export type BillingInterval = 'month' | 'year'

export interface BillingAccount {
  id: string
  tenantId: string
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
  createdAt: string
}

export interface SubscriptionItem {
  id: string
  moduleCode: string
  name: string
  startedAt: string
  endsAtPeriodEnd: boolean
}

export interface SubscriptionAddon {
  id: string
  addonCode: string
  name: string
  quantity: number
  cycle: 'month' | 'year' | 'one_time'
  endsAtPeriodEnd: boolean
}

export interface BillingSubscription {
  id: string
  state: SubscriptionState
  interval: BillingInterval
  bundleCode: string | null
  couponCode: string | null
  declaredStudents: number
  billedStudents: number
  collectionMode: string
  trialEndsAt: string | null
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  graceEndsAt: string | null
  grandfatherEndsAt: string | null
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  nextDeadline?: string | null
  items?: SubscriptionItem[]
  addons?: SubscriptionAddon[]
}

export interface BillingEntitlement {
  state: SubscriptionState
  accessMode: 'full' | 'core_only' | 'read_only'
  entitledModules?: string[]
  nextDeadline?: string | null
  trialEndsAt?: string | null
  graceEndsAt?: string | null
  periodEndsAt?: string | null
}

export interface InvoiceLine {
  id: string
  position: number
  kind: string
  moduleCode: string | null
  description: string
  hsnSac: string
  quantity: number
  unitPaise: number
  amountPaise: number
  discountPaise: number
  taxablePaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
}

export interface BillingInvoice {
  id: string
  number: string
  reason: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  issuedAt: string
  dueAt: string
  paidAt: string | null
  periodStart: string | null
  periodEnd: string | null
  studentsBilled: number
  placeOfSupply: string | null
  subtotalPaise: number
  discountPaise: number
  taxablePaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  totalPaise: number
  amountPaidPaise: number
  amountCreditedPaise: number
  outstandingPaise: number
  lines?: InvoiceLine[]
}

export interface BillingPayment {
  id: string
  invoiceId: string | null
  invoiceNumber?: string | null
  provider: string
  providerPaymentId: string | null
  method: string
  status: 'initiated' | 'captured' | 'failed' | 'refunded'
  amountPaise: number
  refundedPaise: number
  reference: string
  failureReason: string
  receiptNumber: string | null
  capturedAt: string | null
  createdAt: string
}

export interface CreditNote {
  id: string
  number: string
  invoiceId: string
  reason: string
  issuedAt: string
  totalPaise: number
  refundPaise: number
  refundStatus: 'none' | 'pending' | 'processed' | 'failed'
}

export interface QuoteTotals {
  subtotalPaise: number
  discountPaise: number
  taxablePaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  totalPaise: number
}

export interface Quote {
  effective: 'new_period' | 'mid_period'
  interval: BillingInterval
  students: number
  modules: Array<{ code: string; name: string }>
  bundleCode: string | null
  couponCode: string | null
  dueNow: (QuoteTotals & { reason: string; periodStart: string; periodEnd: string; dueAt: string; lines: InvoiceLine[] }) | null
  perPeriod: (QuoteTotals & { lines: InvoiceLine[] }) | null
}

export interface RenewalEstimate extends QuoteTotals {
  periodStart: string
  periodEnd: string
  dueAt: string
}

export interface AuditEntry {
  id: number
  occurredAt: string
  actorType: string
  actorId: string
  entityType: string
  entityId: string
  action: string
}

export interface BillingTenantListItem {
  account: BillingAccount
  subscription: BillingSubscription | null
  entitlement: BillingEntitlement | null
}

export interface BillingTenantListResponse {
  items: BillingTenantListItem[]
  total: number
  page: number
  pages: number
  limit: number
}

export interface BillingTenantDetails {
  account: BillingAccount
  subscription: BillingSubscription | null
  entitlement: BillingEntitlement
  openInvoices: BillingInvoice[]
  upcomingRenewal: RenewalEstimate | null
  invoices: BillingInvoice[]
  payments: BillingPayment[]
  creditNotes: CreditNote[]
}

export interface ModulePrice {
  id: string
  moduleCode: string
  interval: BillingInterval
  basePaise: number
  includedStudents: number
  perStudentPaise: number
  effectiveFrom: string
  effectiveTo: string | null
}

export interface CatalogModule {
  code: string
  name: string
  description: string
  isCore: boolean
  active: boolean
  sortOrder: number
  prices: { month: ModulePrice | null; year: ModulePrice | null }
}

export interface Bundle {
  code: string
  name: string
  description: string
  discountBps: number
  active: boolean
  moduleCodes: string[]
}

export interface Coupon {
  code: string
  description: string
  percentBps: number | null
  fixedPaise: number | null
  duration: 'once' | 'forever' | 'repeating'
  durationCycles: number | null
  maxRedemptions: number | null
  redeemedCount: number
  moduleCodes: string[] | null
  expiresAt: string | null
  active: boolean
}

export interface Addon {
  code: string
  name: string
  description: string
  amountPaise: number
  cycle: 'month' | 'year' | 'one_time'
  active: boolean
}

export interface AdminCatalog {
  modules: CatalogModule[]
  bundles: Bundle[]
  addons: Addon[]
  coupons: Coupon[]
}

export interface Selection {
  modules: string[]
  bundleCode?: string | null
  interval: BillingInterval
  declaredStudents?: number
  couponCode?: string | null
}
