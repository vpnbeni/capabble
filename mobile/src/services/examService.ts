import { api, requestBytes } from '@/lib/api'

// Exam results for staff (/api/exam-definitions, /api/exam-results), the website's Exams → Result.
// Marks are keyed by subject slug ("social-science"). "Own classes only" logins get their sections.

export interface ExamDefinition {
  _id: string
  name: string
  code?: string
  duration?: string
  maximumMarks?: number
  displayOrder?: number
  /** Subjects this exam covers (slugs); empty means every subject of the class. */
  subjectKeys?: string[]
  resultsPublished?: boolean
}

export type EntryStatus = 'complete' | 'partial' | 'pending'

export interface ClassEntryStatus {
  class: string
  section: string
  studentCount: number
  overallStatus?: EntryStatus
  filledCells?: number
  totalCells?: number
  subjects: { subjectId: string; subjectName: string; filledCount: number; pendingCount: number; studentCount: number; status: EntryStatus }[]
}

export interface StudentResult {
  studentId: string
  marks: Record<string, number | string | null>
  absent: boolean
  absentSubjects: string[]
}

export interface SubjectMark {
  studentId: string
  /** null: no mark; absent: marked absent for this subject. */
  value: number | null
  absent: boolean
}

/** An internal exam's datesheet for one class (GET /datesheets?examType=internal). */
export interface ExamDatesheet {
  _id: string
  title: string
  class: string
  section?: string
  academicYear?: string
  examId?: { _id: string; name: string } | string | null
  /** draft can be changed; published can't (the server refuses). */
  status?: string
  subjects: {
    subject?: { _id?: string; name?: string } | string | null
    examDate: string
    dayName?: string
    timeSlot?: { start?: string; end?: string }
    duration?: number
    instructions?: string
    isOptional?: boolean
  }[]
}

/** What the exam form sends (the website's Exams sheet). */
export interface ExamInput {
  name: string
  code: string
  duration: string
  maximumMarks: number
  displayOrder: number
}

/** A subject of a class from the school's subject list (/subjects), what a datesheet points at. */
export interface ClassSubject {
  _id: string
  name: string
  code?: string
  class?: string
}

/** One paper on a datesheet as the server takes it; the whole list is sent each time. */
export interface DatesheetPaper {
  subject: string
  examDate: string
  timeSlot: { start: string; end: string }
  duration: number
  instructions?: string
  isOptional?: boolean
}

export interface NewDatesheet {
  title: string
  examId: string
  class: string
  section: string
  academicYear: string
  startDate: string
  endDate: string
}

/** The exam's subject keys as the server stores them ("Social Science" → "social-science"). */
export const subjectKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, '-')

const examPath = (id: string) => `/exam-definitions/${encodeURIComponent(id)}`
const sheetPath = (id: string) => `/datesheets/${encodeURIComponent(id)}`

export const examService = {
  exams: () => api.get<ExamDefinition[]>('/exam-definitions'),
  entryStatus: (examId: string) => api.get<ClassEntryStatus[]>('/exam-results/status', { examId }),
  results: (examId: string, className: string, section: string) =>
    api.get<StudentResult[]>('/exam-results', { examId, class: className, section }),
  /** One datesheet with its subjects' names (the list sends subject ids only). */
  datesheet: async (id: string) => (await api.get<{ datesheet: ExamDatesheet }>(`/datesheets/${encodeURIComponent(id)}`)).datesheet,
  datesheets: async () => (await api.get<{ datesheets: ExamDatesheet[] }>('/datesheets', { examType: 'internal' })).datesheets,
  /** Families see marks once results are published (and are told). */
  setPublished: (examId: string, published: boolean) => api.put<unknown>(`/exam-definitions/${encodeURIComponent(examId)}/results-publication`, { published }),
  /** One student's report card for an exam, as a PDF in the school's design. */
  reportCard: (examId: string, studentId: string) => requestBytes('/report-card/single', { params: { examId, studentId } }),
  createExam: (input: ExamInput) => api.post<ExamDefinition>('/exam-definitions', input),
  /** Partial: only the fields sent change. */
  updateExam: (id: string, input: Partial<ExamInput>) => api.put<ExamDefinition>(examPath(id), input),
  removeExam: (id: string) => api.delete<unknown>(examPath(id)),
  /** Sets one exam's subjects; other exams in the matrix stay as they are. */
  setExamSubjects: (id: string, keys: string[]) => api.put<unknown>('/exam-definitions/subject-matrix', { matrix: { [id]: keys } }),
  /** One class's subjects from the school's subject list. */
  classSubjects: (className: string) => api.get<ClassSubject[]>('/subjects', { class: className, page: 1, limit: 100 }),
  /** A page of the school's whole subject list (100 a page, the server's most). */
  allSubjects: (page: number) => api.get<ClassSubject[]>('/subjects', { page, limit: 100, sortField: 'name' }),
  /** Subjects as the timetable knows them (school-wide and per class-section), by name. */
  timetableSubjects: async () => {
    const state = await api.get<{ subjects?: { name?: string }[]; classes?: { className?: string; subjects?: string[] }[] }>('/timetable/state')
    return {
      names: (state?.subjects ?? []).map((row) => row.name?.trim() ?? '').filter(Boolean),
      byClass: (state?.classes ?? []).map((row) => ({ className: row.className ?? '', subjects: (row.subjects ?? []).map((name) => name.trim()).filter(Boolean) })),
    }
  },
  /** Adds a subject to the school's subject list for one class (a datesheet points at these). */
  createSubject: (input: { name: string; code: string; class: string }) => api.post<ClassSubject>('/subjects', { ...input, duration: 3 }),
  createDatesheet: async (input: NewDatesheet) =>
    (await api.post<{ datesheet: ExamDatesheet }>('/datesheets', { ...input, examType: 'internal', generalInstructions: [] })).datesheet,
  /** Draft only. The papers list replaces the saved one, so it is always sent whole. */
  updateDatesheet: async (id: string, input: { title?: string; startDate?: string; endDate?: string; subjects?: DatesheetPaper[] }) =>
    (await api.put<{ datesheet: ExamDatesheet }>(sheetPath(id), input)).datesheet,
  publishDatesheet: (id: string) => api.post<unknown>(`${sheetPath(id)}/publish`),
  removeDatesheet: (id: string) => api.delete<unknown>(sheetPath(id)),
  /** A class's admit cards in the school's design, one PDF. */
  admitCards: (examId: string, className: string, section: string) =>
    requestBytes('/admit-cards', { method: 'POST', body: { examId, class: className, section } }),
  /** A class's award list; subject and date only fill the sheet's header. */
  awardList: (examId: string, className: string, section: string, subject = '', examDate = '') =>
    requestBytes('/award-list', { method: 'POST', body: { examId, class: className, section, subject, examDate } }),
  /** Every report card of a class for an exam, one PDF. */
  reportCards: (examId: string, className: string, section: string) =>
    requestBytes('/report-card/bulk', { params: { examId, class: className, section } }),
  /** Saves one subject for a class; other subjects' marks stay as they are on the server. */
  saveSubject: (examId: string, className: string, section: string, subjectId: string, rows: SubjectMark[]) =>
    api.post<unknown>('/exam-results/bulk', {
      examId,
      class: className,
      section,
      subjectId,
      results: rows.map((row) => ({
        studentId: row.studentId,
        marks: row.absent || row.value === null ? {} : { [subjectId]: row.value },
        absentSubjects: row.absent ? [subjectId] : [],
      })),
    }),
}
