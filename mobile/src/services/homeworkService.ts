import { api } from '@/lib/api'

// Homework (/api/acdmc/homework), the same records as the website's Academics → Homework.
// Teachers limited to their own classes only see and change those (the server checks).

export type HomeworkStatus = 'draft' | 'published' | 'closed'

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
}

export interface AcademicOptions {
  classOptions: { className: string; sections: string[] }[]
  /** Subjects per class; an empty className means every class. */
  subjects: { name: string; className: string }[]
}

export const homeworkService = {
  options: () => api.get<AcademicOptions>('/acdmc/options'),
  list: (params: { className?: string; section?: string; from?: string }) =>
    api.get<{ items: Homework[] }>('/acdmc/homework', { ...params, limit: 50 }),
  get: (id: string) => api.get<Homework>(`/acdmc/homework/${encodeURIComponent(id)}`),
  create: (input: HomeworkInput) => api.post<Homework>('/acdmc/homework', input),
  update: (id: string, input: HomeworkInput) => api.put<Homework>(`/acdmc/homework/${encodeURIComponent(id)}`, input),
  setStatus: (id: string, status: HomeworkStatus) => api.post<Homework>(`/acdmc/homework/${encodeURIComponent(id)}/status`, { status }),
}
