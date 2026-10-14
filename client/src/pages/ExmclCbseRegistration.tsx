import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { BookOpen, Plus, Save, Users, X } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardToolbar,
  Checkbox,
  Combobox,
  EmptyState,
  Entity,
  FilterBar,
  Page,
  Select,
  cx,
  type ComboboxOption,
} from '@/components/ui'
import { CardLoading, errorMessage } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/exmcl.css'
import '@/components/exmcl/cbse-registration.css'
import api from '@/services/api'
import cbseRegistrationService, {
  type CbseRegistrationMatrix,
  type CbseRegistrationSubject,
  type CbseRegistrationStudent,
  type ClassSubjectRow,
  type ClassSubjectSlot,
} from '@/services/cbseRegistrationService'
import { useTimetable } from '@/contexts/TimetableContext'
import { sortClassNames, sortSectionNames } from '@/constants/studentClasses'
import { getCanonicalSectionName, normalizeSectionKey } from '@/constants/sectionMetadata'

type ClassSectionEntry = {
  _id?: { class?: string; section?: string }
  count?: number
  active?: number
}

const SUBJECTS_PER_STACK = 3

const subjectKey = (name: string) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')

const isCbseRegistrationClass = (className: string) => {
  const key = String(className || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  return /^(9th|10th|11th|12th|9|10|11|12|ix|x|xi|xii|class9|class10|class11|class12)$/.test(key)
}

const isSeniorClass = (className: string) => {
  const key = String(className || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  return /^(11th|12th|11|12|xi|xii|class11|class12)$/.test(key)
}

const normalizeClassNameKey = (className: string) =>
  String(className || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')

const formatSubjectLabel = (subject: { name: string; code?: string }) => {
  const code = String(subject.code || '').trim()
  return code ? `${subject.name} (${code})` : subject.name
}

const rowId = (className: string, section: string) =>
  `${String(className).trim().toLowerCase()}::${normalizeSectionKey(section)}`

const emptySlot = (): ClassSubjectSlot => ({ key: '', name: '', code: '' })

const ensureMinSlots = (subjects: ClassSubjectSlot[], min = SUBJECTS_PER_STACK) => {
  const next = [...(subjects || [])]
  while (next.length < min) next.push(emptySlot())
  return next
}

const compactSubjects = (subjects: ClassSubjectSlot[]) =>
  (subjects || []).filter((item) => item?.key && item?.name)

const mirrorNinthToTenth = (rows: ClassSubjectRow[]) => {
  const next = rows.map((row) => ({
    ...row,
    subjects: [...(row.subjects || [])],
  }))
  const ninth = next.find((row) => normalizeClassNameKey(row.className) === '9th')
  if (!ninth || compactSubjects(ninth.subjects).length === 0) return next
  return next.map((row) => {
    if (normalizeClassNameKey(row.className) !== '10th') return row
    if (compactSubjects(row.subjects).length > 0) return row
    return { ...row, subjects: [...ninth.subjects] }
  })
}

/** Fill empty 12th section rows from matching 11th section (Science/Commerce/Humanities). */
const mirrorEleventhToTwelfth = (rows: ClassSubjectRow[]) => {
  const next = rows.map((row) => ({
    ...row,
    subjects: [...(row.subjects || [])],
  }))
  const eleventhBySection = new Map<string, ClassSubjectSlot[]>()
  next.forEach((row) => {
    if (normalizeClassNameKey(row.className) !== '11th') return
    const sectionKey = normalizeSectionKey(row.section)
    if (!sectionKey) return
    const subjects = compactSubjects(row.subjects)
    if (subjects.length === 0) return
    eleventhBySection.set(sectionKey, [...row.subjects])
  })
  if (eleventhBySection.size === 0) return next
  return next.map((row) => {
    if (normalizeClassNameKey(row.className) !== '12th') return row
    if (compactSubjects(row.subjects).length > 0) return row
    const sectionKey = normalizeSectionKey(row.section)
    const source = eleventhBySection.get(sectionKey)
    if (!source) return row
    return { ...row, subjects: [...source] }
  })
}

const applyDefaultSubjectMirrors = (rows: ClassSubjectRow[]) =>
  mirrorEleventhToTwelfth(mirrorNinthToTenth(rows))

const getMirrorTargetIds = (source: ClassSubjectRow | undefined, allRows: ClassSubjectRow[]) => {
  if (!source) return [] as string[]
  const classKey = normalizeClassNameKey(source.className)
  if (classKey === '9th') {
    return allRows
      .filter((row) => normalizeClassNameKey(row.className) === '10th')
      .map((row) => rowId(row.className, row.section))
  }
  if (classKey === '11th') {
    const sectionKey = normalizeSectionKey(source.section)
    return allRows
      .filter(
        (row) =>
          normalizeClassNameKey(row.className) === '12th' &&
          normalizeSectionKey(row.section) === sectionKey
      )
      .map((row) => rowId(row.className, row.section))
  }
  return []
}

const classSectionLabel = (className: string, section?: string) =>
  section ? `${className}-${section}` : className

const ExmclCbseRegistration: React.FC = () => {
  const { subjects: timetableSubjects } = useTimetable()
  const [loadingStats, setLoadingStats] = useState(true)
  const [loadingClassMatrix, setLoadingClassMatrix] = useState(true)
  const [loadingStudentMatrix, setLoadingStudentMatrix] = useState(false)
  const [savingClassMatrix, setSavingClassMatrix] = useState(false)
  const [savingStudentMatrix, setSavingStudentMatrix] = useState(false)

  const [classSectionEntries, setClassSectionEntries] = useState<ClassSectionEntry[]>([])
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [search, setSearch] = useState('')

  const [classRows, setClassRows] = useState<ClassSubjectRow[]>([])
  const [subjectCatalog, setSubjectCatalog] = useState<ClassSubjectSlot[]>([])

  const [students, setStudents] = useState<CbseRegistrationStudent[]>([])
  const [studentSubjects, setStudentSubjects] = useState<CbseRegistrationSubject[]>([])
  const [studentMatrix, setStudentMatrix] = useState<CbseRegistrationMatrix>({})
  const [additionalByStudent, setAdditionalByStudent] = useState<Record<string, string>>({})
  const columnClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const columnClickKeyRef = useRef<string>('')

  useEffect(() => {
    return () => {
      if (columnClickTimerRef.current) clearTimeout(columnClickTimerRef.current)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoadingStats(true)
      setLoadingClassMatrix(true)
      try {
        const [statsRes, classPayload] = await Promise.all([
          api.get('/students/stats', { params: { lite: true } }),
          cbseRegistrationService.getClassSubjectMatrix(),
        ])
        if (cancelled) return
        const byClassSection = Array.isArray(statsRes?.data?.data?.byClassSection)
          ? statsRes.data.data.byClassSection
          : []
        setClassSectionEntries(byClassSection)
        const rows = applyDefaultSubjectMirrors(
          classPayload.rows.map((row) => ({
            ...row,
            subjects: ensureMinSlots(row.subjects || []),
          }))
        )
        setClassRows(rows)
        setSubjectCatalog(classPayload.catalog)
      } catch (error) {
        if (cancelled) return
        toast.error(errorMessage(error, 'Classes and subjects didn’t load. Check your connection and try again.'))
      } finally {
        if (!cancelled) {
          setLoadingStats(false)
          setLoadingClassMatrix(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const catalogOptions = useMemo((): ComboboxOption[] => {
    const byKey = new Map<string, ClassSubjectSlot>()
    subjectCatalog.forEach((row) => {
      const key = subjectKey(row.key || row.name)
      if (!key) return
      byKey.set(key, { key, name: row.name || key, code: row.code || '' })
    })
    ;(timetableSubjects || []).forEach((row) => {
      const name = String(row.name || '').trim()
      const key = subjectKey(name)
      if (!key || byKey.has(key)) return
      byKey.set(key, { key, name, code: '' })
    })
    return Array.from(byKey.values())
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map((row) => ({
        value: row.key,
        label: row.name,
        meta: row.code ? `Code ${row.code}` : undefined,
        keywords: row.code,
      }))
  }, [subjectCatalog, timetableSubjects])

  const catalogByKey = useMemo(() => {
    const map = new Map<string, ClassSubjectSlot>()
    subjectCatalog.forEach((row) => {
      const key = subjectKey(row.key || row.name)
      if (!key) return
      map.set(key, { key, name: row.name || key, code: row.code || '' })
    })
    ;(timetableSubjects || []).forEach((row) => {
      const name = String(row.name || '').trim()
      const key = subjectKey(name)
      if (!key || map.has(key)) return
      map.set(key, { key, name, code: '' })
    })
    return map
  }, [subjectCatalog, timetableSubjects])

  const populatedClassSections = useMemo(
    () =>
      classSectionEntries.filter((entry) => {
        const enrolled = Number(entry.active ?? entry.count)
        return Number.isFinite(enrolled) ? enrolled > 0 : Boolean(entry?._id?.class)
      }),
    [classSectionEntries]
  )

  const classOptions = useMemo(() => {
    const fromStudents = populatedClassSections
      .map((entry) => String(entry?._id?.class || '').trim())
      .filter((name) => Boolean(name) && isCbseRegistrationClass(name))
    return Array.from(new Set(fromStudents)).sort(sortClassNames)
  }, [populatedClassSections])

  const sectionOptions = useMemo(() => {
    if (!selectedClass) return []
    const classKey = selectedClass.trim().toLowerCase()
    return Array.from(
      new Set(
        populatedClassSections
          .filter((entry) => String(entry?._id?.class || '').trim().toLowerCase() === classKey)
          .map((entry) => String(entry?._id?.section || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => sortSectionNames(a, b, selectedClass))
  }, [populatedClassSections, selectedClass])

  useEffect(() => {
    setSelectedSection('')
  }, [selectedClass])

  useEffect(() => {
    if (selectedClass && classOptions.length > 0 && !classOptions.includes(selectedClass)) {
      setSelectedClass('')
      setSelectedSection('')
    }
  }, [selectedClass, classOptions])

  useEffect(() => {
    if (selectedSection && sectionOptions.length > 0 && !sectionOptions.includes(selectedSection)) {
      setSelectedSection('')
    }
  }, [selectedSection, sectionOptions])

  const subjectsForSelectedClass = useMemo(() => {
    if (!selectedClass) return [] as CbseRegistrationSubject[]
    const classKey = selectedClass.trim().toLowerCase()
    const sectionKey = normalizeSectionKey(getCanonicalSectionName(selectedSection) || selectedSection)
    const matched = classRows.find((row) => {
      if (String(row.className || '').trim().toLowerCase() !== classKey) return false
      if (isSeniorClass(selectedClass)) {
        return normalizeSectionKey(row.section) === sectionKey
      }
      return true
    })
    if (!matched) return []
    return compactSubjects(matched.subjects).map((slot) => ({
      key: slot.key,
      name: slot.name,
      code: slot.code,
    }))
  }, [classRows, selectedClass, selectedSection])

  const loadStudentMatrix = useCallback(async () => {
    if (!selectedClass || !selectedSection) {
      setStudents([])
      setStudentSubjects([])
      setStudentMatrix({})
      setAdditionalByStudent({})
      return
    }
    setLoadingStudentMatrix(true)
    try {
      const payload = await cbseRegistrationService.getMatrix(selectedClass, selectedSection)
      setStudents(payload.students)
      setStudentMatrix(payload.matrix || {})
      setAdditionalByStudent(payload.additionalByStudent || {})
      setStudentSubjects(payload.subjects)
    } catch (error) {
      toast.error(errorMessage(error, 'Students for this section didn’t load. Try again.'))
      setStudents([])
      setStudentSubjects([])
      setStudentMatrix({})
      setAdditionalByStudent({})
    } finally {
      setLoadingStudentMatrix(false)
    }
  }, [selectedClass, selectedSection])

  useEffect(() => {
    void loadStudentMatrix()
  }, [loadStudentMatrix])

  useEffect(() => {
    if (!selectedClass || !selectedSection) return
    setStudentSubjects(subjectsForSelectedClass)
    const allowed = new Set(subjectsForSelectedClass.map((s) => s.key))
    setStudentMatrix((prev) => {
      const next: CbseRegistrationMatrix = {}
      Object.entries(prev).forEach(([studentId, keys]) => {
        next[studentId] = (keys || []).filter((key) => allowed.has(key))
      })
      return next
    })
    setAdditionalByStudent((prev) => {
      const next: Record<string, string> = {}
      Object.entries(prev).forEach(([studentId, key]) => {
        if (allowed.has(key)) next[studentId] = key
      })
      return next
    })
  }, [subjectsForSelectedClass, selectedClass, selectedSection])

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter((student) => {
      const roll = String(student.classRollNo ?? student.rollNumber ?? '').toLowerCase()
      return student.name.toLowerCase().includes(q) || roll.includes(q)
    })
  }, [search, students])

  const updateRowSubjects = (targetId: string, updater: (subjects: ClassSubjectSlot[]) => ClassSubjectSlot[]) => {
    setClassRows((prev) => {
      const source = prev.find((row) => rowId(row.className, row.section) === targetId)
      const mirrorIds = new Set(getMirrorTargetIds(source, prev))
      return prev.map((row) => {
        const id = rowId(row.className, row.section)
        if (id === targetId || mirrorIds.has(id)) {
          return { ...row, subjects: updater([...(row.subjects || [])]) }
        }
        return row
      })
    })
  }

  const setRowSubjectAt = (targetId: string, index: number, subjectKeyValue: string) => {
    const row = classRows.find((item) => rowId(item.className, item.section) === targetId)
    if (subjectKeyValue && row) {
      const duplicate = (row.subjects || []).some(
        (slot, i) => i !== index && slot.key && slot.key === subjectKeyValue
      )
      if (duplicate) {
        toast.error('That subject is already in this class. Pick a different one.')
        return
      }
    }
    updateRowSubjects(targetId, (subjects) => {
      const next = ensureMinSlots(subjects, Math.max(SUBJECTS_PER_STACK, index + 1))
      if (!subjectKeyValue) {
        next[index] = emptySlot()
        return next
      }
      const picked = catalogByKey.get(subjectKeyValue)
      if (!picked) return next
      // Guard again inside updater (mirrors may copy into another row)
      const alreadyUsed = next.some((slot, i) => i !== index && slot.key === picked.key)
      if (alreadyUsed) return subjects
      next[index] = { key: picked.key, name: picked.name, code: picked.code || '' }
      return next
    })
  }

  const optionsForSlot = (rowSubjects: ClassSubjectSlot[], index: number): ComboboxOption[] => {
    const used = new Set(
      (rowSubjects || [])
        .map((slot, i) => (i === index ? '' : slot.key))
        .filter(Boolean)
    )
    return catalogOptions.filter((option) => !used.has(String(option.value)))
  }

  const addSubjectToRow = (targetId: string) => {
    updateRowSubjects(targetId, (subjects) => [...ensureMinSlots(subjects), emptySlot()])
  }

  const removeSubjectFromRow = (targetId: string, index: number) => {
    updateRowSubjects(targetId, (subjects) => {
      const next = subjects.filter((_, i) => i !== index)
      return ensureMinSlots(next)
    })
  }

  const handleSaveClassMatrix = async () => {
    setSavingClassMatrix(true)
    try {
      const payloadRows = classRows.map((row) => ({
        className: row.className,
        section: row.section,
        subjects: compactSubjects(row.subjects),
      }))
      const saved = await cbseRegistrationService.saveClassSubjectMatrix({ rows: payloadRows })
      setClassRows(
        applyDefaultSubjectMirrors(
          saved.rows.map((row) => ({
            ...row,
            subjects: ensureMinSlots(row.subjects || []),
          }))
        )
      )
      setSubjectCatalog(saved.catalog)
      toast.success('Class subjects saved.')
    } catch (error) {
      toast.error(errorMessage(error, 'Class subjects weren’t saved. Try again.'))
    } finally {
      setSavingClassMatrix(false)
    }
  }

  const isStudentChecked = (studentId: string, key: string) =>
    Array.isArray(studentMatrix[studentId]) && studentMatrix[studentId].includes(key)

  const isAdditionalSubject = (studentId: string, key: string) =>
    additionalByStudent[studentId] === key

  const toggleStudentCell = (studentId: string, key: string) => {
    setStudentMatrix((prev) => {
      const current = new Set(prev[studentId] || [])
      if (current.has(key)) {
        current.delete(key)
        setAdditionalByStudent((addPrev) => {
          if (addPrev[studentId] !== key) return addPrev
          const next = { ...addPrev }
          delete next[studentId]
          return next
        })
      } else {
        current.add(key)
      }
      return { ...prev, [studentId]: Array.from(current) }
    })
  }

  const markAdditionalSubject = (studentId: string, key: string) => {
    if (!isStudentChecked(studentId, key)) {
      setStudentMatrix((prev) => {
        const current = new Set(prev[studentId] || [])
        current.add(key)
        return { ...prev, [studentId]: Array.from(current) }
      })
    }
    setAdditionalByStudent((prev) => {
      if (prev[studentId] === key) {
        const next = { ...prev }
        delete next[studentId]
        toast.success('Additional subject cleared.')
        return next
      }
      toast.success('Marked as the additional subject. Double-click again to clear it.')
      return { ...prev, [studentId]: key }
    })
  }

  const toggleStudentSubjectColumn = (key: string, checked: boolean) => {
    setStudentMatrix((prev) => {
      const next = { ...prev }
      filteredStudents.forEach((student) => {
        const current = new Set(next[student._id] || [])
        if (checked) current.add(key)
        else current.delete(key)
        next[student._id] = Array.from(current)
      })
      return next
    })
    if (!checked) {
      setAdditionalByStudent((prev) => {
        const next = { ...prev }
        filteredStudents.forEach((student) => {
          if (next[student._id] === key) delete next[student._id]
        })
        return next
      })
    }
  }

  const toggleStudentRow = (studentId: string, checked: boolean) => {
    setStudentMatrix((prev) => ({
      ...prev,
      [studentId]: checked ? studentSubjects.map((row) => row.key) : [],
    }))
    if (!checked) {
      setAdditionalByStudent((prev) => {
        const next = { ...prev }
        delete next[studentId]
        return next
      })
    }
  }

  const toggleAllStudentsAllSubjects = (checked: boolean) => {
    const allKeys = studentSubjects.map((row) => row.key)
    setStudentMatrix((prev) => {
      const next = { ...prev }
      filteredStudents.forEach((student) => {
        next[student._id] = checked ? [...allKeys] : []
      })
      return next
    })
    if (!checked) {
      setAdditionalByStudent((prev) => {
        const next = { ...prev }
        filteredStudents.forEach((student) => {
          delete next[student._id]
        })
        return next
      })
    }
  }

  const markAdditionalSubjectForAll = (key: string) => {
    const allAlreadyAdditional =
      filteredStudents.length > 0 &&
      filteredStudents.every((student) => additionalByStudent[student._id] === key)

    setStudentMatrix((prev) => {
      const next = { ...prev }
      filteredStudents.forEach((student) => {
        const current = new Set(next[student._id] || [])
        current.add(key)
        next[student._id] = Array.from(current)
      })
      return next
    })

    setAdditionalByStudent((prev) => {
      const next = { ...prev }
      if (allAlreadyAdditional) {
        filteredStudents.forEach((student) => {
          if (next[student._id] === key) delete next[student._id]
        })
        toast.success('Additional subject cleared for all students.')
        return next
      }
      filteredStudents.forEach((student) => {
        next[student._id] = key
      })
      toast.success('Marked as additional subject for all students.')
      return next
    })
  }

  const handleSubjectColumnHeaderClick = (key: string, currentlyAllSelected: boolean) => {
    if (columnClickTimerRef.current && columnClickKeyRef.current === key) {
      clearTimeout(columnClickTimerRef.current)
      columnClickTimerRef.current = null
      columnClickKeyRef.current = ''
      markAdditionalSubjectForAll(key)
      return
    }
    columnClickKeyRef.current = key
    if (columnClickTimerRef.current) clearTimeout(columnClickTimerRef.current)
    columnClickTimerRef.current = setTimeout(() => {
      columnClickTimerRef.current = null
      columnClickKeyRef.current = ''
      toggleStudentSubjectColumn(key, !currentlyAllSelected)
    }, 220)
  }

  const handleSaveStudentMatrix = async () => {
    if (!selectedClass || !selectedSection) {
      toast.error('Choose a class and section first.')
      return
    }
    setSavingStudentMatrix(true)
    try {
      const saved = await cbseRegistrationService.saveMatrix(
        selectedClass,
        selectedSection,
        studentMatrix,
        additionalByStudent
      )
      setStudentMatrix(saved.matrix)
      setAdditionalByStudent(saved.additionalByStudent)
      toast.success('Student subjects saved.')
    } catch (error) {
      toast.error(errorMessage(error, 'Student subjects weren’t saved. Try again.'))
    } finally {
      setSavingStudentMatrix(false)
    }
  }

  const filtersReady = Boolean(selectedClass && selectedSection)
  const selectedCount = useMemo(
    () => Object.values(studentMatrix).reduce((sum, keys) => sum + (Array.isArray(keys) ? keys.length : 0), 0),
    [studentMatrix]
  )
  const selectedLabel = classSectionLabel(selectedClass, selectedSection)
  const subjectScopeLabel = isSeniorClass(selectedClass) ? selectedLabel : selectedClass

  let classBody: React.ReactNode
  if (loadingClassMatrix) classBody = <CardLoading label="Loading class subjects…" />
  else if (classRows.length === 0)
    classBody = (
      <EmptyState
        icon={BookOpen}
        title="Class subjects didn’t load"
        body="Classes 9 to 12 appear here. Reload the page to try again."
      />
    )
  else
    classBody = (
      <ul className="ex-reg-classes" aria-label="Subjects by class">
        {classRows.map((row) => {
          const id = rowId(row.className, row.section)
          const subjects = ensureMinSlots(row.subjects || [])
          const filled = compactSubjects(subjects).length
          const name = classSectionLabel(row.className, row.section)
          return (
            <li key={id} className="ex-reg-class">
              <div className="ex-reg-class__head">
                <div className="ex-reg-class__titles">
                  <span className="cb-strong">{row.className}</span>
                  {row.section ? <Badge dot={false}>{row.section}</Badge> : null}
                  <span className="cb-muted">
                    {filled === 1 ? '1 subject' : `${filled} subjects`}
                  </span>
                </div>
                <Button size="sm" variant="tertiary" icon={Plus} onClick={() => addSubjectToRow(id)}>
                  Add subject
                </Button>
              </div>
              <div className="ex-reg-slots">
                {subjects.map((slot, index) => (
                  <div key={`${id}-${index}`} className="ex-reg-slot">
                    <Combobox
                      className="ex-reg-combo"
                      size="sm"
                      emptyText="No subjects match"
                      aria-label={`${name} subject ${index + 1}`}
                      placeholder={`Subject ${index + 1}`}
                      value={slot.key || ''}
                      selectedLabel={slot.key ? slot.name || slot.key : ''}
                      clearable={false}
                      options={optionsForSlot(subjects, index)}
                      onChange={(value) => setRowSubjectAt(id, index, value)}
                    />
                    {subjects.length > SUBJECTS_PER_STACK ? (
                      <Button
                        size="sm"
                        variant="tertiary"
                        icon={X}
                        aria-label={`Remove ${name} subject ${index + 1}`}
                        title="Remove subject"
                        onClick={() => removeSubjectFromRow(id, index)}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    )

  let studentBody: React.ReactNode
  if (loadingStudentMatrix) studentBody = <CardLoading label="Loading students…" />
  else if (!filtersReady)
    studentBody = (
      <EmptyState
        icon={Users}
        title="Choose a class and section"
        body="Pick a class and section above to tick the subjects each student is registering for."
      />
    )
  else if (studentSubjects.length === 0)
    studentBody = (
      <EmptyState
        icon={BookOpen}
        title={`No subjects set for ${subjectScopeLabel}`}
        body={`Add ${subjectScopeLabel}’s subjects under Subjects by class, then tick them for each student here.`}
      />
    )
  else if (filteredStudents.length === 0)
    studentBody = search.trim() ? (
      <EmptyState
        compact
        icon={Users}
        title="No students match this search"
        action={
          <Button size="sm" onClick={() => setSearch('')}>
            Clear search
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={Users}
        title={`No students in ${selectedLabel}`}
        body="Students appear here once they are added to this section in Students."
      />
    )
  else {
    const allKeys = studentSubjects.map((s) => s.key)
    const everythingSelected =
      filteredStudents.length > 0 &&
      allKeys.length > 0 &&
      filteredStudents.every((student) => allKeys.every((key) => isStudentChecked(student._id, key)))
    const somethingSelected =
      !everythingSelected &&
      filteredStudents.some((student) => allKeys.some((key) => isStudentChecked(student._id, key)))

    studentBody = (
      <>
        <div className="ex-matrix ex-reg-matrix">
          <table aria-label={`Subjects for each student in ${selectedLabel}`}>
            <thead>
              <tr>
                <th scope="col" className="ex-matrix__subject">
                  Student
                </th>
                {studentSubjects.map((subject) => {
                  const allSelected =
                    filteredStudents.length > 0 &&
                    filteredStudents.every((student) => isStudentChecked(student._id, subject.key))
                  const someSelected =
                    !allSelected && filteredStudents.some((student) => isStudentChecked(student._id, subject.key))
                  const allAdditional =
                    filteredStudents.length > 0 &&
                    filteredStudents.every((student) => isAdditionalSubject(student._id, subject.key))
                  return (
                    <th
                      key={subject.key}
                      scope="col"
                      title={`${formatSubjectLabel(subject)}. Tick for every student; double-click to make it everyone’s additional subject.`}
                      onDoubleClick={() => markAdditionalSubjectForAll(subject.key)}
                    >
                      <span className="ex-reg-head">
                        <span className="ex-reg-head__name">{subject.name}</span>
                        <span className="ex-reg-head__code">{subject.code || '—'}</span>
                        {/* Single click toggles the column; a double click marks it additional for all. */}
                        <span
                          onClickCapture={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            handleSubjectColumnHeaderClick(subject.key, allSelected)
                          }}
                          onDoubleClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                          }}
                        >
                          <Checkbox
                            checked={allSelected}
                            indeterminate={someSelected}
                            onChange={() => undefined}
                            aria-label={`${subject.name} for every student. Double-click to make it everyone’s additional subject.`}
                          />
                        </span>
                        {allAdditional ? (
                          <Badge tone="info" dot={false}>
                            Additional
                          </Badge>
                        ) : null}
                      </span>
                    </th>
                  )
                })}
                <th scope="col" className="ex-matrix__all">
                  <span className="ex-reg-head">
                    <span className="ex-reg-head__name">All subjects</span>
                    <Checkbox
                      checked={everythingSelected}
                      indeterminate={somethingSelected}
                      onChange={(checked) => toggleAllStudentsAllSubjects(checked)}
                      aria-label="Every subject for every student"
                    />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((student) => {
                const allSelected =
                  studentSubjects.length > 0 &&
                  studentSubjects.every((subject) => isStudentChecked(student._id, subject.key))
                const someSelected =
                  !allSelected && studentSubjects.some((subject) => isStudentChecked(student._id, subject.key))
                const roll = student.classRollNo ?? student.rollNumber
                return (
                  <tr key={student._id}>
                    <th scope="row" className="ex-matrix__subject" title={student.name}>
                      <Entity primary={student.name} secondary={`Roll no. ${roll ?? '—'}`} />
                    </th>
                    {studentSubjects.map((subject) => {
                      const isAdditional = isAdditionalSubject(student._id, subject.key)
                      return (
                        <td
                          key={subject.key}
                          className={cx(isAdditional && 'is-additional')}
                          onDoubleClick={() => markAdditionalSubject(student._id, subject.key)}
                          title={
                            isAdditional
                              ? 'Additional subject. Double-click to clear.'
                              : 'Double-click to mark as the additional subject.'
                          }
                        >
                          <span className="ex-reg-cell">
                            <Checkbox
                              checked={isStudentChecked(student._id, subject.key)}
                              onChange={() => toggleStudentCell(student._id, subject.key)}
                              aria-label={`${student.name}: ${subject.name}`}
                            />
                            {isAdditional ? (
                              <Badge tone="info" dot={false}>
                                Additional
                              </Badge>
                            ) : null}
                          </span>
                        </td>
                      )
                    })}
                    <td className="ex-matrix__all">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onChange={(checked) => toggleStudentRow(student._id, checked)}
                        aria-label={`Every subject for ${student.name}`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="cb-table-foot">
          <span className="is-num">
            {filteredStudents.length === 1 ? '1 student' : `${filteredStudents.length} students`} ·{' '}
            {studentSubjects.length === 1 ? '1 subject' : `${studentSubjects.length} subjects`} · {selectedCount} ticked
          </span>
        </div>
      </>
    )
  }

  return (
    <Page>
      <Card
        flush
        title="Subjects by class"
        subtitle="The subjects each class registers with CBSE. Class 9 subjects carry over to Class 10, and Class 11 to Class 12, until you change them."
        action={
          <Button
            size="sm"
            icon={Save}
            loading={savingClassMatrix}
            disabled={loadingClassMatrix}
            onClick={() => void handleSaveClassMatrix()}
          >
            Save class subjects
          </Button>
        }
      >
        {classBody}
      </Card>

      <Card
        flush
        title="Subjects for each student"
        subtitle="Tick the subjects each student is registering for. Double-click a tick to mark it as that student’s additional subject, or double-click a column heading to mark it for everyone."
      >
        <CardToolbar>
          <FilterBar
            search={
              filtersReady
                ? { placeholder: 'Search name or roll no.', value: search, onChange: setSearch, label: 'Search students' }
                : undefined
            }
            filters={
              <>
                <Select
                  size="sm"
                  aria-label="Class"
                  placeholder="Choose class"
                  value={selectedClass}
                  onChange={(event) => setSelectedClass(event.target.value)}
                  disabled={loadingStats}
                  options={classOptions}
                />
                <Select
                  size="sm"
                  aria-label="Section"
                  placeholder={selectedClass ? 'Choose section' : 'Choose class first'}
                  value={selectedSection}
                  onChange={(event) => setSelectedSection(event.target.value)}
                  disabled={!selectedClass}
                  options={sectionOptions}
                />
              </>
            }
            actions={
              <Button
                variant="primary"
                icon={Save}
                loading={savingStudentMatrix}
                disabled={loadingStudentMatrix || !filtersReady || studentSubjects.length === 0}
                onClick={() => void handleSaveStudentMatrix()}
              >
                Save student subjects
              </Button>
            }
          />
        </CardToolbar>
        {studentBody}
      </Card>
    </Page>
  )
}

export default ExmclCbseRegistration
