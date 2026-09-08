import api from './api'

export type AsetsPagination = {
  page: number
  limit: number
  total: number
  pages: number
}

const asetsService = {
  getDashboard: async () => {
    const res = await api.get('/asets/dashboard')
    return res.data.data
  },
  getMeta: async () => {
    const res = await api.get('/asets/meta')
    return res.data.data
  },
  listAssets: async (params?: Record<string, any>) => {
    const res = await api.get('/asets/assets', { params })
    return res.data.data as { items: any[]; pagination: AsetsPagination }
  },
  getAsset: async (id: string) => {
    const res = await api.get(`/asets/assets/${id}`)
    return res.data.data
  },
  createAsset: async (payload: Record<string, any>) => api.post('/asets/assets', payload),
  bulkCreateAssets: async (payload: Record<string, any>) => api.post('/asets/assets/bulk', payload),
  updateAsset: async (id: string, payload: Record<string, any>) => api.put(`/asets/assets/${id}`, payload),
  archiveAsset: async (id: string) => api.delete(`/asets/assets/${id}`),
  lookup: async (code: string) => {
    const res = await api.get(`/asets/lookup/${encodeURIComponent(code)}`)
    return res.data.data
  },

  listCategories: async (params?: Record<string, any>) => {
    const res = await api.get('/asets/categories', { params })
    return (res.data.data || []) as any[]
  },
  saveCategory: async (payload: Record<string, any>, id?: string) =>
    id ? api.put(`/asets/categories/${id}`, payload) : api.post('/asets/categories', payload),
  removeCategory: async (id: string) => api.delete(`/asets/categories/${id}`),

  listLocations: async (params?: Record<string, any>) => {
    const res = await api.get('/asets/locations', { params })
    return (res.data.data || []) as any[]
  },
  getLocationOverview: async (id: string) => {
    const res = await api.get(`/asets/locations/${id}`)
    return res.data.data
  },
  saveLocation: async (payload: Record<string, any>, id?: string) =>
    id ? api.put(`/asets/locations/${id}`, payload) : api.post('/asets/locations', payload),
  removeLocation: async (id: string) => api.delete(`/asets/locations/${id}`),

  listVendors: async () => {
    const res = await api.get('/asets/vendors')
    return (res.data.data || []) as any[]
  },
  saveVendor: async (payload: Record<string, any>, id?: string) =>
    id ? api.put(`/asets/vendors/${id}`, payload) : api.post('/asets/vendors', payload),
  removeVendor: async (id: string) => api.delete(`/asets/vendors/${id}`),

  listAllocations: async (params?: Record<string, any>) => {
    const res = await api.get('/asets/allocations', { params })
    return res.data.data
  },
  createAllocation: async (payload: Record<string, any>) => api.post('/asets/allocations', payload),
  returnAllocation: async (id: string, payload?: Record<string, any>) =>
    api.post(`/asets/allocations/${id}/return`, payload || {}),

  listTransfers: async (params?: Record<string, any>) => {
    const res = await api.get('/asets/transfers', { params })
    return res.data.data
  },
  createTransfer: async (payload: Record<string, any>) => api.post('/asets/transfers', payload),
  completeTransfer: async (id: string, payload?: Record<string, any>) =>
    api.post(`/asets/transfers/${id}/complete`, payload || {}),

  listMaintenance: async (params?: Record<string, any>) => {
    const res = await api.get('/asets/maintenance', { params })
    return res.data.data
  },
  createMaintenance: async (payload: Record<string, any>) => api.post('/asets/maintenance', payload),
  updateMaintenance: async (id: string, payload: Record<string, any>) =>
    api.put(`/asets/maintenance/${id}`, payload),

  listAudits: async () => {
    const res = await api.get('/asets/audits')
    return (res.data.data || []) as any[]
  },
  getAudit: async (id: string) => {
    const res = await api.get(`/asets/audits/${id}`)
    return res.data.data
  },
  createAudit: async (payload: Record<string, any>) => api.post('/asets/audits', payload),
  updateAuditItem: async (auditId: string, itemId: string, payload: Record<string, any>) =>
    api.put(`/asets/audits/${auditId}/items/${itemId}`, payload),
  scanAudit: async (auditId: string, payload: Record<string, any>) =>
    api.post(`/asets/audits/${auditId}/scan`, payload),
  closeAudit: async (auditId: string) => api.post(`/asets/audits/${auditId}/close`),

  listStock: async () => {
    const res = await api.get('/asets/stock')
    return (res.data.data || []) as any[]
  },
  saveStock: async (payload: Record<string, any>, id?: string) =>
    id ? api.put(`/asets/stock/${id}`, payload) : api.post('/asets/stock', payload),
  adjustStock: async (id: string, payload: Record<string, any>) => api.post(`/asets/stock/${id}/adjust`, payload),

  listProcurement: async () => {
    const res = await api.get('/asets/procurement')
    return (res.data.data || []) as any[]
  },
  createProcurement: async (payload: Record<string, any>) => api.post('/asets/procurement', payload),
  receiveProcurement: async (id: string, payload?: Record<string, any>) =>
    api.post(`/asets/procurement/${id}/receive`, payload || {}),

  listDisposals: async () => {
    const res = await api.get('/asets/disposals')
    return (res.data.data || []) as any[]
  },
  createDisposal: async (payload: Record<string, any>) => api.post('/asets/disposals', payload),
  approveDisposal: async (id: string, payload?: Record<string, any>) =>
    api.post(`/asets/disposals/${id}/approve`, payload || {}),

  getReport: async (type: string) => {
    const res = await api.get(`/asets/reports/${type}`)
    return res.data.data
  },
  getSettings: async () => {
    const res = await api.get('/asets/settings')
    return res.data.data
  },
  updateSettings: async (payload: Record<string, any>) => api.put('/asets/settings', payload),
}

export default asetsService
