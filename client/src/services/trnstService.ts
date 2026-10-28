import api from './api'

export type VehicleStatus = 'active' | 'maintenance' | 'inactive'
export type VehicleType = 'Bus' | 'Mini Bus' | 'Van' | 'Winger' | 'Car' | 'Auto' | 'Other'
export type RouteShift = 'morning' | 'afternoon' | 'both'

export type TransportVehicle = {
  _id: string
  busNo: string
  registrationNumber: string
  vehicleType: VehicleType
  make?: string
  model?: string
  color?: string
  capacity?: number
  driverId?: string | null
  driverName?: string
  driverPhone?: string
  conductorId?: string | null
  conductorName?: string
  conductorPhone?: string
  insuranceExpiry?: string | null
  fitnessExpiry?: string | null
  status: VehicleStatus
  notes?: string
}

export type TransportStop = {
  _id?: string
  name: string
  landmark?: string
  pickupTime?: string
  dropTime?: string
  sequence?: number
  lat?: number | null
  lng?: number | null
}

export type TransportRoute = {
  _id: string
  name: string
  code: string
  vehicleId?: TransportVehicle | string | null
  shift: RouteShift
  startPoint?: string
  endPoint?: string
  distanceKm?: number
  stops?: TransportStop[]
  isActive?: boolean
}

export type CommuteMode = 'Walk' | 'Bicycle' | 'Parent drop' | 'Own vehicle' | 'Other'

export type SelfStudentRecord = {
  _id: string
  studentId: string
  name: string
  rollNumber?: string
  className?: string
  section?: string
  commuteMode: CommuteMode
  guardianPhone?: string
  notes?: string
}

export type SelfStudentOption = {
  _id: string
  name: string
  rollNumber?: string
  class?: string
  section?: string
  guardianPhone?: string
  phone?: string
}

export type TransportOverview = {
  vehicles: TransportVehicle[]
  routes: TransportRoute[]
  selfStudents?: SelfStudentRecord[]
  stats: {
    vehicleCount: number
    routeCount: number
    activeVehicles: number
    maintenanceVehicles: number
    totalCapacity: number
    totalStops: number
    selfStudentCount?: number
  }
}

const getOverview = async () => {
  const response = await api.get('/trnst/overview')
  return response.data.data as TransportOverview
}

const getVehicles = async () => {
  const response = await api.get('/trnst/vehicles')
  return (response.data.data || []) as TransportVehicle[]
}

const saveVehicle = async (payload: Partial<TransportVehicle>, id?: string) => {
  if (id) return api.put(`/trnst/vehicles/${id}`, payload)
  return api.post('/trnst/vehicles', payload)
}

const deleteVehicle = async (id: string) => api.delete(`/trnst/vehicles/${id}`)

const getRoutes = async () => {
  const response = await api.get('/trnst/routes')
  return (response.data.data || []) as TransportRoute[]
}

const saveRoute = async (payload: Partial<TransportRoute>, id?: string) => {
  if (id) return api.put(`/trnst/routes/${id}`, payload)
  return api.post('/trnst/routes', payload)
}

const deleteRoute = async (id: string) => api.delete(`/trnst/routes/${id}`)

const getSelfStudents = async (params?: { className?: string; section?: string }) => {
  const response = await api.get('/trnst/self-students', { params })
  return (response.data.data || { records: [], availableStudents: [], classOptions: [] }) as {
    records: SelfStudentRecord[]
    availableStudents: SelfStudentOption[]
    classOptions: Array<{ className: string; sections: string[] }>
  }
}

const saveSelfStudent = async (payload: Partial<SelfStudentRecord> & { studentId?: string }, id?: string) => {
  if (id) return api.put(`/trnst/self-students/${id}`, payload)
  return api.post('/trnst/self-students', payload)
}

const deleteSelfStudent = async (id: string) => api.delete(`/trnst/self-students/${id}`)

export type TripDirection = 'pickup' | 'drop'
export type AssignmentShift = TripDirection | 'both'
export type BoardingEvent = 'boarded' | 'dropped' | 'absent'

export type GeoPoint = {
  lat: number
  lng: number
  accuracy?: number | null
  speed?: number | null
  heading?: number | null
  at: string
}

/** A stop as the crew screen, live view and portal see it. */
export type PublicStop = {
  id: string
  name: string
  landmark?: string
  pickupTime?: string
  dropTime?: string
  sequence?: number
  lat: number | null
  lng: number | null
}

/** The road through a route's stops, from the routing server (null when it couldn't be worked out). */
export type RoadPath = { polyline: string; distanceM: number; durationS: number }

export type TripCounts = { assigned: number; boarded: number; dropped: number; absent: number }

export type TripSummary = {
  _id: string
  direction: TripDirection
  serviceDate: string
  status: 'active' | 'ended'
  startedAt: string
  endedAt?: string | null
  endReason?: '' | 'crew' | 'stale' | 'admin'
  startedByName?: string
  lastLocation?: GeoPoint | null
  staleSeconds: number | null
  pingCount?: number
  vehicle: { _id: string; busNo: string; vehicleType?: VehicleType; registrationNumber: string; driverName?: string; driverPhone?: string; conductorName?: string } | null
  route: { _id: string; name: string; code: string; stops: PublicStop[]; roadPath?: RoadPath | null } | null
  counts: TripCounts
}

