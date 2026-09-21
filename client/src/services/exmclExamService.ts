import api from './api'

export interface ExmclExamDefinition {
  _id: string
  name: string
  code: string
  duration?: string
  maximumMarks?: number
  displayOrder: number
  subjectKeys?: string[]
  createdAt: string
  updatedAt: string
}

export type ExamSubjectMatrix = Record<string, string[]>

export interface ExamSubjectMatrixPayload {
  exams: Array<Pick<ExmclExamDefinition, '_id' | 'name' | 'code' | 'displayOrder' | 'subjectKeys'>>
  matrix: ExamSubjectMatrix
}

type ExamPayload = Pick<ExmclExamDefinition, 'name' | 'code' | 'displayOrder' | 'duration' | 'maximumMarks'>

const getAll = async (): Promise<ExmclExamDefinition[]> => {
  const response = await api.get('/exam-definitions')
  const payload = response?.data?.data ?? response?.data
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.exams)) return payload.exams
  return []
}

const getSubjectMatrix = async (): Promise<ExamSubjectMatrixPayload> => {
  const response = await api.get('/exam-definitions/subject-matrix')
  const data = response?.data?.data || {}
  return {
    exams: Array.isArray(data.exams) ? data.exams : [],
    matrix: data.matrix && typeof data.matrix === 'object' ? data.matrix : {},
  }
}

const saveSubjectMatrix = async (matrix: ExamSubjectMatrix): Promise<ExamSubjectMatrixPayload> => {
  const response = await api.put('/exam-definitions/subject-matrix', { matrix })
  const data = response?.data?.data || {}
  return {
    exams: Array.isArray(data.exams) ? data.exams : [],
    matrix: data.matrix && typeof data.matrix === 'object' ? data.matrix : {},
  }
}

const create = async (payload: ExamPayload): Promise<ExmclExamDefinition> => {
  const response = await api.post('/exam-definitions', payload)
  return response?.data?.data as ExmclExamDefinition
}

const update = async (id: string, payload: Partial<ExamPayload>): Promise<ExmclExamDefinition> => {
  const response = await api.put(`/exam-definitions/${id}`, payload)
  return response?.data?.data as ExmclExamDefinition
}

const remove = async (id: string): Promise<void> => {
  await api.delete(`/exam-definitions/${id}`)
}

const exmclExamService = {
  getAll,
  create,
  update,
  remove,
  getSubjectMatrix,
  saveSubjectMatrix,
}

export default exmclExamService
