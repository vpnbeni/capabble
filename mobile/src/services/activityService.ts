import { ApiError, api, requestBytes } from '@/lib/api'
import { fileForm, tooBig, type PickedFile } from '@/lib/pickFile'

// Activities (/api/actvt): houses, house points, clubs, events, certificates and councils, as on the website.

export interface HouseTeacher {
  name: string
  role?: string
  phone?: string
  email?: string
  teacherId?: string | null
}

export interface CouncilMember {
  name: string
  role?: string
  className?: string
  section?: string
  phone?: string
  studentId?: string | null
}

export interface House {
  _id: string
  name: string
  color?: string
  motto?: string
  incharge?: string
  logo?: string
  flag?: string
  teachers?: HouseTeacher[]
  councilMembers?: CouncilMember[]
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
  logo?: string
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

export type PostStatus = 'closed' | 'open' | 'accepting'

export interface Council {
  _id: string
  name: string
  councilType?: 'school' | 'house' | string
  houseName?: string
  academicYear?: string
  description?: string
}

export interface CouncilPost {
  _id: string
  title: string
  description?: string
  seats: number
  councilType?: string
  preferredGender?: string
  preferredClasses?: string[]
  registrationStatus?: PostStatus
  registrationCount: number
  pendingCount: number
  acceptedCount: number
}

export interface CouncilApplication {
  _id: string
  postId: string
  postTitle?: string
  studentId?: string
  studentName: string
  className?: string
  section?: string
  status: 'pending' | 'accepted' | 'rejected'
}

export interface PostInput {
  title?: string
  description?: string
  seats?: number
  preferredGender?: string
  preferredClasses?: string
  registrationStatus?: PostStatus
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
  /** Only the fields sent change (`teachers` and `councilMembers` are replaced whole). */
  updateHouse: (id: string, input: Partial<Pick<House, 'teachers' | 'councilMembers'>> & { clearLogo?: boolean }) => api.put<House>(`/actvt/houses/${encodeURIComponent(id)}`, input),
  /** A house's logo or flag, or a club's logo, sent as the record's own update. */
  uploadImage: (kind: 'houses' | 'clubs', id: string, field: 'logo' | 'flag', picked: PickedFile) => {
    if (tooBig(picked)) throw new ApiError('The photo is over 10 MB. Choose a smaller one.', 413)
    return api.upload<unknown>(`/actvt/${kind}/${encodeURIComponent(id)}`, fileForm(field, picked), 'PUT')
  },
  clearLogo: (kind: 'houses' | 'clubs', id: string) => api.put<unknown>(`/actvt/${kind}/${encodeURIComponent(id)}`, { clearLogo: 'true' }),
  council: (id: string) => api.get<{ council: Council; posts: CouncilPost[]; registrations: CouncilApplication[] }>(`/actvt/councils/${encodeURIComponent(id)}/details`),
  /** A new post on a house council goes on every house's council, as on the website. */
  addPost: (council: Council, input: PostInput) => api.post<unknown>('/actvt/council-posts', { ...input, councilId: council._id, applyToAllHouseCouncils: council.councilType === 'house' }),
  updatePost: (id: string, input: PostInput) => api.put<CouncilPost>(`/actvt/council-posts/${encodeURIComponent(id)}`, input),
  removePost: (id: string) => api.delete<unknown>(`/actvt/council-posts/${encodeURIComponent(id)}`),
  /** Puts a student forward for a post (the post must be taking applications). */
  addApplication: (postId: string, student: { _id: string; name: string; class: string; section: string; gender?: string; rollNumber?: string }) =>
    api.post<CouncilApplication>('/actvt/council-registrations', {
      postId,
      studentId: student._id,
      studentName: student.name,
      className: student.class,
      section: student.section,
      gender: student.gender,
      rollNumber: student.rollNumber,
    }),
  /** Selecting is refused once the post's seats are filled. */
  setApplication: (id: string, status: CouncilApplication['status']) => api.put<CouncilApplication>(`/actvt/council-registrations/${encodeURIComponent(id)}`, { status }),
  removeApplication: (id: string) => api.delete<unknown>(`/actvt/council-registrations/${encodeURIComponent(id)}`),
  /** Certificates as a PDF, one landscape A4 page each (at most 200). */
  certificatesPdf: (ids: string[]) => requestBytes('/actvt/certificates/pdf', { method: 'POST', body: { ids } }),
  removeCertificate: (id: string) => api.delete<unknown>(`/actvt/certificates/${encodeURIComponent(id)}`),
  profile: (studentId: string) => api.get<ActivityProfile>(`/actvt/students/${encodeURIComponent(studentId)}/profile`),
}
