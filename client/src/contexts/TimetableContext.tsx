import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type ReactNode,
} from 'react'
import toast from 'react-hot-toast'
import timetableService, { type TimetableStatePayload } from '@/services/timetableService'

export interface TimetableClass {
  id: string
  className: string
  section: string
  floor: string
  subjects: string[]
  incharge: string
  classGroup: string
  displayOrder: number
}

export interface TimetableSubject {
  id: string
  name: string
  type: string
  requiresConsecutivePeriods: boolean
  consecutivePeriodCount: number
  color: string
}

export interface TimetableTeacher {
  id: string
  name: string
  shortName: string
  subjects: string[]
}

export interface TeacherSubjectClassAssignment {
  classId: string
  className: string
  section: string
  subjects: string[]
}

export interface TeacherSubjectAllocation {
  teacherId: string
  teacherName: string
  assignments: TeacherSubjectClassAssignment[]
}

export interface ParallelSubjectPair {
  id: string
  className: string
  subjectA: string
  subjectB: string
}

export interface CommonPeriod {
  id: string
  className: string
  subject: string
  sections: string[]
}

export interface TimetableMatrixClass {
  id: string
  name: string
}

export interface TimetableMatrixSection {
  id: string
  name: string
}

export type TimetableMatrixSelection = Record<string, Record<string, boolean>>

export type PeriodAllocationMap = Record<string, Record<string, number>>

export interface TimetableCell {
  subject: string
  teacher: string
}

export const EMPTY_CELL: TimetableCell = { subject: '', teacher: '' }

export type TimetableGrid = Record<string, Record<string, Record<number, TimetableCell>>>

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export type Weekday = typeof WEEKDAYS[number]

const DEFAULT_STATE: TimetableStatePayload = {
  classes: [],
  subjects: [],
  teachers: [],
  teacherSubjectAllocations: [],
  parallelSubjectPairs: [],
  commonPeriods: [],
  periodsPerWeek: 42,
  periodAllocation: {},
  timetableGrid: {},
  matrixClasses: [],
  matrixSections: [],
  matrixSelection: {},
}

interface TimetableContextType {
  isHydrated: boolean
  rehydrate: () => Promise<void>
  classes: TimetableClass[]
  addClass: (item: Omit<TimetableClass, 'id'>) => void
  updateClass: (id: string, data: Partial<TimetableClass>) => void
  deleteClasses: (ids: string[]) => void
  clearClasses: () => void

  subjects: TimetableSubject[]
  addSubject: (item: Omit<TimetableSubject, 'id'>) => void
  updateSubject: (id: string, data: Partial<TimetableSubject>) => void
  deleteSubjects: (ids: string[]) => void
  applyClassSubjectAssignments: (subjectsByClassId: Record<string, string[]>) => void

  teachers: TimetableTeacher[]
  setTeachers: (teachers: TimetableTeacher[]) => void
  addTeacher: (item: Omit<TimetableTeacher, 'id'>) => void
  updateTeacher: (id: string, data: Partial<TimetableTeacher>) => void
  deleteTeachers: (ids: string[]) => void

  teacherSubjectAllocations: TeacherSubjectAllocation[]
  setTeacherSubjectAllocations: (allocations: TeacherSubjectAllocation[]) => void

  parallelSubjectPairs: ParallelSubjectPair[]
  setParallelSubjectPairs: (pairs: ParallelSubjectPair[]) => void

  commonPeriods: CommonPeriod[]
  setCommonPeriods: (next: CommonPeriod[] | ((prev: CommonPeriod[]) => CommonPeriod[])) => void

  periodsPerWeek: number
  setPeriodsPerWeek: (n: number) => void
  periodsPerDay: number
  periodAllocation: PeriodAllocationMap
  setPeriodCount: (classId: string, subject: string, count: number) => void
  clearPeriodAllocation: () => void

  timetableGrid: TimetableGrid
  setGridCell: (classId: string, day: string, slot: number, cell: TimetableCell) => void
  clearGridForClass: (classId: string) => void
  clearAllGrid: () => void

