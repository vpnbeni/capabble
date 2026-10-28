import React, { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import {
  frameAt, placeOnRoad, roadLineFromPolyline, splitAtBus, travelFrames, turnDeg, locate,
  type Frame, type LatLng, type RoadLine,
} from '@capabble/shared/roadPath'
import { VEHICLE_SIZE, vehicleKind, vehicleSvg } from '@capabble/shared/vehicleArt'
import { cx } from '@/components/ui'
import type { PublicStop } from '@/services/trnstService'
import { leafletLayer } from 'protomaps-leaflet'
import { getMapRegions, regionForPoints, type MapRegion } from './mapRegions'
import './trnst.css'

const TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = import.meta.env.VITE_MAP_TILE_ATTRIBUTION || '&copy; OpenStreetMap contributors'
// Centre of India, for a map with nothing on it yet.
const DEFAULT_CENTER: L.LatLngTuple = [22.6, 79.0]

export type MapBus = {
  id: string
  lat: number
  lng: number
  heading?: number | null
  label: string
  /** The vehicle record's type (Bus, Van, Auto…); picks the picture on the map. */
  vehicleType?: string
  /** The road this vehicle's route follows (encoded polyline), so it moves along the road. */
  roadPath?: string | null
  /** Last position is old: drawn muted. */
  stale?: boolean
  onClick?: () => void
}

type Props = {
  stops?: Array<Pick<PublicStop, 'id' | 'name' | 'lat' | 'lng'> & Partial<PublicStop>>
  myStopId?: string
  buses?: MapBus[]
  trail?: Array<{ lat: number; lng: number }>
  /** The road through the stops (encoded polyline). Without it the stops are joined by a dashed line. */
  roadPath?: string | null
  /** Which way the followed vehicle drives the road; the part behind it is drawn as driven. */
  roadForward?: boolean
  /** Click-to-place mode for setting a stop's position. */
  pick?: { value: { lat: number; lng: number } | null; onChange: (point: { lat: number; lng: number }) => void }
  /** Change this to re-fit the view to everything on the map. */
  fitKey?: string
  /** Keep this bus in view as it moves (until the user pans). */
  followBusId?: string
  /** Fly here whenever `key` changes (a search result, the user's location). */
  focus?: { key: string; lat: number; lng: number; zoom?: number }
  label: string
  className?: string
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string)

const stopIcon = (index: number, mine: boolean) =>
  L.divIcon({
    className: '',
    html: `<span class="tr-pin${mine ? ' tr-pin--mine' : ''}">${index + 1}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })

const VEHICLE_BOX = 60

const vehicleIcon = (type: string | undefined, label: string) => {
  const kind = vehicleKind(type)
  const { width, height } = VEHICLE_SIZE[kind]
  return L.divIcon({
    className: '',
    html: `<span class="tr-veh tr-veh--${kind}">`
      + '<span class="tr-veh__halo"></span>'
      + `<span class="tr-veh__body" style="width:${width}px;height:${height}px">${vehicleSvg(kind)}</span>`
      + `<span class="tr-veh__label">${escapeHtml(label)}</span></span>`,
    iconSize: [VEHICLE_BOX, VEHICLE_BOX],
    iconAnchor: [VEHICLE_BOX / 2, VEHICLE_BOX / 2],
  })
}

// Locations arrive about every 10 s; spread the drive over most of that so the vehicle keeps moving.
const MOVE_MS = 9000
// A jump this long (a signal gap, a new trip) is drawn at once, not driven.
const JUMP_M = 3000

const roadCache = new Map<string, RoadLine | null>()
const roadFor = (polyline?: string | null): RoadLine | null => {
  if (!polyline) return null
  if (!roadCache.has(polyline)) roadCache.set(polyline, roadLineFromPolyline(polyline))
  return roadCache.get(polyline) ?? null
}

/**
 * A vehicle that drives along its road from one location to the next (Rapido / Zomato
 * style) and turns with the road. Reports how far down the road it is for the driven line.
 */
const VehicleMarker: React.FC<{ bus: MapBus; onAlong?: (along: number) => void }> = ({ bus, onAlong }) => {
  const map = useMap()
  const marker = useRef<L.Marker | null>(null)
  const shown = useRef<Frame | null>(null)
  const rotation = useRef<number | null>(null)
  const raf = useRef<number | null>(null)
  const lastReport = useRef(0)
  const line = roadFor(bus.roadPath)
  const onClick = useRef(bus.onClick)
  const reportAlong = useRef(onAlong)
  onClick.current = bus.onClick
  reportAlong.current = onAlong

  const draw = (frame: Frame, final = false) => {
    shown.current = frame
    const target = marker.current
    if (!target) return
    target.setLatLng([frame.lat, frame.lng])
    // Turn the short way round, never a full spin from 359° to 1°.
    rotation.current = rotation.current === null ? frame.bearing : rotation.current + turnDeg(rotation.current, frame.bearing)
    const body = target.getElement()?.querySelector<HTMLElement>('.tr-veh__body')
    if (body) body.style.transform = `translate(-50%, -50%) rotate(${rotation.current.toFixed(1)}deg)`
    const now = performance.now()
    if (line && reportAlong.current && (final || now - lastReport.current > 400)) {
      lastReport.current = now
      reportAlong.current(locate(line, frame).along)
    }
  }

  useEffect(() => {
    const created = L.marker([bus.lat, bus.lng], { icon: vehicleIcon(bus.vehicleType, bus.label), zIndexOffset: 1000, keyboard: false })
      .bindTooltip(bus.label, { direction: 'top', offset: [0, -20] })
      .on('click', () => onClick.current?.())
      .addTo(map)
    marker.current = created
    rotation.current = null
    if (shown.current) draw(shown.current, true)
    return () => {
      created.remove()
      marker.current = null
    }
  }, [map, bus.vehicleType, bus.label])

  useEffect(() => {
    marker.current?.getElement()?.querySelector('.tr-veh')?.classList.toggle('tr-veh--stale', Boolean(bus.stale))
  }, [bus.stale, bus.vehicleType, bus.label])

  useEffect(() => {
    const to: LatLng = { lat: bus.lat, lng: bus.lng }
    const from = shown.current
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const frames = from ? travelFrames(line, from, to, bus.heading) : [placeOnRoad(line, to, bus.heading)]
    const end = frames[frames.length - 1]
    if (!from || frames.length === 1 || reduceMotion || document.hidden || Math.hypot(end.lat - from.lat, end.lng - from.lng) * 111000 > JUMP_M) {
      draw(end, true)
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / MOVE_MS)
      draw(frameAt(frames, t), t === 1)
      raf.current = t < 1 ? requestAnimationFrame(step) : null
    }
    raf.current = requestAnimationFrame(step)
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    }
  }, [bus.lat, bus.lng, bus.heading, line])

  return null
}

/** The road as navigation apps draw it: a light casing under a solid line, the driven part greyed. */
const RoadRoute: React.FC<{ line: RoadLine; drivenAlong?: number | null; forward?: boolean }> = ({ line, drivenAlong, forward = true }) => {
  const full = useMemo(() => line.points.map((point) => [point.lat, point.lng] as L.LatLngTuple), [line])
  const split = useMemo(
    () => (typeof drivenAlong === 'number' ? splitAtBus(line, drivenAlong, forward) : null),
    [line, drivenAlong, forward]
  )
  const toTuples = (points: LatLng[]) => points.map((point) => [point.lat, point.lng] as L.LatLngTuple)
  const round = { lineCap: 'round', lineJoin: 'round' } as const
  return (
    <>
      <Polyline positions={full} pathOptions={{ ...round, className: 'tr-map__road-casing' }} interactive={false} />
      {split ? (
        <>
          <Polyline positions={toTuples(split.driven)} pathOptions={{ ...round, className: 'tr-map__road tr-map__road--driven' }} interactive={false} />
          <Polyline positions={toTuples(split.ahead)} pathOptions={{ ...round, className: 'tr-map__road' }} interactive={false} />
        </>
      ) : (
        <Polyline positions={full} pathOptions={{ ...round, className: 'tr-map__road' }} interactive={false} />
      )}
    </>
  )
}

const pickIcon = L.divIcon({ className: '', html: '<span class="tr-pin tr-pin--mine tr-pin--pick"></span>', iconSize: [24, 24], iconAnchor: [12, 12] })

const hasPoint = (point: { lat?: number | null; lng?: number | null }) =>
  typeof point.lat === 'number' && typeof point.lng === 'number'

/** Fit the view to the given points whenever `fitKey` changes. */
const FitView: React.FC<{ points: L.LatLngTuple[]; fitKey?: string }> = ({ points, fitKey }) => {
  const map = useMap()
  const done = useRef<string | null>(null)
  useEffect(() => {
    const key = fitKey ?? 'once'
    if (done.current === key || !points.length) return
    done.current = key
    if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), 15))
    else map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 16 })
  }, [map, points, fitKey])
  return null
}

/** Pan to the followed bus as it moves, until the user drags the map. */
const FollowBus: React.FC<{ bus?: MapBus }> = ({ bus }) => {
  const map = useMap()
  const userMoved = useRef(false)
  useMapEvents({ dragstart: () => { userMoved.current = true } })
  useEffect(() => {
    if (bus && !userMoved.current) map.panTo([bus.lat, bus.lng], { animate: true })
  }, [map, bus?.lat, bus?.lng])
  return null
}

const FocusView: React.FC<{ focus: NonNullable<Props['focus']> }> = ({ focus }) => {
  const map = useMap()
  useEffect(() => {
    map.flyTo([focus.lat, focus.lng], focus.zoom ?? 17, { duration: 0.6 })
  }, [map, focus.key])
  return null
}

const PMTILES_ATTRIBUTION = '&copy; OpenStreetMap contributors &middot; Protomaps'
// Let people look a little past the edge of an area before the map stops them.
const REGION_PADDING_DEG = 0.25

/** Draws a self-hosted map area (.pmtiles), and keeps the view inside it so nothing shows blank. */
const RegionLayer: React.FC<{ region: MapRegion }> = ({ region }) => {
  const map = useMap()
  useEffect(() => {
    const layer = leafletLayer({
      url: region.url,
      flavor: 'light',
      lang: 'en',
      maxDataZoom: region.maxZoom,
      maxZoom: 19,
      attribution: PMTILES_ATTRIBUTION,
    }) as unknown as L.Layer
    layer.addTo(map)
    const [west, south, east, north] = region.bbox
    map.setMaxBounds(L.latLngBounds(
      [south - REGION_PADDING_DEG, west - REGION_PADDING_DEG],
      [north + REGION_PADDING_DEG, east + REGION_PADDING_DEG]
    ))
    return () => {
      map.removeLayer(layer)
      map.setMaxBounds(null as unknown as L.LatLngBounds)
    }
  }, [map, region.url])
  return null
}

/**
 * The map's background: our own map file when everything shown is inside one of its
 * areas, public OpenStreetMap tiles otherwise (other states, or before the file exists).
 */
const BaseLayer: React.FC<{ points: L.LatLngTuple[] }> = ({ points }) => {
  const [regions, setRegions] = useState<MapRegion[] | null>(null)
  useEffect(() => {
    let alive = true
    void getMapRegions().then((list) => { if (alive) setRegions(list) })
    return () => { alive = false }
  }, [])
  const region = useMemo(
    () => (regions ? regionForPoints(regions, points.map(([lat, lng]) => ({ lat, lng }))) : null),
    [regions, points]
  )
  if (!regions) return null
  return region ? <RegionLayer region={region} /> : <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
}

const PickHandler: React.FC<{ onPick: (point: { lat: number; lng: number }) => void }> = ({ onPick }) => {
  useMapEvents({ click: (event) => onPick({ lat: Number(event.latlng.lat.toFixed(6)), lng: Number(event.latlng.lng.toFixed(6)) }) })
  return null
}

/** Leaflet sizes itself on mount; inside a dialog or tab it must re-measure once visible. */
const SizeWatcher: React.FC = () => {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)
    return () => observer.disconnect()
  }, [map])
  return null
}

const TransportMap: React.FC<Props> = ({ stops = [], myStopId, buses = [], trail, roadPath, roadForward, pick, fitKey, followBusId, focus, label, className }) => {
  const placedStops = useMemo(() => stops.map((stop, index) => ({ stop, index })).filter(({ stop }) => hasPoint(stop)), [stops])

  const points = useMemo<L.LatLngTuple[]>(() => {
    const all: L.LatLngTuple[] = placedStops.map(({ stop }) => [stop.lat as number, stop.lng as number])
    buses.forEach((bus) => all.push([bus.lat, bus.lng]))
    trail?.forEach((point) => all.push([point.lat, point.lng]))
    if (pick?.value) all.push([pick.value.lat, pick.value.lng])
    return all
  }, [placedStops, buses, trail, pick?.value])

  const routeLine = useMemo<L.LatLngTuple[]>(
    () => placedStops.map(({ stop }) => [stop.lat as number, stop.lng as number]),
    [placedStops]
  )
  const road = roadFor(roadPath)
  // Grey out the road behind the followed vehicle (or the only one) once we know which way it drives.
  const drivingBusId = typeof roadForward === 'boolean' ? (followBusId || (buses.length === 1 ? buses[0].id : undefined)) : undefined
  const [drivenAlong, setDrivenAlong] = useState<number | null>(null)
  useEffect(() => setDrivenAlong(null), [drivingBusId, roadPath])

  return (
    <div className={cx('tr-map', className)} role="region" aria-label={label}>
      <MapContainer center={points[0] || DEFAULT_CENTER} zoom={points.length ? 14 : 5} scrollWheelZoom className="tr-map__canvas">
        <BaseLayer points={points} />
        <SizeWatcher />
        <FitView points={points} fitKey={fitKey} />
        {followBusId ? <FollowBus bus={buses.find((bus) => bus.id === followBusId)} /> : null}
        {pick ? <PickHandler onPick={pick.onChange} /> : null}
        {focus ? <FocusView focus={focus} /> : null}

        {road ? (
          <RoadRoute line={road} drivenAlong={drivingBusId ? drivenAlong : null} forward={roadForward} />
        ) : routeLine.length > 1 ? (
          <Polyline positions={routeLine} pathOptions={{ className: 'tr-map__route' }} />
        ) : null}
        {trail && trail.length > 1 ? (
          <Polyline positions={trail.map((point) => [point.lat, point.lng] as L.LatLngTuple)} pathOptions={{ className: 'tr-map__trail' }} />
        ) : null}

        {placedStops.map(({ stop, index }) => (
          <Marker key={stop.id || `${stop.name}-${index}`} position={[stop.lat as number, stop.lng as number]} icon={stopIcon(index, Boolean(myStopId) && stop.id === myStopId)}>
            <Tooltip direction="top" offset={[0, -10]}>
              {stop.name}
              {stop.pickupTime ? ` · pickup ${stop.pickupTime}` : ''}
              {stop.dropTime ? ` · drop ${stop.dropTime}` : ''}
            </Tooltip>
          </Marker>
        ))}

        {buses.map((bus) => (
          <VehicleMarker
            key={bus.id}
            bus={bus.roadPath === undefined && road ? { ...bus, roadPath } : bus}
            onAlong={bus.id === drivingBusId ? setDrivenAlong : undefined}
          />
        ))}

        {pick?.value ? <Marker position={[pick.value.lat, pick.value.lng]} icon={pickIcon} /> : null}
      </MapContainer>
    </div>
  )
}

export default TransportMap
