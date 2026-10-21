import { platformApi } from './platformApi'

export type DemoRequestStatus = 'new' | 'contacted' | 'scheduled' | 'closed'

export interface DemoRequest {
  _id: string
  name: string
  institution: string
  role: string
  email: string
  phone: string
  city: string
  state: string
  studentCount: string
  modules: string[]
  preferredTime: string
  message: string
  status: DemoRequestStatus
  notes: string
  statusUpdatedAt: string | null
  statusUpdatedBy: string | null
  source: string
  createdIp: string | null
  createdAt: string
  updatedAt: string
}

export interface DemoRequestListResponse {
  items: DemoRequest[]
  total: number
  page: number
  pages: number
  limit: number
  counts: Partial<Record<DemoRequestStatus, number>>
}

interface Envelope<T> { success: boolean; message?: string; data: T }

export const demoRequestApi = {
  async list(params: { status?: DemoRequestStatus; search?: string; page?: number; limit?: number }) {
    const res = await platformApi.get<Envelope<DemoRequestListResponse>>('/demo-requests', {
      params: { ...params, status: params.status || undefined, search: params.search || undefined },
    })
    return res.data.data
  },

  async update(id: string, payload: { status?: DemoRequestStatus; notes?: string }) {
    const res = await platformApi.patch<Envelope<DemoRequest>>(`/demo-requests/${encodeURIComponent(id)}`, payload)
    return res.data.data
  },
}
