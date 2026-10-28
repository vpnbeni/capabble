/**
 * Geometry for showing a school vehicle moving along the road, used by the web map and
 * the app's map. The server sends a route's road as an encoded polyline; these helpers
 * put the vehicle on that road, step it along the road between two GPS fixes (so it
 * turns corners instead of cutting across blocks), and work out how far it is from a stop.
 */

export type LatLng = { lat: number; lng: number }
/** A point on the vehicle's way, with the direction it faces (degrees from north). */
export type Frame = LatLng & { bearing: number }

export type RoadLine = {
  points: LatLng[]
  /** Metres from the start of the road to each point. */
  cum: number[]
  total: number
}

/** A fix this close to the road is drawn on the road. */
export const SNAP_M = 45
/** Further than this from the road, the vehicle is off its route (a detour). */
const ON_ROUTE_M = 150

const RAD = Math.PI / 180
const EARTH_M = 6371008.8

/** Google's encoded polyline format, precision 5. */
export function decodePolyline(text: string): LatLng[] {
  const points: LatLng[] = []
  let index = 0
  let lat = 0
  let lng = 0
  const next = () => {
    let result = 0
    let shift = 0
    let byte = 0
    do {
      byte = text.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20 && index < text.length)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (index < text.length) {
    lat += next()
    lng += next()
    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * RAD
  const dLng = (b.lng - a.lng) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export function bearingDeg(a: LatLng, b: LatLng): number {
  const y = Math.sin((b.lng - a.lng) * RAD) * Math.cos(b.lat * RAD)
  const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lng - a.lng) * RAD)
  return (Math.atan2(y, x) / RAD + 360) % 360
}

/** Smallest turn from one bearing to another, -180..180. */
export function turnDeg(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180
}

export function roadLine(points: LatLng[] | null | undefined): RoadLine | null {
  if (!points || points.length < 2) return null
  const cum = [0]
  for (let i = 1; i < points.length; i += 1) cum.push(cum[i - 1] + distanceM(points[i - 1], points[i]))
  return { points, cum, total: cum[cum.length - 1] }
}

export function roadLineFromPolyline(polyline?: string | null): RoadLine | null {
  return polyline ? roadLine(decodePolyline(polyline)) : null
}

/** The nearest place on the road to a point: how far along the road it is and how far off it. */
export function locate(line: RoadLine, point: LatLng): { along: number; offM: number } {
  // Flat metres around the point; plenty accurate for the few hundred metres that matter.
  const kx = 111320 * Math.cos(point.lat * RAD)
  const ky = 110540
  let best = { along: 0, offM: Infinity }
  for (let i = 0; i < line.points.length - 1; i += 1) {
    const a = line.points[i]
    const b = line.points[i + 1]
    const ax = (a.lng - point.lng) * kx
    const ay = (a.lat - point.lat) * ky
    const dx = (b.lng - a.lng) * kx
    const dy = (b.lat - a.lat) * ky
    const lengthSq = dx * dx + dy * dy
    const t = lengthSq ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq)) : 0
    const off = Math.hypot(ax + t * dx, ay + t * dy)
    if (off < best.offM) best = { along: line.cum[i] + t * (line.cum[i + 1] - line.cum[i]), offM: off }
  }
  return best
}

/** The point `along` metres down the road, facing down the road. */
export function pointAt(line: RoadLine, along: number): Frame {
  const target = Math.max(0, Math.min(line.total, along))
  let i = 0
  while (i < line.points.length - 2 && line.cum[i + 1] < target) i += 1
  const a = line.points[i]
  const b = line.points[i + 1]
  const span = line.cum[i + 1] - line.cum[i]
  const t = span ? (target - line.cum[i]) / span : 0
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, bearing: bearingDeg(a, b) }
}

/** The road between two distances along it, in the order given (so `from > to` runs backwards). */
export function sliceLine(line: RoadLine, from: number, to: number): LatLng[] {
  const lo = Math.max(0, Math.min(from, to))
  const hi = Math.min(line.total, Math.max(from, to))
  const inner = line.points.filter((_, i) => line.cum[i] > lo && line.cum[i] < hi)
  const start = pointAt(line, lo)
  const end = pointAt(line, hi)
  const out = [{ lat: start.lat, lng: start.lng }, ...inner, { lat: end.lat, lng: end.lng }]
  return from <= to ? out : out.reverse()
}

/** Turn a list of points into frames, each facing the next point. */
function framesFor(points: LatLng[], fallbackBearing: number): Frame[] {
  return points.map((point, i) => {
    const ahead = points[i + 1]
    const behind = points[i - 1]
    const bearing = ahead && distanceM(point, ahead) > 0.5
      ? bearingDeg(point, ahead)
      : behind && distanceM(behind, point) > 0.5 ? bearingDeg(behind, point) : fallbackBearing
    return { lat: point.lat, lng: point.lng, bearing }
  })
}

/**
 * Where to draw a vehicle reported at `point`: on the road when it is close to it,
 * facing the way the road runs that is nearest its GPS heading.
 */
