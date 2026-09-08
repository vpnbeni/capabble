import axios from 'axios'
import type { DirectoryItem, SchoolProfile, YearDetail } from '@/types/profile'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'x-schol-role': localStorage.getItem('schol_role') || 'viewer',
  },
})

export function setScholRole(role: string) {
  localStorage.setItem('schol_role', role)
  api.defaults.headers['x-schol-role'] = role
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
