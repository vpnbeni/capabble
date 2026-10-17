import axios from 'axios'
import type {
  DefaultTenantFeatureConfigResponse,
  DataRollout,
  MasterCBSEDatesheet,
  MasterGuideline,
  MasterUndertaking,
  MasterSubject,
  MasterSubjectListResult,
  PlatformAdmin,
  RolloutModule,
  RolloutStatus,
  SubjectStats,
  Tenant,
  TenantFeatureConfigResponse,
  TenantFeaturePage,
  TenantListResponse,
  TenantWithFeatureSummary,
  UploadResult,
  MasterRemunerationRate,
  MasterPackingDispatch,
  MasterSchoolDirectory,
  SchoolDirectoryTypeSettings,
} from '../types/platform'

const configuredApiBaseUrl = (import.meta.env.VITE_PLATFORM_API_URL || '').trim()

const isLocalApiUrl = (value: string): boolean => {
  if (!value) {
    return false
  }

  try {
    const parsedUrl = new URL(value)
    return parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

const API_BASE_URL = import.meta.env.DEV
  ? '/api/admin'
  : ((!import.meta.env.DEV && isLocalApiUrl(configuredApiBaseUrl))
    ? '/api/admin'
    : (configuredApiBaseUrl || '/api/admin'))

interface ApiResponse<T> {
  success: boolean
  message?: string
  data: T
}

const platformApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

platformApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('platformToken')
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export interface TenantCreatePayload {
  slug: string
  name: string
  adminEmail: string
  adminPassword?: string
}

export interface TenantUpdatePayload {
  name?: string
  adminEmail?: string
}

export interface RolloutInitiatePayload {
  module: RolloutModule
  masterDataId: string
  versionLabel: string
}

export const platformAuthApi = {
  async login(email: string, password: string): Promise<{ token: string; admin: PlatformAdmin }> {
    const response = await platformApi.post<ApiResponse<{ token: string; admin: PlatformAdmin }>>('/auth/login', {
      email,
      password,
    })

    const { token, admin } = response.data.data
    localStorage.setItem('platformToken', token)

    return { token, admin }
  },

  async logout(): Promise<void> {
    try {
      await platformApi.post('/auth/logout')
    } finally {
      localStorage.removeItem('platformToken')
    }
  },

  async me(): Promise<PlatformAdmin> {
    const response = await platformApi.get<ApiResponse<PlatformAdmin>>('/auth/me')
    return response.data.data
  },
}

export const tenantAdminApi = {
  async list(search = ''): Promise<TenantListResponse> {
    const response = await platformApi.get<ApiResponse<TenantListResponse>>('/tenants', {
      params: {
        limit: 100,
        search: search || undefined,
      },
    })
    return response.data.data
  },

  async create(payload: TenantCreatePayload): Promise<{ tenant: Tenant; generatedPassword?: string | null }> {
    const response = await platformApi.post<ApiResponse<{ tenant: Tenant; generatedPassword?: string | null }>>(
      '/tenants',
      payload,
    )
    return response.data.data
  },

  async getById(id: string): Promise<Tenant> {
    const response = await platformApi.get<ApiResponse<Tenant>>(`/tenants/${id}`)
    return response.data.data
  },

  async update(id: string, payload: TenantUpdatePayload): Promise<Tenant> {
    const response = await platformApi.patch<ApiResponse<Tenant>>(`/tenants/${id}`, payload)
    return response.data.data
  },

  async activate(id: string): Promise<Tenant> {
    const response = await platformApi.post<ApiResponse<Tenant>>(`/tenants/${id}/activate`)
    return response.data.data
  },

  async suspend(id: string): Promise<Tenant> {
    const response = await platformApi.post<ApiResponse<Tenant>>(`/tenants/${id}/suspend`)
    return response.data.data
  },

  async delete(id: string, confirmSlug: string): Promise<{ _id: string; slug: string; dbName: string }> {
    const response = await platformApi.delete<ApiResponse<{ _id: string; slug: string; dbName: string }>>(
      `/tenants/${id}`,
      {
        data: { confirmSlug },
      },
    )
    return response.data.data
  },
}

export const featuresAdminApi = {
  async listPages(): Promise<TenantFeaturePage[]> {
    const response = await platformApi.get<ApiResponse<TenantFeaturePage[]>>('/features/pages')
    return response.data.data
  },

  async getDefaultFeatures(): Promise<DefaultTenantFeatureConfigResponse> {
    const response = await platformApi.get<ApiResponse<DefaultTenantFeatureConfigResponse>>('/features/defaults')
    return response.data.data
  },

  async updateDefaultFeatures(toggles: Record<string, boolean>): Promise<DefaultTenantFeatureConfigResponse> {
    const response = await platformApi.put<ApiResponse<DefaultTenantFeatureConfigResponse>>('/features/defaults', {
      toggles,
    })
    return response.data.data
  },

  async listTenants(search = ''): Promise<TenantWithFeatureSummary[]> {
    const response = await platformApi.get<ApiResponse<TenantWithFeatureSummary[]>>('/features/tenants', {
      params: {
        search: search || undefined,
      },
    })
    return response.data.data
  },

  async getTenantFeatures(tenantId: string): Promise<TenantFeatureConfigResponse> {
    const response = await platformApi.get<ApiResponse<TenantFeatureConfigResponse>>(`/features/tenants/${tenantId}`)
    return response.data.data
  },

  async updateTenantFeatures(tenantId: string, toggles: Record<string, boolean>): Promise<TenantFeatureConfigResponse> {
    const response = await platformApi.put<ApiResponse<TenantFeatureConfigResponse>>(`/features/tenants/${tenantId}`, {
      toggles,
    })
    return response.data.data
  },
}

export const masterSubjectsApi = {
  async upload(formData: FormData): Promise<UploadResult<{ total: number; inserted: number; updated: number; skipped: number; errors?: Array<{ row: number; message: string }> }>> {
    const response = await platformApi.post<UploadResult<{ total: number; inserted: number; updated: number; skipped: number; errors?: Array<{ row: number; message: string }> }>>(
      '/master-subjects/upload',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    )
    return response.data
  },

  async list(classFilter?: string): Promise<MasterSubjectListResult> {
    const params = classFilter ? { class: classFilter } : {}
    const response = await platformApi.get<ApiResponse<MasterSubjectListResult>>('/master-subjects', { params })
    return response.data.data
  },

  async stats(): Promise<SubjectStats> {
    const response = await platformApi.get<ApiResponse<SubjectStats>>('/master-subjects/stats')
    return response.data.data
  },

  async update(id: string, data: Partial<MasterSubject>): Promise<MasterSubject> {
    const response = await platformApi.patch<ApiResponse<MasterSubject>>(`/master-subjects/${id}`, data)
    return response.data.data
  },

  async delete(id: string): Promise<void> {
    await platformApi.delete(`/master-subjects/${id}`)
  },
}

export const masterDatesheetApi = {
  async upload(formData: FormData): Promise<UploadResult<{ datesheet: Partial<MasterCBSEDatesheet> }>> {
    const response = await platformApi.post<UploadResult<{ datesheet: Partial<MasterCBSEDatesheet> }>>(
      '/master-datesheet/upload',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    )
    return response.data
  },

  async list(): Promise<MasterCBSEDatesheet[]> {
    const response = await platformApi.get<ApiResponse<MasterCBSEDatesheet[]>>('/master-datesheet')
    return response.data.data
  },

  async getById(id: string): Promise<MasterCBSEDatesheet> {
    const response = await platformApi.get<ApiResponse<MasterCBSEDatesheet>>(`/master-datesheet/${id}`)
    return response.data.data
  },

  async delete(id: string): Promise<void> {
    await platformApi.delete(`/master-datesheet/${id}`)
  },
}

export const masterSchoolDirectoryApi = {
  async list(): Promise<MasterSchoolDirectory[]> {
    const response = await platformApi.get<ApiResponse<MasterSchoolDirectory[]>>('/master-school-directory')
    return response.data.data
  },

  async upload(formData: FormData): Promise<UploadResult<{ source: 'pdf' | 'csv'; total: number; inserted: number; updated: number; skipped: number; errors?: Array<{ row?: number; message: string }> }>> {
    const response = await platformApi.post<UploadResult<{ source: 'pdf' | 'csv'; total: number; inserted: number; updated: number; skipped: number; errors?: Array<{ row?: number; message: string }> }>>(
      '/master-school-directory/upload',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    )
    return response.data
  },

  async deleteMany(ids: string[]): Promise<{ deletedCount: number }> {
    const response = await platformApi.delete<ApiResponse<{ deletedCount: number }>>('/master-school-directory', {
      data: { ids },
    })
    return response.data.data
  },

  async getTypeSettings(): Promise<SchoolDirectoryTypeSettings> {
    const response = await platformApi.get<ApiResponse<SchoolDirectoryTypeSettings>>('/master-school-directory/type-settings')
    return response.data.data
  },

  async updateTypeSettings(govtKeywords: string[]): Promise<SchoolDirectoryTypeSettings> {
    const response = await platformApi.put<ApiResponse<SchoolDirectoryTypeSettings>>('/master-school-directory/type-settings', {
      govtKeywords,
    })
    return response.data.data
  },

  async updateSchoolType(id: string, type: 'Govt.' | 'Private'): Promise<MasterSchoolDirectory> {
    const response = await platformApi.patch<ApiResponse<MasterSchoolDirectory>>(`/master-school-directory/${id}/type`, {
      type,
    })
    return response.data.data
  },
}

export const masterGuidelinesApi = {
  async upload(formData: FormData): Promise<UploadResult<MasterGuideline>> {
    const response = await platformApi.post<UploadResult<MasterGuideline>>(
      '/master-guidelines/upload',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000,
      },
    )
    return response.data
  },

  async list(): Promise<MasterGuideline[]> {
    const response = await platformApi.get<ApiResponse<MasterGuideline[]>>('/master-guidelines')
    return response.data.data
  },

  async getById(id: string): Promise<MasterGuideline> {
    const response = await platformApi.get<ApiResponse<MasterGuideline>>(`/master-guidelines/${id}`)
    return response.data.data
  },

  async current(): Promise<MasterGuideline | null> {
    const response = await platformApi.get<ApiResponse<MasterGuideline | null>>('/master-guidelines/current')
    return response.data.data
  },

  async delete(id: string, removeFromCloudinary = false): Promise<void> {
    await platformApi.delete(`/master-guidelines/${id}`, {
      params: { removeFromCloudinary },
    })
  },
}

export const masterUndertakingsApi = {
  async upload(formData: FormData): Promise<UploadResult<MasterUndertaking>> {
    const response = await platformApi.post<UploadResult<MasterUndertaking>>('/master-undertakings/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  async list(): Promise<MasterUndertaking[]> {
    const response = await platformApi.get<ApiResponse<MasterUndertaking[]>>('/master-undertakings')
    return response.data.data
  },

  async getById(id: string): Promise<MasterUndertaking> {
    const response = await platformApi.get<ApiResponse<MasterUndertaking>>(`/master-undertakings/${id}`)
    return response.data.data
  },

  async current(): Promise<MasterUndertaking | null> {
    const response = await platformApi.get<ApiResponse<MasterUndertaking | null>>('/master-undertakings/current')
    return response.data.data
  },

  async delete(id: string, removeFromCloudinary = false): Promise<void> {
    await platformApi.delete(`/master-undertakings/${id}`, {
      params: { removeFromCloudinary },
    })
  },
}

export const masterRemunerationApi = {
  async list(): Promise<MasterRemunerationRate[]> {
    const response = await platformApi.get<ApiResponse<MasterRemunerationRate[]>>('/master-remuneration')
    return response.data.data
  },

  async upsert(rates: Array<{
    dutyType: string
    remuneration: number
    conveyance: number
    refreshment: number
  }>): Promise<MasterRemunerationRate[]> {
    const response = await platformApi.put<ApiResponse<MasterRemunerationRate[]>>('/master-remuneration', { rates })
    return response.data.data
  },
}

export const masterPackingDispatchApi = {
  async get(): Promise<MasterPackingDispatch> {
    const response = await platformApi.get<ApiResponse<MasterPackingDispatch>>('/master-packing-dispatch')
    return response.data.data
  },

  async upsert(payload: MasterPackingDispatch): Promise<MasterPackingDispatch> {
    const response = await platformApi.put<ApiResponse<MasterPackingDispatch>>('/master-packing-dispatch', payload)
    return response.data.data
  },
}

export const rolloutApi = {
  async initiate(payload: RolloutInitiatePayload): Promise<DataRollout> {
    const response = await platformApi.post<ApiResponse<DataRollout>>('/rollouts/initiate', payload)
    return response.data.data
  },

  async list(filters?: { module?: RolloutModule; status?: RolloutStatus }): Promise<DataRollout[]> {
    const response = await platformApi.get<ApiResponse<DataRollout[]>>('/rollouts', { params: filters })
    return response.data.data
  },

  async getById(id: string): Promise<DataRollout> {
    const response = await platformApi.get<ApiResponse<DataRollout>>(`/rollouts/${id}`)
    return response.data.data
  },

  async retry(id: string): Promise<DataRollout> {
    const response = await platformApi.post<ApiResponse<DataRollout>>(`/rollouts/${id}/retry`)
    return response.data.data
  },
}

export { platformApi }
