import { api, requestBytes } from '@/lib/api'

// Exam results for staff (/api/exam-definitions, /api/exam-results), the website's Exams → Result.
// Marks are keyed by subject slug ("social-science"). "Own classes only" logins get their sections.

export interface ExamDefinition {
  _id: string
  name: string
  code?: string
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
  examId?: { _id: string; name: string } | string | null
  status?: string
  subjects: { subject?: { name?: string } | null; examDate: string; dayName?: string; timeSlot?: { start?: string; end?: string }; instructions?: string }[]
}

export const examService = {
  exams: () => api.get<ExamDefinition[]>('/exam-definitions'),
  entryStatus: (examId: string) => api.get<ClassEntryStatus[]>('/exam-results/status', { examId }),
  results: (examId: string, className: string, section: string) =>
    api.get<StudentResult[]>('/exam-results', { examId, class: className, section }),
  datesheets: async () => (await api.get<{ datesheets: ExamDatesheet[] }>('/datesheets', { examType: 'internal' })).datesheets,
  /** Families see marks once results are published (and are told). */
  setPublished: (examId: string, published: boolean) => api.put<unknown>(`/exam-definitions/${encodeURIComponent(examId)}/results-publication`, { published }),
  /** One student's report card for an exam, as a PDF in the school's design. */
  reportCard: (examId: string, studentId: string) => requestBytes('/report-card/single', { params: { examId, studentId } }),
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
