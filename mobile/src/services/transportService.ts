import { api } from '@/lib/api'

// School transport (/api/trnst) for the office and the principal: the website's Transport →
// Today, Routes, Vehicles, Students and Own way. Crew screens and the live map need the location build.

export type Shift = 'pickup' | 'drop' | 'both'
export const SHIFT_LABELS: Record<Shift, string> = { pickup: 'Morning only', drop: 'Afternoon only', both: 'Both ways' }

export interface Vehicle {
  _id: string
  busNo: string
  registrationNumber: string
  vehicleType?: string
  make?: string
  model?: string
  capacity?: number
  driverName?: string
  driverPhone?: string
  conductorName?: string
  conductorPhone?: string
  insuranceExpiry?: string | null
  fitnessExpiry?: string | null
  status: 'active' | 'maintenance' | 'inactive' | string
}

export interface Stop {
  _id: string
  name: string
  landmark?: string
  pickupTime?: string
  dropTime?: string
  sequence: number
}

export interface Route {
  _id: string
  name: string
  code?: string
  shift: Shift
  startPoint?: string
  endPoint?: string
  distanceKm?: number
  vehicleId?: Pick<Vehicle, '_id' | 'busNo' | 'registrationNumber' | 'capacity' | 'driverName'> | null
  stops: Stop[]
}

export interface Rider {
  studentId: string
  name: string
  rollNumber: string
  className: string
  section: string
  selfCommute: string | null
  assignment: { _id: string; routeId: string; stopId: string | null; stopName: string; shift: Shift } | null
}

export interface Trip {
  _id: string
  direction: 'pickup' | 'drop'
  status: 'active' | 'ended' | string
  startedAt: string
  endedAt?: string | null
  startedByName?: string
  staleSeconds: number | null
  vehicle: Pick<Vehicle, '_id' | 'busNo' | 'registrationNumber' | 'driverName' | 'driverPhone' | 'conductorName'> | null
  route: { _id: string; name: string; code?: string } | null
  counts: { assigned: number; boarded: number; dropped: number; absent: number }
}

export interface OwnWay {
  _id: string
  studentId: string
  name: string
  rollNumber: string
  className: string
  section: string
  commuteMode: string
  guardianPhone?: string
  notes?: string
}

/** Schools type the bus number as "7" or as "Bus 7"; show "Bus 7" either way. */
export const busTitle = (busNo?: string) => {
  const value = String(busNo ?? '').trim()
  if (!value) return 'School bus'
  return /^bus\b/i.test(value) ? value : `Bus ${value}`
}

/** "1 student", "3 students". */
export const many = (n: number, one: string, more = `${one}s`) => `${n} ${n === 1 ? one : more}`

export const transportService = {
  trips: async () => (await api.get<{ date: string; trips: Trip[] }>('/trnst/trips')).trips,
  routes: () => api.get<Route[]>('/trnst/routes'),
  vehicles: () => api.get<Vehicle[]>('/trnst/vehicles'),
  riders: async (routeId?: string) => (await api.get<{ rows: Rider[] }>('/trnst/assignments', { routeId: routeId || undefined })).rows,
  ownWay: async () => (await api.get<{ records: OwnWay[] }>('/trnst/self-students')).records,
  /** Puts one student on a route (and stop); replaces only that student's assignment. */
  assign: (input: { studentId: string; routeId: string; stopId?: string | null; shift: Shift }) =>
    api.post<{ assigned: number }>('/trnst/assignments/bulk', { studentIds: [input.studentId], routeId: input.routeId, stopId: input.stopId || undefined, shift: input.shift }),
  remove: (studentId: string) => api.delete<unknown>(`/trnst/assignments/${encodeURIComponent(studentId)}`),
}