  matrixClasses: TimetableMatrixClass[]
  matrixSections: TimetableMatrixSection[]
  matrixSelection: TimetableMatrixSelection
  setMatrixState: (state: {
    matrixClasses: TimetableMatrixClass[]
    matrixSections: TimetableMatrixSection[]
    matrixSelection: TimetableMatrixSelection
  }) => void
}

const TimetableContext = createContext<TimetableContextType>({
  isHydrated: false,
  rehydrate: async () => {},
  classes: [],
  addClass: () => {},
  updateClass: () => {},
  deleteClasses: () => {},
  clearClasses: () => {},
  subjects: [],
  addSubject: () => {},
  updateSubject: () => {},
  deleteSubjects: () => {},
  applyClassSubjectAssignments: () => {},
  teachers: [],
  setTeachers: () => {},
  addTeacher: () => {},
  updateTeacher: () => {},
  deleteTeachers: () => {},
  teacherSubjectAllocations: [],
  setTeacherSubjectAllocations: () => {},
  parallelSubjectPairs: [],
  setParallelSubjectPairs: () => {},
  commonPeriods: [],
  setCommonPeriods: () => {},
  periodsPerWeek: 42,
  setPeriodsPerWeek: () => {},
  periodsPerDay: 7,
  periodAllocation: {},
  setPeriodCount: () => {},
  clearPeriodAllocation: () => {},
  timetableGrid: {},
  setGridCell: () => {},
  clearGridForClass: () => {},
  clearAllGrid: () => {},
  matrixClasses: [],
  matrixSections: [],
  matrixSelection: {},
  setMatrixState: () => {},
})

let _seq = 0
const genId = (prefix: string) => `${prefix}-${++_seq}-${Date.now()}`

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

const getClassKey = (value: string) => value.trim().toLowerCase()

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

const shouldSyncSubjectsAcrossSections = (className: string) => {
  const level = parseClassLevel(className)
  return level !== 11 && level !== 12
}

const normalizeSubjectNames = (subjects: string[]) => {
  const seen = new Set<string>()
  const normalized: string[] = []

  subjects.forEach((subject) => {
    const trimmed = subject.trim()
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    normalized.push(trimmed)
  })

  return normalized
}

const normalizeState = (state: Partial<TimetableStatePayload> | null | undefined): TimetableStatePayload => {
  return {
    classes: Array.isArray(state?.classes) ? state!.classes : [],
    subjects: Array.isArray(state?.subjects) ? state!.subjects : [],
    teachers: Array.isArray(state?.teachers) ? state!.teachers : [],
    teacherSubjectAllocations: Array.isArray(state?.teacherSubjectAllocations) ? state!.teacherSubjectAllocations : [],
    parallelSubjectPairs: Array.isArray(state?.parallelSubjectPairs) ? state!.parallelSubjectPairs : [],
    commonPeriods: Array.isArray(state?.commonPeriods) ? (state!.commonPeriods as CommonPeriod[]) : [],
    periodsPerWeek:
      typeof state?.periodsPerWeek === 'number' && state.periodsPerWeek > 0
        ? state.periodsPerWeek
        : DEFAULT_STATE.periodsPerWeek,
    periodAllocation: state?.periodAllocation ?? {},
    timetableGrid: state?.timetableGrid ?? {},
    matrixClasses: Array.isArray(state?.matrixClasses) ? state!.matrixClasses : [],
    matrixSections: Array.isArray(state?.matrixSections) ? state!.matrixSections : [],
    matrixSelection: state?.matrixSelection ?? {},
  }
}

