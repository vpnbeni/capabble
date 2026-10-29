import { api } from '@/lib/api'
import type { Tone } from '@/theme/tokens'

// The school's assets (/api/asets), the website's Assets → Register, Maintenance, Stock and
// Disposals. Assets are found by name, ID, serial or tag, typed until the camera can scan them.

export type AssetStatus = 'PROCURED' | 'RECEIVED' | 'IN_STOCK' | 'ALLOCATED' | 'IN_USE' | 'UNDER_MAINTENANCE' | 'DAMAGED' | 'LOST' | 'RETIRED' | 'DISPOSED'
export type MaintenanceStatus = 'Reported' | 'Assigned' | 'In Progress' | 'Awaiting Parts' | 'Completed' | 'Closed'
export type Priority = 'Low' | 'Medium' | 'High' | 'Critical'

export const MAINTENANCE_STATUSES: MaintenanceStatus[] = ['Reported', 'Assigned', 'In Progress', 'Awaiting Parts', 'Completed', 'Closed']
export const PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Critical']

export interface AssetLocation {
  _id: string
  name: string
  path?: string
  type?: string
  isStore?: boolean
}

export interface Asset {
  _id: string
  assetId: string
  assetTag?: string
  name: string
  brand?: string
  model?: string
  serialNumber?: string
  status: AssetStatus
  condition: string
  categoryId?: { _id: string; name: string } | null
  locationId?: AssetLocation | null
  locationPath?: string
  custodianName?: string
  department?: string
  purchaseDate?: string | null
  purchaseCost?: number
  currentValue?: number
  warranty?: { endDate?: string | null; provider?: string }
  nextMaintenanceDue?: string | null
  notes?: string
}

export interface Allocation {
  _id: string
  toLocationId?: AssetLocation | null
  newCustodianName?: string
  allocationDate: string
  status: 'Active' | 'Returned' | 'Cancelled'
}

export interface Maintenance {
  _id: string
  assetId?: Pick<Asset, '_id' | 'assetId' | 'name' | 'status'> | string | null
  issue: string
  reportedDate: string
  reportedBy?: string
  priority: Priority
  assignedTo?: string
  status: MaintenanceStatus
  cost?: number
  notes?: string
}

export interface Disposal {
  _id: string
  assetId?: Pick<Asset, '_id' | 'assetId' | 'name' | 'status'> | null
  disposalDate: string
  reason: string
  method?: string
  residualValue?: number
  status: 'Pending' | 'Approved' | 'Completed' | 'Rejected'
  notes?: string
}

export interface StockItem {
  _id: string
  name: string
  sku?: string
  unit?: string
  quantityOnHand: number
  reorderLevel: number
  locationId?: AssetLocation | null
  categoryId?: { name: string } | null
}

export interface AssetRecord {
  asset: Asset
  allocations: Allocation[]
  maintenance: Maintenance[]
  disposals: Disposal[]
}

export interface AssetSummary {
  kpis: { totalAssets: number; inUse: number; inStock: number; underMaintenance: number; damaged: number; lost: number }
}

type Page<T> = { items: T[]; pagination: { total: number } }

