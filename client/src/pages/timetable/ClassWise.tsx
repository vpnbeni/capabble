import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useTimetable, WEEKDAYS, EMPTY_CELL, type TimetableCell } from '@/contexts/TimetableContext'
import bellTimingsService, { type BellTimingRowPayload } from '@/services/bellTimingsService'
import timetableService, { type TimetableVersionSummary, type TimetableGridState } from '@/services/timetableService'
import toast from 'react-hot-toast'
import { CalendarDays, Eraser, FileSpreadsheet, FileText, Plus, Trash2, Wand2 } from 'lucide-react'
import {
  Badge,
  Banner,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  FilterBar,
  Icon,
  Page,
  Select,
  Switch,
  cx,
} from '@/components/ui'
import '@/components/timetable/classwise.css'

/* ══════════════════════════════ Helpers ══════════════════════════════ */

/**
 * Stable identity tint per subject — the same subject always gets the same tint for the
 * session. Tints map to the --chart-1..6 tokens (see classwise.css .tcw-tint--c1..6).
 */
const SUBJECT_TINTS: Record<string, number> = {}
const TINT_COUNT = 6

let _colorIdx = 0
const getSubjectTint = (subject: string) => {
  if (!SUBJECT_TINTS[subject]) {
    SUBJECT_TINTS[subject] = (_colorIdx % TINT_COUNT) + 1
    _colorIdx++
  }
  return `tcw-tint--c${SUBJECT_TINTS[subject]}`
}

/** Short day names for compact display */
const SHORT_DAYS: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed',
  Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat',
}

const normalizeTeacherName = (value: string) => value.trim().toLowerCase()
const normalizeSubjectName = (value: string) => value.trim().toLowerCase()

const createWeekdaySelection = (checked: boolean) =>
  WEEKDAYS.reduce<Record<string, boolean>>((acc, day) => {
    acc[day] = checked
    return acc
  }, {})

const FALLBACK_START_MINUTES = 8 * 60

const parseTimeToMinutes = (value: string): number => {
  const [hoursRaw, minutesRaw] = String(value || '').split(':')
  const hours = Number.parseInt(hoursRaw, 10)
  const minutes = Number.parseInt(minutesRaw, 10)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return FALLBACK_START_MINUTES
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return FALLBACK_START_MINUTES
  return hours * 60 + minutes
}

const formatMinutesTo12Hour = (value: number): string => {
  const normalized = ((value % 1440) + 1440) % 1440
  const hours24 = Math.floor(normalized / 60)
  const minutes = String(normalized % 60).padStart(2, '0')
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24
  return `${String(hours12).padStart(2, '0')}:${minutes} ${suffix}`
}

const buildPeriodTimeRanges = (startTime: string, rows: BellTimingRowPayload[]): string[] => {
  let cursor = parseTimeToMinutes(startTime)
  const periodRanges: string[] = []

  rows.forEach((row) => {
    const duration = Number.isFinite(row.duration) && row.duration > 0
      ? row.duration
      : row.type === 'break'
        ? 15
        : 40
    const from = cursor
    const to = cursor + duration

    if (row.type === 'period') {
      periodRanges.push(`${formatMinutesTo12Hour(from)} - ${formatMinutesTo12Hour(to)}`)
    }

    cursor = to
  })

  return periodRanges
}

/* ══════════════════════════════ Component ══════════════════════════════ */