export function placeOnRoad(line: RoadLine | null, point: LatLng, heading?: number | null): Frame {
  const fallback = typeof heading === 'number' ? heading : 0
  if (!line) return { ...point, bearing: fallback }
  const spot = locate(line, point)
  if (spot.offM > SNAP_M) return { ...point, bearing: fallback }
  const onRoad = pointAt(line, spot.along)
  const bearing = typeof heading === 'number' && Math.abs(turnDeg(onRoad.bearing, heading)) > 90
    ? (onRoad.bearing + 180) % 360
    : onRoad.bearing
  return { lat: onRoad.lat, lng: onRoad.lng, bearing }
}

/**
 * The way from where the vehicle is drawn now to its new fix: along the road when both
 * are on it and the road distance is believable, straight otherwise. First frame is
 * `from`, last is where to draw the vehicle at the end.
 */
export function travelFrames(line: RoadLine | null, from: Frame, to: LatLng, heading?: number | null): Frame[] {
  const straight = distanceM(from, to)
  if (line) {
    const a = locate(line, from)
    const b = locate(line, to)
    const byRoad = Math.abs(b.along - a.along)
    if (a.offM <= SNAP_M && b.offM <= SNAP_M && byRoad <= Math.max(straight * 3, straight + 300)) {
      if (byRoad < 1) return [from]
      return framesFor(sliceLine(line, a.along, b.along), from.bearing)
    }
  }
  if (straight < 1) return [from]
  const end = { ...to, bearing: typeof heading === 'number' ? heading : bearingDeg(from, to) }
  return [{ ...from, bearing: bearingDeg(from, to) }, end]
}

/** Position and facing a fraction `t` (0–1) of the way through the frames, at an even speed. */
export function frameAt(frames: Frame[], t: number): Frame {
  if (frames.length === 1 || t <= 0) return frames[0]
  if (t >= 1) return frames[frames.length - 1]
  const lengths = [0]
  for (let i = 1; i < frames.length; i += 1) lengths.push(lengths[i - 1] + distanceM(frames[i - 1], frames[i]))
  const total = lengths[lengths.length - 1]
  if (!total) return frames[frames.length - 1]
  const target = t * total
  let i = 0
  while (i < frames.length - 2 && lengths[i + 1] < target) i += 1
  const span = lengths[i + 1] - lengths[i]
  const f = span ? (target - lengths[i]) / span : 1
  const a = frames[i]
  const b = frames[i + 1]
  return { lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, bearing: a.bearing }
}

type TimedStop = { pickupTime?: string | null; dropTime?: string | null }

/**
 * Whether the vehicle drives the road from its first stop to its last on this trip.
 * Read from the stop times; without them, pickups run in stop order and drops in reverse.
 */
export function runsForward(stops: TimedStop[], direction: 'pickup' | 'drop'): boolean {
  const field = direction === 'pickup' ? 'pickupTime' : 'dropTime'
  const timed = stops.map((stop) => stop[field]).filter((time): time is string => Boolean(time))
  if (timed.length >= 2 && timed[0] !== timed[timed.length - 1]) return timed[0] < timed[timed.length - 1]
  return direction === 'pickup'
}

export type TripProgress = {
  /** Metres along the road where the vehicle is. */
  busAlong: number
  forward: boolean
  /** Road metres still to drive to the stop (null when it has passed it or there is no stop). */
  toStopM: number | null
  /** Rough minutes to the stop at the route's usual pace. */
  toStopMin: number | null
  passedStop: boolean
}

/** How far down the road the vehicle is, and how far it still has to go to `stop`. Null when it is off the route. */
export function tripProgress(
  line: RoadLine,
  bus: LatLng,
  opts: { forward: boolean; stop?: LatLng | null; distanceM?: number; durationS?: number }
): TripProgress | null {
  const here = locate(line, bus)
  if (here.offM > ON_ROUTE_M) return null
  let toStopM: number | null = null
  let passedStop = false
  if (opts.stop) {
    const stopAlong = locate(line, opts.stop).along
    const ahead = opts.forward ? stopAlong - here.along : here.along - stopAlong
    if (ahead < -60) passedStop = true
    else toStopM = Math.max(0, ahead)
  }
  // Routing times are for a car; a school bus with stops runs about a third slower.
  const pace = opts.distanceM && opts.durationS ? (opts.durationS * 1.3) / opts.distanceM : null
  const toStopMin = toStopM !== null && pace ? Math.max(1, Math.round((toStopM * pace) / 60)) : null
  return { busAlong: here.along, forward: opts.forward, toStopM, toStopMin, passedStop }
}

/** The road split at the vehicle: the part already driven and the part still ahead. */
export function splitAtBus(line: RoadLine, busAlong: number, forward: boolean): { driven: LatLng[]; ahead: LatLng[] } {
  return forward
    ? { driven: sliceLine(line, 0, busAlong), ahead: sliceLine(line, busAlong, line.total) }
    : { driven: sliceLine(line, line.total, busAlong), ahead: sliceLine(line, busAlong, 0) }
}
