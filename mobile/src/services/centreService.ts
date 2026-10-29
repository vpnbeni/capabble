import { api, requestBytes } from '@/lib/api'

// The board exam centre (/api/centre-details, /seating-plan, /centre-datesheet, /duties, /answersheets,
// /form66, /dispatch), the website's Exam centre pages. Several of these send the list itself, not
// { data }, so they are read raw.

export interface CentreDetails {
  centreNo: string
  centreName: string
  centreSchoolCode: string
  centreSuperintendent: string
  centreSuperintendentContact: string
  deputyCentreSuperintendent: string
  deputyCentreSuperintendentContact: string
  centreClerk: string
  centreClerkContact: string
  packingClothColor: string
  packingMarker: string
  packingClothColorClass10: string
  packingMarkerClass10: string
  packingClothColorClass12: string
  packingMarkerClass12: string
  dispatchSlipToAddress: string
  dispatchSlipFromAddress: string
  dispatchSlipInsuredAmount: string
}

export const CENTRE_FIELDS = [
  'centreNo',
  'centreName',
  'centreSchoolCode',
  'centreSuperintendent',
  'centreSuperintendentContact',
  'deputyCentreSuperintendent',
  'deputyCentreSuperintendentContact',
  'centreClerk',
  'centreClerkContact',
  'packingClothColor',
  'packingMarker',
  'packingClothColorClass10',
  'packingMarkerClass10',
  'packingClothColorClass12',
  'packingMarkerClass12',
  'dispatchSlipToAddress',
  'dispatchSlipFromAddress',
  'dispatchSlipInsuredAmount',
] as const satisfies readonly (keyof CentreDetails)[]

export interface ExamRoom {
  _id: string
  roomNo: string
  roomName?: string
  floor?: string
  capacity: number
  seatingLayout?: { rows?: { benchCount: number; benchType: string }[] }
  allocatedExamDates?: string[]
  allocationOrderByDate?: Record<string, number>
  assetLocationId?: string | null
}

export interface RoomInput {
  roomNo?: string
  roomName?: string
  floor?: string
  capacity?: number
}

export interface AssetRoom {
  locationId: string
  roomNumber: string
  name: string
  floor: string
  capacity: number
  useForExams: boolean
}

export interface CentrePaper {
  _id: string
  examDate: string
  dayName: string
  subjectCode: string
  subjectName: string
  class: string
  timeSlot: { start: string; end: string }
  candidateCount: number
  roomsNeeded: number
}

export interface DutyPerson {
  _id: string
  name: string
  designation?: string
}

export interface Duty {
  _id: string
  room: { _id: string; roomNo: string; roomName?: string; floor?: string }
  functionary: DutyPerson
  functionary2?: DutyPerson
}

export interface DayDuties {
  examDate: string
  duties: Duty[]
  totalAssigned: number
}

export interface AnswerSheet {
  _id?: string
  answerSheetType: string
  pages: number
  colour: string
  class: string
  suffix?: string
  sortOrder?: number
  serialRanges?: { serialFrom: string; serialTo: string }[]
  serialFrom: string | null
  serialTo: string | null
  total: number
  used: number
  discarded: number
  balance?: number
  discardedSerials?: { serial: string; reason: string }[]
  isTemplate?: boolean
}

/** As the website counts them: the larger of the spoilt count and the spoilt serials listed. */
export const spoiltOf = (sheet: AnswerSheet) => Math.max(Number(sheet.discarded || 0), sheet.discardedSerials?.length ?? 0)
export const leftOf = (sheet: AnswerSheet) => Math.max(0, (sheet.total || 0) - (sheet.used || 0) - spoiltOf(sheet))

export interface DaySheetSummary {
  date: string
  classes: Record<
    string,
    {
      totalAllocated: number
      totalDiscarded: number
      entries: {
        answerSheetType: string
        pages: number
        colour: string
        serialFrom: string
        serialTo: string
        sheetsAllocated: number
        candidateCount: number
        subjectCode: string
        subjectName: string
        insufficientSheets?: boolean
      }[]
    }
  >
}

export interface Form66Subject {
  code: string
  name?: string
  count: number
}

export type SeatingFormat = 'main-gate' | 'room-folder-slip' | 'room-door-slip' | 'cbse-copy'

const SERIAL = /^[A-Z]?\d+$/

/** The website's serial checks: one range, same letter in front, To not before From. */
export const serialError = (from: string, to: string) => {
  const a = from.trim().toUpperCase()
  const b = to.trim().toUpperCase()
  if (!a || !b) return 'Enter both serial numbers.'
  if (!SERIAL.test(a) || !SERIAL.test(b)) return 'A serial is digits, with at most one letter in front, like A1000234.'
  if (a.replace(/\d+$/, '') !== b.replace(/\d+$/, '')) return 'Both serials need the same letter in front.'
  if (Number(b.replace(/\D/g, '')) < Number(a.replace(/\D/g, ''))) return 'The last serial comes before the first.'
  return null
}

