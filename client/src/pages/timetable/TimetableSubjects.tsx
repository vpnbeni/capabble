import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { BookOpen, CalendarClock, Pencil, Plus, Save, SearchX, Split, Trash2 } from 'lucide-react'
import { useTimetable, type TimetableSubject } from '@/contexts/TimetableContext'
import { sectionLabel } from '@/components/students/studentFormat'
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Menu,
  Page,
  Select,
  TextField,
  type DataTableColumn,
} from '@/components/ui'
import '@/components/timetable/subjects.css'
import { useUrlSearchQuery } from '@/hooks/useUrlSearchQuery'

const SUBJECT_TYPES = ['Language', 'Skill', 'Core', 'Elective', 'Co-Curricular', 'Other']

const EMPTY_FORM = {
  name: '',
  type: 'Other',
  requiresConsecutivePeriods: false,
  consecutivePeriodCount: 2,
  color: '',
}

const EMPTY_PAIR_FORM = {
  className: '',
  subjectA: '',
  subjectB: '',
}

const ADD_SUBJECT_FORM_ID = 'tt-subject-add-form'
const EDIT_SUBJECT_FORM_ID = 'tt-subject-edit-form'
const PAIR_FORM_ID = 'tt-subject-pair-form'
const COMMON_PERIOD_FORM_ID = 'tt-subject-common-period-form'

const ROMAN_CLASS_LEVELS: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
}

const parseClassLevel = (className: string): number | null => {
  const normalized = className.trim().toLowerCase().replace(/^class\s*/i, '')
  if (!normalized) return null

  const numericMatch = normalized.match(/\d+/)
  if (numericMatch?.[0]) {
    const parsed = Number.parseInt(numericMatch[0], 10)
    if (Number.isFinite(parsed)) return parsed
  }

  return ROMAN_CLASS_LEVELS[normalized] ?? null
}

const compareClassNames = (a: string, b: string) => {
  const aLevel = parseClassLevel(a)
  const bLevel = parseClassLevel(b)

  if (aLevel !== null && bLevel !== null && aLevel !== bLevel) return aLevel - bLevel
  if (aLevel !== null && bLevel === null) return -1
  if (aLevel === null && bLevel !== null) return 1
  return a.localeCompare(b, undefined, { numeric: true })
}

const getSeniorSectionOrder = (section: string) => {
  const normalized = section.trim().toLowerCase().replace(/\./g, '')
  if (normalized.startsWith('sci') || normalized.startsWith('science')) return 0
  if (normalized.startsWith('comm') || normalized.startsWith('commerce')) return 1
  if (normalized.startsWith('hum') || normalized.startsWith('humanities')) return 2
  return 99
}

