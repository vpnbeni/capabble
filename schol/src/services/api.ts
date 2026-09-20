import axios from 'axios'
import type { DirectoryItem, SchoolProfile, YearDetail } from '@/types/profile'
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

export async function fetchSchoolDirectory(params: {
  q?: string
  state?: string
  district?: string
  page?: number
  limit?: number
}) {
  const { data } = await api.get<{ items: DirectoryItem[]; pagination: { total: number; page: number; limit: number; pages: number } }>(
    '/schools',
    { params },
  )
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

export async function confirmKysMapping(schoolId: string, kysSchoolId: string, udise?: string) {
  const { data } = await api.post(`/kys-mapping/schools/${schoolId}/confirm`, {
    kys_school_id: kysSchoolId,
    udise,
  })
  return data
}