/** The website's words for an asset status: "IN_USE" → "In use". */
export const assetStatusLabel = (status: string) => {
  const words = status.replace(/[_-]+/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const TONES: Record<string, Tone> = {
  IN_STOCK: 'info',
  IN_USE: 'success',
  ALLOCATED: 'info',
  UNDER_MAINTENANCE: 'warning',
  DAMAGED: 'warning',
  LOST: 'danger',
  REPORTED: 'warning',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  AWAITING_PARTS: 'warning',
  COMPLETED: 'success',
  PENDING: 'warning',
}
export const assetTone = (status: string): Tone => TONES[status.toUpperCase().replace(/[\s-]+/g, '_')] ?? 'neutral'

/** Where an asset is: "Main block › Room 12", without the campus when there is only one. */
export const placeOf = (asset: Pick<Asset, 'locationId' | 'locationPath'>) => {
  const parts = (asset.locationPath || asset.locationId?.path || asset.locationId?.name || '').split(' › ').filter(Boolean)
  return (parts.length > 1 ? parts.slice(1) : parts).join(' › ')
}

const id = (value: string) => encodeURIComponent(value)

export interface AssetCategory {
  _id: string
  name: string
  code: string
  trackingModeDefault?: 'individual' | 'consumable'
}

export interface AssetVendor {
  _id: string
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  gstin?: string
}

export interface AssetPurchase {
  _id: string
  title: string
  itemName?: string
  vendorId?: { _id: string; name: string } | null
  categoryId?: { _id: string; name: string; code: string } | null
  locationId?: { _id: string; name: string } | null
  quantity: number
  unitCost: number
  totalCost: number
  warrantyMonths?: number
  trackingMode: 'individual' | 'consumable'
  status: 'Draft' | 'Requested' | 'Ordered' | 'Received' | 'Cancelled'
  receiptDate?: string | null
  createdAt: string
}

export type AuditItemState = 'Verified' | 'Missing' | 'Damaged' | 'Wrong Location' | 'Not Found' | 'Unverified'

export interface AssetAudit {
  _id: string
  title: string
  status: 'In Progress' | 'Closed' | string
  startedAt?: string
  closedAt?: string | null
  summary?: { expected: number; found: number; missing: number; damaged: number; wrongLocation: number; unverified: number }
  createdAt: string
}

export interface AuditItem {
  _id: string
  state: AuditItemState
  scannedCode?: string
  verifiedAt?: string | null
  assetId?: { _id: string; assetId: string; name: string; locationPath?: string } | null
  expectedLocationId?: { name: string; path?: string } | null
}

export type ReportRow = { _id: string | null; count: number; value: number; name?: string; code?: string; path?: string }

export interface NewAsset {
  name: string
  categoryId: string
  locationId?: string
  vendorId?: string
  brand?: string
  model?: string
  serialNumber?: string
  purchaseCost?: number
  currentValue?: number
  condition?: string
  status?: AssetStatus
  quantity?: number
}

export const assetService = {
  summary: () => api.get<AssetSummary>('/asets/dashboard'),
  assets: async (filter: { q?: string; locationId?: string; status?: string }) => {
    const page = await api.get<Page<Asset>>('/asets/assets', { q: filter.q || undefined, locationId: filter.locationId || undefined, status: filter.status || undefined, limit: 50, sort: 'name' })
    return { items: page.items, total: page.pagination.total }
  },
  asset: (assetId: string) => api.get<AssetRecord>(`/asets/assets/${id(assetId)}`),
  locations: () => api.get<AssetLocation[]>('/asets/locations'),
  /** Hands the asset to a place and, if given, a person. */
  allocate: (input: { assetId: string; toLocationId: string; newCustodianName?: string; reason?: string; markInUse?: boolean }) => api.post<Allocation>('/asets/allocations', input),
  returnAllocation: (allocationId: string) => api.post<Allocation>(`/asets/allocations/${id(allocationId)}/return`, {}),
  /** Moves it to another place; the school's settings may hold it for approval. */
  transfer: (input: { assetId: string; destinationLocationId: string; reason?: string }) => api.post<{ status: string }>('/asets/transfers', input),
  maintenance: async (status?: string) => (await api.get<Page<Maintenance>>('/asets/maintenance', { status: status || undefined, limit: 100 })).items,
  reportProblem: (input: { assetId: string; issue: string; priority: Priority }) => api.post<Maintenance>('/asets/maintenance', input),
  /** Changes only the fields sent. */
  updateMaintenance: (maintenanceId: string, input: Partial<Pick<Maintenance, 'status' | 'assignedTo' | 'notes' | 'cost'>>) => api.put<Maintenance>(`/asets/maintenance/${id(maintenanceId)}`, input),
  stock: () => api.get<StockItem[]>('/asets/stock'),
  adjustStock: (stockId: string, input: { type: 'receipt' | 'issue'; quantity: number; notes?: string }) => api.post<{ item: StockItem }>(`/asets/stock/${id(stockId)}/adjust`, input),
  disposals: () => api.get<Disposal[]>('/asets/disposals'),
  /** One asset; with a quantity above one, that many alike (each gets its own asset ID). */
  addAsset: (input: NewAsset) => ((input.quantity ?? 1) > 1 ? api.post<unknown>('/asets/assets/bulk', input) : api.post<Asset>('/asets/assets', input)),
  categories: () => api.get<AssetCategory[]>('/asets/categories'),
  saveCategory: (input: { _id?: string; name: string; code: string; trackingModeDefault?: string }) =>
    input._id ? api.put<AssetCategory>(`/asets/categories/${id(input._id)}`, input) : api.post<AssetCategory>('/asets/categories', input),
  vendors: () => api.get<AssetVendor[]>('/asets/vendors'),
  /** Changes only the fields sent. */
  saveVendor: (input: Partial<AssetVendor> & { name: string }) => (input._id ? api.put<AssetVendor>(`/asets/vendors/${id(input._id)}`, input) : api.post<AssetVendor>('/asets/vendors', input)),
  /** A place inside another (campus › block › floor › room); the server checks the order. */
  addLocation: (input: { name: string; type: string; parentId?: string; roomType?: string; isStore?: boolean }) => api.post<AssetLocation>('/asets/locations', input),
  renameLocation: (locationId: string, name: string) => api.put<AssetLocation>(`/asets/locations/${id(locationId)}`, { name }),
  purchases: () => api.get<AssetPurchase[]>('/asets/procurement'),
  addPurchase: (input: { title: string; itemName: string; categoryId?: string; vendorId?: string; locationId?: string; quantity: number; unitCost: number; warrantyMonths?: number; trackingMode: 'individual' | 'consumable'; status: 'Ordered' }) =>
    api.post<AssetPurchase>('/asets/procurement', input),
  /** Makes the assets (or the stock item) the purchase is for. */
  receivePurchase: (purchaseId: string) => api.post<{ generatedCount: number }>(`/asets/procurement/${id(purchaseId)}/receive`, {}),
  audits: () => api.get<AssetAudit[]>('/asets/audits'),
  audit: (auditId: string) => api.get<{ audit: AssetAudit; items: AuditItem[] }>(`/asets/audits/${id(auditId)}`),
  startAudit: (input: { title: string; scopeType: 'Full' | 'Location' | 'Category'; locationId?: string; categoryId?: string }) => api.post<AssetAudit>('/asets/audits', input),
  /** By asset ID, barcode or tag; an asset not on the list is added to it. */
  checkAsset: (auditId: string, code: string) => api.post<unknown>(`/asets/audits/${id(auditId)}/scan`, { code }),
  /** Missing marks the asset lost and Damaged marks it damaged. */
  markAuditItem: (auditId: string, itemId: string, state: AuditItemState) => api.put<unknown>(`/asets/audits/${id(auditId)}/items/${id(itemId)}`, { state }),
  closeAudit: (auditId: string) => api.post<AssetAudit>(`/asets/audits/${id(auditId)}/close`, {}),
  report: async <T = ReportRow>(type: 'by-category' | 'by-location' | 'register') => (await api.get<{ rows: T[] }>(`/asets/reports/${type}`)).rows,
  approveDisposal: (disposalId: string) => api.post<Disposal>(`/asets/disposals/${id(disposalId)}/approve`, {}),
}