/** Rooms in the order the server hands out duties for a date: the date's allocation order, then room number. */
export const roomsForDate = (rooms: ExamRoom[], date: string) => {
  const order = (room: ExamRoom) => room.allocationOrderByDate?.[date] ?? Number.MAX_SAFE_INTEGER
  const number = (room: ExamRoom) => {
    const match = String(room.roomNo)
      .trim()
      .match(/^(\d+)/)
    return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY
  }
  return rooms
    .filter((room) => room.allocatedExamDates?.includes(date))
    .sort(
      (a, b) =>
        order(a) - order(b) || (number(a) === number(b) ? 0 : number(a) < number(b) ? -1 : 1) || String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true, sensitivity: 'base' }),
    )
}

export const centreService = {
  details: () => api.get<Partial<CentreDetails> | null>('/centre-details'),
  /** The server replaces the whole record, so send every field. */
  saveDetails: (details: CentreDetails) => api.put<CentreDetails>('/centre-details', details),

  rooms: () => api.get<ExamRoom[]>('/seating-plan/rooms', undefined, { raw: true }),
  addRoom: (input: RoomInput) => api.post<ExamRoom>('/seating-plan/rooms', input, { raw: true }),
  saveRoom: ({ id, input }: { id: string; input: RoomInput }) => api.put<ExamRoom>(`/seating-plan/rooms/${id}`, input, { raw: true }),
  removeRoom: (id: string) => api.delete<unknown>(`/seating-plan/rooms/${id}`),
  assetRooms: () => api.get<AssetRoom[]>('/seating-plan/rooms/asets-candidates', undefined, { raw: true }),
  /** The locations to use for exams; rooms from the others stop being exam rooms. */
  syncAssetRooms: (locationIds: string[]) => api.post<unknown>('/seating-plan/rooms/sync-from-asets', { locationIds }),

  papers: () => api.get<CentrePaper[]>('/centre-datesheet/entries'),
  seatingPdf: (paperId: string, format: SeatingFormat) => requestBytes(`/seating-plan/generate/${format}/${paperId}`),
  dispatchSlip: (paperId: string) => requestBytes(`/dispatch/slip/${paperId}/pdf`),

  duties: (examDate: string) => api.get<DayDuties>('/duties', { examDate }),
  dutyMode: async () => ((await api.get<{ mode?: string }>('/duties/allocation-mode')).mode === 'auto' ? 'auto' : 'manual') as 'auto' | 'manual',
  invigilators: async () => (await api.get<{ data: DutyPerson[] }>('/teachers', { dutyType: 'Invigilator', isActive: 'true', limit: 100, sort: 'name' })).data,
  /** Auto: the people to choose from. By hand: the first and second invigilator of each room, in `roomsForDate` order. */
  assignDuties: (input: { examDate: string; functionaryIds: string[]; secondFunctionaryIds?: string[] }) => api.post<DayDuties>('/duties/assign', input),
  dutyRecord: (examDate: string) => requestBytes('/duties/functionary-duty-record', { params: { examDate } }),

  answerSheets: () => api.get<AnswerSheet[]>('/answersheets'),
  /** A row the school hasn't received yet (a template) is created; a received one gets its serials changed. */
  saveSerials: (sheet: AnswerSheet, serialFrom: string, serialTo: string) => {
    const range = { serialFrom: serialFrom.trim().toUpperCase(), serialTo: serialTo.trim().toUpperCase() }
    const serials = { serialRanges: [range], ...range }
    return sheet._id && !sheet.isTemplate
      ? api.put<AnswerSheet>(`/answersheets/${sheet._id}`, serials)
      : api.post<AnswerSheet>('/answersheets', {
          answerSheetType: sheet.answerSheetType,
          pages: sheet.pages,
          colour: sheet.colour,
          class: sheet.class,
          suffix: sheet.suffix,
          sortOrder: sheet.sortOrder,
          ...serials,
          used: 0,
          discarded: 0,
        })
  },
  discardSerials: ({ id, fromSerial, toSerial, reason }: { id: string; fromSerial: string; toSerial: string; reason: string }) =>
    api.post<unknown>(`/answersheets/${id}/discarded`, { fromSerial: fromSerial.trim().toUpperCase(), toSerial: toSerial.trim().toUpperCase(), reason }),
  sheetRecord: (id: string) => requestBytes(`/answersheets/${id}/consolidated-record/download`),
  daySheets: (date: string) => api.get<DaySheetSummary>('/answersheets/daily-summary', { date }),

  form66Dates: () => api.get<string[]>('/form66/dates', undefined, { raw: true }),
  form66Subjects: (date: string) => api.get<Form66Subject[]>(`/form66/dates/${encodeURIComponent(date)}/subjects`, undefined, { raw: true }),
  form66Pdf: (date: string, subjectCode?: string) =>
    requestBytes(subjectCode ? `/form66/dates/${encodeURIComponent(date)}/subjects/${encodeURIComponent(subjectCode)}/pdf` : `/form66/dates/${encodeURIComponent(date)}/pdf`),
}
