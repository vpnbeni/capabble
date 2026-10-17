import api from './api'

export type SearchRecordType = 'student' | 'staff' | 'receipt' | 'asset' | 'subject' | 'room' | 'alumni' | 'candidate' | 'appointment'

export interface SearchHit {
  id: string
  type: SearchRecordType
  title: string
  subtitle?: string
  path: string
  badge?: string
  image?: string
  score: number
  fuzzy?: boolean
}

export interface SearchGroup {
  type: SearchRecordType
  label: string
  items: SearchHit[]
}

export interface GlobalSearchResult {
  q: string
  groups: SearchGroup[]
  /** True when nothing matched exactly and these are the closest spellings. */
  fuzzy?: boolean
  tookMs: number
}

const globalSearch = async (
  q: string,
  options: { types?: SearchRecordType[]; limit?: number; signal?: AbortSignal } = {}
): Promise<GlobalSearchResult> => {
  const response = await api.get('/search', {
    params: {
      q,
      limit: options.limit,
      types: options.types?.length ? options.types.join(',') : undefined,
    },
    signal: options.signal,
    // The palette shows its own inline state; don't toast while someone is typing.
    _silent: true,
  } as any)
  return response.data?.data ?? { q, groups: [], tookMs: 0 }
}

const searchService = { globalSearch }

export default searchService