export const TimetableProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [classes, setClasses] = useState<TimetableClass[]>(DEFAULT_STATE.classes)
  const [subjects, setSubjects] = useState<TimetableSubject[]>(DEFAULT_STATE.subjects)
  const [teachers, setTeachersState] = useState<TimetableTeacher[]>(DEFAULT_STATE.teachers)
  const [teacherSubjectAllocations, setTeacherSubjectAllocationsState] = useState<TeacherSubjectAllocation[]>(DEFAULT_STATE.teacherSubjectAllocations)
  const [parallelSubjectPairs, setParallelSubjectPairsState] = useState<ParallelSubjectPair[]>(DEFAULT_STATE.parallelSubjectPairs)
  const [commonPeriods, setCommonPeriodsState] = useState<CommonPeriod[]>(DEFAULT_STATE.commonPeriods as CommonPeriod[])
  const [periodsPerWeek, setPeriodsPerWeek] = useState(DEFAULT_STATE.periodsPerWeek)
  const [periodAllocation, setPeriodAllocation] = useState<PeriodAllocationMap>(DEFAULT_STATE.periodAllocation)
  const [timetableGrid, setTimetableGrid] = useState<TimetableGrid>(DEFAULT_STATE.timetableGrid)
  const [matrixClasses, setMatrixClasses] = useState<TimetableMatrixClass[]>(DEFAULT_STATE.matrixClasses)
  const [matrixSections, setMatrixSections] = useState<TimetableMatrixSection[]>(DEFAULT_STATE.matrixSections)
  const [matrixSelection, setMatrixSelection] = useState<TimetableMatrixSelection>(DEFAULT_STATE.matrixSelection)
  const [isHydrated, setIsHydrated] = useState(false)

  const saveTimerRef = useRef<number | null>(null)
  const isHydratedRef = useRef(false)
  const latestSnapshotRef = useRef<TimetableStatePayload>(DEFAULT_STATE)
  const hasLocalEditsBeforeHydrationRef = useRef(false)
  const lastSyncedStateRef = useRef<string>(JSON.stringify(DEFAULT_STATE))
  // The version of the state this tab last read or saved; a save names it so it can't undo a newer change.
  const stateVersionRef = useRef<string | null>(null)

  const periodsPerDay = useMemo(() => Math.floor(periodsPerWeek / WEEKDAYS.length), [periodsPerWeek])

  useEffect(() => {
    let isMounted = true

    const hydrate = async () => {
      try {
        const remote = await timetableService.getStateVersioned()
        const remoteState = normalizeState(remote.state)
        if (!isMounted) return
        stateVersionRef.current = remote.updatedAt

        if (hasLocalEditsBeforeHydrationRef.current) {
          return
        }

        setClasses(remoteState.classes)
        setSubjects(remoteState.subjects)
        setTeachersState(remoteState.teachers)
        setTeacherSubjectAllocationsState(remoteState.teacherSubjectAllocations)
        setParallelSubjectPairsState(remoteState.parallelSubjectPairs)
        setCommonPeriodsState((remoteState.commonPeriods as CommonPeriod[]) ?? [])
        setPeriodsPerWeek(remoteState.periodsPerWeek)
        setPeriodAllocation(remoteState.periodAllocation)
        setTimetableGrid(remoteState.timetableGrid)
        setMatrixClasses(remoteState.matrixClasses)
        setMatrixSections(remoteState.matrixSections)
        setMatrixSelection(remoteState.matrixSelection)
        lastSyncedStateRef.current = JSON.stringify(remoteState)
      } catch {
        // Keep in-memory defaults when API load fails.
        lastSyncedStateRef.current = JSON.stringify(DEFAULT_STATE)
      } finally {
        if (isMounted) {
          setIsHydrated(true)
          isHydratedRef.current = true
        }
      }
    }

    hydrate()

    return () => {
      isMounted = false
    }
  }, [])

  const rehydrate = useCallback(async () => {
    try {
      const remote = await timetableService.getStateVersioned()
      const remoteState = normalizeState(remote.state)
      stateVersionRef.current = remote.updatedAt
      setClasses(remoteState.classes)
      setSubjects(remoteState.subjects)
      setTeachersState(remoteState.teachers)
      setTeacherSubjectAllocationsState(remoteState.teacherSubjectAllocations)
      setParallelSubjectPairsState(remoteState.parallelSubjectPairs)
      setCommonPeriodsState((remoteState.commonPeriods as CommonPeriod[]) ?? [])
      setPeriodsPerWeek(remoteState.periodsPerWeek)
      setPeriodAllocation(remoteState.periodAllocation)
      setTimetableGrid(remoteState.timetableGrid)
      setMatrixClasses(remoteState.matrixClasses)
      setMatrixSections(remoteState.matrixSections)
      setMatrixSelection(remoteState.matrixSelection)
      lastSyncedStateRef.current = JSON.stringify(remoteState)
    } catch {
      // silently keep current state if fetch fails
    }
  }, [])

  const rehydrateRef = useRef(rehydrate)
  useEffect(() => {
    rehydrateRef.current = rehydrate
  }, [rehydrate])

  const stateSnapshot = useMemo<TimetableStatePayload>(
    () => ({
      classes,
      subjects,
      teachers,
      teacherSubjectAllocations,
      parallelSubjectPairs,
      commonPeriods,
      periodsPerWeek,
      periodAllocation,
      timetableGrid,
      matrixClasses,
      matrixSections,
      matrixSelection,
    }),
    [
      classes,
      subjects,
      teachers,
      teacherSubjectAllocations,
      parallelSubjectPairs,
      commonPeriods,
      periodsPerWeek,
      periodAllocation,
      timetableGrid,
      matrixClasses,
      matrixSections,
      matrixSelection,
    ]
  )

  useEffect(() => {
    latestSnapshotRef.current = stateSnapshot
  }, [stateSnapshot])

  const persistLatestState = useCallback(async () => {
    if (!isHydratedRef.current) return

    const snapshot = latestSnapshotRef.current
    const serialized = JSON.stringify(snapshot)
    if (serialized === lastSyncedStateRef.current) return

    try {
      const saved = await timetableService.saveStateVersioned(snapshot, stateVersionRef.current)
      stateVersionRef.current = saved.updatedAt
      lastSyncedStateRef.current = serialized
    } catch (error: any) {
      // Someone saved since this tab read it (another tab, the app): show theirs instead of overwriting.
      if (error?.conflict) {
        toast.error(error.message, { id: 'timetable-state-changed' })
        await rehydrateRef.current()
      }
      // Other errors: the API interceptor already shows them.
    }
  }, [])

  useEffect(() => {
    if (!isHydrated) return

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void persistLatestState()
    }, 150)
  }, [stateSnapshot, isHydrated, persistLatestState])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }

      void persistLatestState()
    }
  }, [persistLatestState])

  const addClass = useCallback((item: Omit<TimetableClass, 'id'>) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setClasses((prev) => {
      const classKey = getClassKey(item.className)
      const incomingSubjects = normalizeSubjectNames(item.subjects)
      const sameClassRows = prev.filter((row) => getClassKey(row.className) === classKey)
      const shouldSync = shouldSyncSubjectsAcrossSections(item.className)

      let subjectsForClass = incomingSubjects
      if (shouldSync && subjectsForClass.length === 0) {
        const existingWithSubjects = sameClassRows.find((row) => row.subjects.length > 0)
        subjectsForClass = existingWithSubjects ? normalizeSubjectNames(existingWithSubjects.subjects) : []
      }

      const nextRow: TimetableClass = {
        ...item,
        id: genId('tc'),
        subjects: shouldSync ? subjectsForClass : incomingSubjects,
      }

      if (!shouldSync || subjectsForClass.length === 0) {
        return [...prev, nextRow]
      }

      const syncedExistingRows = prev.map((row) =>
        getClassKey(row.className) === classKey
          ? { ...row, subjects: [...subjectsForClass] }
          : row
      )

      return [...syncedExistingRows, nextRow]
    })
  }, [])

  const updateClass = useCallback((id: string, data: Partial<TimetableClass>) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setClasses((prev) => {
      const target = prev.find((row) => row.id === id)
      if (!target) return prev

      const mergedTarget: TimetableClass = { ...target, ...data }
      const nextTargetSubjects = Array.isArray(data.subjects)
        ? normalizeSubjectNames(data.subjects)
        : target.subjects

      const shouldSync = Array.isArray(data.subjects) && shouldSyncSubjectsAcrossSections(mergedTarget.className)
      const targetClassKey = getClassKey(mergedTarget.className)

      return prev.map((row) => {
        if (row.id === id) {
          return {
            ...row,
            ...data,
            subjects: Array.isArray(data.subjects) ? nextTargetSubjects : row.subjects,
          }
        }

        if (shouldSync && getClassKey(row.className) === targetClassKey) {
          return {
            ...row,
            subjects: [...nextTargetSubjects],
          }
        }

        return row
      })
    })
  }, [])

  const deleteClasses = useCallback((ids: string[]) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    const idSet = new Set(ids)
    setClasses((prev) => prev.filter((c) => !idSet.has(c.id)))
    setPeriodAllocation((prev) => {
      const next = { ...prev }
      ids.forEach((id) => delete next[id])
      return next
    })
    setTimetableGrid((prev) => {
      const next = { ...prev }
      ids.forEach((id) => delete next[id])
      return next
    })
  }, [])

  const clearClasses = useCallback(() => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setClasses([])
    setPeriodAllocation({})
    setTimetableGrid({})
  }, [])

  const addSubject = useCallback((item: Omit<TimetableSubject, 'id'>) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setSubjects((prev) => [...prev, { ...item, id: genId('ts') }])
  }, [])

  const updateSubject = useCallback(
    (id: string, data: Partial<TimetableSubject>) => {
      if (!isHydratedRef.current) {
        hasLocalEditsBeforeHydrationRef.current = true
      }

      const target = subjects.find((s) => s.id === id)
      const oldName = target?.name?.trim() || ''
      const nextName = (data.name ?? target?.name ?? '').trim()
      const didRename =
        !!oldName &&
        !!nextName &&
        oldName.toLowerCase() !== nextName.toLowerCase()

      setSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)))

      if (!didRename) {
        return
      }

      const oldKey = oldName.toLowerCase()

      // Update subject names in class subject lists
      setClasses((prev) =>
        prev.map((row) => {
          if (!row.subjects || row.subjects.length === 0) return row
          const nextSubjects = row.subjects.map((subject) => {
            const trimmed = subject.trim()
            return trimmed.toLowerCase() === oldKey ? nextName : subject
          })
          return { ...row, subjects: nextSubjects }
        })
      )

      // Update subject names in teacher subject allocations
      setTeacherSubjectAllocationsState((prev) =>
        prev.map((allocation) => ({
          ...allocation,
          assignments: allocation.assignments.map((assignment) => ({
            ...assignment,
            subjects: assignment.subjects.map((subject) =>
              subject.trim().toLowerCase() === oldKey ? nextName : subject
            ),
          })),
        }))
      )

      // Update subject names in parallel subject pairs
      setParallelSubjectPairsState((prev) =>
        prev.map((pair) => ({
          ...pair,
          subjectA: pair.subjectA.trim().toLowerCase() === oldKey ? nextName : pair.subjectA,
          subjectB: pair.subjectB.trim().toLowerCase() === oldKey ? nextName : pair.subjectB,
        }))
      )

      // Update subject names in period allocation maps
      setPeriodAllocation((prev) => {
        const next: PeriodAllocationMap = {}

        Object.entries(prev).forEach(([classId, allocation]) => {
          const nextAllocation: Record<string, number> = {}

          Object.entries(allocation || {}).forEach(([subjectName, count]) => {
            const trimmed = subjectName.trim()
            if (trimmed.toLowerCase() === oldKey) {
              const existing = nextAllocation[nextName] ?? 0
              nextAllocation[nextName] = existing + count
            } else {
              nextAllocation[subjectName] = count
            }
          })

          next[classId] = nextAllocation
        })

        return next
      })

      // Update subject names in timetable grid cells
      setTimetableGrid((prev) => {
        const next: TimetableGrid = {}

        Object.entries(prev).forEach(([classId, days]) => {
          const nextDays: Record<string, Record<number, TimetableCell>> = {}

          Object.entries(days || {}).forEach(([day, slots]) => {
            const nextSlots: Record<number, TimetableCell> = {}

            Object.entries(slots || {}).forEach(([slotKey, cell]) => {
              const slot = Number(slotKey)
              if (!Number.isFinite(slot)) return

              const subjectKey = cell.subject.trim().toLowerCase()
              const subject =
                subjectKey === oldKey ? nextName : cell.subject

              nextSlots[slot] = { ...cell, subject }
            })

            nextDays[day] = nextSlots
          })

          next[classId] = nextDays
        })

        return next
      })
    },
    [subjects]
  )

  const deleteSubjects = useCallback((ids: string[]) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    const idSet = new Set(ids)
    const removedSubjectKeys = new Set(
      subjects
        .filter((subject) => idSet.has(subject.id))
        .map((subject) => subject.name.trim().toLowerCase())
    )

    setSubjects((prev) => prev.filter((s) => !idSet.has(s.id)))
    if (removedSubjectKeys.size > 0) {
      setParallelSubjectPairsState((prev) =>
        prev.filter((pair) => {
          const subjectAKey = pair.subjectA.trim().toLowerCase()
          const subjectBKey = pair.subjectB.trim().toLowerCase()
          return !removedSubjectKeys.has(subjectAKey) && !removedSubjectKeys.has(subjectBKey)
        })
      )
      setPeriodAllocation((prev) => {
        const next: PeriodAllocationMap = {}
        Object.entries(prev).forEach(([classId, allocation]) => {
          const filtered = Object.fromEntries(
            Object.entries(allocation).filter(([subjectName]) => !removedSubjectKeys.has(subjectName.trim().toLowerCase()))
          )
          next[classId] = filtered
        })
        return next
      })
    }
  }, [subjects])

  const applyClassSubjectAssignments = useCallback((subjectsByClassId: Record<string, string[]>) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }

    const directUpdates = new Map<string, string>()
    Object.entries(subjectsByClassId || {}).forEach(([classId, rawSubjects]) => {
      const normalized = normalizeSubjectNames(Array.isArray(rawSubjects) ? rawSubjects : [])
      directUpdates.set(classId, normalized.join('\u0000'))
    })
    if (directUpdates.size === 0) return

    setClasses((prev) => {
      const classWideUpdates = new Map<string, string>()
      prev.forEach((row) => {
        const encoded = directUpdates.get(row.id)
        if (!encoded) return
        if (!shouldSyncSubjectsAcrossSections(row.className)) return
        classWideUpdates.set(getClassKey(row.className), encoded)
      })

      return prev.map((row) => {
        const directEncoded = directUpdates.get(row.id)
        const classWideEncoded = classWideUpdates.get(getClassKey(row.className))
        const encodedSubjects = directEncoded || classWideEncoded
        if (!encodedSubjects) return row
        const nextSubjects = encodedSubjects ? encodedSubjects.split('\u0000').filter(Boolean) : []
        return { ...row, subjects: nextSubjects }
      })
    })
  }, [])

  const setTeachersValue = useCallback((nextTeachers: TimetableTeacher[]) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setTeachersState(nextTeachers)
  }, [])

  const addTeacher = useCallback((item: Omit<TimetableTeacher, 'id'>) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setTeachersState((prev) => [...prev, { ...item, id: genId('tt') }])
  }, [])

  const updateTeacher = useCallback((id: string, data: Partial<TimetableTeacher>) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setTeachersState((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)))
  }, [])

  const deleteTeachers = useCallback((ids: string[]) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    const idSet = new Set(ids)
    setTeachersState((prev) => prev.filter((t) => !idSet.has(t.id)))
  }, [])

  const setTeacherSubjectAllocations = useCallback((allocations: TeacherSubjectAllocation[]) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setTeacherSubjectAllocationsState(allocations)
  }, [])

  const setParallelSubjectPairs = useCallback((pairs: ParallelSubjectPair[]) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setParallelSubjectPairsState(pairs)
  }, [])

  const setCommonPeriods = useCallback((next: CommonPeriod[] | ((prev: CommonPeriod[]) => CommonPeriod[])) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setCommonPeriodsState((prev) => (typeof next === 'function' ? next(prev) : next))
  }, [])

  const setPeriodsPerWeekValue = useCallback((n: number) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setPeriodsPerWeek(n)
  }, [])

  const setPeriodCount = useCallback((classId: string, subject: string, count: number) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setPeriodAllocation((prev) => {
      const targetClass = classes.find((item) => item.id === classId)
      if (!targetClass) {
        return {
          ...prev,
          [classId]: {
            ...(prev[classId] || {}),
            [subject]: count,
          },
        }
      }

      const classKey = getClassKey(targetClass.className)
      const affectedClasses = classes.filter((item) => getClassKey(item.className) === classKey)
      const affectedClassIds = affectedClasses.map((item) => item.id)

      const canonicalSubjectByKey = new Map<string, string>()
      affectedClasses.forEach((item) => {
        item.subjects.forEach((subjectName) => {
          const trimmed = subjectName.trim()
          const key = trimmed.toLowerCase()
          if (!trimmed || canonicalSubjectByKey.has(key)) return
          canonicalSubjectByKey.set(key, trimmed)
        })
      })

      const subjectKey = subject.trim().toLowerCase()
      const linkedSubjectKeys = new Set<string>()
      const queue: string[] = [subjectKey]
      while (queue.length > 0) {
        const current = queue.shift() || ''
        if (!current || linkedSubjectKeys.has(current)) continue
        linkedSubjectKeys.add(current)

        parallelSubjectPairs.forEach((pair) => {
          if (getClassKey(pair.className) !== classKey) return
          const pairSubjectA = pair.subjectA.trim().toLowerCase()
          const pairSubjectB = pair.subjectB.trim().toLowerCase()
          if (current === pairSubjectA && pairSubjectB && !linkedSubjectKeys.has(pairSubjectB)) {
            queue.push(pairSubjectB)
          } else if (current === pairSubjectB && pairSubjectA && !linkedSubjectKeys.has(pairSubjectA)) {
            queue.push(pairSubjectA)
          }
        })
      }

      const subjectsToSync = Array.from(linkedSubjectKeys)
        .map((key) => canonicalSubjectByKey.get(key))
        .filter((value): value is string => Boolean(value))

      if (subjectsToSync.length === 0) {
        subjectsToSync.push(subject)
      }

      const next = { ...prev }
      affectedClassIds.forEach((affectedClassId) => {
        const existing = prev[affectedClassId] || {}
        const nextClassAllocation = { ...existing }
        subjectsToSync.forEach((subjectName) => {
          nextClassAllocation[subjectName] = count
        })
        next[affectedClassId] = nextClassAllocation
      })

      return next
    })
  }, [classes, parallelSubjectPairs])

  const clearPeriodAllocation = useCallback(() => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setPeriodAllocation({})
  }, [])

  const setGridCell = useCallback((classId: string, day: string, slot: number, cell: TimetableCell) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setTimetableGrid((prev) => ({
      ...prev,
      [classId]: {
        ...(prev[classId] || {}),
        [day]: {
          ...((prev[classId] || {})[day] || {}),
          [slot]: cell,
        },
      },
    }))
  }, [])

  const clearGridForClass = useCallback((classId: string) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setTimetableGrid((prev) => {
      const next = { ...prev }
      delete next[classId]
      return next
    })
  }, [])

  const clearAllGrid = useCallback(() => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setTimetableGrid({})
  }, [])

  const setMatrixState = useCallback((state: {
    matrixClasses: TimetableMatrixClass[]
    matrixSections: TimetableMatrixSection[]
    matrixSelection: TimetableMatrixSelection
  }) => {
    if (!isHydratedRef.current) {
      hasLocalEditsBeforeHydrationRef.current = true
    }
    setMatrixClasses(state.matrixClasses)
    setMatrixSections(state.matrixSections)
    setMatrixSelection(state.matrixSelection)
  }, [])

  return (
    <TimetableContext.Provider
      value={{
        isHydrated,
        rehydrate,
        classes,
        addClass,
        updateClass,
        deleteClasses,
        clearClasses,
        subjects,
        addSubject,
        updateSubject,
        deleteSubjects,
        applyClassSubjectAssignments,
        teachers,
        setTeachers: setTeachersValue,
        addTeacher,
        updateTeacher,
        deleteTeachers,
        teacherSubjectAllocations,
        setTeacherSubjectAllocations,
        parallelSubjectPairs,
        setParallelSubjectPairs,
        commonPeriods,
        setCommonPeriods,
        periodsPerWeek,
        setPeriodsPerWeek: setPeriodsPerWeekValue,
        periodsPerDay,
        periodAllocation,
        setPeriodCount,
        clearPeriodAllocation,
        timetableGrid,
        setGridCell,
        clearGridForClass,
        clearAllGrid,
        matrixClasses,
        matrixSections,
        matrixSelection,
        setMatrixState,
      }}
    >
      {children}
    </TimetableContext.Provider>
  )
}

export const useTimetable = () => useContext(TimetableContext)

export default TimetableContext
