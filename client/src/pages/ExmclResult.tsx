import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Tabs } from '@/components/common/Tabs'
import exmclExamService, { type ExmclExamDefinition } from '@/services/exmclExamService'
import exmclResultService, { type ResultClassSectionStatus } from '@/services/exmclResultService'
import subjectService from '@/services/subjectService'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { useTimetable } from '@/contexts/TimetableContext'
import { sortSectionNames } from '@/constants/studentClasses'
import { resolveApiBaseUrl } from '@/utils/tenantRuntime'
import ResultEntryStatusPanel from '@/components/exmcl/ResultEntryStatusPanel'

type ResultTab = 'exam'

type StudentRow = {
  _id: string
  rollNumber: string
  classRollNo?: number | null
  name: string
  class: string
  section: string
  profileImage?: string | null
  subjects?: Array<{ _id?: string; name?: string } | string>
}

type ClassSectionEntry = {
  _id?: { class?: string; section?: string }
  count?: number
  active?: number
}

type SubjectColumn = {
  id: string
  name: string
}

const tabConfig = [{ id: 'exam' as const, label: 'Exam', color: 'indigo' as const }]

const SERVER_URL = resolveApiBaseUrl().replace('/api', '')

const getProfileImageUrl = (profileImage?: string | null) => {
  if (!profileImage) return null
  if (profileImage.startsWith('http')) return profileImage
  return `${SERVER_URL}${profileImage}`
}

const getInitials = (name: string) => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
}

const sortClassNames = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })

const subjectKey = (name: string) => String(name || '').trim().toLowerCase().replace(/\s+/g, '-')

const formatScore = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')

const parseEnteredMark = (raw: string | undefined): number | null => {
  if (raw == null || raw === '') return null
  const num = Number(raw)
  return Number.isFinite(num) ? num : null
}

const isAbsentToken = (value: string) => /^(a|ab|abs|absent)$/i.test(value.trim())

const setSubjectAbsentFlag = (
  prev: Record<string, Record<string, boolean>>,
  studentId: string,
  subjectId: string,
  absent: boolean
) => {
  const current = { ...(prev[studentId] || {}) }
  if (absent) current[subjectId] = true
  else delete current[subjectId]
  return { ...prev, [studentId]: current }
}

