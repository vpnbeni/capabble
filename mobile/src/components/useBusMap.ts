import { useEffect, useMemo, useRef } from 'react'

import { locate, placeOnRoad, roadLineFromPolyline, SNAP_M, travelFrames, type Frame, type RoadLine } from '@capabble/shared/roadPath'
import { VEHICLE_SIZE, vehicleKind, vehicleSvg } from '@capabble/shared/vehicleArt'

import { useTheme } from '@/theme/ThemeProvider'

export type BusMapStop = { id?: string; name: string; lat?: number | null; lng?: number | null }
export type BusMapProps = {
  stops: BusMapStop[]
  myStopId?: string
  /** The road through the stops (encoded polyline); without it the stops are joined by a dashed line. */
  roadPath?: string | null
  /** Which way the vehicle drives the road on this trip. */
  forward: boolean
  bus?: { lat: number; lng: number; heading?: number | null } | null
  vehicleType?: string
  /** The number shown next to the vehicle. */
  label: string
  stale?: boolean
  /** Spoken name of the map. */
  accessibilityLabel: string
}

const TILE_URL = process.env.EXPO_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = process.env.EXPO_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; OpenStreetMap contributors'
// Locations arrive about every 10 s; the vehicle drives over most of that so it keeps moving.
const MOVE_MS = 9000
// A longer jump (a signal gap) is drawn at once.
const JUMP_M = 3000

const withAlong = (line: RoadLine | null, frame: Frame) => {
  if (!line) return frame
  const spot = locate(line, frame)
  return spot.offM <= SNAP_M ? { ...frame, along: spot.along } : frame
}

/**
 * Sends the map what to draw once its page is `ready`: the route, then the vehicle's
 * way from where it is drawn to each new location. `send` must be stable.
 */
export function useBusMap(props: BusMapProps, ready: boolean, send: (message: string) => void) {
  const { colors } = useTheme()
  const line = useMemo(() => roadLineFromPolyline(props.roadPath), [props.roadPath])
  const shown = useRef<Frame | null>(null)

  const scene = useMemo(() => {
    const stops = props.stops
      .filter((stop): stop is BusMapStop & { lat: number; lng: number } => typeof stop.lat === 'number' && typeof stop.lng === 'number')
      .map((stop) => ({ lat: stop.lat, lng: stop.lng, mine: Boolean(props.myStopId && stop.id === props.myStopId) }))
    return JSON.stringify({
      type: 'scene',
      road: line ? line.points.map((point) => [point.lat, point.lng]) : null,
      cum: line ? line.cum : null,
      stops,
      forward: props.forward,
      colors: { accent: colors['accent-strong'], surface: colors.surface, ink: colors.ink, inkSubtle: colors['ink-subtle'], border: colors.border },
      tileUrl: TILE_URL,
      attribution: ATTRIBUTION,
    })
  }, [line, props.stops, props.myStopId, props.forward, colors])

  useEffect(() => {
    if (ready) send(scene)
  }, [ready, scene, send])

  const { bus, vehicleType, label, stale } = props
  const lat = bus?.lat
  const lng = bus?.lng
  const heading = bus?.heading
  useEffect(() => {
    if (!ready || typeof lat !== 'number' || typeof lng !== 'number') return
    const bus = { lat, lng, heading }
    const to = { lat: bus.lat, lng: bus.lng }
    const from = shown.current
    let frames = from ? travelFrames(line, from, to, bus.heading) : [placeOnRoad(line, to, bus.heading)]
    const end = frames[frames.length - 1]
    const jumped = from && Math.hypot(end.lat - from.lat, end.lng - from.lng) * 111000 > JUMP_M
    if (jumped) frames = [end]
    shown.current = end
    const kind = vehicleKind(vehicleType)
    send(JSON.stringify({
      type: 'vehicle',
      frames: frames.map((frame) => withAlong(line, frame)),
      durationMs: frames.length > 1 ? MOVE_MS : 0,
      svg: vehicleSvg(kind),
      width: VEHICLE_SIZE[kind].width,
      height: VEHICLE_SIZE[kind].height,
      label,
      stale: Boolean(stale),
    }))
  }, [ready, send, lat, lng, heading, line, vehicleType, label, stale])
}
