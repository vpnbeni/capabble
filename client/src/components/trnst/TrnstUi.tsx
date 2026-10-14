import React from 'react'
import { Badge, type Tone } from '@/components/ui'
import type { RouteShift, TransportRoute, TransportVehicle, VehicleStatus } from '@/services/trnstService'
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