const extractStudentList = (payload: any): StudentRow[] => {
  if (Array.isArray(payload?.data?.students)) return payload.data.students
  if (Array.isArray(payload?.students)) return payload.students
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

const extractSubjectList = (payload: any): Array<{ _id?: string; name?: string; class?: string }> => {
  if (Array.isArray(payload?.data?.data)) return payload.data.data
  if (Array.isArray(payload?.data)) return payload.data
  return []
}

const ExmclResult: React.FC = () => {
  const { matrixClasses, matrixSections, matrixSelection, classes: timetableClasses } = useTimetable()
  const [activeTab, setActiveTab] = useState<ResultTab>('exam')
  const [loading, setLoading] = useState(true)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [exams, setExams] = useState<ExmclExamDefinition[]>([])
  const [classSectionEntries, setClassSectionEntries] = useState<ClassSectionEntry[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [classSubjects, setClassSubjects] = useState<SubjectColumn[]>([])
  const [selectedExamId, setSelectedExamId] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [marksByStudent, setMarksByStudent] = useState<Record<string, Record<string, string>>>({})
  const [absentByStudent, setAbsentByStudent] = useState<Record<string, Record<string, boolean>>>({})
  const [deletedSubjectIds, setDeletedSubjectIds] = useState<Set<string>>(new Set())
  const [loadError, setLoadError] = useState<string | null>(null)
  const [statusRows, setStatusRows] = useState<ResultClassSectionStatus[]>([])
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusRefreshToken, setStatusRefreshToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const [examList, statsRes] = await Promise.all([
          exmclExamService.getAll(),
          api.get('/students/stats', { params: { lite: true } }),
        ])
        if (cancelled) return

        const byClassSection = Array.isArray(statsRes?.data?.data?.byClassSection)
          ? statsRes.data.data.byClassSection
          : []

        setExams(examList)
        setClassSectionEntries(byClassSection)
        if (examList.length > 0) setSelectedExamId(examList[0]._id)
      } catch (error: any) {
        if (cancelled) return
        const message = String(error?.response?.data?.message || error?.message || 'Failed to load result setup data.')
        setLoadError(message)
        toast.error(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const classOptions = useMemo(() => {
    const fromStudents = classSectionEntries
      .filter((entry) => {
        const enrolled = Number(entry.active ?? entry.count)
        return Number.isFinite(enrolled) ? enrolled > 0 : Boolean(entry?._id?.class)
      })
      .map((entry) => String(entry?._id?.class || '').trim())
      .filter(Boolean)
    return Array.from(new Set(fromStudents)).sort(sortClassNames)
  }, [classSectionEntries])

  const sectionOptions = useMemo(() => {
    if (!selectedClass) return []

    const fromStudents = classSectionEntries
      .filter((entry) => String(entry?._id?.class || '').trim().toLowerCase() === selectedClass.trim().toLowerCase())
      .map((entry) => String(entry?._id?.section || '').trim())
      .filter(Boolean)

    const classRow = (matrixClasses || []).find(
      (item) => String(item.name || '').trim().toLowerCase() === selectedClass.trim().toLowerCase()
    )
    const fromTimetable = classRow
      ? (matrixSections || [])
          .filter((section) => Boolean(matrixSelection?.[classRow.id]?.[section.id]))
          .map((section) => String(section.name || '').trim())
          .filter(Boolean)
      : []

    return Array.from(new Set([...fromStudents, ...fromTimetable])).sort((a, b) =>
      sortSectionNames(a, b, selectedClass)
    )
  }, [classSectionEntries, matrixClasses, matrixSections, matrixSelection, selectedClass])

  const filteredStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      const rollA = Number(a.classRollNo) || 0
      const rollB = Number(b.classRollNo) || 0
      if (rollA !== rollB) return rollA - rollB
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
    })
  }, [students])

  const allSubjects = useMemo(() => {
    const byKey = new Map<string, SubjectColumn>()

    const addSubject = (name: string, id?: string) => {
      const trimmed = String(name || '').trim()
      if (!trimmed) return
      const key = subjectKey(trimmed)
      if (!key || byKey.has(key)) return
      byKey.set(key, { id: key, name: trimmed })
      if (id && id !== key && !byKey.has(id)) {
        byKey.set(key, { id: key, name: trimmed })
      }
    }

    classSubjects.forEach((subject) => addSubject(subject.name, subject.id))

    if (selectedClass) {
      const classKey = selectedClass.trim().toLowerCase()
      ;(timetableClasses || []).forEach((row) => {
        if (String(row.className || '').trim().toLowerCase() !== classKey) return
        ;(row.subjects || []).forEach((subjectName) => addSubject(String(subjectName)))
      })
    }

    students.forEach((student) => {
      ;(student.subjects || []).forEach((subject) => {
        if (typeof subject === 'string') addSubject(subject)
        else addSubject(String(subject?.name || ''), subject?._id)
      })
    })

    return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [classSubjects, selectedClass, students, timetableClasses])

  const filteredSubjects = useMemo(
    () => allSubjects.filter((subject) => !deletedSubjectIds.has(subject.id)),
    [allSubjects, deletedSubjectIds]
  )

  useEffect(() => {
    setSelectedSection('')
  }, [selectedClass])

  useEffect(() => {
    if (selectedSection && sectionOptions.length > 0 && !sectionOptions.includes(selectedSection)) {
      setSelectedSection('')
    }
  }, [selectedSection, sectionOptions])

  useEffect(() => {
    setDeletedSubjectIds(new Set())
  }, [selectedClass, selectedExamId])

  useEffect(() => {
    if (!selectedClass || !selectedSection) {
      setStudents([])
      setClassSubjects([])
      return
    }

    let cancelled = false
    setStudentsLoading(true)

    const loadSheet = async () => {
      try {
        const [studentRes, subjectRes] = await Promise.all([
          api.get('/students', {
            params: {
              page: 1,
              limit: 500,
              class: selectedClass,
              section: selectedSection,
              isActive: true,
              sort: 'classRollNo',
              lite: true,
            },
          }),
          subjectService.getAll({ page: 1, limit: 500, class: selectedClass }).catch(() => null),
        ])
        if (cancelled) return

        setStudents(extractStudentList(studentRes?.data))
        setClassSubjects(
          extractSubjectList(subjectRes)
            .filter((subject) => String(subject.class || '').trim().toLowerCase() === selectedClass.trim().toLowerCase() || !subject.class)
            .map((subject) => ({
              id: subjectKey(String(subject.name || '')),
              name: String(subject.name || '').trim(),
            }))
            .filter((subject) => subject.name)
        )
      } catch (error: any) {
        if (cancelled) return
        setStudents([])
        setClassSubjects([])
        toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load students.'))
      } finally {
        if (!cancelled) setStudentsLoading(false)
      }
    }

    void loadSheet()
    return () => {
      cancelled = true
    }
  }, [selectedClass, selectedSection])

  useEffect(() => {
    if (!selectedExamId || !selectedClass || !selectedSection) {
      setMarksByStudent({})
      setAbsentByStudent({})
      return
    }

    let cancelled = false
    exmclResultService
      .getResults(selectedExamId, selectedClass, selectedSection)
      .then((entries) => {
        if (cancelled) return
        const loaded: Record<string, Record<string, string>> = {}
        const absent: Record<string, Record<string, boolean>> = {}
        for (const entry of entries) {
          const sid = String(entry.studentId)
          loaded[sid] = {}
          const subjectFlags: Record<string, boolean> = {}
          const savedSubjects = Array.isArray(entry.absentSubjects) ? entry.absentSubjects : []
          savedSubjects.forEach((subjectId) => {
            if (subjectId) subjectFlags[String(subjectId)] = true
          })
          if (entry.absent && savedSubjects.length === 0) {
            subjectFlags['*'] = true
          }
          absent[sid] = subjectFlags
          for (const [subjectId, value] of Object.entries(entry.marks || {})) {
            loaded[sid][subjectId] = value !== null && value !== undefined ? String(value) : ''
          }
        }
        setMarksByStudent(loaded)
        setAbsentByStudent(absent)
      })
      .catch(() => {
        if (!cancelled) {
          setMarksByStudent({})
          setAbsentByStudent({})
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedExamId, selectedClass, selectedSection])

  useEffect(() => {
    if (!selectedExamId) {
      setStatusRows([])
      return
    }

    let cancelled = false
    setStatusLoading(true)

    exmclResultService
      .getEntryStatus(selectedExamId)
      .then((rows) => {
        if (!cancelled) setStatusRows(rows)
      })
      .catch(() => {
        if (!cancelled) setStatusRows([])
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedExamId, statusRefreshToken])

  const refreshEntryStatus = useCallback(() => {
    setStatusRefreshToken((prev) => prev + 1)
  }, [])

  const selectedExam = exams.find((exam) => exam._id === selectedExamId)
  const maxMarks = Number(selectedExam?.maximumMarks)
  const hasMaxMarks = Number.isFinite(maxMarks) && maxMarks > 0

  const isSubjectAbsent = useCallback(
    (studentId: string, subjectId: string) => {
      const flags = absentByStudent[studentId]
      if (!flags) return false
      return Boolean(flags['*'] || flags[subjectId])
    },
    [absentByStudent]
  )

  const updateMark = (studentId: string, subjectId: string, value: string) => {
    if (isAbsentToken(value)) {
      setAbsentByStudent((prev) => {
        const flags = prev[studentId] || {}
        if (flags['*']) return prev
        return setSubjectAbsentFlag(prev, studentId, subjectId, true)
      })
      return
    }

    setAbsentByStudent((prev) => {
      const flags = prev[studentId] || {}
      const currently = Boolean(flags['*'] || flags[subjectId])
      if (!currently) return prev
      if (flags['*']) {
        const expanded: Record<string, boolean> = {}
        filteredSubjects.forEach((subject) => {
          if (subject.id !== subjectId) expanded[subject.id] = true
        })
        return { ...prev, [studentId]: expanded }
      }
      const next = { ...flags }
      delete next[subjectId]
      return { ...prev, [studentId]: next }
    })

    if (value !== '' && !/^\d{0,3}(\.\d{0,2})?$/.test(value)) return
    if (value !== '' && Number(value) < 0) return
    if (hasMaxMarks && value !== '' && Number(value) > maxMarks) {
      toast.error(`Marks cannot exceed M.M. ${maxMarks}.`)
      return
    }
    setMarksByStudent((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        [subjectId]: value,
      },
    }))
  }

  const toggleSubjectAbsent = (studentId: string, subjectId: string) => {
    setAbsentByStudent((prev) => {
      const flags = prev[studentId] || {}
      const currently = Boolean(flags['*'] || flags[subjectId])
      if (flags['*']) {
        const expanded: Record<string, boolean> = {}
        filteredSubjects.forEach((subject) => {
          expanded[subject.id] = subject.id !== subjectId ? true : !currently
        })
        if (currently) delete expanded[subjectId]
        return { ...prev, [studentId]: expanded }
      }
      return setSubjectAbsentFlag(prev, studentId, subjectId, !currently)
    })
  }

  const toggleAbsent = (studentId: string) => {
    setAbsentByStudent((prev) => {
      const flags = prev[studentId] || {}
      const fullyAbsent =
        Boolean(flags['*']) ||
        (filteredSubjects.length > 0 && filteredSubjects.every((subject) => flags[subject.id]))
      if (fullyAbsent) {
        return { ...prev, [studentId]: {} }
      }
      return {
        ...prev,
        [studentId]: Object.fromEntries(filteredSubjects.map((subject) => [subject.id, true])),
      }
    })
  }

  const deleteSubject = useCallback((subjectId: string) => {
    setDeletedSubjectIds((prev) => new Set([...prev, subjectId]))
  }, [])

  const handleSave = async () => {
    if (!selectedExamId || !selectedClass || !selectedSection) return
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      if (hasMaxMarks) {
        const overMax = filteredStudents.some((student) =>
          filteredSubjects.some((subject) => {
            if (isSubjectAbsent(student._id, subject.id)) return false
            const raw = marksByStudent[student._id]?.[subject.id] ?? ''
            if (raw === '') return false
            const num = Number(raw)
            return Number.isFinite(num) && num > maxMarks
          })
        )
        if (overMax) {
          toast.error(`Marks cannot exceed M.M. ${maxMarks} for ${selectedExam?.code || 'this exam'}.`)
          return
        }
      }
      const results = filteredStudents.map((student) => {
        const absentSubjects = filteredSubjects
          .filter((subject) => isSubjectAbsent(student._id, subject.id))
          .map((subject) => subject.id)
        return {
          studentId: student._id,
          absent: absentSubjects.length > 0 && absentSubjects.length === filteredSubjects.length,
          absentSubjects,
          marks: Object.fromEntries(
            filteredSubjects
              .map((subject) => {
                if (isSubjectAbsent(student._id, subject.id)) return [subject.id, null] as [string, number | null]
                const raw = marksByStudent[student._id]?.[subject.id] ?? ''
                const num = raw === '' ? null : Number(raw)
                return [subject.id, num] as [string, number | null]
              })
              .filter(([, value]) => value !== null)
          ) as Record<string, number>,
        }
      })

      await exmclResultService.saveResults({
        examId: selectedExamId,
        class: selectedClass,
        section: selectedSection,
        results,
      })

      toast.success('Results saved successfully.')
      refreshEntryStatus()
    } catch (error: any) {
      const message = String(error?.response?.data?.message || error?.message || 'Failed to save results.')
      toast.error(message)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const canSave = Boolean(selectedExamId && selectedClass && selectedSection && filteredStudents.length > 0)

  const subjectAverages = useMemo(() => {
    const averages: Record<string, string> = {}
    filteredSubjects.forEach((subject) => {
      let sum = 0
      let count = 0
      filteredStudents.forEach((student) => {
        if (isSubjectAbsent(student._id, subject.id)) return
        const raw = marksByStudent[student._id]?.[subject.id] ?? ''
        if (raw === '') return
        const num = Number(raw)
        if (!Number.isFinite(num)) return
        sum += num
        count += 1
      })
      if (count === 0) {
        averages[subject.id] = '—'
        return
      }
      averages[subject.id] = formatScore(sum / count)
    })
    return averages
  }, [filteredStudents, filteredSubjects, isSubjectAbsent, marksByStudent])

  const studentScoreById = useMemo(() => {
    const byStudent: Record<string, { total: string; percentage: string; totalNum: number | null; pctNum: number | null }> = {}

    filteredStudents.forEach((student) => {
      const appeared = filteredSubjects.filter((subject) => !isSubjectAbsent(student._id, subject.id))
      if (filteredSubjects.length > 0 && appeared.length === 0) {
        byStudent[student._id] = { total: 'Ab', percentage: 'Ab', totalNum: null, pctNum: null }
        return
      }
      let total = 0
      let entered = 0
      appeared.forEach((subject) => {
        const num = parseEnteredMark(marksByStudent[student._id]?.[subject.id])
        if (num == null) return
        total += num
        entered += 1
      })
      if (entered === 0) {
        byStudent[student._id] = { total: '—', percentage: '—', totalNum: null, pctNum: null }
        return
      }
      const maxTotal = hasMaxMarks ? maxMarks * appeared.length : 0
      const pct = maxTotal > 0 ? (total / maxTotal) * 100 : null
      byStudent[student._id] = {
        total: formatScore(total),
        percentage: pct == null ? '—' : `${formatScore(pct)}%`,
        totalNum: total,
        pctNum: pct,
      }
    })

    return byStudent
  }, [filteredStudents, filteredSubjects, hasMaxMarks, isSubjectAbsent, marksByStudent, maxMarks])

  const classScoreAverages = useMemo(() => {
    let totalSum = 0
    let totalCount = 0
    let pctSum = 0
    let pctCount = 0
    filteredStudents.forEach((student) => {
      const row = studentScoreById[student._id]
      if (row?.totalNum != null) {
        totalSum += row.totalNum
        totalCount += 1
      }
      if (row?.pctNum != null) {
        pctSum += row.pctNum
        pctCount += 1
      }
    })
    return {
      total: totalCount > 0 ? formatScore(totalSum / totalCount) : '—',
      percentage: pctCount > 0 ? `${formatScore(pctSum / pctCount)}%` : '—',
    }
  }, [filteredStudents, studentScoreById])

  return (
    <div className="p-8 max-w-[1600px] mx-auto min-h-screen bg-gray-50/50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between px-4 py-3 bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          <Tabs<ResultTab>
            tabs={tabConfig}
            activeTab={activeTab}
            onChange={setActiveTab}
            variant="pill"
            size="sm"
            ariaLabel="Result mode"
          />
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:mx-4">
            <select
              title="Select exam"
              aria-label="Select exam"
              value={selectedExamId}
              onChange={(e) => setSelectedExamId(e.target.value)}
              className="min-w-[200px] rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="">Exam</option>
              {exams.map((exam) => (
                <option key={exam._id} value={exam._id}>
                  {exam.code} - {exam.name}
                </option>
              ))}
            </select>
            <select
              title="Select class"
              aria-label="Select class"
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="min-w-[130px] rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="">Class</option>
              {classOptions.map((className) => (
                <option key={className} value={className}>
                  {className}
                </option>
              ))}
            </select>
            <select
              title="Select section"
              aria-label="Select section"
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="min-w-[140px] rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              disabled={!selectedClass}
            >
              <option value="">{selectedClass ? 'Section' : 'Select class first'}</option>
              {sectionOptions.map((section) => (
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Result Entry
              {hasMaxMarks ? <span className="ml-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">M.M. {maxMarks}</span> : null}
            </h3>
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 transition-colors"
            >
              {saving ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Saving…
                </>
              ) : (
                'Save Results'
              )}
            </button>
          </div>
        </div>

        <div className="max-h-[70vh] overflow-x-auto overflow-y-auto">
          {loading ? (
            <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">Loading result sheet...</div>
          ) : loadError ? (
            <div className="p-10 text-center text-sm text-red-600 dark:text-red-400">{loadError}</div>
          ) : !selectedExamId || !selectedClass || !selectedSection ? (
            <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
              Select Exam, Class, and Section to load students and enter marks.
            </div>
          ) : studentsLoading ? (
            <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">Loading students...</div>
          ) : filteredSubjects.length === 0 && allSubjects.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
              No subjects found for the selected class. Assign subjects to students or add them in Subjects.
            </div>
          ) : filteredSubjects.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
              All subject columns have been removed. Change class or exam to reset.
            </div>
          ) : (
            <table className="w-max table-fixed border-collapse divide-y divide-gray-200 dark:divide-gray-700">
              <colgroup>
                <col className="w-[88px]" />
                <col className="w-[40px]" />
                <col className="w-[64px]" />
                <col className="w-[168px]" />
                <col className="w-[52px]" />
                {filteredSubjects.map((subject) => (
                  <col key={subject.id} className="w-[72px]" />
                ))}
                <col className="w-[72px]" />
                <col className="w-[76px]" />
              </colgroup>
              <thead className="sticky top-0 z-40 bg-gray-50/95 backdrop-blur dark:bg-gray-900/95">
                <tr>
                  <th className="sticky left-0 z-50 bg-gray-50/95 px-2 py-2 text-left text-xs font-semibold uppercase tracking-normal text-gray-500 backdrop-blur dark:bg-gray-900/95 dark:text-gray-400">
                    Adm. No.
                  </th>
                  <th className="sticky left-[88px] z-50 bg-gray-50/95 px-1 py-2 text-left text-xs font-semibold uppercase tracking-normal text-gray-500 backdrop-blur dark:bg-gray-900/95 dark:text-gray-400">
                    Photo
                  </th>
                  <th className="sticky left-[128px] z-50 bg-gray-50/95 px-2 py-2 text-left text-xs font-semibold uppercase tracking-normal text-gray-500 backdrop-blur dark:bg-gray-900/95 dark:text-gray-400">
                    Roll No
                  </th>
                  <th className="sticky left-[192px] z-50 bg-gray-50/95 px-2 py-2 text-left text-xs font-semibold uppercase tracking-normal text-gray-500 backdrop-blur dark:bg-gray-900/95 dark:text-gray-400">
                    Student Name
                  </th>
                  <th
                    className="sticky left-[360px] z-50 bg-gray-50/95 px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-normal text-gray-500 backdrop-blur dark:bg-gray-900/95 dark:text-gray-400"
                    title="Tick to mark absent in all subjects. To mark one subject only, type Ab in that cell."
                  >
                    Abs
                  </th>
                  {filteredSubjects.map((subject) => (
                    <th
                      key={subject.id}
                      className="group px-1 py-2 text-left text-[11px] font-semibold uppercase leading-tight tracking-normal text-gray-500 dark:text-gray-400"
                    >
                      <div className="flex items-start gap-0.5">
                        <span className="min-w-0 break-words">
                          {subject.name}
                          {hasMaxMarks ? <span className="ml-0.5 text-[10px] font-medium normal-case text-indigo-500">/{maxMarks}</span> : null}
                        </span>
                        <button
                          onClick={() => deleteSubject(subject.id)}
                          title="Remove from result entry"
                          className="invisible mt-0.5 shrink-0 rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-500 group-hover:visible dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="px-1 py-2 text-left text-[11px] font-semibold uppercase leading-tight tracking-normal text-gray-600 dark:text-gray-300">
                    Total
                    {hasMaxMarks && filteredSubjects.length > 0 ? (
                      <span className="ml-0.5 text-[10px] font-medium normal-case text-indigo-500">
                        /{maxMarks * filteredSubjects.length}
                      </span>
                    ) : null}
                  </th>
                  <th className="px-1 py-2 text-left text-[11px] font-semibold uppercase leading-tight tracking-normal text-gray-600 dark:text-gray-300">
                    %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7 + filteredSubjects.length}
                      className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500"
                    >
                      No students found for class {selectedClass}, section {selectedSection}. Add them in Student Management.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => {
                    const fullyAbsent =
                      filteredSubjects.length > 0 &&
                      filteredSubjects.every((subject) => isSubjectAbsent(student._id, subject.id))
                    const partlyAbsent =
                      !fullyAbsent && filteredSubjects.some((subject) => isSubjectAbsent(student._id, subject.id))
                    const stickyBg = fullyAbsent
                      ? 'bg-amber-50 dark:bg-amber-950/40'
                      : 'bg-white dark:bg-gray-800'
                    const photoUrl = getProfileImageUrl(student.profileImage)
                    return (
                    <tr
                      key={student._id}
                      className={
                        fullyAbsent
                          ? 'bg-amber-50/80 dark:bg-amber-950/30'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }
                    >
                      <td className={`sticky left-0 z-20 px-2 py-1.5 text-sm font-medium text-gray-900 dark:text-white ${stickyBg}`}>
                        {student.rollNumber}
                      </td>
                      <td className={`sticky left-[88px] z-20 px-1 py-1.5 ${stickyBg}`}>
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="h-7 w-7 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-600"
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[9px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                          >
                            {getInitials(student.name)}
                          </span>
                        )}
                      </td>
                      <td className={`sticky left-[128px] z-20 px-2 py-1.5 text-sm text-gray-900 dark:text-white ${stickyBg}`}>
                        {student.classRollNo || '—'}
                      </td>
                      <td
                        className={`sticky left-[192px] z-20 truncate px-2 py-1.5 text-sm text-gray-900 dark:text-white ${stickyBg}`}
                        title={student.name}
                      >
                        {student.name}
                      </td>
                      <td className={`sticky left-[360px] z-20 px-1 py-1.5 text-center ${stickyBg}`}>
                        <input
                          type="checkbox"
                          checked={fullyAbsent}
                          ref={(el) => {
                            if (el) el.indeterminate = partlyAbsent
                          }}
                          onChange={() => toggleAbsent(student._id)}
                          title={
                            fullyAbsent
                              ? `Mark ${student.name} present in all subjects`
                              : `Mark ${student.name} absent in all subjects`
                          }
                          aria-label={
                            fullyAbsent
                              ? `Mark ${student.name} present in all subjects`
                              : `Mark ${student.name} absent in all subjects`
                          }
                          className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                      </td>
                      {filteredSubjects.map((subject) => {
                        const subjectAbsent = isSubjectAbsent(student._id, subject.id)
                        return (
                        <td key={`${student._id}-${subject.id}`} className="px-1 py-1">
                          <input
                            type="text"
                            inputMode="text"
                            title={
                              subjectAbsent
                                ? `${student.name} is absent in ${subject.name}. Type marks to mark present, or click Ab.`
                                : `Marks for ${student.name} in ${subject.name}${hasMaxMarks ? ` (max ${maxMarks})` : ''}. Type Ab to mark absent.`
                            }
                            value={subjectAbsent ? 'Ab' : marksByStudent[student._id]?.[subject.id] ?? ''}
                            onChange={(e) => updateMark(student._id, subject.id, e.target.value)}
                            onDoubleClick={() => toggleSubjectAbsent(student._id, subject.id)}
                            onFocus={(e) => {
                              if (subjectAbsent) e.currentTarget.select()
                            }}
                            placeholder={hasMaxMarks ? `0–${maxMarks}` : '0'}
                            className={
                              subjectAbsent
                                ? 'w-14 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-1 text-center text-xs font-semibold text-amber-800 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                                : 'w-14 rounded-md border border-gray-300 bg-white px-1.5 py-1 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white'
                            }
                          />
                        </td>
                        )
                      })}
                      <td className="px-1 py-1.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                        {studentScoreById[student._id]?.total ?? '—'}
                      </td>
                      <td className="px-1 py-1.5 text-sm font-semibold tabular-nums text-gray-900 dark:text-white">
                        {studentScoreById[student._id]?.percentage ?? '—'}
                      </td>
                    </tr>
                    )
                  })
                )}
              </tbody>
              {filteredStudents.length > 0 ? (
                <tfoot className="sticky bottom-0 z-30">
                  <tr className="border-t-2 border-indigo-200 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/50">
                    <td
                      colSpan={4}
                      className="sticky left-0 z-40 bg-indigo-50 px-2 py-2 text-xs font-semibold uppercase tracking-normal text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200"
                    >
                      Subject Average
                    </td>
                    <td className="px-1 py-2" />
                    {filteredSubjects.map((subject) => (
                      <td
                        key={`avg-${subject.id}`}
                        className="px-1 py-2 text-sm font-semibold tabular-nums text-indigo-800 dark:text-indigo-200"
                        title={`Average of entered ${subject.name} marks`}
                      >
                        {subjectAverages[subject.id]}
                      </td>
                    ))}
                    <td className="px-1 py-2 text-sm font-semibold tabular-nums text-indigo-800 dark:text-indigo-200">
                      {classScoreAverages.total}
                    </td>
                    <td className="px-1 py-2 text-sm font-semibold tabular-nums text-indigo-800 dark:text-indigo-200">
                      {classScoreAverages.percentage}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          )}
        </div>
        <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
          Double click the cell to mark student absent in the subject.
        </p>
      </div>

      {selectedExamId ? (
        <div className="mt-5">
          <ResultEntryStatusPanel
            loading={statusLoading}
            rows={statusRows}
            selectedClass={selectedClass}
            selectedSection={selectedSection}
            onSelectClassSection={(className, section) => {
              setSelectedClass(className)
              setSelectedSection(section)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}

export default ExmclResult
