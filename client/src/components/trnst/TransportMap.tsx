import React, { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
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
  /** Last position is old: drawn muted. */
  stale?: boolean
  onClick?: () => void
}

type Props = {
  stops?: Array<Pick<PublicStop, 'id' | 'name' | 'lat' | 'lng'> & Partial<PublicStop>>
  myStopId?: string
  buses?: MapBus[]
  trail?: Array<{ lat: number; lng: number }>
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

const busIcon = (bus: MapBus) =>
  L.divIcon({
    className: '',
    html: `<span class="tr-bus${bus.stale ? ' tr-bus--stale' : ''}">`
      + (typeof bus.heading === 'number' ? `<span class="tr-bus__arrow" style="transform:rotate(${Math.round(bus.heading)}deg)"></span>` : '')
      + `<span class="tr-bus__label">${escapeHtml(bus.label)}</span></span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })

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

const TransportMap: React.FC<Props> = ({ stops = [], myStopId, buses = [], trail, pick, fitKey, followBusId, focus, label, className }) => {
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

  return (
    <div className={cx('tr-map', className)} role="region" aria-label={label}>
      <MapContainer center={points[0] || DEFAULT_CENTER} zoom={points.length ? 14 : 5} scrollWheelZoom className="tr-map__canvas">
        <BaseLayer points={points} />
        <SizeWatcher />
        <FitView points={points} fitKey={fitKey} />
        {followBusId ? <FollowBus bus={buses.find((bus) => bus.id === followBusId)} /> : null}
        {pick ? <PickHandler onPick={pick.onChange} /> : null}
        {focus ? <FocusView focus={focus} /> : null}

        {routeLine.length > 1 ? <Polyline positions={routeLine} pathOptions={{ className: 'tr-map__route' }} /> : null}
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
          <Marker
            key={bus.id}
            position={[bus.lat, bus.lng]}
            icon={busIcon(bus)}
            zIndexOffset={1000}
            eventHandlers={bus.onClick ? { click: bus.onClick } : undefined}
          >
            <Tooltip direction="top" offset={[0, -16]}>{bus.label}</Tooltip>
          </Marker>
        ))}

        {pick?.value ? <Marker position={[pick.value.lat, pick.value.lng]} icon={pickIcon} /> : null}
      </MapContainer>
    </div>
  )
}

export default TransportMap
