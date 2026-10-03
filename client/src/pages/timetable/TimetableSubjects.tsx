import React, { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTimetable, type TimetableSubject } from '@/contexts/TimetableContext'

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

const TYPE_COLORS: Record<
  string,
  { bg: string; color: string; border: string; icon: string; chip: string; darkBg: string; darkColor: string }
> = {
  Language: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', icon: '#2563eb', chip: '#eff6ff', darkBg: '#1e3a5f33', darkColor: '#93c5fd' },
  Skill: { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', icon: '#059669', chip: '#ecfdf5', darkBg: '#064e3b33', darkColor: '#6ee7b7' },
  Core: { bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe', icon: '#4f46e5', chip: '#eef2ff', darkBg: '#312e8133', darkColor: '#a5b4fc' },
  Elective: { bg: '#fffbeb', color: '#b45309', border: '#fde68a', icon: '#d97706', chip: '#fffbeb', darkBg: '#78350f33', darkColor: '#fcd34d' },
  'Co-Curricular': { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe', icon: '#7c3aed', chip: '#f5f3ff', darkBg: '#4c1d9533', darkColor: '#c4b5fd' },
  Other: { bg: '#f8fafc', color: '#475569', border: '#e2e8f0', icon: '#64748b', chip: '#f8fafc', darkBg: '#33415533', darkColor: '#94a3b8' },
}

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
  const [isCommonPeriodSectionsOpen, setIsCommonPeriodSectionsOpen] = useState(false)
  const matrixTableRef = useRef<HTMLTableElement | null>(null)
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

  const selectAllOnPage = () => {
    const ids = sortedSubjects.map((s) => s.id)
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

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return
    if (!window.confirm(`Delete ${selectedIds.size} selected subject(s)? This cannot be undone.`)) return
    deleteSubjects(Array.from(selectedIds))
    setSelectedIds(new Set())
  }

  const allOnPageSelected = sortedSubjects.length > 0 && sortedSubjects.every((s) => selectedIds.has(s.id))
  const someOnPageSelected = sortedSubjects.some((s) => selectedIds.has(s.id))

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

  useEffect(() => {
    const table = matrixTableRef.current
    if (!table) return

    const syncStickyOffsets = () => {
      const nameCell = table.querySelector('.ts-sticky-col-3') as HTMLElement | null
      const typeCell = table.querySelector('.ts-sticky-col-4') as HTMLElement | null
      if (!nameCell || !typeCell) return

      const left4 = 78 + nameCell.offsetWidth
      const left5 = left4 + typeCell.offsetWidth
      table.style.setProperty('--ts-sticky-left-4', `${left4}px`)
      table.style.setProperty('--ts-sticky-left-5', `${left5}px`)
    }

    syncStickyOffsets()
    const observer = new ResizeObserver(syncStickyOffsets)
    observer.observe(table)
    return () => observer.disconnect()
  }, [subjects, isAddingNew, editingId])

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

    if (!className) return 'Select class first.'
    if (!subjectA || !subjectB) return 'Select both parallel subjects.'
    if (subjectA.toLowerCase() === subjectB.toLowerCase()) return 'Both subjects cannot be same.'

    const duplicate = parallelSubjectPairs.find((pair) => {
      if (excludeId && pair.id === excludeId) return false
      if (pair.className.trim().toLowerCase() !== className.toLowerCase()) return false

      const existing = [pair.subjectA.trim().toLowerCase(), pair.subjectB.trim().toLowerCase()].sort().join('|')
      const incoming = [subjectA.toLowerCase(), subjectB.toLowerCase()].sort().join('|')
      return existing === incoming
    })

    if (duplicate) return 'This parallel pair already exists for the selected class.'
    return ''
  }

  const handleAddPair = () => {
    const validationError = getPairValidationError(newPair, null)
    if (validationError) {
      window.alert(validationError)
      return
    }

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
      window.alert(validationError)
      return
    }

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

  const handleDeletePair = (pairId: string) => {
    const pair = parallelSubjectPairs.find((item) => item.id === pairId)
    if (!pair) return
    if (!window.confirm(`Delete parallel pair "${pair.subjectA} + ${pair.subjectB}" from class ${pair.className}?`)) {
      return
    }
    setParallelSubjectPairs(parallelSubjectPairs.filter((item) => item.id !== pairId))
  }

  const handleCancelPairEdit = () => {
    setEditingPairId(null)
    setEditingPairData({ ...EMPTY_PAIR_FORM })
    setIsAddingPair(false)
    setNewPair({ ...EMPTY_PAIR_FORM })
  }

  const handleOpenAddCommonPeriod = () => {
    setIsAddingCommonPeriod(true)
    setNewCommonPeriod({ className: '', subject: '' })
    setSelectedCommonPeriodSections([])
    setIsCommonPeriodSectionsOpen(false)
  }

  const handleCancelAddCommonPeriod = () => {
    setIsAddingCommonPeriod(false)
    setNewCommonPeriod({ className: '', subject: '' })
    setSelectedCommonPeriodSections([])
    setIsCommonPeriodSectionsOpen(false)
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
      window.alert('Select at least one section to save the common period.')
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
    setIsCommonPeriodSectionsOpen(false)
  }

  // ── Stats ──
  const typeCounts: Record<string, number> = {}
  subjects.forEach((s) => { typeCounts[s.type] = (typeCounts[s.type] || 0) + 1 })

  return (
    <div className="ts-page">
      <style>{`
        /* ───────── Page ───────── */
        .ts-page {
          padding: 12px 32px 32px;
          max-width: 1600px;
          margin: 0 auto;
        }

        /* ───────── Card ───────── */
        .ts-card {
          background: #fff;
          border-radius: 12px;
          box-shadow: none;
          overflow: hidden;
          margin-bottom: 24px;
          border: 1px solid #e5e7eb;
        }
        .ts-card:hover {
          box-shadow: none;
          border-color: #d4d4d8;
        }
        .dark .ts-card {
          background: #1e293b;
          border-color: #334155;
        }

        /* ───────── Header ───────── */
        .ts-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          background: linear-gradient(180deg, #f8faff 0%, #ffffff 55%);
          border-bottom: 1px solid #e2e8f0;
          position: relative;
        }
        .ts-card-header::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: linear-gradient(180deg, #2563eb 0%, #6366f1 100%);
          border-radius: 0 2px 2px 0;
        }
        .dark .ts-card-header {
          background: linear-gradient(180deg, #1e293b 0%, #1a2332 100%);
          border-color: #334155;
        }
        .ts-card-header h3 {
          font-size: 0.95rem;
          font-weight: 650;
          color: #1e293b;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
          letter-spacing: -0.01em;
        }
        .dark .ts-card-header h3 {
          color: #f1f5f9;
        }
        .ts-header-icon {
          width: 26px;
          height: 26px;
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: linear-gradient(135deg, #2563eb 0%, #6366f1 100%);
        }
        .ts-header-icon svg {
          width: 14px;
          height: 14px;
          color: #fff;
        }

        /* ───────── Header stats ───────── */
        .ts-header-stats {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          justify-content: center;
          min-width: 0;
          overflow-x: auto;
          padding: 2px 8px;
        }
        .ts-stat-card-inline {
          min-width: 72px;
          flex: 0 0 auto;
          padding: 5px 8px;
          border-radius: 8px;
          gap: 6px;
          display: flex;
          align-items: center;
          border: 1px solid #e2e8f0;
        }
        .dark .ts-stat-card-inline {
          border-color: #334155;
        }
        .ts-stat-icon {
          width: 20px;
          height: 20px;
          border-radius: 5px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .ts-stat-icon svg { width: 11px; height: 11px; color: #fff; }
        .ts-stat-value {
          font-size: 0.9rem;
          line-height: 1.05;
          font-weight: 700;
          color: #1e293b;
          letter-spacing: -0.02em;
        }
        .dark .ts-stat-value { color: #f1f5f9; }
        .ts-stat-label {
          font-size: 0.55rem;
          letter-spacing: 0.06em;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
        }

        .ts-bg-indigo-soft { background: #eff6ff; border-color: #bfdbfe; }
        .ts-bg-green-soft { background: #ecfdf5; border-color: #a7f3d0; }
        .ts-bg-amber-soft { background: #fffbeb; border-color: #fde68a; }
        .ts-bg-indigo-grad { background: linear-gradient(135deg, #2563eb, #4f46e5); }
        .ts-bg-green-grad { background: linear-gradient(135deg, #059669, #047857); }
        .ts-bg-amber-grad { background: linear-gradient(135deg, #d97706, #b45309); }

        .dark .ts-bg-indigo-soft { background: #1e3a5f33; border-color: #1e40af; }
        .dark .ts-bg-green-soft { background: #064e3b33; border-color: #047857; }
        .dark .ts-bg-amber-soft { background: #78350f33; border-color: #b45309; }

        /* ───────── Buttons ───────── */
        .ts-btn-group {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .ts-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 14px;
          border-radius: 8px;
          font-size: 0.78rem;
          font-weight: 600;
          border: 1px solid transparent;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
          white-space: nowrap;
          box-shadow: none;
        }
        .ts-btn svg { width: 14px; height: 14px; }
        .ts-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .ts-btn-primary {
          background: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
          color: #fff;
        }
        .ts-btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #1d4ed8 0%, #4338ca 100%);
        }
        .ts-btn-success {
          background: #fff;
          color: #047857;
          border-color: #6ee7b7;
        }
        .ts-btn-success:hover:not(:disabled) {
          background: #ecfdf5;
          border-color: #34d399;
        }
        .ts-btn-danger {
          background: #fff;
          color: #b91c1c;
          border-color: #e5e7eb;
        }
        .ts-btn-danger:hover:not(:disabled) {
          background: #fafafa;
          border-color: #fca5a5;
        }

        /* ───────── Table ───────── */
        .ts-table-wrap { overflow-x: auto; }
        .ts-matrix-vert-scroll {
          --ts-matrix-row-height: 44px;
          /* Show ~10 subject rows, then allow vertical scrolling */
          max-height: calc(var(--ts-matrix-row-height) * 10 + 44px);
          overflow-y: auto;
        }
        .ts-table {
          width: 100%;
          border-collapse: collapse;
          border-spacing: 0;
        }
        .ts-subject-matrix-table {
          width: max-content;
          table-layout: auto;
        }
        .ts-table thead th {
          padding: 10px 14px;
          font-size: 0.68rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #52525b;
          background: #fafafa;
          border-bottom: 1px solid #e5e7eb;
          border-top: none;
          text-align: left;
          white-space: nowrap;
        }
        .ts-th-matrix {
          text-align: center !important;
          width: 1%;
          min-width: 0;
          padding: 8px 6px !important;
          font-size: 0.65rem;
          letter-spacing: 0.06em;
          color: #4338ca;
          background: #f5f7ff !important;
          border-bottom-color: #c7d2fe;
        }
        .dark .ts-th-matrix {
          color: #a5b4fc;
          background: #1e1b4b !important;
          border-bottom-color: #4338ca;
        }
        .dark .ts-table thead th {
          background: #0f172a;
          color: #a1a1aa;
          border-color: #334155;
        }
        .ts-table tbody tr { transition: background 0.12s ease; }
        .ts-table tbody tr:hover { background: #fafafa; }
        .dark .ts-table tbody tr:hover { background: #283548; }
        .ts-table tbody tr:nth-child(even) { background: #fff; }
        .dark .ts-table tbody tr:nth-child(even) { background: #1a2536; }
        .ts-table tbody tr:nth-child(even):hover { background: #fafafa; }
        .dark .ts-table tbody tr:nth-child(even):hover { background: #283548; }
        .ts-table tbody td {
          padding: 8px 14px;
          font-size: 0.84rem;
          color: #27272a;
          border-top: none;
          border-bottom: 1px solid #f4f4f5;
          white-space: nowrap;
        }
        .ts-td-matrix {
          text-align: center;
          width: 1%;
          min-width: 0;
          padding: 6px !important;
        }
        .ts-td-matrix .ts-checkbox {
          width: 15px;
          height: 15px;
        }
        .ts-matrix-note {
          font-size: 0.75rem;
          color: #94a3b8;
        }
        .dark .ts-matrix-note { color: #64748b; }
        .dark .ts-table tbody td {
          color: #e2e8f0;
          border-color: #1e293b;
        }
        .ts-table tbody tr:first-child td {
          border-top: none;
        }
        .ts-table thead th:first-child,
        .ts-table tbody td:first-child {
          width: 36px;
          padding-left: 10px;
          padding-right: 6px;
        }
        .ts-subject-matrix-table .ts-sticky-col {
          position: sticky;
          width: 1%;
          padding-left: 8px !important;
          padding-right: 8px !important;
        }
        .ts-subject-matrix-table thead .ts-sticky-col {
          z-index: 8;
          background: #fafafa;
        }
        .dark .ts-subject-matrix-table thead .ts-sticky-col {
          background: #0f172a;
        }
        /* Freeze header while scrolling vertically */
        .ts-subject-matrix-table thead th {
          position: sticky;
          top: 0;
          z-index: 20;
          background: #fafafa;
        }
        .dark .ts-subject-matrix-table thead th {
          background: #0f172a;
        }
        .ts-subject-matrix-table tbody .ts-sticky-col {
          z-index: 4;
          background: #fff;
        }
        .ts-subject-matrix-table tbody tr:nth-child(even) .ts-sticky-col {
          background: #fff;
        }
        .ts-subject-matrix-table tbody tr:hover .ts-sticky-col {
          background: #fafafa;
        }
        .dark .ts-subject-matrix-table tbody .ts-sticky-col {
          background: #1e293b;
        }
        .dark .ts-subject-matrix-table tbody tr:nth-child(even) .ts-sticky-col {
          background: #1a2536;
        }
        .dark .ts-subject-matrix-table tbody tr:hover .ts-sticky-col {
          background: #283548;
        }
        .ts-subject-matrix-table .ts-sticky-col-1 {
          left: 0;
          width: 36px;
          min-width: 36px;
          max-width: 36px;
          padding-left: 10px !important;
          padding-right: 6px !important;
          text-align: center;
        }
        .ts-subject-matrix-table .ts-sticky-col-2 {
          left: 36px;
          width: 42px;
          min-width: 42px;
          max-width: 42px;
          padding-left: 4px !important;
          padding-right: 4px !important;
          text-align: center;
        }
        .ts-subject-matrix-table .ts-sticky-col-3 {
          left: 78px;
          width: auto;
          min-width: 0;
          max-width: none;
        }
        .ts-subject-matrix-table .ts-sticky-col-4 {
          left: var(--ts-sticky-left-4, 170px);
          width: auto;
          min-width: 0;
          max-width: none;
        }
        .ts-subject-matrix-table .ts-sticky-col-5 {
          left: var(--ts-sticky-left-5, 250px);
          width: auto;
          min-width: 0;
          max-width: none;
          text-align: center;
        }
        .ts-subject-matrix-table .ts-sticky-col-5 .ts-action-group {
          justify-content: center;
        }
        .ts-subject-matrix-table .ts-sticky-divider {
          box-shadow: 1px 0 0 #e5e7eb;
        }
        .dark .ts-subject-matrix-table .ts-sticky-divider {
          box-shadow: 1px 0 0 #334155;
        }

        /* ───────── Serial number ───────── */
        .ts-sr {
          font-weight: 600;
          color: #a1a1aa;
          font-size: 0.78rem;
          display: inline-block;
        }

        /* ───────── Value styles ───────── */
        .ts-subject-name {
          font-weight: 600;
          color: #18181b;
          font-size: 0.84rem;
          letter-spacing: -0.01em;
        }
        .dark .ts-subject-name { color: #f1f5f9; }

        /* ───────── Type badge ───────── */
        .ts-type-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        /* ───────── Action links ───────── */
        .ts-action-link {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 6px;
          border: none;
          background: none;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .ts-action-edit { color: #2563eb; }
        .ts-action-edit:hover { background: #eff6ff; color: #1d4ed8; }
        .dark .ts-action-edit { color: #60a5fa; }
        .dark .ts-action-edit:hover { background: #1e3a5f33; }
        .ts-action-save { color: #059669; }
        .ts-action-save:hover { background: #ecfdf5; color: #047857; }
        .ts-action-cancel { color: #94a3b8; }
        .ts-action-cancel:hover { background: #f1f5f9; color: #64748b; }
        .ts-action-group { display: flex; gap: 8px; }
        .ts-edit-icon {
          width: 14px;
          height: 14px;
          display: inline;
          margin-right: 4px;
          vertical-align: -2px;
        }

        /* ───────── Checkbox ───────── */
        .ts-checkbox-label {
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .ts-checkbox {
          width: 15px;
          height: 15px;
          border-radius: 4px;
          accent-color: #4f46e5;
        }

        /* ───────── New row ───────── */
        .ts-new-row {
          background: #fafafa !important;
        }
        .dark .ts-new-row {
          background: #0f172a !important;
        }

        /* ───────── Input ───────── */
        .ts-input {
          width: 100%;
          padding: 6px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          font-size: 0.85rem;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          outline: none;
          background: #fff;
          color: #334155;
        }
        .dark .ts-input {
          background: #1e293b;
          border-color: #475569;
          color: #e2e8f0;
        }
        .ts-input:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.12);
        }

        /* ───────── Empty state ───────── */
        .ts-empty {
          padding: 48px 24px;
          text-align: center;
        }
        .ts-empty-icon {
          width: 64px;
          height: 64px;
          margin: 0 auto 16px;
          border-radius: 16px;
          background: #f4f4f5;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ts-empty-icon svg {
          width: 32px;
          height: 32px;
          color: #94a3b8;
        }
        .ts-empty h3 {
          font-size: 1.05rem;
          font-weight: 700;
          color: #334155;
          margin: 0 0 6px;
        }
        .dark .ts-empty h3 { color: #f1f5f9; }
        .ts-empty p {
          color: #94a3b8;
          font-size: 0.88rem;
          margin: 0 0 20px;
        }
      `}</style>

      <div className="mb-6" />

      <div className="ts-card">
        {/* ── Header ── */}
        <div className="ts-card-header">
          <div>
            <h3>
              <span className="ts-header-icon">
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              </span>
              Subjects
            </h3>
          </div>
          <div className="ts-header-stats">
            <div className="ts-stat-card-inline ts-bg-indigo-soft">
              <div className="ts-stat-icon ts-bg-indigo-grad">
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              </div>
              <div>
                <div className="ts-stat-value">{subjects.length}</div>
                <div className="ts-stat-label">Total</div>
              </div>
            </div>
            {Object.entries(typeCounts).map(([type, count]) => {
              const colors = TYPE_COLORS[type] || TYPE_COLORS.Other
              return (
                <div
                  key={type}
                  className="ts-stat-card-inline"
                  style={{ background: colors.chip, borderColor: colors.border }}
                >
                  <div className="ts-stat-icon" style={{ background: colors.icon }}>
                    <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                    </svg>
                  </div>
                  <div>
                    <div className="ts-stat-value">{count}</div>
                    <div className="ts-stat-label">{type}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="ts-btn-group">
            {selectedIds.size > 0 && (
              <button onClick={handleDeleteSelected} className="ts-btn ts-btn-danger">
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
                Delete {selectedIds.size}
              </button>
            )}
            <button
              onClick={() => setIsAddingNew(true)}
              disabled={isAddingNew}
              className="ts-btn ts-btn-primary"
            >
              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
              </svg>
              Add Subject
            </button>
            <button
              onClick={handleSaveSubjectMatrix}
              disabled={!hasPendingMatrixChanges}
              className="ts-btn ts-btn-success"
            >
              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Save Matrix{hasPendingMatrixChanges ? ' changes' : ''}
            </button>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="px-6 py-3 text-xs text-secondary-500 dark:text-secondary-400 border-b border-secondary-100 dark:border-secondary-800">
          Subject Selection Matrix: classes up to 10 are grouped class-wise, while classes 11 and 12 are shown class-section wise. Use Save Matrix to persist checkbox changes.
        </div>
        <div className="ts-table-wrap ts-matrix-vert-scroll">
          <table className="ts-table ts-subject-matrix-table" ref={matrixTableRef}>
            <thead>
              <tr>
                <th className="ts-sticky-col ts-sticky-col-1">
                  <label className="ts-checkbox-label">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someOnPageSelected && !allOnPageSelected
                      }}
                      onChange={selectAllOnPage}
                      className="ts-checkbox"
                      aria-label="Select all"
                    />
                  </label>
                </th>
                <th className="ts-sticky-col ts-sticky-col-2">Sr No</th>
                <th className="ts-sticky-col ts-sticky-col-3">Name</th>
                <th className="ts-sticky-col ts-sticky-col-4">Type</th>
                <th className="ts-sticky-col ts-sticky-col-5 ts-sticky-divider">Actions</th>
                {matrixColumns.map((column) => (
                  <th key={column.key} className="ts-th-matrix">{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Add new row */}
              {isAddingNew && (
                <tr className="ts-new-row">
                  <td className="ts-sticky-col ts-sticky-col-1" />
                  <td className="ts-sticky-col ts-sticky-col-2"><span className="ts-sr">-</span></td>
                  <td className="ts-sticky-col ts-sticky-col-3">
                    <input
                      type="text"
                      title="Subject name"
                      value={newItem.name}
                      onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                      placeholder="e.g. Mathematics"
                      className="ts-input"
                    />
                  </td>
                  <td className="ts-sticky-col ts-sticky-col-4">
                    <select
                      title="Subject type"
                      value={newItem.type}
                      onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                      className="ts-input"
                    >
                      <option value="">Select Type</option>
                      {SUBJECT_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td className="ts-sticky-col ts-sticky-col-5 ts-sticky-divider">
                    <div className="ts-action-group">
                      <button onClick={handleAdd} className="ts-action-link ts-action-save">Save</button>
                      <button onClick={handleCancelEdit} className="ts-action-link ts-action-cancel">Cancel</button>
                    </div>
                  </td>
                  {matrixColumns.length > 0 && (
                    <td colSpan={matrixColumns.length}>
                      <span className="ts-matrix-note">Save subject first, then assign to classes.</span>
                    </td>
                  )}
                </tr>
              )}

              {/* Rows */}
              {sortedSubjects.map((item, index) => {
                const isEditing = editingId === item.id
                const colors = TYPE_COLORS[item.type] || TYPE_COLORS.Other

                if (isEditing) {
                  return (
                    <tr key={item.id}>
                      <td className="ts-sticky-col ts-sticky-col-1">
                        <label className="ts-checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelection(item.id)}
                            className="ts-checkbox"
                            aria-label={`Select ${item.name}`}
                            title={`Select ${item.name}`}
                          />
                        </label>
                      </td>
                      <td className="ts-sticky-col ts-sticky-col-2"><span className="ts-sr">{index + 1}</span></td>
                      <td className="ts-sticky-col ts-sticky-col-3">
                        <input
                          type="text"
                          title="Edit subject name"
                          value={editingData.name}
                          onChange={(e) => setEditingData({ ...editingData, name: e.target.value })}
                          placeholder="Subject name"
                          className="ts-input"
                        />
                      </td>
                      <td className="ts-sticky-col ts-sticky-col-4">
                        <select
                          title="Edit subject type"
                          value={editingData.type}
                          onChange={(e) => setEditingData({ ...editingData, type: e.target.value })}
                          className="ts-input"
                        >
                          {SUBJECT_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </td>
                      <td className="ts-sticky-col ts-sticky-col-5 ts-sticky-divider">
                        <div className="ts-action-group">
                          <button onClick={() => handleSave(item.id)} className="ts-action-link ts-action-save">Save</button>
                          <button onClick={handleCancelEdit} className="ts-action-link ts-action-cancel">Cancel</button>
                        </div>
                      </td>
                      {matrixColumns.length > 0 && (
                        <td colSpan={matrixColumns.length}>
                          <span className="ts-matrix-note">Update name/type and save. Matrix checkboxes stay in normal view.</span>
                        </td>
                      )}
                    </tr>
                  )
                }

                return (
                  <tr key={item.id}>
                    <td className="ts-sticky-col ts-sticky-col-1">
                      <label className="ts-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelection(item.id)}
                          className="ts-checkbox"
                          aria-label={`Select ${item.name}`}
                        />
                      </label>
                    </td>
                    <td className="ts-sticky-col ts-sticky-col-2"><span className="ts-sr">{index + 1}</span></td>
                    <td className="ts-sticky-col ts-sticky-col-3"><span className="ts-subject-name">{item.name}</span></td>
                    <td className="ts-sticky-col ts-sticky-col-4">
                      <span
                        className="ts-type-badge"
                        style={{ background: colors.bg, color: colors.color, border: `1px solid ${colors.border}` }}
                      >
                        {item.type}
                      </span>
                    </td>
                    <td className="ts-sticky-col ts-sticky-col-5 ts-sticky-divider">
                      <button onClick={() => handleEdit(item)} className="ts-action-link ts-action-edit">
                        <svg className="ts-edit-icon" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                        Edit
                      </button>
                    </td>
                    {matrixColumns.map((column) => (
                      <td key={`${item.id}-${column.key}`} className="ts-td-matrix">
                        <input
                          type="checkbox"
                          className="ts-checkbox"
                          checked={isSubjectAssignedToColumn(item.name, column)}
                          onChange={(e) => toggleSubjectAssignment(item.name, column, e.target.checked)}
                          aria-label={`Assign ${item.name} to ${column.label}`}
                        />
                      </td>
                    ))}
                  </tr>
                )
              })}

              {/* Empty state */}
              {subjects.length === 0 && !isAddingNew && (
                <tr>
                  <td colSpan={5 + matrixColumns.length}>
                    <div className="ts-empty">
                      <div className="ts-empty-icon">
                        <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                        </svg>
                      </div>
                      <h3>No Subjects Added</h3>
                      <p>Add subjects to define what is taught in your school for timetable generation.</p>
                      <button onClick={() => setIsAddingNew(true)} className="ts-btn ts-btn-primary">
                        <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                        </svg>
                        Add Subject
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showParallelSubjectPairs && (
        <div className="ts-card">
        <div className="ts-card-header">
          <div>
            <h3>
              <span className="ts-header-icon">
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h7.5M3.75 5.25A2.25 2.25 0 016 3h12a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0118 21H6a2.25 2.25 0 01-2.25-2.25V5.25z" />
                </svg>
              </span>
              Parallel Subject Pairs
            </h3>
          </div>
          <div className="ts-header-stats">
            <div className="ts-stat-card-inline ts-bg-indigo-soft">
              <div className="ts-stat-icon ts-bg-indigo-grad">
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h7.5M3.75 5.25A2.25 2.25 0 016 3h12a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0118 21H6a2.25 2.25 0 01-2.25-2.25V5.25z" />
                </svg>
              </div>
              <div>
                <div className="ts-stat-value">{parallelSubjectPairs.length}</div>
                <div className="ts-stat-label">Pairs</div>
              </div>
            </div>
          </div>
          <div className="ts-btn-group">
            <button
              onClick={() => setIsAddingPair(true)}
              disabled={isAddingPair || classOptions.length === 0}
              className="ts-btn ts-btn-primary"
              title={classOptions.length === 0 ? 'Add classes and subjects first' : 'Add parallel pair'}
            >
              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
              </svg>
              Add Pair
            </button>
          </div>
        </div>

        <div className="px-6 py-3 text-xs text-secondary-500 dark:text-secondary-400 border-b border-secondary-100 dark:border-secondary-800">
          Parallel subjects share the same timetable slot. In Period Distribution, paired subjects are counted as one shared period, not two.
        </div>

        <div className="ts-table-wrap">
          <table className="ts-table">
            <thead>
              <tr>
                <th>Sr No</th>
                <th>Class</th>
                <th>Subject A</th>
                <th>Subject B</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isAddingPair && (
                <tr className="ts-new-row">
                  <td><span className="ts-sr">-</span></td>
                  <td>
                    <select
                      title="Class"
                      value={newPair.className}
                      onChange={(e) =>
                        setNewPair({ className: e.target.value, subjectA: '', subjectB: '' })
                      }
                      className="ts-input"
                    >
                      <option value="">Select class</option>
                      {classOptions.map((className) => (
                        <option key={className} value={className}>{className}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      title="Subject A"
                      value={newPair.subjectA}
                      onChange={(e) => setNewPair((prev) => ({ ...prev, subjectA: e.target.value }))}
                      className="ts-input"
                      disabled={!newPair.className}
                    >
                      <option value="">Select subject</option>
                      {(classSubjectsMap.get(newPair.className) || []).map((subject) => (
                        <option key={subject} value={subject}>{subject}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      title="Subject B"
                      value={newPair.subjectB}
                      onChange={(e) => setNewPair((prev) => ({ ...prev, subjectB: e.target.value }))}
                      className="ts-input"
                      disabled={!newPair.className}
                    >
                      <option value="">Select subject</option>
                      {(classSubjectsMap.get(newPair.className) || []).map((subject) => (
                        <option key={subject} value={subject}>{subject}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="ts-action-group">
                      <button onClick={handleAddPair} className="ts-action-link ts-action-save">Save</button>
                      <button onClick={handleCancelPairEdit} className="ts-action-link ts-action-cancel">Cancel</button>
                    </div>
                  </td>
                </tr>
              )}

              {parallelSubjectPairs.map((pair, index) => {
                const isEditingPair = editingPairId === pair.id
                if (isEditingPair) {
                  return (
                    <tr key={pair.id}>
                      <td><span className="ts-sr">{index + 1}</span></td>
                      <td>
                        <select
                          title="Class"
                          value={editingPairData.className}
                          onChange={(e) =>
                            setEditingPairData({ className: e.target.value, subjectA: '', subjectB: '' })
                          }
                          className="ts-input"
                        >
                          <option value="">Select class</option>
                          {classOptions.map((className) => (
                            <option key={className} value={className}>{className}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          title="Subject A"
                          value={editingPairData.subjectA}
                          onChange={(e) => setEditingPairData((prev) => ({ ...prev, subjectA: e.target.value }))}
                          className="ts-input"
                          disabled={!editingPairData.className}
                        >
                          <option value="">Select subject</option>
                          {(classSubjectsMap.get(editingPairData.className) || []).map((subject) => (
                            <option key={subject} value={subject}>{subject}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          title="Subject B"
                          value={editingPairData.subjectB}
                          onChange={(e) => setEditingPairData((prev) => ({ ...prev, subjectB: e.target.value }))}
                          className="ts-input"
                          disabled={!editingPairData.className}
                        >
                          <option value="">Select subject</option>
                          {(classSubjectsMap.get(editingPairData.className) || []).map((subject) => (
                            <option key={subject} value={subject}>{subject}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="ts-action-group">
                          <button onClick={() => handleSavePair(pair.id)} className="ts-action-link ts-action-save">Save</button>
                          <button onClick={handleCancelPairEdit} className="ts-action-link ts-action-cancel">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={pair.id}>
                    <td><span className="ts-sr">{index + 1}</span></td>
                    <td><span className="ts-subject-name">{pair.className}</span></td>
                    <td>{pair.subjectA}</td>
                    <td>{pair.subjectB}</td>
                    <td>
                      <div className="ts-action-group">
                        <button onClick={() => handleEditPair(pair.id)} className="ts-action-link ts-action-edit">Edit</button>
                        <button
                          onClick={() => handleDeletePair(pair.id)}
                          className="ts-action-link"
                          style={{ color: '#ef4444' }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {parallelSubjectPairs.length === 0 && !isAddingPair && (
                <tr>
                  <td colSpan={5}>
                    <div className="ts-empty">
                      <div className="ts-empty-icon">
                        <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h7.5M3.75 5.25A2.25 2.25 0 016 3h12a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0118 21H6a2.25 2.25 0 01-2.25-2.25V5.25z" />
                        </svg>
                      </div>
                      <h3>No Parallel Pairs Added</h3>
                      <p>Define subject pairs (like French + Sanskrit) that run in the same period.</p>
                      <button
                        onClick={() => setIsAddingPair(true)}
                        className="ts-btn ts-btn-primary"
                        disabled={classOptions.length === 0}
                      >
                        <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                        </svg>
                        Add Parallel Pair
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {showCommonPeriod && (
      <div className="ts-card">
        <div className="ts-card-header">
          <div>
            <h3>
              <span className="ts-header-icon">
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h10M7 16h10" />
                </svg>
              </span>
              Common Period
            </h3>
          </div>
          <div className="ts-header-stats">
            <div className="ts-stat-card-inline ts-bg-indigo-soft">
              <div className="ts-stat-icon ts-bg-indigo-grad">
                <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 12h8M8 17h8" />
                </svg>
              </div>
              <div>
                <div className="ts-stat-value">{commonPeriods.length}</div>
                <div className="ts-stat-label">Matches</div>
              </div>
            </div>
          </div>
          <div className="ts-btn-group">
            <button
              type="button"
              onClick={handleOpenAddCommonPeriod}
              className="ts-btn ts-btn-primary"
            >
              <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
              </svg>
              Add Common Period
            </button>
          </div>
        </div>

        <div className="px-6 py-3 text-xs text-secondary-500 dark:text-secondary-400 border-b border-secondary-100 dark:border-secondary-800">
          Create common periods by selecting a <b>Subject</b> and <b>Class</b>. Common Period matches are derived from the current timetable grid.
        </div>

        {isAddingCommonPeriod && (
          <div className="px-6 py-4 border-b border-secondary-100 dark:border-secondary-800">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[240px] flex-1">
                <label className="block text-xs font-medium text-secondary-500 mb-1">Subject</label>
                <select
                  className="ts-input w-full"
                  value={newCommonPeriod.subject}
                  title="Subject"
                  onChange={(e) => {
                    const subject = e.target.value
                    setNewCommonPeriod((prev) => ({ ...prev, subject }))
                  }}
                >
                  <option value="">Select subject</option>
                  {sortedSubjects.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-[240px] flex-1">
                <label className="block text-xs font-medium text-secondary-500 mb-1">Class</label>
                <select
                  className="ts-input w-full"
                  value={newCommonPeriod.className}
                  title="Class"
                  onChange={(e) => setNewCommonPeriod((prev) => ({ ...prev, className: e.target.value }))}
                  disabled={!newCommonPeriod.subject}
                >
                  <option value="">Select class</option>
                  {(newCommonPeriod.subject ? availableClassNamesForSubjectFromMatrix : classNameOptions).map((cn) => (
                    <option key={cn} value={cn}>
                      {cn}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-[240px] flex-1">
                <label className="block text-xs font-medium text-secondary-500 mb-1">Sections</label>
                <div className="relative">
                  <button
                    type="button"
                    className="ts-input w-full text-left flex items-center justify-between gap-2"
                    onClick={() => setIsCommonPeriodSectionsOpen((v) => !v)}
                    disabled={!newCommonPeriod.subject || !newCommonPeriod.className || matrixAssignedSectionsForSelection.length === 0}
                    title="Sections"
                  >
                    <span className="truncate">
                      {selectedCommonPeriodSections.length > 0
                        ? selectedCommonPeriodSections.join(', ')
                        : (newCommonPeriod.subject && newCommonPeriod.className ? 'Select sections' : 'Select subject and class')}
                    </span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden="true"
                      style={{ opacity: 0.7 }}
                    >
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                  </button>

                  {isCommonPeriodSectionsOpen && (
                    <div className="absolute z-20 mt-2 w-full rounded-xl border border-secondary-200 bg-white shadow-lg p-2 max-h-[220px] overflow-auto">
                      {matrixAssignedSectionsForSelection.map((section) => {
                        const checked = selectedCommonPeriodSections.includes(section)
                        return (
                          <label key={section} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary-50 cursor-pointer">
                            <input
                              type="checkbox"
                              className="ts-checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const nextChecked = e.target.checked
                                setSelectedCommonPeriodSections((prev) => {
                                  if (nextChecked) {
                                    return Array.from(new Set([...prev, section]))
                                  }
                                  return prev.filter((s) => s !== section)
                                })
                              }}
                              aria-label={`Select section ${section}`}
                            />
                            <span className="text-sm text-secondary-900">{section}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveCommonPeriod}
                  className="ts-btn ts-btn-primary"
                  disabled={!newCommonPeriod.subject || !newCommonPeriod.className || selectedCommonPeriodSections.length === 0}
                >
                  <svg fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                  </svg>
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleCancelAddCommonPeriod}
                  className="ts-action-link ts-action-cancel"
                >
                  Cancel
                </button>
              </div>
            </div>

            <div className="mt-3 text-xs text-secondary-500">
              {candidateCommonMatches.length === 0
                ? 'No common period matches for the selected subject/class yet.'
                : `Found ${candidateCommonMatches.length} timetable match(es) for this subject/class.`}
              {matrixAssignedSectionsForSelection.length > 0 && ` Sections (from matrix): ${matrixAssignedSectionsForSelection.join(', ')}`}
            </div>
          </div>
        )}

        <div className="ts-table-wrap">
          <table className="ts-table">
            <thead>
              <tr>
                <th>Sr No</th>
                <th>Subject</th>
                <th>Class</th>
                <th>Sections</th>
              </tr>
            </thead>
            <tbody>
              {commonPeriods.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="ts-empty">
                      <div className="ts-empty-icon">
                        <svg fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5M8.25 12h7.5m-7.5 5.25h7.5M3.75 5.25A2.25 2.25 0 016 3h12a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0118 21H6a2.25 2.25 0 01-2.25-2.25V5.25z" />
                        </svg>
                      </div>
                      <h3>No Common Periods</h3>
                      <p>
                        Click <b>Add Common Period</b> and choose a Subject+Class to create common periods from the timetable grid.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                commonPeriods.map((row, index) => (
                  <tr key={row.id}>
                    <td><span className="ts-sr">{index + 1}</span></td>
                    <td>{row.subject}</td>
                    <td><span className="ts-subject-name">{row.className}</span></td>
                    <td>{row.sections.join(', ')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  )
}

export default TimetableSubjects
