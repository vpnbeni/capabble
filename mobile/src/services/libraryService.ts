import { api } from '@/lib/api'

// The library desk (/api/libry), the website's Library → Circulation, Catalogue, Members and Fines.
// Copies are found by accession number or barcode, typed until the camera can scan them.

export interface LibraryMember {
  _id: string
  name: string
  memberType: string
  memberId: string
  className?: string
  section?: string
  status: string
}

export interface LibraryCopy {
  _id: string
  accessionNumber: string
  barcode?: string
  status: 'available' | 'issued' | 'lost' | 'damaged' | 'inspection' | string
  shelfLocation?: string
  titleId?: { _id: string; title: string; authors?: string[] } | null
}

export interface Loan {
  _id: string
  dueAt: string
  issuedAt?: string
  renewals: number
  status: 'active' | 'returned'
  copyId?: LibraryCopy | null
  memberId?: LibraryMember | null
}

export interface LibraryTitle {
  _id: string
  title: string
  authors?: string[]
  /** Copies of this title, and how many are on the shelf. */
  inventory?: { copies: number; available: number }
  classificationCode?: string
}

export interface Fine {
  _id: string
  amount: number
  outstandingAmount: number
  status: 'open' | 'paid' | 'waived' | string
  kind?: string
  reason?: string
  memberId?: { name: string; memberType: string } | null
  createdAt: string
}

export interface LibraryToday {
  titles: number
  copies: number
  available: number
  issued: number
  overdue: number
  dueToday: number
  todayIssues: number
  todayReturns: number
}

/** Money fields come back as Mongo decimals ({ $numberDecimal: "120.00" }). */
export type Decimal = number | string | { $numberDecimal: string } | null | undefined
export const decimal = (value: Decimal) => {
  if (value === null || value === undefined) return null
  const n = Number(typeof value === 'object' ? value.$numberDecimal : value)
  return Number.isFinite(n) ? n : null
}

export interface TitleInput {
  title: string
  authors?: string
  isbn13?: string
  publisher?: string
  publicationYear?: number
  classificationCode?: string
}

export interface CopyInput {
  accessionNumber: string
  price?: number
}

export interface PurchaseRequest {
  _id: string
  title: string
  author?: string
  isbn13?: string
  quantity: number
  estimatedUnitCost?: Decimal
  purpose: string
  status: 'requested' | 'approved' | 'rejected' | 'ordered' | 'received' | string
  requestedBy: string
  reviewedBy?: string
  reviewNote?: string
  createdAt: string
}

export interface Supplier {
  _id: string
  name: string
  contactName?: string
  phone?: string
  email?: string
}

export interface OrderLine {
  _id?: string
  title: string
  author?: string
  isbn13?: string
  quantity: number
  receivedQuantity?: number
  unitCost?: Decimal
}

export interface PurchaseOrder {
  _id: string
  number: string
  supplierId?: { _id: string; name: string } | string | null
  requestId?: string | null
  lines: OrderLine[]
  status: 'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled' | string
  orderedAt?: string
  createdAt: string
}

export interface Stocktake {
  _id: string
  name: string
  status: 'open' | 'closed'
  items: { _id: string; accessionNumber: string; expectedStatus: string; state: 'pending' | 'verified' | 'missing'; scannedAt?: string | null }[]
  startedBy?: string
  closedAt?: string | null
  createdAt: string
}

export interface DigitalResource {
  _id: string
  title: string
  authors?: string[]
  resourceType: 'ebook' | 'pdf' | 'link' | 'audiobook' | 'video'
  url: string
  description?: string
  audience: 'staff' | 'students' | 'all'
}

export type InventoryRow = { _id: string; copies: number; value: number | null }
export type FineRow = { _id: string; count: number; outstanding: Decimal }

const id = encodeURIComponent

