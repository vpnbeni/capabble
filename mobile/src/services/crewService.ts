import { api } from '@/lib/api'

// The bus crew's own screens (/api/trnst/crew): their bus and routes, starting and ending a trip,
// and marking students on and off. Sharing the bus's location waits for the location build.

export type Direction = 'pickup' | 'drop'
export const DIRECTION_LABELS: Record<Direction, string> = { pickup: 'Morning pickup', drop: 'Afternoon drop' }

export interface CrewStop {
  id: string
  name: string
  landmark: string
  pickupTime: string
  dropTime: string
  sequence: number
}

export interface CrewRoute {
  _id: string
  name: string
  code?: string
  /** Which trips the route runs: morning, afternoon or both. */
  shift: 'morning' | 'afternoon' | 'both'
  stops: CrewStop[]
}

export interface CrewVehicle {
  _id: string
  busNo: string
  registrationNumber: string
  driverName?: string
  conductorName?: string
  status: string
  routes: CrewRoute[]
}

export interface CrewTrip {
  _id: string
  vehicleId: string
  routeId: string
  direction: Direction
  serviceDate: string
  status: 'active' | 'ended' | string
  startedAt: string
  endedAt?: string | null
}

export type BoardingEvent = 'boarded' | 'dropped' | 'absent'

export interface RosterStudent {
  studentId: string
  name: string
  rollNumber: string
  className: string
  section: string
  guardianPhone: string
  marks: Partial<Record<BoardingEvent, { at: string; method: string }>>
}

export interface Roster {
  trip: CrewTrip
  route: { _id: string; name: string; code?: string } | null
  stops: { stop: { id: string; name: string; pickupTime?: string; dropTime?: string }; students: RosterStudent[] }[]
  counts: { assigned: number; boarded: number; dropped: number; absent: number }
}

/** One student on the crew's route: class, stop, class teacher and family to call. */
export interface CrewStudentCard {
  student: { studentId: string; name: string; rollNumber: string; className: string; section: string; profileImage: string | null }
  stop: { name: string; pickupTime?: string; dropTime?: string } | null
  classTeacher: { name: string; phone: string } | null
  family: { relation: 'Father' | 'Mother' | 'Guardian' | 'Parent'; name: string; phone: string }[]
}

export const crewService = {
  me: () => api.get<{ today: string; vehicles: CrewVehicle[]; trips: CrewTrip[] }>('/trnst/crew/me'),
  /** Starts the trip, or resumes it when this bus is already on it. */
  start: (input: { routeId: string; direction: Direction }) => api.post<CrewTrip>('/trnst/crew/trips', input),
  end: (tripId: string) => api.post<CrewTrip>(`/trnst/crew/trips/${encodeURIComponent(tripId)}/end`),
  student: (tripId: string, studentId: string) =>
    api.get<CrewStudentCard>(`/trnst/crew/trips/${encodeURIComponent(tripId)}/students/${encodeURIComponent(studentId)}`),
  roster: (tripId: string) => api.get<Roster>(`/trnst/crew/trips/${encodeURIComponent(tripId)}/roster`),
  /** Marks one student; families get a notification for on the bus and dropped. */
  mark: (tripId: string, input: { studentId: string; event: BoardingEvent }) =>
    api.post<unknown>(`/trnst/crew/trips/${encodeURIComponent(tripId)}/boarding`, { ...input, method: 'manual' }),
}
