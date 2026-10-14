/**
 * Per-tenant, per-user palette memory kept in localStorage: recent searches,
 * recently opened results and page-visit counts (for "Frequently used").
 * Every access is guarded — private mode or blocked storage just means no history.
 */
export type StoredItem = {
  id: string
  kind: 'page' | 'record' | 'module' | 'action'
  type?: string
  title: string
  subtitle?: string
  path: string
}

type Visit = { count: number; last: number }

type PaletteMemory = {
  recentSearches: string[]
  recentItems: StoredItem[]
  visits: Record<string, Visit>
}

const VERSION = 'v1'
const MAX_RECENT_SEARCHES = 6
const MAX_RECENT_ITEMS = 6
const MAX_VISITS = 80

const empty = (): PaletteMemory => ({ recentSearches: [], recentItems: [], visits: {} })

export const memoryKey = (tenant: string | null | undefined, userId: string | null | undefined) =>
  `cb:cmdk:${VERSION}:${tenant || 'default'}:${userId || 'anon'}`

export const readMemory = (key: string): PaletteMemory => {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<PaletteMemory>
    return {
      recentSearches: Array.isArray(parsed.recentSearches) ? parsed.recentSearches : [],
      recentItems: Array.isArray(parsed.recentItems) ? parsed.recentItems : [],
      visits: parsed.visits && typeof parsed.visits === 'object' ? parsed.visits : {},
    }
  } catch {
    return empty()
  }
}

const writeMemory = (key: string, memory: PaletteMemory) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(memory))
  } catch {
    // Storage full or blocked — history is a convenience, so ignore.
  }
}

const update = (key: string, change: (memory: PaletteMemory) => PaletteMemory) => {
  const next = change(readMemory(key))
  writeMemory(key, next)
  return next
}

export const addRecentSearch = (key: string, query: string) => {
  const value = query.trim()
  if (value.length < 2) return readMemory(key)
  return update(key, (memory) => ({
    ...memory,
    recentSearches: [value, ...memory.recentSearches.filter((entry) => entry.toLowerCase() !== value.toLowerCase())]
      .slice(0, MAX_RECENT_SEARCHES),
  }))
}

export const addRecentItem = (key: string, item: StoredItem) =>
  update(key, (memory) => ({
    ...memory,
    recentItems: [item, ...memory.recentItems.filter((entry) => entry.path !== item.path)].slice(0, MAX_RECENT_ITEMS),
  }))

export const removeRecentSearch = (key: string, query: string) =>
  update(key, (memory) => ({ ...memory, recentSearches: memory.recentSearches.filter((entry) => entry !== query) }))

export const clearHistory = (key: string) =>
  update(key, (memory) => ({ ...memory, recentSearches: [], recentItems: [] }))

export const recordVisit = (key: string, path: string) => {
  update(key, (memory) => {
    const previous = memory.visits[path]
    const visits = { ...memory.visits, [path]: { count: (previous?.count ?? 0) + 1, last: Date.now() } }
    const paths = Object.keys(visits)
    if (paths.length > MAX_VISITS) {
      paths
        .sort((left, right) => visits[left].last - visits[right].last)
        .slice(0, paths.length - MAX_VISITS)
        .forEach((stale) => delete visits[stale])
    }
    return { ...memory, visits }
  })
}

/** Frecency: visit count weighted by how recently the page was used (Firefox-style buckets). */
const recencyWeight = (last: number) => {
  const hours = (Date.now() - last) / 36e5
  if (hours < 4) return 100
  if (hours < 24) return 70
  if (hours < 24 * 3) return 50
  if (hours < 24 * 7) return 30
  if (hours < 24 * 30) return 15
  return 5
}

export const topVisitedPaths = (memory: PaletteMemory, limit: number): string[] =>
  Object.entries(memory.visits)
    .map(([path, visit]) => ({ path, score: Math.min(visit.count, 50) * recencyWeight(visit.last) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ path }) => path)
