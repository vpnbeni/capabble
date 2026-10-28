import { api } from '@/lib/api'

// Homework, assignments and quizzes (/api/acdmc/…), the same records as the website's Academics.
// Teachers limited to their own classes only see and change those (the server checks).

export type WorkKind = 'homework' | 'assignment' | 'quiz'
export type HomeworkStatus = 'draft' | 'published' | 'closed'
export type SubmissionStatus = 'pending' | 'submitted' | 'late' | 'missing' | 'excused'

const PATH: Record<WorkKind, string> = { homework: '/acdmc/homework', assignment: '/acdmc/assignments', quiz: '/acdmc/quizzes' }

export interface WorkSummary {
  total: number
  pending: number
  submitted: number
  late: number
  missing: number
  excused: number
  turnedIn: number
  marked: number
  average: number | null
  maxMarks: number | null
}

export interface Homework {
  _id: string
  title: string
  className: string
  section: string
  subjectName: string
  teacherName?: string
  assignedDate?: string
  dueDate: string
  instructions?: string
  status: HomeworkStatus
  /** Assignments and quizzes. */
  maxMarks?: number | null
  /** Quizzes: the day it is taken. */
  date?: string
  topic?: string
  curriculumId?: string
  topicIds?: string[]
  summary?: WorkSummary
}

export interface HomeworkInput {
  title: string
  teacherId?: string
  className: string
  section: string
  subjectName: string
  assignedDate: string
  dueDate: string
  instructions: string
  status: HomeworkStatus
  maxMarks?: number
  /** Sent back unchanged on an edit, or the server unlinks the curriculum topics. */
  curriculumId?: string
  topicIds?: string[]
}

export interface SubmissionRow {
  studentId: string
  studentName: string
  rollNo: string
  status: SubmissionStatus
  marks: number | null
  remark: string
  /** False for a student who has since left the class (their row is kept). */
  enrolled: boolean
}

export interface Roster {
  work: Homework
  rows: SubmissionRow[]
  maxMarks: number | null
  /** Assignments and quizzes take marks; homework doesn't. */
  marked: boolean
  summary: WorkSummary
}

export interface AcademicOptions {
  classOptions: { className: string; sections: string[] }[]
  /** Subjects per class; an empty className means every class. */
  subjects: { name: string; className: string }[]
}

const one = (kind: WorkKind, id: string) => `${PATH[kind]}/${encodeURIComponent(id)}`

export const homeworkService = {
  options: () => api.get<AcademicOptions>('/acdmc/options'),
  list: (kind: WorkKind, params: { className?: string; section?: string; from?: string }) =>
    api.get<{ items: Homework[] }>(PATH[kind], { ...params, limit: 50 }),
  get: (kind: WorkKind, id: string) => api.get<Homework>(one(kind, id)),
  create: (kind: WorkKind, input: HomeworkInput) => api.post<Homework>(PATH[kind], input),
  update: (kind: WorkKind, id: string, input: HomeworkInput) => api.put<Homework>(one(kind, id), input),
  setStatus: (kind: WorkKind, id: string, status: HomeworkStatus) => api.post<Homework>(`${one(kind, id)}/status`, { status }),
  /** The class with each student's submission (students who joined later show as pending). */
  roster: (kind: WorkKind, id: string) => api.get<Roster>(`${one(kind, id)}/roster`),
  /** Only the rows that changed, each whole (status, marks and remark together). */
  saveSubmissions: (kind: WorkKind, id: string, rows: SubmissionRow[]) =>
    api.put<{ summary: WorkSummary }>(`${one(kind, id)}/submissions`, {
      rows: rows.map(({ studentId, studentName, rollNo, status, marks, remark }) => ({ studentId, studentName, rollNo, status, marks, remark })),
    }),
}
