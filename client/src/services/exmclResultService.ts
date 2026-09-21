import api from './api'

export interface ResultEntry {
  studentId: string
  marks: Record<string, number>
  absent?: boolean
  absentSubjects?: string[]
}

export interface BulkSavePayload {
  examId: string
  class: string
  section: string
  results: ResultEntry[]
}

export type ResultSubjectStatus = 'complete' | 'partial' | 'pending'

export interface ResultSubjectEntryStatus {
  subjectId: string
  subjectName: string
  filledCount: number
  pendingCount: number
  studentCount: number
  status: ResultSubjectStatus
}

export interface ResultClassSectionStatus {
  class: string
  section: string
  studentCount: number
  subjectCount: number
  subjects: ResultSubjectEntryStatus[]
  filledCells: number
  pendingCells: number
  totalCells: number
  overallStatus: ResultSubjectStatus
}

const getResults = async (examId: string, className: string, section: string): Promise<ResultEntry[]> => {
  const response = await api.get('/exam-results', {
    params: { examId, class: className, section },
  })
  return Array.isArray(response?.data?.data) ? response.data.data : []
}

const saveResults = async (payload: BulkSavePayload): Promise<void> => {
  await api.post('/exam-results/bulk', payload)
}

const getEntryStatus = async (examId: string): Promise<ResultClassSectionStatus[]> => {
  const response = await api.get('/exam-results/status', { params: { examId } })
  return Array.isArray(response?.data?.data) ? response.data.data : []
}

const exmclResultService = { getResults, saveResults, getEntryStatus }

export default exmclResultService
