import React, { useEffect, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { BookOpen } from 'lucide-react'
import { Badge, Checkbox, Combobox, EmptyState, Select, TextField, formatDate, type Tone } from '@/components/ui'
import { useAcdmcOptions, useCoverage, useCurriculum, useCurriculumList } from '@/hooks/useAcdmc'
import { selectUser } from '@/redux/slices/authSlice'
import type {
  AcdmcOptions,
  ClassWorkKind,
  ClassWorkStatus,
  CurriculumStatus,
  LessonPlanStatus,
  SubmissionStatus,
} from '@/services/acdmcService'

// ── Labels and tones ─────────────────────────────────────────────────────

export const STATUS_META: Record<LessonPlanStatus | ClassWorkStatus | CurriculumStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  planned: { label: 'Planned', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  published: { label: 'Published', tone: 'info' },
  closed: { label: 'Closed', tone: 'success' },
}

export const SUBMISSION_META: Record<SubmissionStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  submitted: { label: 'Submitted', tone: 'success' },
  late: { label: 'Late', tone: 'warning' },
  missing: { label: 'Missing', tone: 'danger' },
  excused: { label: 'Excused', tone: 'neutral' },
}

export const KIND_META: Record<ClassWorkKind, { label: string; plural: string; path: string; noun: string }> = {
  homework: { label: 'Homework', plural: 'Homework', path: '/acdmc/homework', noun: 'homework' },
  assignment: { label: 'Assignment', plural: 'Assignments', path: '/acdmc/assignment', noun: 'assignment' },
  quiz: { label: 'Quiz', plural: 'Quizzes', path: '/acdmc/quiz', noun: 'quiz' },
}

export const StatusBadge: React.FC<{ status: keyof typeof STATUS_META }> = ({ status }) => {
  const meta = STATUS_META[status] || STATUS_META.draft
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}

export const SubmissionBadge: React.FC<{ status: SubmissionStatus }> = ({ status }) => {
  const meta = SUBMISSION_META[status] || SUBMISSION_META.pending
  return <Badge tone={meta.tone}>{meta.label}</Badge>
}

/** "7th" → "7", so the UI says "Class 7-A" the way schools do. */
export const classShort = (className: string) => {
  const match = /^(\d+)(st|nd|rd|th)$/i.exec(String(className || '').trim())
  return match ? match[1] : String(className || '').trim()
}

export const classLabel = (className?: string, section?: string) => {
  if (!className) return '—'
  return `Class ${classShort(className)}${section ? `-${section}` : ''}`
}

/** Deleting academic records is limited to school admins (the API enforces it too). */
export const useIsAdmin = () => useSelector(selectUser)?.role === 'admin'

export const errorMessage = (error: unknown, fallback = 'Something went wrong. Try again.') => {
  const data = (error as { response?: { data?: { message?: string; error?: string } } })?.response?.data
  return data?.message || data?.error || (error as Error)?.message || fallback
}

export const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Dates inside the current year drop the year, as the design system asks. */
export const shortDate = (value?: string) => {
  if (!value) return '—'
  const sameYear = value.slice(0, 4) === String(new Date().getFullYear())
  return formatDate(`${value}T00:00:00`, { year: !sameYear })
}

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (value?: string) => {
  const [y, m] = String(value || '').split('-').map(Number)
  if (!y || !m) return '—'
  return `${MONTH_LABELS[m - 1]} ${y}`
}

// ── Option helpers ───────────────────────────────────────────────────────

export const classSelectOptions = (options?: AcdmcOptions) =>
  (options?.classOptions || []).map((c) => ({ value: c.className, label: `Class ${classShort(c.className)}` }))

export const sectionSelectOptions = (options: AcdmcOptions | undefined, className: string) =>
  (options?.classOptions.find((c) => c.className === className)?.sections || []).map((s) => ({ value: s, label: s }))

/** Subjects for a class: the class's own subjects, timetable allocations, then school-wide subjects. */
export const subjectNamesFor = (options: AcdmcOptions | undefined, className: string, section = '') => {
  if (!options) return []
  const names = new Set<string>()
  options.allocations
    .filter((a) => a.className === className && (!section || a.section === section))
    .forEach((a) => names.add(a.subjectName))
  options.subjects.filter((s) => s.className === className).forEach((s) => names.add(s.name))
  if (!names.size) options.subjects.forEach((s) => names.add(s.name))
  return Array.from(names).filter(Boolean).sort((a, b) => a.localeCompare(b))
}