/** "7" → "Class 7", "XI-Science" → "Class XI-Science"; names that aren't class levels stay as they are. */
const classLabel = (className: string) => {
  const trimmed = className.trim()
  if (!trimmed) return '—'
  if (/^class\b/i.test(trimmed)) return trimmed
  const [base, ...rest] = trimmed.split('-')
  if (parseClassLevel(base) === null) return trimmed
  const section = sectionLabel(rest.join('-'))
  return section ? `Class ${base} · ${section}` : `Class ${base}`
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

interface SubjectMatrixColumn {
  key: string
  label: string
  classIds: string[]
  className: string
  section: string
  sectionSpecific: boolean
}

interface TimetableSubjectsProps {
  showParallelSubjectPairs?: boolean
  showCommonPeriod?: boolean
}

const TimetableSubjects: React.FC<TimetableSubjectsProps> = ({
  showParallelSubjectPairs = true,
  showCommonPeriod = true,
}) => {
  const {
    classes,
    subjects,
    parallelSubjectPairs,
    setParallelSubjectPairs,
    commonPeriods,
    setCommonPeriods,
    addSubject,
    updateSubject,
    deleteSubjects,
    applyClassSubjectAssignments,
    timetableGrid,
  } = useTimetable()
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newItem, setNewItem] = useState({ ...EMPTY_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingData, setEditingData] = useState({ ...EMPTY_FORM })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [classSubjectDraft, setClassSubjectDraft] = useState<Record<string, string[]>>({})
  const [hasPendingMatrixChanges, setHasPendingMatrixChanges] = useState(false)
  const [isAddingPair, setIsAddingPair] = useState(false)
  const [newPair, setNewPair] = useState({ ...EMPTY_PAIR_FORM })
  const [editingPairId, setEditingPairId] = useState<string | null>(null)
  const [editingPairData, setEditingPairData] = useState({ ...EMPTY_PAIR_FORM })
  const [isAddingCommonPeriod, setIsAddingCommonPeriod] = useState(false)
  const [newCommonPeriod, setNewCommonPeriod] = useState<{ className: string; subject: string }>({
    className: '',
    subject: '',
  })
  const [selectedCommonPeriodSections, setSelectedCommonPeriodSections] = useState<string[]>([])
  // View-only state for the redesigned layout (search, type filter, confirmations, inline form errors).
  const initialSubjectSearch = useUrlSearchQuery((value) => setSubjectSearch(value))
  const [subjectSearch, setSubjectSearch] = useState(initialSubjectSearch)
  const [subjectTypeFilter, setSubjectTypeFilter] = useState('all')
  const [subjectDeleteIds, setSubjectDeleteIds] = useState<string[] | null>(null)
  const [pairDeleteId, setPairDeleteId] = useState<string | null>(null)
  const [pairError, setPairError] = useState('')
  const [commonPeriodError, setCommonPeriodError] = useState('')
  type CommonPeriodRow = {
    id: string
    className: string
    subject: string
    sections: string[]
  }

  // ── CRUD ──
  const handleAdd = () => {
    if (!newItem.name.trim()) return
    addSubject({
      name: newItem.name.trim(),
      type: newItem.type || 'Other',
      requiresConsecutivePeriods: newItem.requiresConsecutivePeriods,
      consecutivePeriodCount: newItem.consecutivePeriodCount,
      color: newItem.color,
    })
    setNewItem({ ...EMPTY_FORM })
    setIsAddingNew(false)
  }

  const handleEdit = (item: TimetableSubject) => {
    setEditingId(item.id)
    setEditingData({ name: item.name, type: item.type, requiresConsecutivePeriods: item.requiresConsecutivePeriods, consecutivePeriodCount: item.consecutivePeriodCount, color: item.color })
  }

  const handleSave = (id: string) => {
    if (!editingData.name.trim()) return
    updateSubject(id, {
      name: editingData.name.trim(),
      type: editingData.type || 'Other',
    })
    setEditingId(null)
    setEditingData({ ...EMPTY_FORM })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setEditingData({ ...EMPTY_FORM })
    setIsAddingNew(false)
    setNewItem({ ...EMPTY_FORM })
  }

  // ── Selection ──
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sortedSubjects = useMemo(
    () => [...subjects].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })),
    [subjects]
  )

  const visibleSubjects = useMemo(() => {
    const query = subjectSearch.trim().toLowerCase()
    return sortedSubjects.filter((s) => {
      if (subjectTypeFilter !== 'all' && s.type !== subjectTypeFilter) return false
      if (query && !s.name.toLowerCase().includes(query)) return false
      return true
    })
  }, [sortedSubjects, subjectSearch, subjectTypeFilter])

  const selectAllOnPage = () => {
    const ids = visibleSubjects.map((s) => s.id)
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        ids.forEach((id) => next.add(id))
        return next
      })
    }
  }

  // Opens the confirmation; the delete itself runs from the danger Dialog (was window.confirm).
  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return
    setSubjectDeleteIds(Array.from(selectedIds))
  }

  const handleConfirmDeleteSubjects = () => {
    const ids = subjectDeleteIds
    setSubjectDeleteIds(null)
    if (!ids || ids.length === 0) return
    deleteSubjects(ids)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })
  }

  const allOnPageSelected = visibleSubjects.length > 0 && visibleSubjects.every((s) => selectedIds.has(s.id))
  const someOnPageSelected = visibleSubjects.some((s) => selectedIds.has(s.id))

  const classOptions = useMemo(() => {
    const deduped = new Set<string>()
    classes.forEach((item) => {
      const className = item.className.trim()
      if (className) deduped.add(className)
    })
    return Array.from(deduped).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [classes])

  const classSubjectsMap = useMemo(() => {
    const map = new Map<string, string[]>()
    classOptions.forEach((className) => {
      const subjectSet = new Set<string>()
      classes.forEach((item) => {
        if (item.className.trim().toLowerCase() !== className.toLowerCase()) return
        item.subjects.forEach((subject) => {
          const trimmed = subject.trim()
          if (trimmed) subjectSet.add(trimmed)
        })
      })
      map.set(
        className,
        Array.from(subjectSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      )
    })
    return map
  }, [classes, classOptions])

  const classesById = useMemo(() => {
    return new Map(classes.map((item) => [item.id, item]))
  }, [classes])

  useEffect(() => {
    if (hasPendingMatrixChanges) return

    const nextDraft: Record<string, string[]> = {}
    classes.forEach((item) => {
      nextDraft[item.id] = [...item.subjects]
    })
    setClassSubjectDraft(nextDraft)
  }, [classes, hasPendingMatrixChanges])

  const matrixColumns = useMemo<SubjectMatrixColumn[]>(() => {
    const groupedColumns = new Map<string, SubjectMatrixColumn>()
    const sectionColumns: SubjectMatrixColumn[] = []

    const sortedClasses = [...classes].sort((a, b) => {
      const classOrder = compareClassNames(a.className, b.className)
      if (classOrder !== 0) return classOrder
      const classLevel = parseClassLevel(a.className)
      if (classLevel === 11 || classLevel === 12) {
        const sectionOrder = getSeniorSectionOrder(a.section) - getSeniorSectionOrder(b.section)
        if (sectionOrder !== 0) return sectionOrder
      }
      return a.section.localeCompare(b.section, undefined, { numeric: true })
    })

    sortedClasses.forEach((item) => {
      const className = item.className.trim()
      if (!className) return

      const section = item.section.trim()
      const classLevel = parseClassLevel(className)
      const sectionSpecific = classLevel === 11 || classLevel === 12

      if (sectionSpecific) {
        sectionColumns.push({
          key: `section-${item.id}`,
          label: section ? `${className}-${section}` : className,
          classIds: [item.id],
          className,
          section,
          sectionSpecific: true,
        })
        return
      }

      const classKey = className.toLowerCase()
      const existing = groupedColumns.get(classKey)
      if (existing) {
        existing.classIds.push(item.id)
        return
      }

      groupedColumns.set(classKey, {
        key: `class-${classKey}`,
        label: className,
        classIds: [item.id],
        className,
        section: '',
        sectionSpecific: false,
      })
    })

    return [...Array.from(groupedColumns.values()), ...sectionColumns]
  }, [classes])

  const isSubjectAssignedToColumn = (subjectName: string, column: SubjectMatrixColumn) => {
    const subjectKey = subjectName.trim().toLowerCase()
    if (!subjectKey || column.classIds.length === 0) return false

    return column.classIds.every((classId) => {
      const draftSubjects = classSubjectDraft[classId] ?? classesById.get(classId)?.subjects ?? []
      return draftSubjects.some((subject) => subject.trim().toLowerCase() === subjectKey)
    })
  }

  const toggleSubjectAssignment = (subjectName: string, column: SubjectMatrixColumn, checked: boolean) => {
    const subjectKey = subjectName.trim().toLowerCase()
    if (!subjectKey || column.classIds.length === 0) return

    setClassSubjectDraft((prev) => {
      const next = { ...prev }
      const targetClassIds = column.sectionSpecific ? [column.classIds[0]] : [...column.classIds]

      targetClassIds.forEach((classId) => {
        const baseSubjects = next[classId] ?? classesById.get(classId)?.subjects ?? []
        const subjectMap = new Map<string, string>()
        baseSubjects.forEach((subject) => {
          const trimmed = subject.trim()
          if (!trimmed) return
          const key = trimmed.toLowerCase()
          if (!subjectMap.has(key)) subjectMap.set(key, trimmed)
        })

        if (checked) {
          subjectMap.set(subjectKey, subjectName)
        } else {
          subjectMap.delete(subjectKey)
        }

        next[classId] = Array.from(subjectMap.values())
      })

      return next
    })
    setHasPendingMatrixChanges(true)
  }

  const handleSaveSubjectMatrix = () => {
    if (!hasPendingMatrixChanges) return

    const allowedSubjectByKey = new Map<string, string>()
    subjects.forEach((subject) => {
      const trimmed = subject.name.trim()
      if (!trimmed) return
      const key = trimmed.toLowerCase()
      if (!allowedSubjectByKey.has(key)) {
        allowedSubjectByKey.set(key, trimmed)
      }
    })

    const toKey = (entries: string[]) =>
      entries
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join('|')

    const updates: Record<string, string[]> = {}
    classes.forEach((classEntry) => {
      const draftSubjects = classSubjectDraft[classEntry.id] ?? classEntry.subjects
      const sanitizedMap = new Map<string, string>()
      draftSubjects.forEach((subjectName) => {
        const key = subjectName.trim().toLowerCase()
        const canonical = allowedSubjectByKey.get(key)
        if (!canonical) return
        if (!sanitizedMap.has(key)) {
          sanitizedMap.set(key, canonical)
        }
      })
      const nextSubjects = Array.from(sanitizedMap.values())
      if (toKey(nextSubjects) !== toKey(classEntry.subjects)) {
        updates[classEntry.id] = nextSubjects
      }
    })

    if (Object.keys(updates).length === 0) {
      setHasPendingMatrixChanges(false)
      return
    }

    applyClassSubjectAssignments(updates)
    setHasPendingMatrixChanges(false)
    toast.success('Subject matrix saved.')
  }

  const getPairValidationError = (
    pairData: { className: string; subjectA: string; subjectB: string },
    excludeId: string | null
  ) => {
    const className = pairData.className.trim()
    const subjectA = pairData.subjectA.trim()
    const subjectB = pairData.subjectB.trim()

    if (!className) return 'Choose a class first.'
    if (!subjectA || !subjectB) return 'Choose both subjects for the pair.'
    if (subjectA.toLowerCase() === subjectB.toLowerCase()) return 'Choose two different subjects.'

    const duplicate = parallelSubjectPairs.find((pair) => {
      if (excludeId && pair.id === excludeId) return false
      if (pair.className.trim().toLowerCase() !== className.toLowerCase()) return false

      const existing = [pair.subjectA.trim().toLowerCase(), pair.subjectB.trim().toLowerCase()].sort().join('|')
      const incoming = [subjectA.toLowerCase(), subjectB.toLowerCase()].sort().join('|')
      return existing === incoming
    })

    if (duplicate) return `${classLabel(className)} already has this pair. Choose different subjects.`
    return ''
  }

  const handleAddPair = () => {
    const validationError = getPairValidationError(newPair, null)
    if (validationError) {
      setPairError(validationError)
      return
    }
    setPairError('')

    setParallelSubjectPairs([
      ...parallelSubjectPairs,
      {
        id: `psp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        className: newPair.className.trim(),
        subjectA: newPair.subjectA.trim(),
        subjectB: newPair.subjectB.trim(),
      },
    ])
    setNewPair({ ...EMPTY_PAIR_FORM })
    setIsAddingPair(false)
  }

  const handleEditPair = (pairId: string) => {
    const pair = parallelSubjectPairs.find((item) => item.id === pairId)
    if (!pair) return

    setEditingPairId(pair.id)
    setEditingPairData({
      className: pair.className,
      subjectA: pair.subjectA,
      subjectB: pair.subjectB,
    })
  }

  const handleSavePair = (pairId: string) => {
    const validationError = getPairValidationError(editingPairData, pairId)
    if (validationError) {
      setPairError(validationError)
      return
    }
    setPairError('')

    setParallelSubjectPairs(
      parallelSubjectPairs.map((pair) =>
        pair.id === pairId
          ? {
              ...pair,
              className: editingPairData.className.trim(),
              subjectA: editingPairData.subjectA.trim(),
              subjectB: editingPairData.subjectB.trim(),
            }
          : pair
      )
    )
    setEditingPairId(null)
    setEditingPairData({ ...EMPTY_PAIR_FORM })
  }

  // Opens the confirmation; the delete itself runs from the danger Dialog (was window.confirm).
  const handleDeletePair = (pairId: string) => {
    const pair = parallelSubjectPairs.find((item) => item.id === pairId)
    if (!pair) return
    setPairDeleteId(pair.id)
  }

  const handleConfirmDeletePair = () => {
    const pairId = pairDeleteId
    setPairDeleteId(null)
    if (!pairId) return
    setParallelSubjectPairs(parallelSubjectPairs.filter((item) => item.id !== pairId))
  }

  const handleCancelPairEdit = () => {
    setEditingPairId(null)
    setEditingPairData({ ...EMPTY_PAIR_FORM })
    setIsAddingPair(false)
    setNewPair({ ...EMPTY_PAIR_FORM })
    setPairError('')
  }

  const handleOpenAddCommonPeriod = () => {
    setIsAddingCommonPeriod(true)
    setNewCommonPeriod({ className: '', subject: '' })
    setSelectedCommonPeriodSections([])
    setCommonPeriodError('')
  }

  const handleCancelAddCommonPeriod = () => {
    setIsAddingCommonPeriod(false)
    setNewCommonPeriod({ className: '', subject: '' })
    setSelectedCommonPeriodSections([])
    setCommonPeriodError('')
  }

  const classMetaById = useMemo(() => {
    return new Map(classes.map((c) => [c.id, { className: c.className, section: c.section }]))
  }, [classes])

  const classNameOptions = useMemo(() => {
    const unique = new Set<string>()
    classes.forEach((c) => {
      const cn = c.className?.trim()
      if (cn) unique.add(cn)
    })
    return Array.from(unique).sort(compareClassNames)
  }, [classes])

  const allCommonMatches = useMemo(() => {
    const grid = timetableGrid
    if (!grid || Object.keys(grid).length === 0) return []

    type CommonPeriodGroup = {
      className: string
      subject: string
      teacher: string
      day: string
      slot: number
      sections: Set<string>
    }

    const groups = new Map<string, CommonPeriodGroup>()

    for (const [classId, byDay] of Object.entries(grid)) {
      const meta = classMetaById.get(classId)
      if (!meta) continue

      const { className, section } = meta
      if (!className || !section) continue

      for (const [day, bySlot] of Object.entries(byDay || {})) {
        for (const [slotKey, cell] of Object.entries(bySlot || {})) {
          if (!cell?.subject || !cell?.teacher) continue

          const subject = cell.subject.trim()
          const teacher = cell.teacher.trim()
          const slot = Number(slotKey)
          if (!subject || !teacher || !Number.isFinite(slot)) continue

          // Group only within the same class (across different sections), same subject+teacher, same day+slot.
          const groupKey = `${className}|||${subject.toLowerCase()}|||${teacher.toLowerCase()}|||${day}|||${slot}`
          const existing = groups.get(groupKey)
          if (existing) {
            existing.sections.add(section)
          } else {
            groups.set(groupKey, {
              className,
              subject,
              teacher,
              day,
              slot,
              sections: new Set([section]),
            })
          }
        }
      }
    }

    // Convert "teacher/day/slot matches" into UI rows: Subject+Class+Sections (teacher/day/slot hidden).
    const ruleMap = new Map<string, CommonPeriodRow>()

    for (const g of Array.from(groups.values()).filter((x) => x.sections.size > 1)) {
      const sectionsSorted = Array.from(g.sections).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      const ruleId = `${g.className}|||${g.subject}|||${sectionsSorted.join('|')}`
      const existing = ruleMap.get(ruleId)
      if (existing) continue
      ruleMap.set(ruleId, {
        id: ruleId,
        className: g.className,
        subject: g.subject,
        sections: sectionsSorted,
      })
    }

    return Array.from(ruleMap.values()).sort((a, b) => {
      const classCmp = compareClassNames(a.className, b.className)
      if (classCmp !== 0) return classCmp
      return a.subject.localeCompare(b.subject, undefined, { sensitivity: 'base', numeric: true })
    })
  }, [timetableGrid, classMetaById])

  const availableClassNamesForSubjectFromMatrix = useMemo(() => {
    if (!newCommonPeriod.subject) return classNameOptions
    const set = new Set<string>()

    // Match the same semantics as the matrix checkboxes (grouped columns require subject in ALL column classIds).
    matrixColumns.forEach((column) => {
      if (isSubjectAssignedToColumn(newCommonPeriod.subject, column)) {
        if (column.className?.trim()) set.add(column.className.trim())
      }
    })

    return Array.from(set).sort(compareClassNames)
  }, [classNameOptions, matrixColumns, classSubjectDraft, classesById, newCommonPeriod.subject])

  useEffect(() => {
    if (!isAddingCommonPeriod) return
    if (!newCommonPeriod.subject) return
    if (!newCommonPeriod.className) return
    if (availableClassNamesForSubjectFromMatrix.includes(newCommonPeriod.className)) return
    setNewCommonPeriod((prev) => ({
      ...prev,
      className: availableClassNamesForSubjectFromMatrix[0] || '',
    }))
  }, [
    availableClassNamesForSubjectFromMatrix,
    isAddingCommonPeriod,
    newCommonPeriod.className,
    newCommonPeriod.subject,
  ])

  const candidateCommonMatches = useMemo(() => {
    if (!newCommonPeriod.subject || !newCommonPeriod.className) return []
    return allCommonMatches.filter(
      (m) => m.subject === newCommonPeriod.subject && m.className === newCommonPeriod.className
    )
  }, [allCommonMatches, newCommonPeriod.className, newCommonPeriod.subject])

  const matrixAssignedSectionsForSelection = useMemo(() => {
    const subjectKey = newCommonPeriod.subject.trim().toLowerCase()
    const classKey = newCommonPeriod.className.trim().toLowerCase()
    if (!subjectKey || !classKey) return []

    const sections = new Set<string>()
    classes.forEach((c) => {
      if (c.className.trim().toLowerCase() !== classKey) return
      const draftSubjects = classSubjectDraft[c.id] ?? c.subjects ?? []
      const hasSubject = draftSubjects.some((s) => s.trim().toLowerCase() === subjectKey)
      if (!hasSubject) return
      const section = c.section?.trim()
      if (section) sections.add(section)
    })

    return Array.from(sections).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [classSubjectDraft, classes, newCommonPeriod.className, newCommonPeriod.subject])

  useEffect(() => {
    if (!isAddingCommonPeriod) return
    setSelectedCommonPeriodSections(matrixAssignedSectionsForSelection)
  }, [isAddingCommonPeriod, matrixAssignedSectionsForSelection])

  const handleSaveCommonPeriod = () => {
    const { className, subject } = newCommonPeriod
    if (!className || !subject) return

    const nextSections = selectedCommonPeriodSections
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s, i, arr) => arr.indexOf(s) === i)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

    if (nextSections.length === 0) {
      setCommonPeriodError('Choose at least one section for this common period.')
      return
    }

    const rowId = `${className}|||${subject}|||${nextSections.join('|')}`

    setCommonPeriods((prev) => {
      const map = new Map(prev.map((p) => [p.id, p]))
      map.set(rowId, { id: rowId, className, subject, sections: nextSections })
      return Array.from(map.values()).sort((a, b) => {
        const classCmp = compareClassNames(a.className, b.className)
        if (classCmp !== 0) return classCmp
        return a.subject.localeCompare(b.subject, undefined, { sensitivity: 'base', numeric: true })
      })
    })

    setIsAddingCommonPeriod(false)
    setNewCommonPeriod({ className: '', subject: '' })
    setSelectedCommonPeriodSections([])
    setCommonPeriodError('')
  }

  // ── Stats ──
  const typeCounts: Record<string, number> = {}
  subjects.forEach((s) => { typeCounts[s.type] = (typeCounts[s.type] || 0) + 1 })


  // ── View helpers (presentation only) ──
  const typeChips = Object.entries(typeCounts).sort(([a], [b]) => {
    const ai = SUBJECT_TYPES.indexOf(a)
    const bi = SUBJECT_TYPES.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b)
  })
  const hasSubjectFilters = subjectSearch.trim() !== '' || subjectTypeFilter !== 'all'
  const clearSubjectFilters = () => {
    setSubjectSearch('')
    setSubjectTypeFilter('all')
  }
  const selectedCount = selectedIds.size
  const editingSubject = editingId ? subjects.find((s) => s.id === editingId) : undefined
  const subjectsPendingDelete = (subjectDeleteIds ?? [])
    .map((id) => subjects.find((s) => s.id === id))
    .filter((s): s is TimetableSubject => Boolean(s))
  const subjectNameOptions = Array.from(new Set(sortedSubjects.map((s) => s.name)))

  const isEditingPairDialog = !isAddingPair && editingPairId !== null
  const pairForm = isEditingPairDialog ? editingPairData : newPair
  const pairSubjectOptions = classSubjectsMap.get(pairForm.className) || []
  const updatePairForm = (patch: Partial<typeof EMPTY_PAIR_FORM>) => {
    setPairError('')
    if (isEditingPairDialog) setEditingPairData((prev) => ({ ...prev, ...patch }))
    else setNewPair((prev) => ({ ...prev, ...patch }))
  }
  const pairPendingDelete = pairDeleteId ? parallelSubjectPairs.find((p) => p.id === pairDeleteId) : undefined

  const commonPeriodCanSave = Boolean(
    newCommonPeriod.subject && newCommonPeriod.className && selectedCommonPeriodSections.length > 0
  )
  const commonPeriodSectionsHint = !newCommonPeriod.subject || !newCommonPeriod.className
    ? 'Choose a subject and class to see their sections.'
    : matrixAssignedSectionsForSelection.length === 0
      ? 'No section of this class takes this subject in the subject matrix yet.'
      : candidateCommonMatches.length === 0
        ? 'No matching periods in the current timetable yet.'
        : `${plural(candidateCommonMatches.length, 'matching period', 'matching periods')} found in the current timetable.`

  const submitWith = (handler: () => void) => (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    handler()
  }

  const subjectColumns: DataTableColumn<TimetableSubject>[] = [
    {
      key: 'name',
      header: 'Subject',
      mobile: 'title',
      render: (item) => (
        <span className="tt-subj-name" title={item.name}>
          {item.name}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      mobile: 'subtitle',
      render: (item) =>
        item.type ? (
          <Badge tone="neutral" dot={false}>
            {item.type}
          </Badge>
        ) : (
          '—'
        ),
    },
    {
      key: 'actions',
      header: <span className="cb-visually-hidden">Actions</span>,
      headerLabel: 'Actions',
      interactive: true,
      mobile: 'aside',
      render: (item) => (
        <Menu
          label={`Actions for ${item.name}`}
          items={[
            { label: 'Edit subject', icon: Pencil, onSelect: () => handleEdit(item) },
            { divider: true },
            { label: 'Delete subject', icon: Trash2, tone: 'danger', onSelect: () => setSubjectDeleteIds([item.id]) },
          ]}
        />
      ),
    },
    ...matrixColumns.map(
      (column): DataTableColumn<TimetableSubject> => ({
        key: column.key,
        header: classLabel(column.label),
        headerLabel: classLabel(column.label),
        align: 'center',
        interactive: true,
        render: (item) => (
          <Checkbox
            checked={isSubjectAssignedToColumn(item.name, column)}
            onChange={(checked) => toggleSubjectAssignment(item.name, column, checked)}
            aria-label={`Teach ${item.name} in ${classLabel(column.label)}`}
          />
        ),
      })
    ),
  ]

  type ParallelPairRow = (typeof parallelSubjectPairs)[number]
  const pairColumns: DataTableColumn<ParallelPairRow>[] = [
    {
      key: 'className',
      header: 'Class',
      mobile: 'title',
      render: (pair) => <span className="cb-strong">{classLabel(pair.className)}</span>,
    },
    {
      key: 'subjectA',
      header: 'First subject',
      render: (pair) => (
        <Badge tone="neutral" dot={false}>
          {pair.subjectA}
        </Badge>
      ),
    },
    {
      key: 'subjectB',
      header: 'Second subject',
      render: (pair) => (
        <Badge tone="neutral" dot={false}>
          {pair.subjectB}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: <span className="cb-visually-hidden">Actions</span>,
      headerLabel: 'Actions',
      interactive: true,
      mobile: 'aside',
      align: 'right',
      width: 56,
      render: (pair) => (
        <Menu
          label={`Actions for ${pair.subjectA} and ${pair.subjectB}`}
          items={[
            {
              label: 'Edit pair',
              icon: Pencil,
              onSelect: () => {
                setPairError('')
                handleEditPair(pair.id)
              },
            },
            { divider: true },
            { label: 'Delete pair', icon: Trash2, tone: 'danger', onSelect: () => handleDeletePair(pair.id) },
          ]}
        />
      ),
    },
  ]

  const commonPeriodColumns: DataTableColumn<CommonPeriodRow>[] = [
    {
      key: 'subject',
      header: 'Subject',
      mobile: 'title',
      render: (row) => (
        <Badge tone="neutral" dot={false}>
          {row.subject}
        </Badge>
      ),
    },
    {
      key: 'className',
      header: 'Class',
      mobile: 'subtitle',
      render: (row) => classLabel(row.className),
    },
    {
      key: 'sections',
      header: 'Sections',
      render: (row) =>
        row.sections.length ? (
          <span className="tt-subj-badges">
            {row.sections.map((section) => (
              <Badge key={section} tone="neutral" dot={false}>
                {section}
              </Badge>
            ))}
          </span>
        ) : (
          '—'
        ),
    },
  ]

  return (
    <Page width="full">
      <Card
        flush
        className="tt-subj-card"
        title="Subjects"
        subtitle="Tick the classes that take each subject, then save the matrix. Classes up to 10 are set class-wise; classes 11 and 12 section-wise."
        action={
          <div className="tt-subj-card__actions">
            {hasPendingMatrixChanges ? <Badge tone="warning">Unsaved changes</Badge> : null}
            <Button
              size="sm"
              variant={hasPendingMatrixChanges ? 'primary' : 'secondary'}
              icon={Save}
              onClick={handleSaveSubjectMatrix}
              disabled={!hasPendingMatrixChanges}
            >
              Save matrix
            </Button>
            <Button
              size="sm"
              variant={hasPendingMatrixChanges ? 'secondary' : 'primary'}
              icon={Plus}
              onClick={() => setIsAddingNew(true)}
              disabled={isAddingNew}
            >
              Add subject
            </Button>
          </div>
        }
      >
        <div className="tt-subj-toolbar">
          <FilterBar
            search={{
              placeholder: 'Search subjects',
              value: subjectSearch,
              onChange: setSubjectSearch,
              label: 'Search subjects',
            }}
            chips={
              subjects.length
                ? [
                    { id: 'all', label: 'All', count: subjects.length, active: subjectTypeFilter === 'all' },
                    ...typeChips.map(([type, count]) => ({
                      id: type,
                      label: type || 'No type',
                      count,
                      active: subjectTypeFilter === type,
                    })),
                  ]
                : undefined
            }
            chipsLabel="Filter by type"
            onChipClick={(id) => setSubjectTypeFilter((prev) => (prev === id && id !== 'all' ? 'all' : id))}
          />
          {selectedCount > 0 ? (
            <div className="tt-subj-bulkbar" role="region" aria-label="Bulk actions">
              <span className="is-num">{plural(selectedCount, 'subject', 'subjects')} selected</span>
              <span className="tt-subj-bulkbar__spacer" />
              <Button variant="tertiary" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear selection
              </Button>
              <Button size="sm" icon={Trash2} onClick={handleDeleteSelected}>
                Delete {plural(selectedCount, 'subject', 'subjects')}
              </Button>
            </div>
          ) : null}
        </div>

        <DataTable
          className="tt-subj-matrix"
          caption="Subjects and the classes that take them"
          columns={subjectColumns}
          rows={visibleSubjects}
          getRowKey={(item) => item.id}
          maxHeight="min(560px, calc(100vh - 280px))"
          selection={{
            isSelected: (item) => selectedIds.has(item.id),
            onToggle: (item) => toggleSelection(item.id),
            allSelected: allOnPageSelected,
            someSelected: someOnPageSelected,
            onToggleAll: selectAllOnPage,
            rowLabel: (item) => `Select ${item.name}`,
          }}
          empty={
            hasSubjectFilters && subjects.length > 0 ? (
              <EmptyState
                compact
                icon={SearchX}
                title="No subjects match these filters"
                body="Try another name or type, or clear the filters."
                action={
                  <Button size="sm" onClick={clearSubjectFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                compact
                icon={BookOpen}
                title="No subjects added yet"
                body="Add the subjects your school teaches, then tick the classes that take each one."
                action={
                  <Button variant="primary" size="sm" icon={Plus} onClick={() => setIsAddingNew(true)}>
                    Add subject
                  </Button>
                }
              />
            )
          }
          footer={
            subjects.length > 0 ? (
              <>
                <span className="is-num">
                  {visibleSubjects.length === subjects.length
                    ? plural(subjects.length, 'subject', 'subjects')
                    : `${visibleSubjects.length} of ${plural(subjects.length, 'subject', 'subjects')}`}
                  {matrixColumns.length > 0 ? ` · ${plural(matrixColumns.length, 'class column', 'class columns')}` : ''}
                </span>
                {matrixColumns.length === 0 ? <span>Add classes to assign subjects to them.</span> : null}
              </>
            ) : null
          }
        />
      </Card>

      {showParallelSubjectPairs && (
        <Card
          flush
          className="tt-subj-card"
          title="Parallel subject pairs"
          subtitle="Subjects in a pair share one timetable slot. Period distribution counts each pair as one period, not two."
          action={
            <Button
              size="sm"
              icon={Plus}
              onClick={() => {
                setPairError('')
                setIsAddingPair(true)
              }}
              disabled={isAddingPair || classOptions.length === 0}
              title={classOptions.length === 0 ? 'Add classes and subjects first' : undefined}
            >
              Add pair
            </Button>
          }
        >
          <DataTable
            className="tt-subj-list"
            caption="Parallel subject pairs"
            columns={pairColumns}
            rows={parallelSubjectPairs}
            getRowKey={(pair) => pair.id}
            empty={
              <EmptyState
                compact
                icon={Split}
                title="No parallel pairs yet"
                body={
                  classOptions.length === 0
                    ? 'Add classes and their subjects first, then pair subjects that run in the same period.'
                    : 'Pair subjects that run in the same period, like French and Sanskrit.'
                }
                action={
                  <Button
                    size="sm"
                    icon={Plus}
                    onClick={() => {
                      setPairError('')
                      setIsAddingPair(true)
                    }}
                    disabled={classOptions.length === 0}
                  >
                    Add pair
                  </Button>
                }
              />
            }
            footer={
              parallelSubjectPairs.length > 0 ? (
                <span className="is-num">{plural(parallelSubjectPairs.length, 'pair', 'pairs')}</span>
              ) : null
            }
          />
        </Card>
      )}

      {showCommonPeriod && (
        <Card
          flush
          className="tt-subj-card"
          title="Common periods"
          subtitle="Sections of one class that take a subject together. Matches come from the current timetable."
          action={
            <Button size="sm" icon={Plus} onClick={handleOpenAddCommonPeriod} disabled={isAddingCommonPeriod}>
              Add common period
            </Button>
          }
        >
          <DataTable
            caption="Common periods"
            columns={commonPeriodColumns}
            rows={commonPeriods as CommonPeriodRow[]}
            getRowKey={(row) => row.id}
            empty={
              <EmptyState
                compact
                icon={CalendarClock}
                title="No common periods yet"
                body="Choose a subject and class to find sections that share a period in the timetable."
                action={
                  <Button size="sm" icon={Plus} onClick={handleOpenAddCommonPeriod}>
                    Add common period
                  </Button>
                }
              />
            }
            footer={
              commonPeriods.length > 0 ? (
                <span className="is-num">{plural(commonPeriods.length, 'common period', 'common periods')}</span>
              ) : null
            }
          />
        </Card>
      )}

      {/* ── Add subject ── */}
      <Dialog
        open={isAddingNew}
        onClose={handleCancelEdit}
        title="Add subject"
        description="Once it's added, tick the classes that take it in the subject matrix."
        footer={
          <>
            <Button onClick={handleCancelEdit}>Cancel</Button>
            <Button
              type="submit"
              form={ADD_SUBJECT_FORM_ID}
              variant="primary"
              icon={Plus}
              disabled={!newItem.name.trim()}
            >
              Add subject
            </Button>
          </>
        }
      >
        <form id={ADD_SUBJECT_FORM_ID} className="tt-subj-form" onSubmit={submitWith(handleAdd)} noValidate>
          <TextField
            label="Subject name"
            required
            autoFocus
            value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
            placeholder="e.g. Mathematics"
          />
          <Select
            label="Type"
            value={newItem.type}
            onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
            options={SUBJECT_TYPES}
          />
        </form>
      </Dialog>

      {/* ── Edit subject ── */}
      <Dialog
        open={editingId !== null}
        onClose={handleCancelEdit}
        title={editingSubject ? `Edit ${editingSubject.name}` : 'Edit subject'}
        description="Class assignments stay as they are in the subject matrix."
        footer={
          <>
            <Button onClick={handleCancelEdit}>Cancel</Button>
            <Button type="submit" form={EDIT_SUBJECT_FORM_ID} variant="primary" disabled={!editingData.name.trim()}>
              Save changes
            </Button>
          </>
        }
      >
        <form
          id={EDIT_SUBJECT_FORM_ID}
          className="tt-subj-form"
          onSubmit={submitWith(() => {
            if (editingId) handleSave(editingId)
          })}
          noValidate
        >
          <TextField
            label="Subject name"
            required
            value={editingData.name}
            onChange={(e) => setEditingData({ ...editingData, name: e.target.value })}
            placeholder="Subject name"
          />
          <Select
            label="Type"
            value={editingData.type}
            onChange={(e) => setEditingData({ ...editingData, type: e.target.value })}
            options={SUBJECT_TYPES}
          />
        </form>
      </Dialog>

      {/* ── Delete subjects ── */}
      <Dialog
        open={subjectDeleteIds !== null}
        onClose={() => setSubjectDeleteIds(null)}
        tone="danger"
        size="sm"
        title={
          subjectsPendingDelete.length === 1
            ? `Delete ${subjectsPendingDelete[0].name}?`
            : `Delete ${plural(subjectsPendingDelete.length, 'subject', 'subjects')}?`
        }
        description="They're removed from the subject list, along with any parallel pairs and period allocations that use them. This can't be undone."
        footer={
          <>
            <Button onClick={() => setSubjectDeleteIds(null)}>
              {subjectsPendingDelete.length === 1 ? 'Keep subject' : 'Keep subjects'}
            </Button>
            <Button variant="danger" icon={Trash2} onClick={handleConfirmDeleteSubjects}>
              Delete {plural(subjectsPendingDelete.length, 'subject', 'subjects')}
            </Button>
          </>
        }
      />

      {/* ── Add / edit parallel pair ── */}
      <Dialog
        open={isAddingPair || editingPairId !== null}
        onClose={handleCancelPairEdit}
        title={isEditingPairDialog ? 'Edit parallel pair' : 'Add parallel pair'}
        description="Both subjects run in the same period for the class."
        footer={
          <>
            <Button onClick={handleCancelPairEdit}>Cancel</Button>
            <Button type="submit" form={PAIR_FORM_ID} variant="primary">
              {isEditingPairDialog ? 'Save pair' : 'Add pair'}
            </Button>
          </>
        }
      >
        <form
          id={PAIR_FORM_ID}
          className="tt-subj-form"
          onSubmit={submitWith(() => {
            if (isEditingPairDialog && editingPairId) handleSavePair(editingPairId)
            else handleAddPair()
          })}
          noValidate
        >
          {pairError ? (
            <Banner tone="danger" onDismiss={() => setPairError('')}>
              {pairError}
            </Banner>
          ) : null}
          <Select
            label="Class"
            required
            value={pairForm.className}
            onChange={(e) => updatePairForm({ className: e.target.value, subjectA: '', subjectB: '' })}
            placeholder="Choose class"
            options={classOptions.map((className) => ({ value: className, label: classLabel(className) }))}
          />
          <Select
            label="First subject"
            required
            value={pairForm.subjectA}
            onChange={(e) => updatePairForm({ subjectA: e.target.value })}
            placeholder="Choose subject"
            disabled={!pairForm.className}
            options={pairSubjectOptions}
            hint={
              pairForm.className && pairSubjectOptions.length === 0
                ? 'This class has no subjects yet. Tick some in the subject matrix and save it.'
                : undefined
            }
          />
          <Select
            label="Second subject"
            required
            value={pairForm.subjectB}
            onChange={(e) => updatePairForm({ subjectB: e.target.value })}
            placeholder="Choose subject"
            disabled={!pairForm.className}
            options={pairSubjectOptions}
          />
        </form>
      </Dialog>

      {/* ── Delete parallel pair ── */}
      <Dialog
        open={pairDeleteId !== null}
        onClose={() => setPairDeleteId(null)}
        tone="danger"
        size="sm"
        title="Delete this parallel pair?"
        description={
          pairPendingDelete
            ? `${pairPendingDelete.subjectA} and ${pairPendingDelete.subjectB} in ${classLabel(pairPendingDelete.className)} will no longer share a period. This can't be undone.`
            : undefined
        }
        footer={
          <>
            <Button onClick={() => setPairDeleteId(null)}>Keep pair</Button>
            <Button variant="danger" icon={Trash2} onClick={handleConfirmDeletePair}>
              Delete pair
            </Button>
          </>
        }
      />

      {/* ── Add common period ── */}
      <Dialog
        open={isAddingCommonPeriod}
        onClose={handleCancelAddCommonPeriod}
        title="Add common period"
        description="Pick a subject and class, then the sections that take it together."
        footer={
          <>
            <Button onClick={handleCancelAddCommonPeriod}>Cancel</Button>
            <Button type="submit" form={COMMON_PERIOD_FORM_ID} variant="primary" disabled={!commonPeriodCanSave}>
              Save common period
            </Button>
          </>
        }
      >
        <form
          id={COMMON_PERIOD_FORM_ID}
          className="tt-subj-form"
          onSubmit={submitWith(handleSaveCommonPeriod)}
          noValidate
        >
          {commonPeriodError ? (
            <Banner tone="danger" onDismiss={() => setCommonPeriodError('')}>
              {commonPeriodError}
            </Banner>
          ) : null}
          <Select
            label="Subject"
            required
            value={newCommonPeriod.subject}
            onChange={(e) => {
              const subject = e.target.value
              setNewCommonPeriod((prev) => ({ ...prev, subject }))
            }}
            placeholder="Choose subject"
            options={subjectNameOptions}
          />
          <Select
            label="Class"
            required
            value={newCommonPeriod.className}
            onChange={(e) => setNewCommonPeriod((prev) => ({ ...prev, className: e.target.value }))}
            placeholder="Choose class"
            disabled={!newCommonPeriod.subject}
            options={(newCommonPeriod.subject ? availableClassNamesForSubjectFromMatrix : classNameOptions).map((cn) => ({
              value: cn,
              label: classLabel(cn),
            }))}
          />
          <fieldset className="tt-subj-sections">
            <legend className="tt-subj-sections__label">Sections</legend>
            {matrixAssignedSectionsForSelection.length > 0 && newCommonPeriod.subject && newCommonPeriod.className ? (
              <div className="tt-subj-sections__list">
                {matrixAssignedSectionsForSelection.map((section) => (
                  <Checkbox
                    key={section}
                    label={section}
                    checked={selectedCommonPeriodSections.includes(section)}
                    onChange={(nextChecked) => {
                      setCommonPeriodError('')
                      setSelectedCommonPeriodSections((prev) => {
                        if (nextChecked) {
                          return Array.from(new Set([...prev, section]))
                        }
                        return prev.filter((s) => s !== section)
                      })
                    }}
                  />
                ))}
              </div>
            ) : null}
            <p className="tt-subj-sections__hint">{commonPeriodSectionsHint}</p>
          </fieldset>
        </form>
      </Dialog>
    </Page>
  )
}

export default TimetableSubjects
