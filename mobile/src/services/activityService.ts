import { api } from '@/lib/api'

// Activities (/api/actvt): houses, house points, clubs, events and certificates, as on the website.

export interface House {
  _id: string
  name: string
  color?: string
  motto?: string
  incharge?: string
  teachers?: { name: string; role?: string; phone?: string }[]
}

export interface Standing {
  houseId: string
  houseName: string
  houseColor?: string
  totalPoints: number
  entries: number
  rank: number
}

export interface PointEntry {
  _id: string
  title: string
  date: string
  houseId: string
  houseName: string
  points: number
  category?: string
  notes?: string
}

export interface Club {
  _id: string
  name: string
  incharge?: string
  meetingDay?: string
  description?: string
  members?: string
}

export interface ActivityEvent {
  _id: string
  title: string
  date: string
  activityType?: string
  venue?: string
  incharge?: string
  status?: 'planned' | 'completed' | 'cancelled' | string
  houseName?: string
  clubName?: string
}

export interface Certificate {
  _id: string
  title: string
  participantName: string
  studentId?: string
  className?: string
  section?: string
  role?: string
  issuedOn?: string
  eventTitle?: string
  houseName?: string
}

export interface ActivityProfile {
  house: { name: string; color?: string } | null
  certificates: Certificate[]
  medals: unknown[]
}

/** The activity records the setup screen keeps: each a list of plain fields under /actvt. */
export type SetupKind = 'houses' | 'clubs' | 'sports' | 'tours' | 'functions' | 'councils'
export type SetupRecord = { _id: string } & Record<string, unknown>

export const activityService = {
  setupList: (kind: SetupKind) => api.get<SetupRecord[]>(`/actvt/${kind}`),
  /** A house or club PUT without isActive would mark it active again: these are only ever active. */
  setupSave: (kind: SetupKind, id: string | undefined, input: Record<string, string>) =>
    id ? api.put<SetupRecord>(`/actvt/${kind}/${encodeURIComponent(id)}`, input) : api.post<SetupRecord>(`/actvt/${kind}`, input),
  /** Removed records leave the lists (soft delete). */
  setupRemove: (kind: SetupKind, id: string) => api.delete<unknown>(`/actvt/${kind}/${encodeURIComponent(id)}`),
  houses: () => api.get<House[]>('/actvt/houses'),
  ranking: () => api.get<{ standings: Standing[]; recent: PointEntry[]; totalEntries: number }>('/actvt/ranking'),
  /** House points for an event or a day's work; the standings add them up. */
  addPoints: (input: { title: string; date: string; houseId: string; houseName: string; houseColor?: string; points: number; category?: string; notes?: string }) =>
    api.post<PointEntry>('/actvt/points', input),
  clubs: () => api.get<Club[]>('/actvt/clubs'),
  events: () => api.get<ActivityEvent[]>('/actvt/events'),
  certificates: () => api.get<Certificate[]>('/actvt/certificates'),
  addCertificate: (input: { title: string; participantName: string; studentId: string; className: string; section: string; role: string; issuedOn: string }) =>
    api.post<Certificate>('/actvt/certificates', input),
  profile: (studentId: string) => api.get<ActivityProfile>(`/actvt/students/${encodeURIComponent(studentId)}/profile`),
}
