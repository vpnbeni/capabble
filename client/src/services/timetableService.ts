import api, { downloadFile } from './api'

export interface TimetableClassState {
  id: string
  className: string
  section: string
  floor: string
  subjects: string[]
  incharge: string
  classGroup: string
  displayOrder: number
}

export interface TimetableSubjectState {
  id: string
  name: string
  type: string
  requiresConsecutivePeriods: boolean
  consecutivePeriodCount: number
  color: string
}

// ── TimetableVersion types ───────────────────────────────────────────────────

export interface ConflictReportEntry {
  classId: string
  className: string
  subjectName: string
  type: 'underallocated' | 'teacher_overload' | 'unfilled'
  expected: number
  actual: number
  message: string
}

export interface GenerationStats {
  totalSlots: number
  filledSlots: number
  conflictCount: number
  durationMs: number
}

export interface TimetableVersionSummary {
  _id: string
  name: string
  status: 'draft' | 'published' | 'archived'
  generatedAt: string
  publishedAt?: string
  academicSession?: string
  generationStats: GenerationStats
  conflictCount: number
}

export interface TimetableVersion extends TimetableVersionSummary {
  conflictReport: ConflictReportEntry[]
  grid: TimetableGridState
}

export interface GenerateResult {
  version: TimetableVersionSummary
  conflictReport: ConflictReportEntry[]
  stats: GenerationStats
}

export interface TimetableTeacherState {
  id: string
  name: string
  shortName: string
  subjects: string[]
}

export interface TeacherSubjectClassAssignmentState {
  classId: string
  className: string
  section: string
  subjects: string[]
}

export interface TeacherSubjectAllocationState {
  teacherId: string
  teacherName: string
  assignments: TeacherSubjectClassAssignmentState[]
}

export interface ParallelSubjectPairState {
  id: string
  className: string
  subjectA: string
  subjectB: string
}

export interface TimetableCellState {
  subject: string
  teacher: string
}

export type TimetableGridState = Record<string, Record<string, Record<number, TimetableCellState>>>
export type PeriodAllocationState = Record<string, Record<string, number>>
export type TimetableMatrixSelectionState = Record<string, Record<string, boolean>>

export interface CommonPeriodState {
  id: string
  className: string
  subject: string
  sections: string[]
}

export interface TimetableMatrixClassState {
  id: string
  name: string
}

export interface TimetableMatrixSectionState {
  id: string
  name: string
}

export interface TimetableStatePayload {
  classes: TimetableClassState[]
  subjects: TimetableSubjectState[]
  teachers: TimetableTeacherState[]
  teacherSubjectAllocations: TeacherSubjectAllocationState[]
  parallelSubjectPairs: ParallelSubjectPairState[]
  commonPeriods: CommonPeriodState[]
  periodsPerWeek: number
  periodAllocation: PeriodAllocationState
  timetableGrid: TimetableGridState
  matrixClasses: TimetableMatrixClassState[]
  matrixSections: TimetableMatrixSectionState[]
  matrixSelection: TimetableMatrixSelectionState
}

const DEFAULT_TIMETABLE_STATE: TimetableStatePayload = {
  classes: [],
  subjects: [],
  teachers: [],
  teacherSubjectAllocations: [],
  parallelSubjectPairs: [],
  commonPeriods: [],
  periodsPerWeek: 42,
  periodAllocation: {},
  timetableGrid: {},
  matrixClasses: [],
  matrixSections: [],
  matrixSelection: {},
}

const normalizeStatePayload = (payload: Partial<TimetableStatePayload> | undefined): TimetableStatePayload => ({
  classes: Array.isArray(payload?.classes) ? payload!.classes : [],
  subjects: Array.isArray(payload?.subjects) ? payload!.subjects : [],
  teachers: Array.isArray(payload?.teachers) ? payload!.teachers : [],
  teacherSubjectAllocations: Array.isArray(payload?.teacherSubjectAllocations) ? payload!.teacherSubjectAllocations : [],
  parallelSubjectPairs: Array.isArray(payload?.parallelSubjectPairs) ? payload!.parallelSubjectPairs : [],
  commonPeriods: Array.isArray(payload?.commonPeriods) ? (payload!.commonPeriods as CommonPeriodState[]) : [],
  periodsPerWeek:
    typeof payload?.periodsPerWeek === 'number' && payload.periodsPerWeek > 0
      ? payload.periodsPerWeek
      : DEFAULT_TIMETABLE_STATE.periodsPerWeek,
  periodAllocation: (payload?.periodAllocation ?? {}) as PeriodAllocationState,
  timetableGrid: (payload?.timetableGrid ?? {}) as TimetableGridState,
  matrixClasses: Array.isArray(payload?.matrixClasses) ? payload!.matrixClasses : [],
  matrixSections: Array.isArray(payload?.matrixSections) ? payload!.matrixSections : [],
  matrixSelection: (payload?.matrixSelection ?? {}) as TimetableMatrixSelectionState,
})

