import { api } from '@/lib/api'

// Lesson plans and syllabus coverage (/api/acdmc), the website's Academics → Lesson plans and Overview.

export type LessonStatus = 'draft' | 'planned' | 'delivered' | 'cancelled'

export interface LessonPlan {
  _id: string
  title: string
  className: string
  section: string
  subjectName: string
  teacherName?: string
  date: string
  periods?: number
  topic?: string
  objectives?: string
  activities?: string
  resources?: string
  assessment?: string
  status: LessonStatus | 'published'
  deliveredOn?: string
  deliveryNote?: string
}

export interface Coverage {
  curriculumId: string
  className: string
  section: string
  subjectName: string
  covered: number
  total: number
  percent: number
}

export const lessonService = {
  list: (from: string, to: string) => api.get<{ items: LessonPlan[] }>('/acdmc/lesson-plans', { from, to, limit: 100 }),
  /** "delivered" marks it taught (with an optional note); the server keeps the curriculum's coverage in step. */
  setStatus: (id: string, status: LessonStatus, deliveryNote?: string) =>
    api.post<LessonPlan>(`/acdmc/lesson-plans/${encodeURIComponent(id)}/status`, { status, ...(deliveryNote ? { deliveryNote } : {}) }),
  /** Syllabus coverage per class, section and subject (and this week's class work). */
  overview: () => api.get<{ today: string; coverage: Coverage[] }>('/acdmc/overview'),
}
