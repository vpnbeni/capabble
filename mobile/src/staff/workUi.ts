import { ClipboardList, FileQuestion, NotebookPen, type LucideIcon } from 'lucide-react-native'

import type { SubmissionStatus, WorkKind } from '@/services/homeworkService'
import type { Tone } from '@/theme/tokens'

/** Words and icons for each kind of class work. Quizzes are written (with their questions) on the website. */
export const WORK: Record<WorkKind, { title: string; one: string; post?: string; icon: LucideIcon }> = {
  homework: { title: 'Homework', one: 'homework', post: 'Post homework', icon: NotebookPen },
  assignment: { title: 'Assignments', one: 'assignment', post: 'Set an assignment', icon: ClipboardList },
  quiz: { title: 'Quizzes', one: 'quiz', icon: FileQuestion },
}

// Same words and tones as the website (client/src/components/acdmc/AcdmcUi.tsx).
export const SUBMISSION: Record<SubmissionStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  submitted: { label: 'Submitted', tone: 'success' },
  late: { label: 'Late', tone: 'warning' },
  missing: { label: 'Missing', tone: 'danger' },
  excused: { label: 'Excused', tone: 'neutral' },
}