export const libraryService = {
  today: () => api.get<LibraryToday>('/libry/dashboard'),
  loans: () => api.get<{ items: Loan[] }>('/libry/loans'),
  member: (code: string) => api.get<{ member: LibraryMember; activeLoans: number; policy: { maxActiveLoans: number; loanDays: number } | null; eligible: boolean }>('/libry/members/lookup', { code }),
  members: (q: string) => api.get<{ items: LibraryMember[] }>('/libry/members', { q: q || undefined }),
  copy: (code: string) => api.get<LibraryCopy>('/libry/copies/lookup', { code }),
  issue: (memberId: string, copyId: string) => api.post<Loan>('/libry/loans/issue', { memberId, copyId }),
  /** By accession number or barcode; "damaged" or "requires_inspection" takes the copy off the shelf. */
  returnByCode: (code: string, condition: 'good' | 'damaged' | 'requires_inspection') => api.post<Loan>('/libry/loans/return-scan', { code, condition }),
  renew: (loanId: string) => api.post<Loan>(`/libry/loans/${encodeURIComponent(loanId)}/renew`, {}),
  titles: (q: string) => api.get<{ items: LibraryTitle[] }>('/libry/titles', { q: q || undefined, limit: 40 }),
  fines: () => api.get<{ items: Fine[] }>('/libry/fines'),
  /** A catalogue title by its ISBN (404 when the library doesn't have it yet). */
  titleByIsbn: (code: string) => api.get<LibraryTitle & { isbn13?: string }>('/libry/titles/lookup', { code }),
  createTitle: (input: TitleInput) => api.post<LibraryTitle>('/libry/titles', input),
  /** All or nothing: every accession number must be new and distinct. */
  addCopies: (titleId: string, copies: CopyInput[]) => api.post<{ summary: { copiesRegistered: number } }>('/libry/copies/bulk', { titleId, copies }),
  requests: () => api.get<{ items: PurchaseRequest[] }>('/libry/acquisitions'),
  request: (input: { title: string; author?: string; isbn13?: string; quantity: number; estimatedUnitCost?: number; purpose: string }) => api.post<PurchaseRequest>('/libry/acquisitions', input),
  /** The person who asked can't approve or reject their own request (the server refuses). */
  review: (requestId: string, decision: 'approved' | 'rejected', note: string) => api.post<PurchaseRequest>(`/libry/acquisitions/${id(requestId)}/review`, { decision, note }),
  suppliers: () => api.get<{ items: Supplier[] }>('/libry/suppliers'),
  addSupplier: (input: { name: string; contactName?: string; phone?: string; email?: string }) => api.post<Supplier>('/libry/suppliers', input),
  orders: () => api.get<{ items: PurchaseOrder[] }>('/libry/purchase-orders'),
  order: (input: { supplierId: string; requestId?: string; lines: OrderLine[] }) => api.post<PurchaseOrder>('/libry/purchase-orders', input),
  /** Makes the copies (each with its title and accession number) and counts each against its order line. */
  receive: (orderId: string, copies: { titleId: string; accessionNumber: string; price?: number; lineId?: string }[]) =>
    api.post<{ copies: { accessionNumber: string }[] }>(`/libry/purchase-orders/${id(orderId)}/receive`, { copies }),
  stocktakes: () => api.get<{ items: Stocktake[] }>('/libry/stocktakes'),
  startStocktake: (name: string) => api.post<Stocktake>('/libry/stocktakes', { name }),
  /** Marks one copy as found on the shelf, by accession number. */
  checkCopy: (stocktakeId: string, code: string) => api.post<Stocktake>(`/libry/stocktakes/${id(stocktakeId)}/scan`, { code }),
  /** Copies not found by then are marked missing. */
  closeStocktake: (stocktakeId: string) => api.post<Stocktake>(`/libry/stocktakes/${id(stocktakeId)}/close`, {}),
  inventory: () => api.get<{ rows: InventoryRow[] }>('/libry/reports/inventory'),
  overdue: () => api.get<{ rows: Loan[] }>('/libry/reports/overdue'),
  fineTotals: () => api.get<{ rows: FineRow[] }>('/libry/reports/fines'),
  digital: () => api.get<{ items: DigitalResource[] }>('/libry/digital-resources'),
  addDigital: (input: { title: string; authors?: string; resourceType: DigitalResource['resourceType']; url: string; audience: DigitalResource['audience']; description?: string }) =>
    api.post<DigitalResource>('/libry/digital-resources', input),
  waiveFine: (id: string, reason: string) => api.post<Fine>(`/libry/fines/${encodeURIComponent(id)}/waive`, { reason }),
}
