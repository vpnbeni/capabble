import axios from 'axios'
import type { DirectoryFilterOptions, DirectoryItem, SchoolProfile, YearDetail } from '@/types/profile'
import type { DatabaseConfig, SetupStatus } from '@/types/setup'

const TOKEN_KEY = 'schol_token'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'x-schol-role': localStorage.getItem('schol_role') || 'admin',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/** Shared axios client (Bearer + role). Use this for all SCHOL API calls. */
export { api as scholApi }

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function setScholRole(role: string) {
  localStorage.setItem('schol_role', role)
  api.defaults.headers['x-schol-role'] = role
}

export async function loginRequest(username: string, password: string) {
  const { data } = await api.post<{
    token: string
    token_type: string
    username: string
    role: string
    expires_in: number
  }>('/auth/login', { username, password })
  return data
}

export async function fetchAuthMe() {
  const { data } = await api.get<{ username: string; role: string; auth_enabled: boolean }>('/auth/me')
  return data
}

export async function fetchSchoolProfile(schoolId: string, year?: string): Promise<SchoolProfile> {
  const { data } = await api.get<SchoolProfile>(`/schools/${schoolId}`, { params: year ? { year } : {} })
  return data
}

export async function fetchYearDetail(schoolId: string, year: string): Promise<YearDetail> {
  const { data } = await api.get<YearDetail>(`/schools/${schoolId}/enrollment/${year}`)
  return data
}

export async function fetchRawSources(schoolId: string) {
  const { data } = await api.get(`/schools/${schoolId}/raw`)
  return data
}

export interface KysSyncRun {
  run_id: string
  school_id: string | null
  school_name?: string | null
  status: string
  current_year: string | null
  processed_count: number
  failed_count: number
  error_summary?: string | null
  started_at?: string | null
  completed_at?: string | null
}

export interface StartKysSyncResult {
  school_id: string
  run_id: string
  status: string
}

export async function syncKysData(schoolId: string): Promise<StartKysSyncResult> {
  // Starts the job and returns immediately; the actual multi-year collection
  // runs in a background thread on the server — poll fetchKysSyncStatus or
  // fetchActiveKysSyncs for progress.
  const { data } = await api.post<StartKysSyncResult>(`/schools/${schoolId}/sync-kys`)
  return data
}

export async function fetchKysSyncStatus(schoolId: string, runId: string): Promise<KysSyncRun> {
  const { data } = await api.get<KysSyncRun>(`/schools/${schoolId}/sync-kys/${runId}`)
  return data
}

export async function cancelKysSync(schoolId: string, runId: string): Promise<KysSyncRun> {
  const { data } = await api.post<KysSyncRun>(`/schools/${schoolId}/sync-kys/${runId}/cancel`)
  return data
}

export async function fetchActiveKysSyncs(): Promise<KysSyncRun[]> {
  const { data } = await api.get<{ active_syncs: KysSyncRun[] }>('/kys-mapping/active-syncs')
  return data.active_syncs
}

export async function fetchSchoolDirectory(params: {
  q?: string
  state?: string
  district?: string
  kys_status?: string
  validation_status?: string
  sort?: string
  order?: string
  page?: number
  limit?: number
}) {
  const { data } = await api.get<{ items: DirectoryItem[]; pagination: { total: number; page: number; limit: number; pages: number } }>(
    '/schools',
    { params },
  )
  return data
}

export async function fetchSchoolFilterOptions(): Promise<DirectoryFilterOptions> {
  const { data } = await api.get<DirectoryFilterOptions>('/schools/filter-options')
  return data
}

export async function fetchSetupStatus(): Promise<SetupStatus> {
  const { data } = await api.get<SetupStatus>('/setup/status')
  return data
}

export async function testDatabaseConnection(config: DatabaseConfig) {
  const { data } = await api.post<{ ok: boolean; message: string; database_url_masked: string }>(
    '/setup/test-connection',
    config,
  )
  return data
}

export async function configureAndMigrate(config: DatabaseConfig) {
  const { data } = await api.post<{
    saved: boolean
    migration: { ok: boolean; message: string }
    status: SetupStatus
  }>('/setup/configure-and-migrate', config)
  return data
}

export async function resetDatabasePassword(config: DatabaseConfig) {
  const { data } = await api.post<{
    ok: boolean
    message: string
    status: SetupStatus
  }>('/setup/reset-password', config)
  return data
}

export async function collectSampleSchool() {
  const { data } = await api.post<{
    collection: { ok: boolean; school_name: string; overall_status: string }
    status: SetupStatus
  }>('/setup/collect-sample')
  return data
}

export async function verifyKysMapping(schoolId: string, kysSchoolId: string) {
  const { data } = await api.post(`/kys-mapping/schools/${schoolId}/verify`, {
    kys_school_id: kysSchoolId,
  })
  return data
}

export async function confirmKysMapping(
  schoolId: string,
  kysSchoolId: string,
  udise?: string,
  allowReviewOverride?: boolean,
) {
  const { data } = await api.post(`/kys-mapping/schools/${schoolId}/confirm`, {
    kys_school_id: kysSchoolId,
    udise,
    allow_review_override: allowReviewOverride ?? false,
  })
  return data
}

export interface BulkKysImportMatch {
  school_id: string
  school_name: string
  school_district?: string | null
  school_pin_code?: string | null
  school_address?: string | null
  kys_school_id: string
  kys_school_name: string | null
  kys_district?: string | null
  kys_pin_code?: string | null
  kys_address?: string | null
  confidence: string
  score: number
  matched_fields?: Record<string, unknown>
  mismatch_fields?: Record<string, unknown>
  persisted?: boolean
  reason?: string
}

export interface BulkKysImportResult {
  error?: string
  candidates_parsed: number
  district_used: string | null
  schools_checked: number
  auto_mapped: BulkKysImportMatch[]
  needs_review: BulkKysImportMatch[]
  no_match: { school_id: string; school_name: string }[]
}

export async function bulkImportKysMapping(
  rawText: string,
  district?: string,
  autoConfirm = true,
): Promise<BulkKysImportResult> {
  const { data } = await api.post<BulkKysImportResult>('/kys-mapping/bulk-import', {
    raw_text: rawText,
    district: district || undefined,
    auto_confirm: autoConfirm,
  })
  return data
}
