import api from './api'

export type BellTimingType = 'period' | 'break'

export interface BellTimingMetaPayload {
  schoolName: string
  title: string
  session: string
  effectiveDate: string
}

export interface BellTimingRowPayload {
  id: string
  type: BellTimingType
  label: string
  duration: number
}

export interface BellTimingsPayload {
  meta: BellTimingMetaPayload
  startTime: string
  rows: BellTimingRowPayload[]
}

export interface BellTimingVersionSummary {
  _id: string
  name: string
  academicSession?: string
  createdAt: string
  updatedAt: string
}

export interface BellTimingVersion extends BellTimingVersionSummary {
  bellTimings: BellTimingsPayload
}

const DEFAULT_BELL_TIMINGS: BellTimingsPayload = {
  meta: {
    schoolName: '',
    title: 'SUMMER BELL TIMINGS',
    session: '',
    effectiveDate: '',
  },
  startTime: '08:00',
  rows: [],
}

const normalizeBellTimingsPayload = (
  value: Partial<BellTimingsPayload> | null | undefined
): BellTimingsPayload => {
  const meta = (value?.meta ?? {}) as Partial<BellTimingMetaPayload>
  return {
    meta: {
      schoolName: String(meta.schoolName || ''),
      title: String(meta.title || DEFAULT_BELL_TIMINGS.meta.title),
      session: String(meta.session || ''),
      effectiveDate: String(meta.effectiveDate || ''),
    },
    startTime: String(value?.startTime || DEFAULT_BELL_TIMINGS.startTime),
    rows: Array.isArray(value?.rows)
      ? value!.rows.map((row, index) => ({
          id: String(row?.id || `bt-row-${index + 1}`),
          type: row?.type === 'break' ? 'break' : 'period',
          label: String(row?.label || ''),
          duration:
            typeof row?.duration === 'number' && Number.isFinite(row.duration) && row.duration > 0
              ? row.duration
              : row?.type === 'break'
                ? 15
                : 40,
        }))
      : [],
  }
}

const bellTimingsService = {
  async getBellTimings(): Promise<BellTimingsPayload> {
    const response = await api.get('/timetable/bell-timings')
    const payload = response.data?.data as Partial<BellTimingsPayload> | undefined
    return normalizeBellTimingsPayload(payload)
  },

  async saveBellTimings(payload: BellTimingsPayload): Promise<BellTimingsPayload> {
    const response = await api.put('/timetable/bell-timings', payload)
    const saved = response.data?.data as Partial<BellTimingsPayload> | undefined
    return normalizeBellTimingsPayload(saved)
  },

  async getVersions(): Promise<BellTimingVersionSummary[]> {
    const response = await api.get('/timetable/bell-timings/versions')
    const data = response.data?.data
    return Array.isArray(data) ? data : []
  },

  /** Pass `bellTimings` to snapshot unsaved on-screen edits; omit it to snapshot the saved timings. */
  async createVersion(name?: string, bellTimings?: BellTimingsPayload): Promise<BellTimingVersionSummary> {
    const response = await api.post('/timetable/bell-timings/versions', {
      ...(name ? { name } : {}),
      ...(bellTimings ? { bellTimings } : {}),
    })
    return response.data?.data as BellTimingVersionSummary
  },

  async getVersion(id: string): Promise<BellTimingVersion> {
    const response = await api.get(`/timetable/bell-timings/versions/${id}`)
    const data = response.data?.data as Partial<BellTimingVersion> | undefined
    return {
      _id: String(data?._id || ''),
      name: String(data?.name || ''),
      academicSession: data?.academicSession,
      createdAt: String(data?.createdAt || ''),
      updatedAt: String(data?.updatedAt || ''),
      bellTimings: normalizeBellTimingsPayload(data?.bellTimings),
    }
  },

  async applyVersion(id: string): Promise<BellTimingsPayload> {
    const response = await api.post(`/timetable/bell-timings/versions/${id}/apply`)
    return normalizeBellTimingsPayload(response.data?.data as Partial<BellTimingsPayload> | undefined)
  },

  async deleteVersion(id: string): Promise<void> {
    await api.delete(`/timetable/bell-timings/versions/${id}`)
  },
}

export default bellTimingsService