export const allSubjectNames = (options?: AcdmcOptions) =>
  Array.from(new Set((options?.subjects || []).map((s) => s.name))).sort((a, b) => a.localeCompare(b))

// ── Class, section, subject and teacher fields ──────────────────────────

export type ClassContextValue = {
  className: string
  section: string
  subjectName: string
  teacherId: string
  teacherName: string
}

export type ClassContextErrors = Partial<Record<keyof ClassContextValue, string>>

/**
 * The "Class and subject" form section shared by lesson plans, homework, assignments
 * and quizzes. Picking class, section and subject preselects the teacher the
 * timetable allocates to that class, when the school uses the Timetable module.
 */
export const ClassContextFields: React.FC<{
  value: ClassContextValue
  onChange: (patch: Partial<ClassContextValue>) => void
  errors?: ClassContextErrors
}> = ({ value, onChange, errors = {} }) => {
  const { data: options } = useAcdmcOptions()
  const sections = sectionSelectOptions(options, value.className)
  const subjects = subjectNamesFor(options, value.className, value.section)

  const allocated = useMemo(
    () =>
      options?.allocations.find(
        (a) =>
          a.className === value.className &&
          a.section === value.section &&
          a.subjectName.toLowerCase() === value.subjectName.toLowerCase()
      ),
    [options, value.className, value.section, value.subjectName]
  )

  useEffect(() => {
    if (allocated && !value.teacherId && options?.teachers.some((t) => t._id === allocated.teacherId)) {
      onChange({ teacherId: allocated.teacherId, teacherName: allocated.teacherName })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocated])

  const teacherOptions = (options?.teachers || []).map((t) => ({
    value: t._id,
    label: t.name,
    meta: [t.designation, t.department].filter(Boolean).join(' · '),
    keywords: t.employeeId,
  }))

  return (
    <div className="cb-form-grid">
      <Select
        label="Class"
        required
        placeholder="Choose class"
        options={classSelectOptions(options)}
        value={value.className}
        error={errors.className}
        onChange={(e) => onChange({ className: e.target.value, section: '', subjectName: '', teacherId: '', teacherName: '' })}
      />
      <Select
        label="Section"
        required
        placeholder={value.className ? 'Choose section' : 'Choose a class first'}
        options={sections}
        value={value.section}
        disabled={!value.className}
        error={errors.section}
        onChange={(e) => onChange({ section: e.target.value })}
      />
      {subjects.length ? (
        <Combobox
          label="Subject"
          required
          placeholder="Search subjects"
          options={subjects.map((s) => ({ value: s, label: s }))}
          value={value.subjectName}
          error={errors.subjectName}
          clearable={false}
          onChange={(subjectName) => onChange({ subjectName })}
        />
      ) : (
        <TextField
          label="Subject"
          required
          value={value.subjectName}
          error={errors.subjectName}
          hint="Add subjects under Subjects to pick from a list."
          onChange={(e) => onChange({ subjectName: e.target.value })}
        />
      )}
      {teacherOptions.length ? (
        <Combobox
          label="Teacher"
          placeholder="Search teachers"
          options={teacherOptions}
          value={value.teacherId}
          selectedLabel={value.teacherId ? undefined : value.teacherName}
          hint={allocated && allocated.teacherId === value.teacherId ? 'Teaches this class in the timetable' : undefined}
          onChange={(teacherId) =>
            onChange({ teacherId, teacherName: options?.teachers.find((t) => t._id === teacherId)?.name || '' })
          }
        />
      ) : (
        <TextField
          label="Teacher"
          value={value.teacherName}
          onChange={(e) => onChange({ teacherName: e.target.value, teacherId: '' })}
        />
      )}
    </div>
  )
}

// ── Syllabus topic picker ────────────────────────────────────────────────

/**
 * Checkbox list of the syllabus topics for a class and subject. Topics already
 * delivered to the section say so, which helps avoid planning them twice.
 */
export const TopicPicker: React.FC<{
  className: string
  section: string
  subjectName: string
  curriculumId: string
  topicIds: string[]
  onChange: (value: { curriculumId: string; topicIds: string[] }) => void
}> = ({ className, section, subjectName, curriculumId, topicIds, onChange }) => {
  const ready = Boolean(className && subjectName)
  const { data: list, isLoading: listLoading } = useCurriculumList({ className, subjectName }, ready)
  const match = ready ? list?.items.find((c) => c.subjectName.toLowerCase() === subjectName.toLowerCase()) : undefined
  const { data: curriculum, isLoading } = useCurriculum(match?._id)
  const { data: coverage } = useCoverage(match?._id)
  const delivered = (section && coverage?.detail[section]) || {}

  useEffect(() => {
    const next = match?._id || ''
    if (!ready || listLoading) return
    if (next !== curriculumId) onChange({ curriculumId: next, topicIds: next ? topicIds : [] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?._id, ready, listLoading])

  if (!ready) {
    return <p className="cb-muted ac-note">Choose a class and subject to pick topics from its syllabus.</p>
  }
  if (listLoading || (match && isLoading)) {
    return (
      <div className="cb-table-state" role="status">
        <span className="cb-spinner" aria-hidden="true" />
        Loading syllabus
      </div>
    )
  }
  if (!match || !curriculum || !curriculum.units.some((u) => u.topics.length)) {
    return (
      <EmptyState
        compact
        icon={BookOpen}
        title={`No ${subjectName} syllabus for ${classLabel(className)}`}
        body="Add one under Curriculum to track which topics each section has covered."
      />
    )
  }

  const toggle = (id: string, on: boolean) => {
    const next = on ? [...topicIds, id] : topicIds.filter((t) => t !== id)
    onChange({ curriculumId: match._id, topicIds: next })
  }

  return (
    <div className="ac-topics">
      {curriculum.units.map((unit) => (
        <fieldset key={unit._id || unit.title} className="ac-topics__unit">
          <legend className="cb-subhead">{unit.title}</legend>
          {unit.topics.map((topic) => {
            const id = topic._id as string
            const done = delivered[id]
            return (
              <Checkbox
                key={id}
                label={topic.title}
                description={
                  done
                    ? `${done.status === 'delivered' ? 'Delivered' : 'Planned'} ${shortDate(done.date)}${done.teacherName ? ` · ${done.teacherName}` : ''}`
                    : undefined
                }
                checked={topicIds.includes(id)}
                onChange={(on) => toggle(id, on)}
              />
            )
          })}
        </fieldset>
      ))}
    </div>
  )
}

// ── Printing ─────────────────────────────────────────────────────────────

/** Prints an element's markup on its own page (question papers). */
export const printElement = (element: HTMLElement | null, title: string) => {
  if (!element) return
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) return
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { font: 13px/1.5 Inter, system-ui, sans-serif; color: #000; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; text-align: center; }
  p { margin: 0; }
  ol { padding-left: 20px; margin: 0; }
  li { margin: 0 0 14px; break-inside: avoid; }
  .ac-paper__meta { display: flex; justify-content: space-between; border-bottom: 1px solid #000; padding: 6px 0; margin: 8px 0 16px; font-size: 12px; }
  .ac-paper__school { text-align: center; font-size: 12px; }
  .ac-paper__q { display: flex; justify-content: space-between; gap: 12px; }
  .ac-paper__marks { white-space: nowrap; font-size: 12px; }
  .ac-paper__options { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; margin-top: 4px; padding-left: 0; list-style: none; }
  .ac-paper__options li { margin: 0; }
  .ac-paper__lines { margin-top: 8px; border-bottom: 1px solid #999; height: 22px; }
  .ac-paper__instructions { margin-bottom: 12px; white-space: pre-wrap; }
  .ac-paper__key { margin-top: 24px; border-top: 1px dashed #000; padding-top: 8px; page-break-before: always; }
</style></head><body>${element.innerHTML}</body></html>`)
  doc.close()
  const run = () => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 1000)
  }
  if (doc.readyState === 'complete') setTimeout(run, 50)
  else frame.onload = run
}
