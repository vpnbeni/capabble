import type { AxiosRequestConfig } from 'axios'
import baseApi from './api'

// Academics pages show their own success/error toasts, so opt out of the global
// interceptor toasts (`_silent`) to avoid showing every message twice.
type Config = AxiosRequestConfig
const silent = (config?: Config): Config => ({ ...(config || {}), _silent: true } as Config)
const api = {
  get: (url: string, config?: Config) => baseApi.get(url, silent(config)),
  delete: (url: string, config?: Config) => baseApi.delete(url, silent(config)),
  post: (url: string, data?: unknown, config?: Config) => baseApi.post(url, data, silent(config)),
  put: (url: string, data?: unknown, config?: Config) => baseApi.put(url, data, silent(config)),
}

export type LessonPlanStatus = 'draft' | 'planned' | 'delivered' | 'cancelled'
export type ClassWorkStatus = 'draft' | 'published' | 'closed'
export type CurriculumStatus = 'draft' | 'published'
export type SubmissionStatus = 'pending' | 'submitted' | 'late' | 'missing' | 'excused'
export type ClassWorkKind = 'homework' | 'assignment' | 'quiz'
export type QuestionType = 'mcq' | 'short' | 'long'

export type ClassOption = { className: string; sections: string[] }
export type SubjectOption = { name: string; code: string; className: string }
export type TeacherOption = { _id: string; name: string; employeeId: string; designation: string; department: string }
export type Allocation = { teacherId: string; teacherName: string; className: string; section: string; subjectName: string }

export type AcdmcOptions = {
  classSource: 'timetable' | 'students' | 'default'
  classOptions: ClassOption[]
  subjects: SubjectOption[]
  teachers: TeacherOption[]
  allocations: Allocation[]
  academicSession: string
}

export type Pagination = { page: number; limit: number; total: number; pages: number }
export type ListResult<T, S extends string> = { items: T[]; counts: Record<S, number>; pagination: Pagination }

type ClassContext = {
  _id: string
  title: string
  teacherId: string
  teacherName: string
  className: string
  section: string
  subjectName: string
  curriculumId: string
  topicIds: string[]
  updatedAt?: string
  createdAt?: string
  createdBy?: string
  updatedBy?: string
}

export type LessonPlan = ClassContext & {
  topic: string
  date: string
  periods: number
  objectives: string
  activities: string
  resources: string
  assessment: string
  status: LessonPlanStatus
  deliveredOn: string
  deliveryNote: string
}

export type SubmissionSummary = {
  total: number
  pending: number
  submitted: number
  late: number
  missing: number
  excused: number
  turnedIn: number
  marked: number
  average: number | null
  highest: number | null
  lowest: number | null
  maxMarks: number | null
}

export type Question = {
  _id?: string
  type: QuestionType
  text: string
  options: string[]
  answer: string
  marks: number
}

export type ClassWork = ClassContext & {
  assignedDate: string
  dueDate: string
  instructions: string
  status: ClassWorkStatus
  maxMarks?: number
  // Quiz only
  date?: string
  topic?: string
  durationMinutes?: number
  questions?: Question[]
  questionCount?: number
  summary: SubmissionSummary
}

export type RosterRow = {
  studentId: string
  studentName: string
  rollNo: string
  status: SubmissionStatus
  marks: number | null
  remark: string
  updatedAt: string | null
  enrolled: boolean
}

export type Roster = {
  work: Omit<ClassWork, 'summary'>
  rows: RosterRow[]
  maxMarks: number | null
  marked: boolean
  studentsAvailable: boolean
  summary: SubmissionSummary
}

export type Topic = { _id?: string; title: string; periods: number; targetMonth: string }
export type Unit = { _id?: string; title: string; order?: number; topics: Topic[] }
export type Book = {
  _id?: string
  title: string
  author: string
  publisher: string
  sessionType: 'current' | 'next'
  status: 'proposed' | 'selected'
}

export type Curriculum = {
  _id: string
  className: string
  subjectName: string
  subjectId: string
  description: string
  status: CurriculumStatus
  units: Unit[]
  books: Book[]
  unitCount: number
  topicCount: number
  plannedPeriods: number
  coverage: { percent: number; sections: number }
  updatedAt?: string
}

export type CurriculumListItem = Omit<Curriculum, 'units'>

export type CoverageSection = { section: string; deliveredTopicIds: string[]; covered: number; total: number; percent: number }
export type CoverageDetail = Record<string, Record<string, { status: 'planned' | 'delivered'; date: string; teacherName: string }>>

