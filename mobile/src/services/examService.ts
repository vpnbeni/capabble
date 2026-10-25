import { api } from '@/lib/api'

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

export const examService = {
  exams: () => api.get<ExamDefinition[]>('/exam-definitions'),
  entryStatus: (examId: string) => api.get<ClassEntryStatus[]>('/exam-results/status', { examId }),
  results: (examId: string, className: string, section: string) =>
    api.get<StudentResult[]>('/exam-results', { examId, class: className, section }),
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
