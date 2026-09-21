import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import datesheetService from '@/services/datesheetService'
import subjectService from '@/services/subjectService'
import exmclExamService, { type ExmclExamDefinition } from '@/services/exmclExamService'
import { useAcademicSession } from '@/contexts/AcademicSessionContext'
import { useTimetable } from '@/contexts/TimetableContext'
import { isSeniorSecondaryClass, sortClassNames, sortSectionNames } from '@/constants/studentClasses'
import api from '@/services/api'

type SubjectOption = {
  _id: string
  name: string
  code: string
  class: string
  duration?: number
}

type ScheduleRow = {
  id: string
  subjectId: string
  examDate: string
  start: string
  end: string
  duration: number
}

type SavedDatesheet = {
  _id: string
  title: string
  class: string
  section?: string
  examId?: { _id?: string; name?: string; code?: string } | string
  subjects: Array<{
    _id?: string
    subject?: { _id?: string; name?: string; code?: string }
    examDate?: string
    timeSlot?: { start?: string; end?: string }
    duration?: number
  }>
  createdAt: string
}

type ClassSectionEntry = {
  _id?: { class?: string; section?: string }
  count?: number
  active?: number
}

const toAcademicYear = (session?: string | null) => {
  if (session && /^\d{4}-\d{4}$/.test(session)) return session
  const now = new Date()
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1
  return `${year}-${year + 1}`
}

