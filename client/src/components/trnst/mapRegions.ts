/**
 * Self-hosted map areas. Each area is one .pmtiles file in the map bucket, listed in
 * regions.json next to the files:
 *
 *   { "regions": [ { "id": "north-india", "name": "Punjab, Haryana, Chandigarh, Delhi",
 *       "file": "north-india.pmtiles", "bbox": [73.8, 27.6, 77.6, 32.6], "maxZoom": 15 } ] }
 *
 * bbox is [west, south, east, north] in degrees. A map uses an area only when everything
 * it shows falls inside it; otherwise it uses public OpenStreetMap tiles. Adding a state
 * is an upload plus an edit to regions.json, no deploy.
 */

export type MapRegion = {
  id: string
  name: string
  url: string
  bbox: [west: number, south: number, east: number, north: number]
  maxZoom: number
}

// Set VITE_MAP_REGIONS_URL=off to always use public OpenStreetMap tiles.
const REGIONS_URL = import.meta.env.VITE_MAP_REGIONS_URL || 'https://tiles.capabble.tech/regions.json'
// Don't hold the map back for long if the bucket can't be reached.
const TIMEOUT_MS = 4000

const isBbox = (value: unknown): value is MapRegion['bbox'] =>
  Array.isArray(value)
  && value.length === 4
  && value.every((n) => typeof n === 'number' && Number.isFinite(n))
  && value[0] < value[2]
  && value[1] < value[3]

/** The file answers a small range request, so a missing upload falls back instead of showing a blank map. */
const isReachable = async (url: string) => {
  try {
    const response = await fetch(url, { headers: { Range: 'bytes=0-126' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    return response.status === 206 || response.status === 200
  } catch {
    return false
  }
}

const loadRegions = async (): Promise<MapRegion[]> => {
  if (!REGIONS_URL || REGIONS_URL === 'off') return []
  try {
    const response = await fetch(REGIONS_URL, { cache: 'no-cache', signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) return []
    const body = await response.json()
    const listed: MapRegion[] = (Array.isArray(body?.regions) ? body.regions : [])
      .filter((row: any) => row && typeof row.file === 'string' && isBbox(row.bbox))
      .map((row: any) => ({
        id: String(row.id || row.file),
        name: String(row.name || row.id || row.file),
        url: new URL(row.file, REGIONS_URL).toString(),
        bbox: row.bbox,
        maxZoom: Number(row.maxZoom) > 0 ? Number(row.maxZoom) : 15,
      }))
    const reachable = await Promise.all(listed.map((region) => isReachable(region.url)))
    return listed.filter((_, index) => reachable[index])
  } catch {
    return []
  }
}

// One load per page visit, shared by every map on screen.
let regionsPromise: Promise<MapRegion[]> | null = null
export const getMapRegions = () => {
  if (!regionsPromise) regionsPromise = loadRegions()
  return regionsPromise
}

const contains = (region: MapRegion, point: { lat: number; lng: number }) => {
  const [west, south, east, north] = region.bbox
  return point.lng >= west && point.lng <= east && point.lat >= south && point.lat <= north
}

/** The first area that holds every point, or null when the points span areas or there are none. */
export const regionForPoints = (regions: MapRegion[], points: Array<{ lat: number; lng: number }>) => {
  if (!points.length) return null
  return regions.find((region) => points.every((point) => contains(region, point))) || null
}
