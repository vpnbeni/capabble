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
  approveDisposal: (disposalId: string) => api.post<Disposal>(`/asets/disposals/${id(disposalId)}/approve`, {}),
}
