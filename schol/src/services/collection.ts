import { scholApi as api, setScholRole } from '@/services/api'
import type {
  CollectionPreview,
  CollectionRunCreatePayload,
  CollectionRunSchoolStatus,
  CollectionRunSummary,
  GeographyDistrict,
  GeographyState,
} from '@/types/collection'

export { setScholRole }

export async function fetchStates(): Promise<GeographyState[]> {
  const { data } = await api.get<{ states: GeographyState[] }>('/geography/states')
  return data.states
}

export async function fetchDistricts(stateId: string): Promise<GeographyDistrict[]> {
  const { data } = await api.get<{ districts: GeographyDistrict[] }>(`/geography/states/${stateId}/districts`)
  return data.districts
}

export async function previewCollection(payload: {
  source: string
  state_id: string
  state_name: string
  district_id: string
  district_name: string
  year_from?: string
  year_to?: string
  data_groups?: string[]
  page?: number
  limit?: number
}): Promise<CollectionPreview> {
  // SARAS directory scrape can take 30–120s for large districts.
  const { data } = await api.post<CollectionPreview>('/collection/preview', payload, {
    timeout: 180_000,
  })
  return data
}

export async function createCollectionRun(payload: CollectionRunCreatePayload): Promise<{ run_id: string; status: string }> {
  const { data } = await api.post<{ run_id: string; status: string }>('/collection/runs', payload)
  return data
}

export async function fetchCollectionRun(runId: string): Promise<CollectionRunSummary> {
  const { data } = await api.get<CollectionRunSummary>(`/collection/runs/${runId}`)
  return data
}

export async function fetchCollectionRunSchools(runId: string): Promise<CollectionRunSchoolStatus[]> {
  const { data } = await api.get<{ schools: CollectionRunSchoolStatus[] }>(`/collection/runs/${runId}/schools`)
  return data.schools
}

export async function listCollectionRuns(): Promise<CollectionRunSummary[]> {
  const { data } = await api.get<{ runs: CollectionRunSummary[] }>('/collection/runs')
  return data.runs
}

export async function pauseCollectionRun(runId: string) {
  const { data } = await api.post(`/collection/runs/${runId}/pause`)
  return data
}

export async function resumeCollectionRun(runId: string) {
  const { data } = await api.post(`/collection/runs/${runId}/resume`)
  return data
}

export interface ReEnrichSarasSchoolResult {
  affiliation_number: string
  school_name: string
  address_line: string | null
  school_id?: string | null
}

export interface ReEnrichSarasResult {
  run_id: string
  total: number
  enriched: number
  schools: ReEnrichSarasSchoolResult[]
}

export async function reEnrichSarasRun(runId: string): Promise<ReEnrichSarasResult> {
  const { data } = await api.post<ReEnrichSarasResult>(`/collection/runs/${runId}/re-enrich-saras`)
  return data
}

export async function fetchMatchCandidates() {
  const { data } = await api.get('/match-candidates')
  return data.items
}