export type AcdmcOverview = {
  today: string
  week: { from: string; to: string }
  stats: {
    plansThisWeek: number
    deliveredThisWeek: number
    homeworkDueThisWeek: number
    assignmentsAwaitingMarks: number
    syllabiPublished: number
    syllabiTotal: number
  }
  coverage: Array<{ curriculumId: string; className: string; section: string; subjectName: string; covered: number; total: number; percent: number }>
  dueSoon: Array<{ kind: ClassWorkKind; _id: string; title: string; className: string; section: string; subjectName: string; date: string; turnedIn: number; total: number }>
  todayPlans: LessonPlan[]
}

export type ListParams = Record<string, string | number | undefined>

export const CLASS_WORK_PATH: Record<ClassWorkKind, string> = {
  homework: '/acdmc/homework',
  assignment: '/acdmc/assignments',
  quiz: '/acdmc/quizzes',
}

const clean = (params: ListParams) =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''))

const acdmcService = {
  getOptions: async () => (await api.get('/acdmc/options')).data.data as AcdmcOptions,
  getOverview: async () => (await api.get('/acdmc/overview')).data.data as AcdmcOverview,

  listLessonPlans: async (params: ListParams) =>
    (await api.get('/acdmc/lesson-plans', { params: clean(params) })).data.data as ListResult<LessonPlan, LessonPlanStatus>,
  getLessonPlan: async (id: string) => (await api.get(`/acdmc/lesson-plans/${id}`)).data.data as LessonPlan,
  saveLessonPlan: async (id: string | undefined, payload: Partial<LessonPlan>) =>
    (id ? await api.put(`/acdmc/lesson-plans/${id}`, payload) : await api.post('/acdmc/lesson-plans', payload)).data
      .data as LessonPlan,
  setLessonPlanStatus: async (id: string, payload: { status: LessonPlanStatus; deliveryNote?: string; deliveredOn?: string }) =>
    (await api.post(`/acdmc/lesson-plans/${id}/status`, payload)).data.data as LessonPlan,
  deleteLessonPlan: async (id: string) => (await api.delete(`/acdmc/lesson-plans/${id}`)).data,

  listClassWork: async (kind: ClassWorkKind, params: ListParams) =>
    (await api.get(CLASS_WORK_PATH[kind], { params: clean(params) })).data.data as ListResult<ClassWork, ClassWorkStatus>,
  getClassWork: async (kind: ClassWorkKind, id: string) => (await api.get(`${CLASS_WORK_PATH[kind]}/${id}`)).data.data as ClassWork,
  saveClassWork: async (kind: ClassWorkKind, id: string | undefined, payload: Partial<ClassWork>) =>
    (id ? await api.put(`${CLASS_WORK_PATH[kind]}/${id}`, payload) : await api.post(CLASS_WORK_PATH[kind], payload)).data
      .data as ClassWork,
  setClassWorkStatus: async (kind: ClassWorkKind, id: string, status: ClassWorkStatus) =>
    (await api.post(`${CLASS_WORK_PATH[kind]}/${id}/status`, { status })).data.data as ClassWork,
  deleteClassWork: async (kind: ClassWorkKind, id: string) => (await api.delete(`${CLASS_WORK_PATH[kind]}/${id}`)).data,
  getRoster: async (kind: ClassWorkKind, id: string) => (await api.get(`${CLASS_WORK_PATH[kind]}/${id}/roster`)).data.data as Roster,
  saveSubmissions: async (kind: ClassWorkKind, id: string, rows: Array<Partial<RosterRow>>) =>
    (await api.put(`${CLASS_WORK_PATH[kind]}/${id}/submissions`, { rows })).data.data as { summary: SubmissionSummary },

  listCurriculum: async (params: ListParams) =>
    (await api.get('/acdmc/curriculum', { params: clean(params) })).data.data as ListResult<CurriculumListItem, CurriculumStatus>,
  getCurriculum: async (id: string) => (await api.get(`/acdmc/curriculum/${id}`)).data.data as Curriculum,
  getCoverage: async (id: string) =>
    (await api.get(`/acdmc/curriculum/${id}/coverage`)).data.data as { sections: CoverageSection[]; detail: CoverageDetail },
  saveCurriculum: async (id: string | undefined, payload: Partial<Curriculum>) =>
    (id ? await api.put(`/acdmc/curriculum/${id}`, payload) : await api.post('/acdmc/curriculum', payload)).data
      .data as Curriculum,
  setCurriculumStatus: async (id: string, status: CurriculumStatus) =>
    (await api.post(`/acdmc/curriculum/${id}/status`, { status })).data.data as Curriculum,
  copyCurriculum: async (id: string, payload: { classNames: string[]; toNextSession: boolean }) =>
    (await api.post(`/acdmc/curriculum/${id}/copy`, payload)).data.data as { created: string[]; skipped: string[] },
  deleteCurriculum: async (id: string) => (await api.delete(`/acdmc/curriculum/${id}`)).data,
}

export default acdmcService
