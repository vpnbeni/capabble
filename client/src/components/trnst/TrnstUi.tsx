import React from 'react'
import { Badge, type Tone } from '@/components/ui'
import type { RouteShift, TransportRoute, TransportVehicle, TripDirection, VehicleStatus } from '@/services/trnstService'
import './trnst.css'

export const errorMessage = (error: any, fallback: string) =>
  String(error?.response?.data?.message || error?.message || fallback)

export const VEHICLE_TYPES = ['Bus', 'Mini Bus', 'Van', 'Winger', 'Other'] as const

export const VEHICLE_STATUS: Record<VehicleStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' },
  maintenance: { label: 'Maintenance', tone: 'warning' },
  inactive: { label: 'Inactive', tone: 'neutral' },
}

export const VehicleStatusBadge: React.FC<{ status: VehicleStatus }> = ({ status }) => {
  const info = VEHICLE_STATUS[status] || VEHICLE_STATUS.inactive
  return <Badge tone={info.tone}>{info.label}</Badge>
}

export const SHIFT_LABEL: Record<RouteShift, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  both: 'Morning and afternoon',
}

/** "Bus 12" when the school numbers its buses, the number plate otherwise. */
export const vehicleName = (vehicle?: Pick<TransportVehicle, 'busNo' | 'registrationNumber' | 'vehicleType'> | null) => {
  if (!vehicle) return ''
  if (vehicle.busNo) return `${vehicle.vehicleType === 'Bus' || !vehicle.vehicleType ? 'Bus' : vehicle.vehicleType} ${vehicle.busNo}`
  return vehicle.registrationNumber || ''
}

export const routeVehicle = (route: TransportRoute) => (typeof route.vehicleId === 'object' ? route.vehicleId : null)

const DAY = 24 * 60 * 60 * 1000

/** Insurance and fitness papers that have lapsed or lapse within 30 days. */
export const papersDue = (vehicle: TransportVehicle, now = Date.now()) =>
  (
    [
      { label: 'Insurance', date: vehicle.insuranceExpiry },
      { label: 'Fitness', date: vehicle.fitnessExpiry },
    ] as const
  )
    .filter((paper) => paper.date)
    .map((paper) => ({ ...paper, days: Math.floor((new Date(paper.date as string).getTime() - now) / DAY) }))
    .filter((paper) => !Number.isNaN(paper.days) && paper.days <= 30)

export const PapersBadge: React.FC<{ vehicle: TransportVehicle }> = ({ vehicle }) => {
  const due = papersDue(vehicle)
  if (!due.length) return null
  const lapsed = due.some((paper) => paper.days < 0)
  const title = due
    .map((paper) => `${paper.label} ${paper.days < 0 ? 'expired' : `expires in ${paper.days} day${paper.days === 1 ? '' : 's'}`}`)
    .join(' · ')
  return (
    <Badge tone={lapsed ? 'danger' : 'warning'} title={title}>
      {lapsed ? 'Papers expired' : 'Papers due'}
    </Badge>
  )
}

/** Primary line with a muted second line, for the first column of a table. */
export const Entity: React.FC<{ primary: React.ReactNode; secondary?: React.ReactNode }> = ({ primary, secondary }) => (
  <div className="tr-entity">
    <span className="tr-entity__primary">{primary}</span>
    {secondary ? <span className="tr-entity__secondary">{secondary}</span> : null}
  </div>
)

export const DIRECTION_LABEL: Record<TripDirection, string> = { pickup: 'Pickup', drop: 'Drop' }

// A bus not heard from for this long is shown as "last seen …".
export const STALE_AFTER_SECONDS = 120

/** "just now", "40 s ago", "3 min ago", "2 h ago". */
export const agoLabel = (seconds: number | null | undefined) => {
  if (seconds === null || seconds === undefined) return 'No location yet'
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds} s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  return `${Math.floor(seconds / 3600)} h ago`
}

export const secondsSince = (iso?: string | null, now = Date.now()) =>
  iso ? Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000)) : null

/** Badge for a bus on a trip: live, last seen a while ago, or no location yet. */
export const LiveBadge: React.FC<{ seconds: number | null }> = ({ seconds }) => {
  if (seconds === null) return <Badge tone="warning">Waiting for location</Badge>
  if (seconds > STALE_AFTER_SECONDS) return <Badge tone="warning">Last seen {agoLabel(seconds)}</Badge>
  return <Badge tone="success">Live</Badge>
}

/** Straight-line metres between two points (haversine). */
export const distanceMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

/** "350 m", "1.4 km". */
export const distanceLabel = (meters: number) =>
  meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`