export type TripDetail = TripSummary & {
  trail: Array<{ lat: number; lng: number; at: string }>
  boarding: Array<{
    studentId: string
    name: string
    rollNumber: string
    className: string
    section: string
    event: BoardingEvent
    method: 'scan' | 'manual'
    at: string
    markedByName?: string
  }>
}

export type CrewTrip = {
  _id: string
  vehicleId: string
  routeId: string
  direction: TripDirection
  serviceDate: string
  status: 'active' | 'ended'
  startedAt: string
  endedAt?: string | null
  lastLocation?: GeoPoint | null
  pingCount?: number
}

export type CrewVehicle = {
  _id: string
  busNo: string
  registrationNumber: string
  vehicleType: VehicleType
  driverName?: string
  conductorName?: string
  status: VehicleStatus
  routes: Array<{ _id: string; name: string; code: string; shift: RouteShift; stops: PublicStop[] }>
}

export type RosterStudent = {
  studentId: string
  name: string
  rollNumber: string
  className: string
  section: string
  profileImage: string | null
  guardianPhone: string
  marks: Partial<Record<BoardingEvent, { at: string; method: 'scan' | 'manual' }>>
}

export type Roster = {
  trip: CrewTrip
  route: { _id: string; name: string; code: string } | null
  stops: Array<{ stop: Pick<PublicStop, 'id' | 'name'> & Partial<PublicStop>; students: RosterStudent[] }>
  counts: TripCounts
}

export type BoardingResult = {
  event: BoardingEvent
  at: string
  duplicate: boolean
  student: { studentId: string; name: string; className: string; section: string; profileImage: string | null }
}

export type AssignmentRow = {
  studentId: string
  name: string
  rollNumber: string
  className: string
  section: string
  selfCommute: string | null
  assignment: { _id: string; routeId: string; stopId: string | null; stopName: string; shift: AssignmentShift } | null
}

export type PlaceResult = { name: string; address: string; kind?: string; lat: number; lng: number }

/** Search OpenStreetMap places in India, nearest to `near` first. */
const searchPlaces = async (query: string, near?: { lat: number; lng: number } | null) => {
  const response = await api.get('/trnst/places', {
    params: { q: query, near: near ? `${near.lat},${near.lng}` : undefined },
    _silent: true,
  } as any)
  return (response.data.data || []) as PlaceResult[]
}

const getLive = async () => {
  const response = await api.get('/trnst/live', { _silent: true } as any)
  return response.data.data as { at: string; trips: TripSummary[] }
}

const getTrips = async (date?: string) => {
  const response = await api.get('/trnst/trips', { params: { date } })
  return response.data.data as { date: string; trips: TripSummary[] }
}

const getTrip = async (id: string) => {
  const response = await api.get(`/trnst/trips/${id}`)
  return response.data.data as TripDetail
}

const getAssignments = async (params?: { className?: string; section?: string; routeId?: string }) => {
  const response = await api.get('/trnst/assignments', { params })
  return response.data.data as { rows: AssignmentRow[]; classOptions: Array<{ className: string; sections: string[] }> }
}

const assignStudents = async (payload: { studentIds: string[]; routeId: string; stopId?: string; shift: AssignmentShift }) => {
  const response = await api.post('/trnst/assignments/bulk', payload, { _silent: true } as any)
  return response.data as { message: string; data: { assigned: number } }
}

const removeAssignment = async (studentId: string) => api.delete(`/trnst/assignments/${studentId}`, { _silent: true } as any)

// Crew screen. Calls are silent: the screen shows its own messages.
const silent = { _silent: true } as any

const getCrewMe = async () => {
  const response = await api.get('/trnst/crew/me', silent)
  return response.data.data as { today: string; vehicles: CrewVehicle[]; trips: CrewTrip[] }
}

const startTrip = async (routeId: string, direction: TripDirection) => {
  const response = await api.post('/trnst/crew/trips', { routeId, direction }, silent)
  return response.data.data as CrewTrip
}

const endTrip = async (tripId: string) => api.post(`/trnst/crew/trips/${tripId}/end`, {}, silent)

const sendLocations = async (tripId: string, points: GeoPoint[]) => {
  const response = await api.post(`/trnst/crew/trips/${tripId}/locations`, { points }, silent)
  return response.data.data as { accepted: number; lastLocation: GeoPoint | null }
}

const getRoster = async (tripId: string) => {
  const response = await api.get(`/trnst/crew/trips/${tripId}/roster`, silent)
  return response.data.data as Roster
}

const markBoarding = async (
  tripId: string,
  payload: { token?: string; studentId?: string; event?: BoardingEvent; method: 'scan' | 'manual' }
) => {
  const response = await api.post(`/trnst/crew/trips/${tripId}/boarding`, payload, silent)
  return response.data.data as BoardingResult
}

const unmarkBoarding = async (tripId: string, studentId: string, event: BoardingEvent) =>
  api.delete(`/trnst/crew/trips/${tripId}/boarding/${studentId}/${event}`, silent)

const trnstService = {
  getOverview,
  getVehicles,
  saveVehicle,
  deleteVehicle,
  getRoutes,
  saveRoute,
  deleteRoute,
  getSelfStudents,
  saveSelfStudent,
  deleteSelfStudent,
  searchPlaces,
  getLive,
  getTrips,
  getTrip,
  getAssignments,
  assignStudents,
  removeAssignment,
  getCrewMe,
  startTrip,
  endTrip,
  sendLocations,
  getRoster,
  markBoarding,
  unmarkBoarding,
}

export default trnstService