const timetableService = {
  async getState(): Promise<TimetableStatePayload> {
    const response = await api.get('/timetable/state')
    return normalizeStatePayload(response.data?.data)
  },

  /** The state with its version (its last save), which a save names so it can't undo a newer change. */
  async getStateVersioned(): Promise<{ state: TimetableStatePayload; updatedAt: string | null }> {
    const response = await api.get('/timetable/state')
    return { state: normalizeStatePayload(response.data?.data), updatedAt: response.data?.data?.updatedAt ?? null }
  },

  /**
   * Saves the whole state if it is still the version it was read at. Throws an error with
   * `conflict: true` when someone (another tab, the app) saved since.
   */
  async saveStateVersioned(state: TimetableStatePayload, expectedUpdatedAt: string | null): Promise<{ state: TimetableStatePayload; updatedAt: string | null }> {
    try {
      const response = await api.put('/timetable/state', { ...state, expectedUpdatedAt }, { _silent: true } as any)
      return { state: normalizeStatePayload(response.data?.data), updatedAt: response.data?.data?.updatedAt ?? null }
    } catch (error: any) {
      if (error?.response?.status === 409) throw Object.assign(new Error(error.response.data?.message || 'The timetable was changed somewhere else.'), { conflict: true })
      throw error
    }
  },

  async saveState(
    state: TimetableStatePayload,
    options?: { silent?: boolean }
  ): Promise<TimetableStatePayload> {
    const response = await api.put('/timetable/state', state, {
      _silent: options?.silent !== false,
    } as any)
    return normalizeStatePayload(response.data?.data)
  },

  // ── Generation ─────────────────────────────────────────────────────────────

  async generate(name?: string): Promise<GenerateResult> {
    const response = await api.post('/timetable/generate', name ? { name } : {})
    return response.data?.data as GenerateResult
  },

  // ── Versions ───────────────────────────────────────────────────────────────

  async getVersions(): Promise<TimetableVersionSummary[]> {
    const response = await api.get('/timetable/versions')
    const data = response.data?.data
    return Array.isArray(data) ? data : []
  },

  async getVersion(id: string): Promise<TimetableVersion> {
    const response = await api.get(`/timetable/versions/${id}`)
    return response.data?.data as TimetableVersion
  },

  async publishVersion(id: string): Promise<TimetableVersionSummary> {
    const response = await api.put(`/timetable/versions/${id}/publish`)
    return response.data?.data as TimetableVersionSummary
  },

  async archiveVersion(id: string): Promise<TimetableVersionSummary> {
    const response = await api.put(`/timetable/versions/${id}/archive`)
    return response.data?.data as TimetableVersionSummary
  },

  async deleteVersion(id: string): Promise<void> {
    await api.delete(`/timetable/versions/${id}`)
  },

  // ── Exports ────────────────────────────────────────────────────────────────

  async exportExcel(id: string, filename?: string): Promise<void> {
    await downloadFile(`/timetable/versions/${id}/export/excel`, filename ?? 'timetable.xlsx')
  },

  async exportClassPDF(id: string, classId?: string, filename?: string): Promise<void> {
    const url = classId
      ? `/timetable/versions/${id}/export/class-pdf/${classId}`
      : `/timetable/versions/${id}/export/class-pdf`
    await downloadFile(url, filename ?? 'class-timetable.pdf')
  },

  async exportTeacherPDF(id: string, teacherId?: string, filename?: string): Promise<void> {
    const url = teacherId
      ? `/timetable/versions/${id}/export/teacher-pdf/${teacherId}`
      : `/timetable/versions/${id}/export/teacher-pdf`
    await downloadFile(url, filename ?? 'teacher-timetable.pdf')
  },
}

export default timetableService