const ClassWise: React.FC = () => {
  const {
    classes,
    teachers,
    teacherSubjectAllocations,
    periodAllocation,
    periodsPerDay,
    timetableGrid,
    setGridCell,
    clearGridForClass,
  } = useTimetable()

  // Selected class
  const [selectedClassId, setSelectedClassId] = useState<string>('')

  // Cell editor state
  const [editingCell, setEditingCell] = useState<{ day: string; slot: number } | null>(null)
  const [cellDraft, setCellDraft] = useState<TimetableCell>({ ...EMPTY_CELL })
  const [editingPeriodSlot, setEditingPeriodSlot] = useState<number | null>(null)
  const [mode, setMode] = useState<'manual' | 'auto'>('manual')
  const [periodDraft, setPeriodDraft] = useState<{
    primarySubject: string
    primaryDays: Record<string, boolean>
    useSecondary: boolean
    secondarySubject: string
  }>({
    primarySubject: '',
    primaryDays: createWeekdaySelection(true),
    useSecondary: false,
    secondarySubject: '',
  })
  const dropdownRef = useRef<HTMLDivElement>(null)
  const periodEditorRef = useRef<HTMLDivElement>(null)
  const [periodTimeRanges, setPeriodTimeRanges] = useState<string[]>([])

  // ── Version state ──
  const [versions, setVersions] = useState<TimetableVersionSummary[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string>('')
  const [versionGrid, setVersionGrid] = useState<TimetableGridState | null>(null)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [exportingPDF, setExportingPDF] = useState(false)
  const [clearAllOpen, setClearAllOpen] = useState(false)

  useEffect(() => {
    timetableService.getVersions().then(setVersions).catch(() => setVersions([]))
  }, [])

  useEffect(() => {
    if (!selectedVersionId) {
      setVersionGrid(null)
      return
    }
    timetableService.getVersion(selectedVersionId)
      .then((v) => setVersionGrid(v.grid ?? null))
      .catch(() => { setVersionGrid(null); toast.error('Failed to load version data.') })
  }, [selectedVersionId])

  const handleExportExcel = async () => {
    if (!selectedVersionId) { toast.error('Select a version to export.'); return }
    setExportingExcel(true)
    try { await timetableService.exportExcel(selectedVersionId) }
    catch { toast.error('Excel export failed.') }
    finally { setExportingExcel(false) }
  }

  const handleExportPDF = async () => {
    if (!selectedVersionId) { toast.error('Select a version to export.'); return }
    if (!selectedClassId) { toast.error('Select a class to export.'); return }
    setExportingPDF(true)
    try { await timetableService.exportClassPDF(selectedVersionId, selectedClassId) }
    catch { toast.error('PDF export failed.') }
    finally { setExportingPDF(false) }
  }

  // Auto-select first class if none selected
  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId]
  )

  const selectedClassPeriodAllocation = useMemo<Record<string, number>>(() => {
    if (!selectedClass) return {}

    const direct = periodAllocation[selectedClass.id]
    if (direct && Object.keys(direct).length > 0) {
      return direct
    }

    const classNameKey = selectedClass.className.trim().toLowerCase()
    const sectionKey = selectedClass.section.trim().toLowerCase()

    const exactFallback = classes.find((item) => {
      if (item.id === selectedClass.id) return false
      const allocation = periodAllocation[item.id]
      if (!allocation || Object.keys(allocation).length === 0) return false
      return (
        item.className.trim().toLowerCase() === classNameKey &&
        item.section.trim().toLowerCase() === sectionKey
      )
    })
    if (exactFallback) {
      return periodAllocation[exactFallback.id] || {}
    }

    const classWideFallback = classes.find((item) => {
      const allocation = periodAllocation[item.id]
      if (!allocation || Object.keys(allocation).length === 0) return false
      return item.className.trim().toLowerCase() === classNameKey
    })

    return classWideFallback ? periodAllocation[classWideFallback.id] || {} : {}
  }, [selectedClass, periodAllocation, classes])

  const unassignedSubjectsForAutoMode = useMemo(() => {
    if (!selectedClass) return []

    const classSubjects = Array.from(
      new Set(
        (selectedClass.subjects || [])
          .map((subject) => subject.trim())
          .filter(Boolean)
      )
    )
    if (classSubjects.length === 0) return []

    const selectedClassNameKey = selectedClass.className.trim().toLowerCase()
    const selectedSectionKey = selectedClass.section.trim().toLowerCase()
    const mappedSubjects = new Set<string>()

    teacherSubjectAllocations.forEach((allocation) => {
      const assignment = allocation.assignments.find((entry) => {
        const classIdMatch = entry.classId === selectedClass.id
        const classNameMatch = entry.className.trim().toLowerCase() === selectedClassNameKey
        const sectionMatch = entry.section.trim().toLowerCase() === selectedSectionKey
        return classIdMatch || (classNameMatch && sectionMatch)
      })
      if (!assignment) return

      assignment.subjects.forEach((subject) => {
        const trimmed = subject.trim()
        if (!trimmed) return
        mappedSubjects.add(normalizeSubjectName(trimmed))
      })
    })

    return classSubjects.filter((subject) => !mappedSubjects.has(normalizeSubjectName(subject)))
  }, [selectedClass, teacherSubjectAllocations])

  const handleModeToggle = useCallback(() => {
    if (mode === 'auto') {
      setMode('manual')
      return
    }

    if (unassignedSubjectsForAutoMode.length > 0) {
      const preview = unassignedSubjectsForAutoMode.slice(0, 5)
      const remainingCount = Math.max(unassignedSubjectsForAutoMode.length - preview.length, 0)
      const extraSuffix = remainingCount > 0 ? ` +${remainingCount} more` : ''
      const label = unassignedSubjectsForAutoMode.length === 1 ? 'subject' : 'subjects'

      toast.error(
        `Assign this remaining ${label} to any teacher under Departments: ${preview.join(', ')}${extraSuffix}`
      )
      return
    }

    setMode('auto')
  }, [mode, unassignedSubjectsForAutoMode])

  // If the selected class is deleted or no selection, pick first
  useMemo(() => {
    if (!selectedClass && classes.length > 0) {
      setSelectedClassId(classes[0].id)
    }
  }, [selectedClass, classes])

  useEffect(() => {
    setEditingCell(null)
    setCellDraft({ ...EMPTY_CELL })
    setEditingPeriodSlot(null)
  }, [selectedClassId])

  // Period slots array [0, 1, 2, ... periodsPerDay-1]
  const periodSlots = useMemo(
    () => Array.from({ length: periodsPerDay }, (_, i) => i),
    [periodsPerDay]
  )

  const periodHeaderTimes = useMemo(
    () => periodSlots.map((slot) => periodTimeRanges[slot] || '-'),
    [periodSlots, periodTimeRanges]
  )

  useEffect(() => {
    let isMounted = true

    const loadBellTimings = async () => {
      try {
        const saved = await bellTimingsService.getBellTimings()
        if (!isMounted) return
        setPeriodTimeRanges(buildPeriodTimeRanges(saved.startTime, saved.rows))
      } catch {
        if (!isMounted) return
        setPeriodTimeRanges([])
      }
    }

    void loadBellTimings()

    return () => {
      isMounted = false
    }
  }, [])

  // Get a cell from the grid — reads version grid when a version is selected
  const getCell = useCallback(
    (classId: string, day: string, slot: number): TimetableCell => {
      if (versionGrid) {
        const cell = (versionGrid[classId]?.[day] as Record<string | number, TimetableCell> | undefined)?.[slot]
        return cell ?? EMPTY_CELL
      }
      return timetableGrid[classId]?.[day]?.[slot] ?? EMPTY_CELL
    },
    [timetableGrid, versionGrid]
  )

  // Stats for selected class
  const stats = useMemo(() => {
    if (!selectedClass) return { filled: 0, total: 0, bySubject: {} as Record<string, number> }
    const total = periodsPerDay * WEEKDAYS.length
    let filled = 0
    const bySubject: Record<string, number> = {}
    for (const day of WEEKDAYS) {
      for (let slot = 0; slot < periodsPerDay; slot++) {
        const cell = getCell(selectedClass.id, day, slot)
        if (cell.subject) {
          filled++
          bySubject[cell.subject] = (bySubject[cell.subject] || 0) + 1
        }
      }
    }
    return { filled, total, bySubject }
  }, [selectedClass, periodsPerDay, getCell])

  // Open cell editor
  const openEditor = useCallback((day: string, slot: number) => {
    if (!selectedClass) return
    setEditingPeriodSlot(null)
    const existing = getCell(selectedClass.id, day, slot)
    setCellDraft({ subject: existing.subject, teacher: existing.teacher })
    setEditingCell({ day, slot })
  }, [selectedClass, getCell])

  // Save cell
  const saveCell = useCallback(() => {
    if (!selectedClass || !editingCell) return
    const normalizedTeacher = normalizeTeacherName(cellDraft.teacher)
    let conflict: string | null = null
    if (normalizedTeacher) {
      for (const cls of classes) {
        if (cls.id === selectedClass.id) continue
        const existingCell = getCell(cls.id, editingCell.day, editingCell.slot)
        if (normalizeTeacherName(existingCell.teacher) === normalizedTeacher) {
          conflict = `${cls.className}-${cls.section}`
          break
        }
      }
    }
    if (conflict) {
      window.alert(`Teacher "${cellDraft.teacher}" is already assigned in ${conflict} for this day and period.`)
      return
    }
    setGridCell(selectedClass.id, editingCell.day, editingCell.slot, { ...cellDraft })
    setEditingCell(null)
    setCellDraft({ ...EMPTY_CELL })
  }, [selectedClass, editingCell, cellDraft, setGridCell, classes, getCell])

  // Clear a single cell
  const clearCell = useCallback(() => {
    if (!selectedClass || !editingCell) return
    setGridCell(selectedClass.id, editingCell.day, editingCell.slot, { ...EMPTY_CELL })
    setEditingCell(null)
    setCellDraft({ ...EMPTY_CELL })
  }, [selectedClass, editingCell, setGridCell])

  // Close editor
  const closeEditor = useCallback(() => {
    setEditingCell(null)
    setCellDraft({ ...EMPTY_CELL })
  }, [])

  const closePeriodEditor = useCallback(() => {
    setEditingPeriodSlot(null)
    setPeriodDraft({
      primarySubject: '',
      primaryDays: createWeekdaySelection(true),
      useSecondary: false,
      secondarySubject: '',
    })
  }, [])

  // Click outside to close open popovers
  useEffect(() => {
    if (!editingCell && editingPeriodSlot === null) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      // The cell editor is a kit Dialog: its own backdrop and close button handle dismissal,
      // so clicks anywhere inside the dialog (title, footer buttons) must not close it here.
      const insideDialog = target instanceof Element && Boolean(target.closest('.cb-dialog'))
      if (editingCell && !insideDialog && dropdownRef.current && !dropdownRef.current.contains(target)) {
        closeEditor()
      }
      if (editingPeriodSlot !== null && periodEditorRef.current && !periodEditorRef.current.contains(target)) {
        closePeriodEditor()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editingCell, editingPeriodSlot, closeEditor, closePeriodEditor])

  const selectedClassTeacherPool = useMemo(() => {
    if (!selectedClass) return []

    const byId = new Map<string, (typeof teachers)[number]>()
    const byName = new Map<string, (typeof teachers)[number]>()
    teachers.forEach((teacher) => {
      byId.set(teacher.id, teacher)
      byName.set(teacher.name.trim().toLowerCase(), teacher)
    })

    const mappedTeachers = new Map<string, { id: string; name: string; shortName: string; subjects: string[] }>()

    const selectedClassNameKey = selectedClass.className.trim().toLowerCase()
    const selectedSectionKey = selectedClass.section.trim().toLowerCase()

    teacherSubjectAllocations.forEach((allocation) => {
      const assignment = allocation.assignments.find((entry) => {
        const classIdMatch = entry.classId === selectedClass.id
        const classNameMatch = entry.className.trim().toLowerCase() === selectedClassNameKey
        const sectionMatch = entry.section.trim().toLowerCase() === selectedSectionKey
        return classIdMatch || (classNameMatch && sectionMatch)
      })
      if (!assignment) return

      const teacherId = String(allocation.teacherId || '').trim()
      const teacherName = String(allocation.teacherName || '').trim()
      if (!teacherId && !teacherName) return

      const teacherFromId = teacherId ? byId.get(teacherId) : undefined
      const teacherFromName = byName.get(teacherName.toLowerCase())
      const normalizedName = teacherName || teacherFromId?.name || teacherFromName?.name || ''
      if (!normalizedName) return

      const key = teacherId || normalizedName.toLowerCase()
      const existing = mappedTeachers.get(key)
      if (existing) {
        const merged = new Set([...existing.subjects, ...assignment.subjects])
        existing.subjects = Array.from(merged)
        return
      }

      mappedTeachers.set(key, {
        id: teacherId || key,
        name: normalizedName,
        shortName: teacherFromId?.shortName || teacherFromName?.shortName || '',
        subjects: [...assignment.subjects],
      })
    })

    if (mappedTeachers.size > 0) {
      return Array.from(mappedTeachers.values())
    }

    // Fallback for legacy data where subject allocation is not configured yet.
    return teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.name,
      shortName: teacher.shortName,
      subjects: [...teacher.subjects],
    }))
  }, [selectedClass, teachers, teacherSubjectAllocations])

  // Teachers filtered by subject for dropdown
  const getTeachersForSubject = useCallback(
    (subject: string) => {
      if (!subject) return selectedClassTeacherPool
      const key = subject.trim().toLowerCase()
      return selectedClassTeacherPool.filter((t) =>
        t.subjects.length === 0 ||
        t.subjects.some((assigned) => assigned.trim().toLowerCase() === key)
      )
    },
    [selectedClassTeacherPool]
  )

  // Check teacher conflict: is teacher already assigned elsewhere at this day+slot?
  const hasTeacherConflict = useCallback(
    (teacherName: string, day: string, slot: number, excludeClassId: string): string | null => {
      const normalizedTeacher = normalizeTeacherName(teacherName)
      if (!normalizedTeacher) return null
      for (const cls of classes) {
        if (cls.id === excludeClassId) continue
        const cell = getCell(cls.id, day, slot)
        if (normalizeTeacherName(cell.teacher) === normalizedTeacher) {
          return `${cls.className}-${cls.section}`
        }
      }
      return null
    },
    [classes, getCell]
  )

  // Check if there is at least one available teacher for a subject at a given slot.
  const canAssignSubjectToSlot = useCallback(
    (subject: string, day: string, slot: number, classId: string): boolean => {
      const candidates = getTeachersForSubject(subject)
      if (candidates.length === 0) return false
      return candidates.some(
        (teacher) => !hasTeacherConflict(teacher.name, day, slot, classId)
      )
    },
    [getTeachersForSubject, hasTeacherConflict]
  )

  const getAutoTeacherForSubject = useCallback(
    (subject: string, day: string, slot: number, classId: string) => {
      const normalizedSubject = subject.trim().toLowerCase()
      if (!normalizedSubject) return ''

      const exactSubjectTeachers = selectedClassTeacherPool.filter((teacher) =>
        teacher.subjects.some((assigned) => assigned.trim().toLowerCase() === normalizedSubject)
      )
      const genericTeachers = selectedClassTeacherPool.filter((teacher) => teacher.subjects.length === 0)
      const pool = [...exactSubjectTeachers, ...genericTeachers]
      if (pool.length === 0) return ''

      const available = pool.find((teacher) => !hasTeacherConflict(teacher.name, day, slot, classId))
      return available?.name || ''
    },
    [selectedClassTeacherPool, hasTeacherConflict]
  )

  const autoFillClassTimetable = useCallback(() => {
    if (!selectedClass) return

    const allocation = selectedClassPeriodAllocation
    const remainingBySubject: Record<string, number> = {}

    Object.entries(allocation).forEach(([subjectName, countValue]) => {
      const trimmed = subjectName.trim()
      const parsed = Number.parseInt(String(countValue), 10)
      if (!trimmed || !Number.isFinite(parsed) || parsed <= 0) return
      remainingBySubject[trimmed] = parsed
    })

    const subjectOrder = Object.keys(remainingBySubject)
    if (subjectOrder.length === 0) {
      toast.error('No period distribution found for this class-section. Set periods in Period Distribution first.')
      return
    }
    const totalRequired = subjectOrder.reduce((sum, subj) => sum + remainingBySubject[subj], 0)
    const totalSlots = periodsPerDay * WEEKDAYS.length
    if (totalRequired > totalSlots) {
      toast.error('Allocated periods exceed available slots for this class. Some periods will be skipped.')
    }

    // For each period slot, assign subjects across weekdays.
    const usedSubjectsByDay: Record<string, Set<string>> = {}
    WEEKDAYS.forEach((day) => {
      usedSubjectsByDay[day] = new Set<string>()
    })

    let pointer = 0

    for (let slot = 0; slot < periodsPerDay; slot++) {
      WEEKDAYS.forEach((day) => {
        const usedForDay = usedSubjectsByDay[day]
        const previousSubject =
          slot > 0 ? getCell(selectedClass.id, day, slot - 1).subject.trim() : ''
        let chosenSubject: string | null = null

        // First pass: prefer subjects not yet used on this day and not same as previous period.
        let attempts = 0
        while (attempts < subjectOrder.length) {
          const idx = (pointer + attempts) % subjectOrder.length
          const candidate = subjectOrder[idx]
          const remaining = remainingBySubject[candidate] || 0
          if (
            remaining > 0 &&
            !usedForDay.has(candidate) &&
            candidate.trim() !== previousSubject
          ) {
            chosenSubject = candidate
            pointer = idx + 1
            break
          }
          attempts++
        }

        // Second pass: allow repeats on the same day / consecutive if needed.
        if (!chosenSubject) {
          attempts = 0
          while (attempts < subjectOrder.length) {
            const idx = (pointer + attempts) % subjectOrder.length
            const candidate = subjectOrder[idx]
            const remaining = remainingBySubject[candidate] || 0
            if (remaining > 0) {
              chosenSubject = candidate
              pointer = idx + 1
              break
            }
            attempts++
          }
        }

        if (!chosenSubject) {
          // No subject left to assign for this cell.
          setGridCell(selectedClass.id, day, slot, { ...EMPTY_CELL })
          return
        }

        const teacher = getAutoTeacherForSubject(chosenSubject, day, slot, selectedClass.id)
        // Always assign the subject; teacher is optional (can be filled later).
        setGridCell(selectedClass.id, day, slot, { subject: chosenSubject, teacher: teacher || '' })
        remainingBySubject[chosenSubject] = (remainingBySubject[chosenSubject] || 0) - 1
        usedForDay.add(chosenSubject)
      })
    }
  }, [selectedClass, selectedClassPeriodAllocation, periodsPerDay, setGridCell, getCell, getAutoTeacherForSubject])

  const openPeriodEditor = useCallback((slot: number) => {
    if (!selectedClass) return
    if (editingPeriodSlot === slot) {
      closePeriodEditor()
      return
    }

    setEditingCell(null)
    setCellDraft({ ...EMPTY_CELL })

    const firstFilledDay = WEEKDAYS.find((day) => getCell(selectedClass.id, day, slot).subject)
    const detectedPrimarySubject = firstFilledDay ? getCell(selectedClass.id, firstFilledDay, slot).subject : ''
    const hasExistingAssignments = WEEKDAYS.some((day) => Boolean(getCell(selectedClass.id, day, slot).subject))
    const primaryDays = createWeekdaySelection(!hasExistingAssignments)

    if (detectedPrimarySubject) {
      WEEKDAYS.forEach((day) => {
        const cellSubject = getCell(selectedClass.id, day, slot).subject
        primaryDays[day] = cellSubject === detectedPrimarySubject
      })
    }

    const secondaryDay = WEEKDAYS.find((day) => {
      const cellSubject = getCell(selectedClass.id, day, slot).subject
      return Boolean(cellSubject) && cellSubject !== detectedPrimarySubject && !primaryDays[day]
    })
    const detectedSecondarySubject = secondaryDay ? getCell(selectedClass.id, secondaryDay, slot).subject : ''

    setPeriodDraft({
      primarySubject: detectedPrimarySubject,
      primaryDays,
      useSecondary: Boolean(detectedSecondarySubject),
      secondarySubject: detectedSecondarySubject,
    })
    setEditingPeriodSlot(slot)
  }, [selectedClass, getCell, editingPeriodSlot, closePeriodEditor])

  const togglePeriodDay = useCallback((day: string) => {
    setPeriodDraft((prev) => ({
      ...prev,
      primaryDays: {
        ...prev.primaryDays,
        [day]: !prev.primaryDays[day],
      },
    }))
  }, [])

  const savePeriodAssignment = useCallback(() => {
    if (!selectedClass || editingPeriodSlot === null) return

    const selectedDays = WEEKDAYS.filter((day) => Boolean(periodDraft.primaryDays[day]))
    if (selectedDays.length > 0 && !periodDraft.primarySubject) {
      window.alert('Select the first subject for checked weekdays.')
      return
    }
    if (periodDraft.useSecondary && !periodDraft.secondarySubject) {
      window.alert('Select the second subject for remaining weekdays.')
      return
    }

    selectedDays.forEach((day) => {
      const subject = periodDraft.primarySubject
      const teacher = getAutoTeacherForSubject(subject, day, editingPeriodSlot, selectedClass.id)
      setGridCell(selectedClass.id, day, editingPeriodSlot, { subject, teacher })
    })

    if (periodDraft.useSecondary && periodDraft.secondarySubject) {
      WEEKDAYS.filter((day) => !periodDraft.primaryDays[day]).forEach((day) => {
        const subject = periodDraft.secondarySubject
        const teacher = getAutoTeacherForSubject(subject, day, editingPeriodSlot, selectedClass.id)
        setGridCell(selectedClass.id, day, editingPeriodSlot, { subject, teacher })
      })
    }

    closePeriodEditor()
  }, [selectedClass, editingPeriodSlot, periodDraft, setGridCell, getAutoTeacherForSubject, closePeriodEditor])

  const clearPeriodAssignment = useCallback(() => {
    if (!selectedClass || editingPeriodSlot === null) return

    WEEKDAYS.forEach((day) => {
      setGridCell(selectedClass.id, day, editingPeriodSlot, { ...EMPTY_CELL })
    })

    closePeriodEditor()
  }, [selectedClass, editingPeriodSlot, setGridCell, closePeriodEditor])

  const goToClasses = useCallback(() => {
    window.location.hash = '/time-table/classes'
  }, [])

  const confirmClearAll = useCallback(() => {
    if (selectedClass) clearGridForClass(selectedClass.id)
    setClearAllOpen(false)
  }, [selectedClass, clearGridForClass])

  const classOptions = useMemo(
    () => classes.map((cls) => ({ value: cls.id, label: `${cls.className}-${cls.section}` })),
    [classes]
  )

  const versionOptions = useMemo(
    () => versions.map((v) => ({ value: v._id, label: `${v.name} · ${v.status}` })),
    [versions]
  )

  const selectedVersionName = useMemo(
    () => versions.find((v) => v._id === selectedVersionId)?.name ?? '',
    [versions, selectedVersionId]
  )

  // Cell editor derived values (computed before render so no hooks follow a conditional).
  const editorExistingCell = selectedClass && editingCell
    ? getCell(selectedClass.id, editingCell.day, editingCell.slot)
    : EMPTY_CELL
  const editorTeacherConflict = selectedClass && editingCell && cellDraft.teacher
    ? hasTeacherConflict(cellDraft.teacher, editingCell.day, editingCell.slot, selectedClass.id)
    : null

  const allFilled = stats.filled === stats.total && stats.total > 0
  const freeCount = stats.total - stats.filled
  const hasSubjects = Boolean(selectedClass && selectedClass.subjects.length > 0)

  return (
    <Page width="full">
      <Card flush className="tcw-card">
        <div className="tcw-toolbar">
          <FilterBar
            filters={
              <>
                {classes.length > 0 ? (
                  <Select
                    aria-label="Class"
                    size="sm"
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    options={classOptions}
                  />
                ) : null}
                <Select
                  aria-label="Timetable version"
                  title="Select a generated timetable version to view"
                  size="sm"
                  value={selectedVersionId}
                  onChange={(e) => setSelectedVersionId(e.target.value)}
                  placeholder="Manual (current grid)"
                  options={versionOptions}
                />
              </>
            }
            actions={
              <>
                <Button
                  size="sm"
                  icon={FileText}
                  onClick={handleExportPDF}
                  loading={exportingPDF}
                  disabled={!selectedVersionId}
                  title={selectedVersionId ? undefined : 'Select a version to export'}
                >
                  {exportingPDF ? 'Exporting…' : 'Export PDF'}
                </Button>
                <Button
                  size="sm"
                  icon={FileSpreadsheet}
                  onClick={handleExportExcel}
                  loading={exportingExcel}
                  disabled={!selectedVersionId}
                  title={selectedVersionId ? undefined : 'Select a version to export'}
                >
                  {exportingExcel ? 'Exporting…' : 'Export Excel'}
                </Button>
              </>
            }
          />
          {selectedVersionId && versionGrid ? (
            <Banner tone="info" title={`Viewing ${selectedVersionName || 'a generated version'}`}>
              This is a generated timetable, so editing is off. Choose “Manual (current grid)” to edit cells.
            </Banner>
          ) : null}
        </div>

        {classes.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="There are no classes to schedule yet"
            body="Add classes on the Classes page, then come back here to build each class timetable."
            action={
              <Button variant="primary" icon={Plus} onClick={goToClasses}>
                Add classes
              </Button>
            }
          />
        ) : null}

        {classes.length > 0 && selectedClass ? (
          <>
            <div className="tcw-head">
              <div className="tcw-head__titles">
                <h2 className="tcw-head__title">
                  {selectedClass.className} · Section {selectedClass.section}
                </h2>
                <div className="tcw-head__summary">
                  <Badge tone="accent">
                    {stats.filled} of {stats.total} periods filled
                  </Badge>
                  {allFilled ? (
                    <Badge tone="success">All periods filled</Badge>
                  ) : (
                    <Badge tone="warning">{freeCount} free</Badge>
                  )}
                  {selectedClass.incharge ? (
                    <Badge dot={false}>Incharge: {selectedClass.incharge}</Badge>
                  ) : null}
                </div>
                <p className="tcw-head__hint">
                  {versionGrid
                    ? 'Showing a generated timetable. Choose “Manual (current grid)” to edit cells.'
                    : 'Select a period heading to assign subjects across weekdays, or turn on auto mode to fill the grid from the period distribution.'}
                </p>
              </div>
              <div className="tcw-head__actions">
                <Switch label="Auto mode" checked={mode === 'auto'} onChange={() => handleModeToggle()} />
                {mode === 'auto' ? (
                  <Button
                    size="sm"
                    icon={Wand2}
                    onClick={autoFillClassTimetable}
                    disabled={selectedClass.subjects.length === 0}
                  >
                    Auto fill
                  </Button>
                ) : null}
                <Button size="sm" icon={Trash2} onClick={() => setClearAllOpen(true)} disabled={stats.filled === 0}>
                  Clear all
                </Button>
              </div>
            </div>

            {!hasSubjects || selectedClassTeacherPool.length === 0 ? (
              <div className="tcw-notices">
                {!hasSubjects ? (
                  <Banner tone="warning" title="This class has no subjects">
                    Assign subjects on the <a href="#/time-table/classes">Classes</a> page before building its timetable.
                  </Banner>
                ) : null}
                {hasSubjects && selectedClassTeacherPool.length === 0 ? (
                  <Banner tone="info" title="No teachers are mapped to this class-section">
                    Assign teachers in Subject Allocation so each period can offer its teachers.
                  </Banner>
                ) : null}
              </div>
            ) : null}

            {hasSubjects ? (
              <>
                {editingPeriodSlot !== null ? (
                  <div
                    className="tcw-period"
                    ref={periodEditorRef}
                    role="region"
                    aria-label={`Period ${editingPeriodSlot + 1} bulk assignment`}
                  >
                    <div className="tcw-period__head">
                      <p className="tcw-period__title">Assign period {editingPeriodSlot + 1} across the week</p>
                      {periodHeaderTimes[editingPeriodSlot] && periodHeaderTimes[editingPeriodSlot] !== '-' ? (
                        <p className="tcw-period__time">{periodHeaderTimes[editingPeriodSlot]}</p>
                      ) : null}
                    </div>
                    <div className="tcw-period__grid">
                      <div className="tcw-period__col">
                        <Select
                          label="First subject"
                          hint="Goes on the ticked weekdays."
                          placeholder="Select subject"
                          value={periodDraft.primarySubject}
                          onChange={(e) => setPeriodDraft((prev) => ({ ...prev, primarySubject: e.target.value }))}
                          options={selectedClass.subjects}
                        />
                        <Checkbox
                          label="Assign a second subject to the remaining weekdays"
                          checked={periodDraft.useSecondary}
                          onChange={(checked) => setPeriodDraft((prev) => ({ ...prev, useSecondary: checked }))}
                        />
                        {periodDraft.useSecondary ? (
                          <Select
                            label="Second subject"
                            placeholder="Select second subject"
                            value={periodDraft.secondarySubject}
                            onChange={(e) => setPeriodDraft((prev) => ({ ...prev, secondarySubject: e.target.value }))}
                            options={selectedClass.subjects}
                          />
                        ) : null}
                      </div>
                      <fieldset className="tcw-period__days">
                        <legend className="cb-field__label">Weekdays for the first subject</legend>
                        <div className="tcw-weekdays">
                          {WEEKDAYS.map((day) => (
                            <Checkbox
                              key={day}
                              label={SHORT_DAYS[day]}
                              checked={Boolean(periodDraft.primaryDays[day])}
                              onChange={() => togglePeriodDay(day)}
                            />
                          ))}
                        </div>
                      </fieldset>
                    </div>
                    <p className="tcw-period__hint">
                      Teachers fill in from the teacher-subject mapping for each assigned day.
                    </p>
                    <div className="tcw-period__actions">
                      <Button size="sm" variant="tertiary" icon={Eraser} onClick={clearPeriodAssignment}>
                        Clear period
                      </Button>
                      <span className="tcw-period__spacer" />
                      <Button size="sm" onClick={closePeriodEditor}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="primary" onClick={savePeriodAssignment}>
                        Save period
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="tcw-grid-scroll">
                  <table
                    className="tcw-grid"
                    style={{ '--tcw-periods': periodSlots.length } as React.CSSProperties}
                  >
                    <caption className="cb-visually-hidden">
                      Timetable for {selectedClass.className}-{selectedClass.section}
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col" className="tcw-grid__day">Day</th>
                        {periodSlots.map((slot) => {
                          const time = periodHeaderTimes[slot]
                          const active = editingPeriodSlot === slot
                          return (
                            <th key={slot} scope="col">
                              <button
                                type="button"
                                className={cx('tcw-period-btn', active && 'is-active')}
                                aria-expanded={active}
                                onClick={() => openPeriodEditor(slot)}
                              >
                                <span className="tcw-period-btn__name">Period {slot + 1}</span>
                                <span className="tcw-period-btn__time">{time && time !== '-' ? time : '—'}</span>
                              </button>
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {WEEKDAYS.map((day) => (
                        <tr key={day}>
                          <th scope="row" className="tcw-grid__day" title={day}>
                            {SHORT_DAYS[day]}
                          </th>
                          {periodSlots.map((slot) => {
                            const cell = getCell(selectedClass.id, day, slot)
                            const isEditing = editingCell?.day === day && editingCell?.slot === slot
                            return (
                              <td key={slot} className="tcw-grid__cell">
                                <button
                                  type="button"
                                  className={cx(
                                    'tcw-cell',
                                    cell.subject ? cx('tcw-cell--filled', getSubjectTint(cell.subject)) : 'tcw-cell--empty',
                                    isEditing && 'is-editing'
                                  )}
                                  onClick={() => openEditor(day, slot)}
                                  aria-label={
                                    cell.subject
                                      ? `${day}, period ${slot + 1}: ${cell.subject}${cell.teacher ? `, ${cell.teacher}` : ''}. Edit`
                                      : `${day}, period ${slot + 1}: free. Assign a subject`
                                  }
                                >
                                  {cell.subject ? (
                                    <>
                                      <span className="tcw-cell__subject">{cell.subject}</span>
                                      {cell.teacher ? <span className="tcw-cell__teacher">{cell.teacher}</span> : null}
                                    </>
                                  ) : (
                                    <Icon icon={Plus} size={16} />
                                  )}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {hasSubjects && stats.filled > 0 ? (
              <div className="tcw-legend" role="list" aria-label="Periods per subject">
                <span className="tcw-legend__title">Periods per subject</span>
                {selectedClass.subjects.map((subj) => {
                  const count = stats.bySubject[subj] || 0
                  return (
                    <span key={subj} role="listitem" className={cx('tcw-legend__item', getSubjectTint(subj))}>
                      <span className="tcw-legend__swatch" aria-hidden="true" />
                      {subj}
                      {count > 0 ? <span className="tcw-legend__count">{count}</span> : null}
                    </span>
                  )
                })}
              </div>
            ) : null}
          </>
        ) : null}
      </Card>

      {/* Cell editor */}
      <Dialog
        open={Boolean(selectedClass && editingCell)}
        onClose={closeEditor}
        size="sm"
        title={editingCell ? `${editingCell.day} · Period ${editingCell.slot + 1}` : 'Edit period'}
        description={
          editingCell && periodHeaderTimes[editingCell.slot] && periodHeaderTimes[editingCell.slot] !== '-'
            ? periodHeaderTimes[editingCell.slot]
            : undefined
        }
        footer={
          <>
            {editorExistingCell.subject ? (
              <Button variant="tertiary" icon={Eraser} onClick={clearCell}>
                Clear period
              </Button>
            ) : null}
            <Button onClick={closeEditor}>Cancel</Button>
            <Button variant="primary" onClick={saveCell}>
              Save
            </Button>
          </>
        }
      >
        {selectedClass && editingCell ? (
          <div className="tcw-editor" ref={dropdownRef}>
            <Select
              label="Subject"
              placeholder="None"
              value={cellDraft.subject}
              onChange={(e) => {
                const nextSubject = e.target.value
                const { day, slot } = editingCell
                if (
                  nextSubject &&
                  !canAssignSubjectToSlot(nextSubject, day, slot, selectedClass.id)
                ) {
                  window.alert(
                    `All teachers for ${nextSubject} are already busy in another section for this period.`
                  )
                  return
                }
                setCellDraft((p) => ({
                  ...p,
                  subject: nextSubject,
                  teacher: nextSubject
                    ? getAutoTeacherForSubject(nextSubject, day, slot, selectedClass.id)
                    : '',
                }))
              }}
              options={selectedClass.subjects.map((subj) => {
                const disabled =
                  !!subj &&
                  subj !== cellDraft.subject &&
                  !canAssignSubjectToSlot(subj, editingCell.day, editingCell.slot, selectedClass.id)
                return { value: subj, label: `${subj}${disabled ? ' (no free teacher)' : ''}`, disabled }
              })}
            />
            <Select
              label="Teacher"
              placeholder="None"
              value={cellDraft.teacher}
              onChange={(e) => setCellDraft((p) => ({ ...p, teacher: e.target.value }))}
              disabled={!cellDraft.subject}
              hint={cellDraft.subject ? undefined : 'Choose a subject first.'}
              error={
                editorTeacherConflict
                  ? `Conflict: ${cellDraft.teacher} is in ${editorTeacherConflict} for this period.`
                  : undefined
              }
              options={getTeachersForSubject(cellDraft.subject).map((t) => {
                const conflict = hasTeacherConflict(t.name, editingCell.day, editingCell.slot, selectedClass.id)
                return {
                  value: t.name,
                  label: `${t.name}${t.shortName ? ` (${t.shortName})` : ''}${conflict ? ` (busy: ${conflict})` : ''}`,
                  disabled: !!conflict,
                }
              })}
            />
          </div>
        ) : null}
      </Dialog>

      {/* Clear-all confirmation */}
      <Dialog
        open={clearAllOpen && Boolean(selectedClass)}
        onClose={() => setClearAllOpen(false)}
        tone="danger"
        size="sm"
        title={selectedClass ? `Clear the timetable for ${selectedClass.className}-${selectedClass.section}?` : 'Clear the timetable?'}
        description={`This removes all ${stats.filled} filled ${stats.filled === 1 ? 'period' : 'periods'} for this class.`}
        footer={
          <>
            <Button onClick={() => setClearAllOpen(false)}>Cancel</Button>
            <Button variant="danger" icon={Trash2} onClick={confirmClearAll}>
              Clear all periods
            </Button>
          </>
        }
      />
    </Page>
  )
}

export default ClassWise