const generateRowId = () => `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

const normalizeSubjectKey = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')

const createEmptyRow = (subject?: SubjectOption): ScheduleRow => ({
  id: generateRowId(),
  subjectId: subject?._id || '',
  examDate: '',
  start: '10:30',
  end: '13:30',
  duration: Number(subject?.duration || 180),
})

const ExmclDatesheets: React.FC = () => {
  const { currentSession } = useAcademicSession()
  const {
    isHydrated: isTimetableHydrated,
    rehydrate: rehydrateTimetable,
    matrixClasses,
    matrixSections,
    matrixSelection,
    classes: timetableClasses,
  } = useTimetable()
  const [loading, setLoading] = useState(true)
  const [examsLoading, setExamsLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exams, setExams] = useState<ExmclExamDefinition[]>([])
  const [subjects, setSubjects] = useState<SubjectOption[]>([])
  const [classSectionEntries, setClassSectionEntries] = useState<ClassSectionEntry[]>([])
  const [savedDatesheets, setSavedDatesheets] = useState<SavedDatesheet[]>([])
  const [selectedExamId, setSelectedExamId] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState<ScheduleRow[]>([createEmptyRow()])

  const selectedExam = exams.find((exam) => exam._id === selectedExamId)
  const requiresSection = isSeniorSecondaryClass(selectedClass)

  const loadData = async () => {
    setLoading(true)
    setExamsLoading(true)

    const [examResult, subjectResult, datesheetResult, statsResult] = await Promise.allSettled([
      exmclExamService.getAll(),
      subjectService.getAll({ page: 1, limit: 500 }),
      datesheetService.getAll({ examType: 'internal' }),
      api.get('/students/stats', { params: { lite: true } }),
    ])

    if (examResult.status === 'fulfilled') {
      setExams(examResult.value)
    } else {
      setExams([])
      toast.error('Failed to load exams. Check that ExmCl Exams is enabled for your account.')
    }
    setExamsLoading(false)

    if (subjectResult.status === 'fulfilled') {
      setSubjects(Array.isArray(subjectResult.value?.data?.data) ? subjectResult.value.data.data : [])
    } else {
      setSubjects([])
    }

    if (datesheetResult.status === 'fulfilled') {
      setSavedDatesheets(
        Array.isArray(datesheetResult.value?.data?.data?.datesheets)
          ? datesheetResult.value.data.data.datesheets
          : []
      )
    } else {
      setSavedDatesheets([])
    }

    if (statsResult.status === 'fulfilled') {
      setClassSectionEntries(
        Array.isArray(statsResult.value?.data?.data?.byClassSection)
          ? statsResult.value.data.data.byClassSection
          : []
      )
    } else {
      setClassSectionEntries([])
    }

    if (
      examResult.status === 'rejected' &&
      subjectResult.status === 'rejected' &&
      datesheetResult.status === 'rejected'
    ) {
      toast.error('Failed to load datesheet data.')
    }

    setLoading(false)
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    if (!isTimetableHydrated) {
      void rehydrateTimetable()
    }
  }, [isTimetableHydrated, rehydrateTimetable])

  const classOptions = useMemo(() => {
    const names = new Set<string>()

    ;(matrixClasses || []).forEach((row) => {
      const className = String(row.name || '').trim()
      if (!className) return
      const hasSelectedSection = (matrixSections || []).some(
        (section) => Boolean(matrixSelection?.[row.id]?.[section.id])
      )
      if (hasSelectedSection || (matrixSections || []).length === 0) {
        names.add(className)
      }
    })

    ;(timetableClasses || []).forEach((row) => {
      const className = String(row.className || '').trim()
      if (className) names.add(className)
    })

    classSectionEntries.forEach((entry) => {
      const className = String(entry?._id?.class || '').trim()
      if (!className) return
      const enrolled = Number(entry.active ?? entry.count)
      if (!Number.isFinite(enrolled) || enrolled > 0) {
        names.add(className)
      }
    })

    subjects.forEach((item) => {
      const className = String(item.class || '').trim()
      if (className) names.add(className)
    })

    return Array.from(names).sort(sortClassNames)
  }, [matrixClasses, matrixSections, matrixSelection, timetableClasses, classSectionEntries, subjects])

  const sectionOptions = useMemo(() => {
    if (!requiresSection || !selectedClass) return []

    const classKey = selectedClass.trim().toLowerCase()
    const fromStudents = classSectionEntries
      .filter((entry) => String(entry?._id?.class || '').trim().toLowerCase() === classKey)
      .map((entry) => String(entry?._id?.section || '').trim())
      .filter(Boolean)

    const matrixClassRow = (matrixClasses || []).find(
      (row) => String(row.name || '').trim().toLowerCase() === classKey
    )
    const fromClassesPage = matrixClassRow
      ? (matrixSections || [])
          .filter((section) => Boolean(matrixSelection?.[matrixClassRow.id]?.[section.id]))
          .map((section) => String(section.name || '').trim())
          .filter(Boolean)
      : []

    const fromTimetableRows = (timetableClasses || [])
      .filter((row) => String(row.className || '').trim().toLowerCase() === classKey)
      .map((row) => String(row.section || '').trim())
      .filter(Boolean)

    return Array.from(new Set([...fromStudents, ...fromClassesPage, ...fromTimetableRows])).sort((a, b) =>
      sortSectionNames(a, b, selectedClass)
    )
  }, [
    classSectionEntries,
    matrixClasses,
    matrixSections,
    matrixSelection,
    requiresSection,
    selectedClass,
    timetableClasses,
  ])

  const filteredSubjects = useMemo(() => {
    if (!selectedClass || !selectedExamId) return []
    const classKey = selectedClass.trim().toLowerCase()
    const examKeys = new Set(
      (selectedExam?.subjectKeys || []).map((key) => normalizeSubjectKey(key)).filter(Boolean)
    )

    const byKey = new Map<string, SubjectOption>()

    const addSubject = (item: SubjectOption) => {
      const name = String(item.name || '').trim()
      if (!name) return
      if (String(item.class || '').trim().toLowerCase() !== classKey) return
      if (examKeys.size > 0) {
        const codeKey = normalizeSubjectKey(item.code)
        const nameKey = normalizeSubjectKey(item.name)
        if (!examKeys.has(codeKey) && !examKeys.has(nameKey)) return
      }
      byKey.set(item._id || `${name}-${item.code}`, item)
    }

    subjects.forEach((item) => addSubject(item))

    ;(timetableClasses || []).forEach((row) => {
      if (String(row.className || '').trim().toLowerCase() !== classKey) return
      if (requiresSection && selectedSection) {
        if (String(row.section || '').trim().toLowerCase() !== selectedSection.trim().toLowerCase()) return
      }
      ;(row.subjects || []).forEach((subjectName) => {
        const trimmed = String(subjectName || '').trim()
        if (!trimmed) return
        const key = normalizeSubjectKey(trimmed)
        if (examKeys.size > 0 && !examKeys.has(key)) return
        const existing = subjects.find(
          (item) =>
            String(item.class || '').trim().toLowerCase() === classKey &&
            normalizeSubjectKey(item.name) === key
        )
        if (existing) {
          addSubject(existing)
          return
        }
        addSubject({
          _id: `timetable-${key}`,
          name: trimmed,
          code: trimmed.slice(0, 8).toUpperCase(),
          class: selectedClass,
        })
      })
    })

    return Array.from(byKey.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    )
  }, [
    subjects,
    selectedClass,
    selectedExamId,
    selectedExam?.subjectKeys,
    selectedSection,
    requiresSection,
    timetableClasses,
  ])

  useEffect(() => {
    setSelectedClass('')
    setSelectedSection('')
    setRows([createEmptyRow()])
  }, [selectedExamId])

  useEffect(() => {
    setSelectedSection('')
    setRows([createEmptyRow()])
  }, [selectedClass])

  useEffect(() => {
    if (selectedExam && selectedClass) {
      setTitle(`${selectedExam.code} — Class ${selectedClass}`)
    }
  }, [selectedExam, selectedClass])

  useEffect(() => {
    if (!selectedExamId || !selectedClass) return
    if (requiresSection && !selectedSection) return
    if (filteredSubjects.length === 0) {
      setRows([createEmptyRow()])
      return
    }
    setRows(filteredSubjects.map((subject) => createEmptyRow(subject)))
  }, [selectedExamId, selectedClass, selectedSection, requiresSection, filteredSubjects])

  const canEditSubjects = Boolean(
    selectedExamId && selectedClass && (!requiresSection || selectedSection) && filteredSubjects.length > 0
  )

  const resetBuilder = () => {
    setSelectedExamId('')
    setSelectedClass('')
    setSelectedSection('')
    setTitle('')
    setRows([createEmptyRow()])
  }

  const addRow = () => {
    setRows((prev) => [...prev, createEmptyRow()])
  }

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((row) => row.id !== id)))
  }

  const updateRow = (id: string, patch: Partial<ScheduleRow>) => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const handleCreateDatesheet = async () => {
    if (!selectedExamId) {
      toast.error('Select an exam first.')
      return
    }
    if (!selectedClass) {
      toast.error('Select a class.')
      return
    }
    if (requiresSection && !selectedSection) {
      toast.error('Select a section for this class.')
      return
    }
    if (!title.trim()) {
      toast.error('Datesheet title is required.')
      return
    }

    const invalidRow = rows.find((row) => !row.subjectId || !row.examDate || !row.start || !row.end || !row.duration)
    if (invalidRow) {
      toast.error('Please fill all subject schedule fields.')
      return
    }

    const examDates = rows.map((row) => new Date(row.examDate))
    const startDate = new Date(Math.min(...examDates.map((date) => date.getTime()))).toISOString().slice(0, 10)
    const endDate = new Date(Math.max(...examDates.map((date) => date.getTime()))).toISOString().slice(0, 10)

    setSaving(true)
    try {
      const createRes = await datesheetService.create({
        title: title.trim(),
        examType: 'internal',
        examId: selectedExamId,
        class: selectedClass,
        section: requiresSection ? selectedSection : '',
        academicYear: toAcademicYear(currentSession),
        startDate,
        endDate,
        generalInstructions: [],
      })

      const createdId = createRes?.data?.data?.datesheet?._id
      if (!createdId) throw new Error('Failed to create datesheet')

      await datesheetService.update(createdId, {
        subjects: rows.map((row) => ({
          subject: row.subjectId,
          examDate: row.examDate,
          timeSlot: { start: row.start, end: row.end },
          duration: Number(row.duration),
          instructions: '',
          isOptional: false,
        })),
      })

      toast.success('Datesheet created successfully.')
      resetBuilder()
      await loadData()
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Unable to create datesheet.'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const getExamLabel = (sheet: SavedDatesheet) => {
    if (sheet.examId && typeof sheet.examId === 'object') {
      return `${sheet.examId.code || ''} — ${sheet.examId.name || ''}`.trim()
    }
    return '—'
  }

  return (
    <div className="space-y-6 p-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Create Datesheet</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose the exam, class, and subjects. For classes up to 10th, one datesheet applies to all sections.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Exam</label>
            <select
              title="Select exam"
              value={selectedExamId}
              onChange={(event) => setSelectedExamId(event.target.value)}
              disabled={examsLoading}
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="">
                {examsLoading ? 'Loading exams...' : exams.length === 0 ? 'No exams found' : 'Select exam'}
              </option>
              {exams.map((exam) => (
                <option key={exam._id} value={exam._id}>
                  {exam.code} — {exam.name}
                </option>
              ))}
            </select>
            {!examsLoading && exams.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                Create exams first under ExmCl → Exams, then return here to build the datesheet.
              </p>
            ) : null}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Class</label>
            <select
              title="Select class"
              value={selectedClass}
              onChange={(event) => setSelectedClass(event.target.value)}
              disabled={!selectedExamId}
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            >
              <option value="">
                {!selectedExamId
                  ? 'Select exam first'
                  : classOptions.length === 0
                    ? 'No classes found'
                    : 'Select class'}
              </option>
              {classOptions.map((className) => (
                <option key={className} value={className}>
                  {className}
                </option>
              ))}
            </select>
            {selectedExamId && classOptions.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                Configure classes under Time Table → Classes, then return here.
              </p>
            ) : null}
          </div>

          {requiresSection ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Section</label>
              <select
                title="Select section"
                value={selectedSection}
                onChange={(event) => setSelectedSection(event.target.value)}
                disabled={!selectedClass}
                className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              >
                <option value="">{selectedClass ? 'Select section' : 'Select class first'}</option>
                {sectionOptions.map((section) => (
                  <option key={section} value={section}>
                    {section}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-end">
              <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                {selectedClass
                  ? 'Shared across all sections for this class.'
                  : 'Section not required up to Class 10.'}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Datesheet Title</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Auto-filled from exam and class"
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </div>
        </div>

        {!canEditSubjects ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {!selectedExamId
              ? 'Start by selecting the exam you are preparing this datesheet for.'
              : !selectedClass
                ? 'Select a class to load subjects for this exam.'
                : requiresSection && !selectedSection
                  ? 'Select a section for Class 11 or 12.'
                  : 'No subjects found for this exam and class. Configure subjects in ExmCl Subjects or Marks Distribution.'}
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-900/40">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Subject</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Date</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Start</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">End</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Duration (min)</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2">
                      <select
                        title="Select subject"
                        value={row.subjectId}
                        onChange={(event) => updateRow(row.id, { subjectId: event.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                      >
                        <option value="">Select subject</option>
                        {filteredSubjects.map((subject) => (
                          <option key={subject._id} value={subject._id}>
                            {subject.code} - {subject.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        title="Exam date"
                        value={row.examDate}
                        onChange={(event) => updateRow(row.id, { examDate: event.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="time"
                        title="Start time"
                        value={row.start}
                        onChange={(event) => updateRow(row.id, { start: event.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="time"
                        title="End time"
                        value={row.end}
                        onChange={(event) => updateRow(row.id, { end: event.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        title="Duration in minutes"
                        min={30}
                        value={row.duration}
                        onChange={(event) => updateRow(row.id, { duration: Number(event.target.value || 0) })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={addRow}
            disabled={!canEditSubjects}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            Add Row
          </button>
          <button
            type="button"
            onClick={handleCreateDatesheet}
            disabled={saving || !canEditSubjects}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Create Datesheet'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Saved Datesheets</h2>
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading datesheets...</div>
        ) : savedDatesheets.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No datesheets yet. Create your first datesheet above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Exam</th>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2">Section</th>
                  <th className="px-3 py-2">Subjects</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {savedDatesheets.map((sheet) => (
                  <tr key={sheet._id}>
                    <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{sheet.title}</td>
                    <td className="px-3 py-2">{getExamLabel(sheet)}</td>
                    <td className="px-3 py-2">{sheet.class}</td>
                    <td className="px-3 py-2">{sheet.section?.trim() ? sheet.section : 'All sections'}</td>
                    <td className="px-3 py-2">{sheet.subjects?.length || 0}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">
                      {new Date(sheet.createdAt).toLocaleDateString('en-GB')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default ExmclDatesheets
