import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ClipboardList, EyeOff, RotateCcw, Save, Users } from 'lucide-react'
import exmclExamService, { type ExmclExamDefinition } from '@/services/exmclExamService'
import exmclResultService, { type ResultClassSectionStatus } from '@/services/exmclResultService'
import subjectService from '@/services/subjectService'
import api from '@/services/api'
import toast from 'react-hot-toast'
import { useTimetable } from '@/contexts/TimetableContext'
import { sortSectionNames } from '@/constants/studentClasses'
import { resolveApiBaseUrl } from '@/utils/tenantRuntime'
import ResultEntryStatusPanel from '@/components/exmcl/ResultEntryStatusPanel'
import { Avatar, Banner, Button, Card, Checkbox, EmptyState, Entity, FilterBar, Menu, Page, Select, cx } from '@/components/ui'
import { CardLoading, errorMessage } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/result.css'

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

const SERVER_URL = resolveApiBaseUrl().replace('/api', '')

const getProfileImageUrl = (profileImage?: string | null) => {
  if (!profileImage) return null
  if (profileImage.startsWith('http')) return profileImage
  return `${SERVER_URL}${profileImage}`
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
  // Section to apply once a class change has reset the section (opening a sheet from the status list).
  const pendingSectionRef = useRef<string | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

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
        const message = errorMessage(error, 'Exams and classes didn’t load. Check your connection and refresh the page.')
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
    setSelectedSection(pendingSectionRef.current ?? '')
    pendingSectionRef.current = null
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
        toast.error(errorMessage(error, 'Students didn’t load. Pick the section again to retry.'))
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
      toast.error(`Marks can’t be more than ${maxMarks}, the maximum for this exam.`)
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
          toast.error(`Some marks are more than ${maxMarks}, the maximum for ${selectedExam?.code || 'this exam'}. Correct them and save again.`)
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

      toast.success(`Marks saved for Class ${selectedClass}-${selectedSection}.`)
      refreshEntryStatus()
    } catch (error: any) {
      toast.error(errorMessage(error, 'Marks weren’t saved. Check your connection and save again.'))
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

  const ready = Boolean(selectedExamId && selectedClass && selectedSection)
  const hiddenCount = allSubjects.length - filteredSubjects.length
  const sectionLabel = `Class ${selectedClass}-${selectedSection}`

  const openFromStatus = (className: string, section: string) => {
    if (className === selectedClass) {
      setSelectedSection(section)
    } else {
      pendingSectionRef.current = section
      setSelectedClass(className)
    }
    sheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const sheetBody = () => {
    if (loading) return <CardLoading label="Loading exams and classes…" />
    if (loadError) {
      return (
        <div className="ex-marks__notice">
          <Banner tone="danger" title="Marks entry couldn’t load">
            {loadError}
          </Banner>
        </div>
      )
    }
    if (exams.length === 0) {
      return (
        <EmptyState
          icon={ClipboardList}
          title="No exams set up for this session"
          body="Add exams in Exams first. Marks are entered against each exam."
        />
      )
    }
    if (!ready) {
      return (
        <EmptyState
          icon={ClipboardList}
          title="Choose an exam, class and section"
          body="That section’s students and subjects open here for marks entry."
        />
      )
    }
    if (studentsLoading) return <CardLoading label="Loading students…" />
    if (allSubjects.length === 0) {
      return (
        <EmptyState
          icon={BookOpen}
          title={`No subjects found for Class ${selectedClass}`}
          body="Add subjects for this class in Subjects, or assign them to students."
        />
      )
    }
    if (filteredSubjects.length === 0) {
      return (
        <EmptyState
          icon={EyeOff}
          title="All subject columns are hidden"
          body="Show them again to enter marks."
          action={
            <Button size="sm" icon={RotateCcw} onClick={() => setDeletedSubjectIds(new Set())}>
              Show all subjects
            </Button>
          }
        />
      )
    }
    if (filteredStudents.length === 0) {
      return (
        <EmptyState
          icon={Users}
          title={`No active students in ${sectionLabel}`}
          body="Add them in Students, then come back to enter marks."
        />
      )
    }

    return (
      <div className="ex-marks-scroll">
        <table className="ex-marks">
          <caption className="cb-visually-hidden">
            Marks for {sectionLabel}
            {selectedExam ? `, ${selectedExam.code}` : ''}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="is-pin is-roll">
                Roll no.
              </th>
              <th scope="col" className="is-pin is-student">
                Student
              </th>
              <th
                scope="col"
                className="is-pin is-abs"
                title="Tick to mark absent in every subject. For one subject, type Ab in that cell."
              >
                Absent
              </th>
              {filteredSubjects.map((subject) => (
                <th key={subject.id} scope="col" className="ex-marks__subject">
                  <div className="ex-marks__subhead">
                    <span className="ex-marks__subname">
                      {subject.name}
                      {hasMaxMarks ? <span className="ex-marks__max"> /{maxMarks}</span> : null}
                    </span>
                    <Menu
                      label={`Options for ${subject.name}`}
                      items={[
                        { label: 'Hide from this sheet', icon: EyeOff, onSelect: () => deleteSubject(subject.id) },
                      ]}
                    />
                  </div>
                </th>
              ))}
              <th scope="col" className="is-right ex-marks__sum">
                Total
                {hasMaxMarks ? <span className="ex-marks__max"> /{maxMarks * filteredSubjects.length}</span> : null}
              </th>
              <th scope="col" className="is-right">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => {
              const fullyAbsent = filteredSubjects.every((subject) => isSubjectAbsent(student._id, subject.id))
              const partlyAbsent =
                !fullyAbsent && filteredSubjects.some((subject) => isSubjectAbsent(student._id, subject.id))
              const absentLabel = fullyAbsent
                ? `Mark ${student.name} present in all subjects`
                : `Mark ${student.name} absent in all subjects`
              return (
                <tr key={student._id} className={cx(fullyAbsent && 'is-absent')}>
                  <td className="is-pin is-roll">{student.classRollNo || '—'}</td>
                  <td className="is-pin is-student" title={student.name}>
                    <div className="ex-marks__who">
                      <Avatar size="sm" name={student.name} src={getProfileImageUrl(student.profileImage)} />
                      <Entity primary={student.name} secondary={`Adm. no. ${student.rollNumber || '—'}`} />
                    </div>
                  </td>
                  <td className="is-pin is-abs">
                    <Checkbox
                      checked={fullyAbsent}
                      indeterminate={partlyAbsent}
                      onChange={() => toggleAbsent(student._id)}
                      aria-label={absentLabel}
                    />
                  </td>
                  {filteredSubjects.map((subject) => {
                    const subjectAbsent = isSubjectAbsent(student._id, subject.id)
                    const hint = subjectAbsent
                      ? `${student.name} is absent in ${subject.name}. Type marks to mark present, or double-click.`
                      : `Marks for ${student.name} in ${subject.name}${hasMaxMarks ? ` (out of ${maxMarks})` : ''}. Type Ab to mark absent.`
                    return (
                      <td key={`${student._id}-${subject.id}`} className="ex-marks__cell">
                        <input
                          type="text"
                          inputMode="text"
                          className={cx('ex-mark', subjectAbsent && 'is-absent')}
                          title={hint}
                          aria-label={hint}
                          value={subjectAbsent ? 'Ab' : marksByStudent[student._id]?.[subject.id] ?? ''}
                          onChange={(e) => updateMark(student._id, subject.id, e.target.value)}
                          onDoubleClick={() => toggleSubjectAbsent(student._id, subject.id)}
                          onFocus={(e) => {
                            if (subjectAbsent) e.currentTarget.select()
                          }}
                          placeholder={hasMaxMarks ? `0–${maxMarks}` : '0'}
                        />
                      </td>
                    )
                  })}
                  <td className="is-right ex-marks__num ex-marks__sum">{studentScoreById[student._id]?.total ?? '—'}</td>
                  <td className="is-right ex-marks__num">{studentScoreById[student._id]?.percentage ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3} className="is-pin is-footlabel">
                Subject average
              </th>
              {filteredSubjects.map((subject) => (
                <td
                  key={`avg-${subject.id}`}
                  className="ex-marks__num ex-marks__cell"
                  title={`Average of entered ${subject.name} marks`}
                >
                  {subjectAverages[subject.id]}
                </td>
              ))}
              <td className="is-right ex-marks__num ex-marks__sum">{classScoreAverages.total}</td>
              <td className="is-right ex-marks__num">{classScoreAverages.percentage}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  const subtitle = selectedExam
    ? hasMaxMarks
      ? `${selectedExam.code} · ${selectedExam.name} · out of ${maxMarks} per subject`
      : `${selectedExam.code} · ${selectedExam.name} · no maximum marks set`
    : 'Choose an exam, class and section to enter marks'

  return (
    <Page width="full">
      <div className="cb-stack">
        <div ref={sheetRef} className="ex-marks-anchor">
          <Card
            flush
            title="Marks entry"
            subtitle={subtitle}
            className="ex-marks-card"
            footer={
              <div className="ex-marks__foot">
                <span>
                  {ready && !studentsLoading && filteredStudents.length > 0
                    ? `${filteredStudents.length} student${filteredStudents.length === 1 ? '' : 's'} in ${sectionLabel}. `
                    : ''}
                  Type Ab or double-click a cell to mark a student absent in that subject.
                </span>
                {hiddenCount > 0 && filteredSubjects.length > 0 ? (
                  <button type="button" className="cb-link" onClick={() => setDeletedSubjectIds(new Set())}>
                    Show {hiddenCount} hidden subject{hiddenCount === 1 ? '' : 's'}
                  </button>
                ) : null}
              </div>
            }
          >
            <div className="ex-marks__toolbar">
              <FilterBar
                filters={
                  <>
                    <Select
                      aria-label="Exam"
                      size="sm"
                      className="ex-marks__exam"
                      value={selectedExamId}
                      onChange={(e) => setSelectedExamId(e.target.value)}
                      placeholder="Choose exam"
                      options={exams.map((exam) => ({ value: exam._id, label: `${exam.code} · ${exam.name}` }))}
                    />
                    <Select
                      aria-label="Class"
                      size="sm"
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                      placeholder="Choose class"
                      options={classOptions}
                    />
                    <Select
                      aria-label="Section"
                      size="sm"
                      value={selectedSection}
                      onChange={(e) => setSelectedSection(e.target.value)}
                      disabled={!selectedClass}
                      placeholder={selectedClass ? 'Choose section' : 'Choose class first'}
                      options={sectionOptions}
                    />
                  </>
                }
                actions={
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Save}
                    onClick={() => void handleSave()}
                    loading={saving}
                    disabled={!canSave}
                  >
                    Save marks
                  </Button>
                }
              />
            </div>
            {sheetBody()}
          </Card>
        </div>

        {selectedExamId ? (
          <ResultEntryStatusPanel
            loading={statusLoading}
            rows={statusRows}
            selectedClass={selectedClass}
            selectedSection={selectedSection}
            onSelectClassSection={openFromStatus}
          />
        ) : null}
      </div>
    </Page>
  )
}

export default ExmclResult
