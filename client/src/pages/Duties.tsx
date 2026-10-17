import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { Document, Page as PdfPage, pdfjs } from 'react-pdf'
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, DoorOpen, Download, ExternalLink, FileText, Save, Users } from 'lucide-react'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { useTeachers } from '../hooks/useTeachers'
import type { Teacher } from '../services/teacherService'
import { seatingPlanService, type Room } from '../services/seatingPlanService'
import dutiesService from '../services/dutiesService'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardToolbar,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  FilterBar,
  Icon,
  Page,
  Select,
  Sheet,
  Switch,
  Tabs,
  cx,
  type DataTableColumn,
  type SelectOption,
} from '@/components/ui'
import { PAPER_PAGES_CLASS, Paper, PaperStage } from '@/components/ui'
import '@/components/exmcl/centre-duties.css'
import {
  useDutiesSupport,
  useDutySelections,
  useDutyAllocationMode,
  useSaveDutySelectionsMutation,
  useUpdateDutyAllocationModeMutation,
  useAssignDailyDutiesMutation,
} from '../hooks/useDuties'
import { useDailyDuties } from '../hooks/useDashboard'
import { useSeatingPlanTemplateSettings } from '../hooks/useSeatingPlan'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

/** PDF page width that fits the preview sheet (xl) and phones. */
const dutyPdfPageWidth = () =>
  typeof window !== 'undefined' ? Math.max(260, Math.min(680, window.innerWidth - 72)) : 680

/* ────────── constants ────────── */

const DUTY_TABS = [
  { key: 'CS', label: 'CS', dutyType: 'Centre Superintendent' },
  { key: 'DCS', label: 'DCS', dutyType: 'Deputy Centre Superintendent' },
  { key: 'OBR', label: 'OBR', dutyType: 'Observer' },
  { key: 'ASI', label: 'ASI', dutyType: 'Invigilator' },
  { key: 'ASC', label: 'ASC', dutyType: 'ASI (CCTV)' },
  { key: 'ASFM', label: 'ASFM', dutyType: 'ASI (Frisking Male)' },
  { key: 'ASFF', label: 'ASFF', dutyType: 'ASI (Frisking Female)' },
  { key: 'CLR', label: 'CLR', dutyType: 'Clerk' },
  { key: 'CL4', label: 'CL4', dutyType: 'Class IV' },
] as const

type ConflictReason = {
  type: 'subject' | 'school' | 'candidateOverlap'
  codes?: string[]
  schoolCode?: string
  rollNumbers?: string[]
  totalOverlaps?: number
}

type ConflictRoom = {
  roomNo: string
  reasons: ConflictReason[]
}

type ConflictDialogEntry = {
  _id?: string
  name?: string
  employeeId?: string
  schoolCode?: string
  eligibleRoomCount: number
  totalRooms: number
  ineligibleRooms?: ConflictRoom[]
}

/* ────────── helpers ────────── */

const normalizeDateKey = (value: string | Date) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

const normalizeSubjectCode = (value: string | undefined | null) => {
  return String(value || '').trim().toUpperCase()
}

const normalizeSchoolCode = (value: string | undefined | null) => {
  return String(value || '').trim().toUpperCase()
}

const formatDateLabel = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-')
  if (!year || !month || !day) return dateKey
  return `${day}.${month}.${year.slice(-2)}`
}

const hasDutyType = (functionary: Teacher, dutyType: string) => {
  if (functionary?.dutyType === dutyType) return true
  if (!Array.isArray(functionary?.dutyHistory)) return false
  return functionary.dutyHistory.some((duty: string) => duty === dutyType)
}

const isCurrentInvigilator = (functionary?: Teacher) => {
  return Boolean(functionary && functionary.isActive !== false && functionary.dutyType === 'Invigilator')
}

const UI_ONLY_HIDDEN_KEY = 'capabble:exam-functionaries:hidden-teacher-ids'

const getFunctionaryHideKeys = (functionary: Partial<Teacher>) => {
  const keys: string[] = []
  const id = String(functionary._id || '').trim()
  const altId = String(functionary.id || '').trim()
  const name = String(functionary.name || '').trim().toLowerCase()
  const oasisId = String(functionary.oasisId || '').trim().toLowerCase()
  const schoolCode = String(functionary.schoolCode || '').trim().toLowerCase()

  if (id) keys.push(`id:${id}`)
  if (altId) keys.push(`id:${altId}`)
  if (name || oasisId || schoolCode) keys.push(`fp:${name}|${oasisId}|${schoolCode}`)
  return keys
}

const loadHiddenFunctionaryKeys = (): Set<string> => {
  try {
    if (typeof window === 'undefined') return new Set()
    const raw = window.localStorage.getItem(UI_ONLY_HIDDEN_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((item) => typeof item === 'string' && item.trim().length > 0))
  } catch {
    return new Set()
  }
}

const compareRoomNo = (a: Room, b: Room) => {
  const aNo = String(a?.roomNo || '')
  const bNo = String(b?.roomNo || '')
  return aNo.localeCompare(bNo, undefined, { numeric: true, sensitivity: 'base' })
}

const getRoomAllocationOrderForDate = (room: Room, dateKey: string) => {
  if (!dateKey) return Number.MAX_SAFE_INTEGER
  const source = room?.allocationOrderByDate as unknown
  if (!source) return Number.MAX_SAFE_INTEGER
  const value =
    source instanceof Map
      ? source.get(dateKey)
      : (source as Record<string, number | undefined>)[dateKey]
  return typeof value === 'number' ? value : Number.MAX_SAFE_INTEGER
}

/**
 * Calculate maximum duties per date for the active tab.
 *
 * CS:   1 per day
 * DCS:  1 per day
 * OBR:  as per observer schedule (0 for now – needs separate schedule)
 * ASI:  2 × rooms used that day
 * ASC:  ⌈rooms / 10⌉ per day
 * ASFM: 1 per day
 * ASFF: 1 per day
 * CLR:  1 per day
 * CL4:  1 if candidates < 20
 *       2 if 20 ≤ candidates ≤ 100
 *       3 if 101 ≤ candidates ≤ 400
 *       4 if candidates > 400
 */
const computeMaxDuties = (
  tabKey: string,
  roomsForDate: number,
  candidatesForDate: number
): number => {
  switch (tabKey) {
    case 'CS':
    case 'DCS':
    case 'ASFM':
    case 'ASFF':
    case 'CLR':
      return 1

    case 'OBR':
      // Observer schedule-based – show 0 until schedule is configured
      return 0

    case 'ASI':
      // Twice the number of rooms used that day
      return roomsForDate * 2

    case 'ASC':
      // 1 per 10 rooms
      return roomsForDate > 0 ? Math.ceil(roomsForDate / 10) : 0

    case 'CL4':
      if (candidatesForDate <= 0) return 0
      if (candidatesForDate < 20) return 1
      if (candidatesForDate <= 100) return 2
      if (candidatesForDate <= 400) return 3
      return 4

    default:
      return 0
  }
}

/* ── Header label for the "maximum" row per tab ── */
const getMaxRowLabel = (tabKey: string): string => {
  switch (tabKey) {
    case 'CS': return 'Max CS per day'
    case 'DCS': return 'Max DCS per day'
    case 'OBR': return 'Max observers'
    case 'ASI': return 'Max invigilators'
    case 'ASC': return 'Max ASI (CCTV)'
    case 'ASFM': return 'Max ASI (frisking, male)'
    case 'ASFF': return 'Max ASI (frisking, female)'
    case 'CLR': return 'Max clerks'
    case 'CL4': return 'Max Class IV'
    default: return 'Maximum duties'
  }
}

const DEFAULT_DUTY_LIST_COLUMN_WIDTHS = {
  srNo: 50,
  roomNo: 70,
  roomName: 120,
  floor: 70,
  inv1School: 90,
  inv1Teacher: 130,
  inv1TeacherId: 100,
  inv1Signature: 130,
  inv2School: 90,
  inv2Teacher: 130,
  inv2TeacherId: 100,
  inv2Signature: 130,
}

const DUTY_LIST_COLUMN_CONTROLS: Array<{
  key: keyof typeof DEFAULT_DUTY_LIST_COLUMN_WIDTHS
  label: string
  min: number
  max: number
}> = [
  { key: 'srNo', label: 'Sr No', min: 40, max: 220 },
  { key: 'roomNo', label: 'Room No', min: 50, max: 220 },
  { key: 'roomName', label: 'Room Name', min: 80, max: 300 },
  { key: 'floor', label: 'Floor', min: 50, max: 220 },
  { key: 'inv1School', label: 'Inv 1 School', min: 70, max: 260 },
  { key: 'inv1Teacher', label: 'Inv 1 Teacher', min: 80, max: 300 },
  { key: 'inv1TeacherId', label: 'Inv 1 OASIS ID', min: 80, max: 260 },
  { key: 'inv1Signature', label: 'Inv 1 Signature', min: 90, max: 320 },
  { key: 'inv2School', label: 'Inv 2 School', min: 70, max: 260 },
  { key: 'inv2Teacher', label: 'Inv 2 Teacher', min: 80, max: 300 },
  { key: 'inv2TeacherId', label: 'Inv 2 OASIS ID', min: 80, max: 260 },
  { key: 'inv2Signature', label: 'Inv 2 Signature', min: 90, max: 320 },
]

/* ────────── component ────────── */

const Duties: React.FC = () => {
  const dutiesTableRef = useRef<HTMLDivElement | null>(null)
  const hasScrolledToDateRef = useRef(false)

  const { data: supportData, isLoading: loadingSupport } = useDutiesSupport()
  const rooms = supportData?.rooms ?? []
  const examDates = supportData?.examDates ?? []
  const requiredRoomsByDate = supportData?.requiredRoomsByDate ?? {}
  const candidatesByDate = supportData?.candidatesByDate ?? {}
  const examSubjectCodesByDate = supportData?.examSubjectCodesByDate ?? {}

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('ASI')
  const allocationModeQuery = useDutyAllocationMode()
  const updateAllocationModeMutation = useUpdateDutyAllocationModeMutation()
  const saveSelectionsMutation = useSaveDutySelectionsMutation()
  const assignDailyDutiesMutation = useAssignDailyDutiesMutation()
  const allocationMode = allocationModeQuery.data ?? 'manual'
  const loadingAllocationMode = allocationModeQuery.isLoading || updateAllocationModeMutation.isPending
  const isSaving = saveSelectionsMutation.isPending
  // Track checked duties: key = "funcId::dateKey", value = true/false
  const [checkedDuties, setCheckedDuties] = useState<Record<string, boolean>>({})
  const [selectedRoomDate, setSelectedRoomDate] = useState('')
  const [roomAssignmentsByDate, setRoomAssignmentsByDate] = useState<Record<string, Record<string, string>>>({})
  const [roomAssignmentsByDateSecond, setRoomAssignmentsByDateSecond] = useState<Record<string, Record<string, string>>>({})
  const [roomCandidateSchoolCodesByDate, setRoomCandidateSchoolCodesByDate] = useState<
    Record<string, Record<string, string[]>>
  >({})
  const [roomSubjectCodesByDate, setRoomSubjectCodesByDate] = useState<
    Record<string, Record<string, string[]>>
  >({})
  const [roomRollNumbersByDate, setRoomRollNumbersByDate] = useState<
    Record<string, Record<string, string[]>>
  >({})
  const savingRoomAssignments = assignDailyDutiesMutation.isPending
  const [dutyPdfPreviewUrl, setDutyPdfPreviewUrl] = useState<string | null>(null)
  const [showDutyPdfPreview, setShowDutyPdfPreview] = useState(false)
  const [loadingDutyPdfPreview, setLoadingDutyPdfPreview] = useState(false)
  const [dutyPdfPageCount, setDutyPdfPageCount] = useState(0)
  const [dutyPdfRenderError, setDutyPdfRenderError] = useState<string | null>(null)
  const [invigilatorDutySort, setInvigilatorDutySort] = useState<'none' | 'asc' | 'desc'>('none')
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [conflictDialogData, setConflictDialogData] = useState<ConflictDialogEntry[] | null>(null)
  const [expandedConflictIdx, setExpandedConflictIdx] = useState<number | null>(null)
  const [replacementTarget, setReplacementTarget] = useState<ConflictDialogEntry | null>(null)
  const [hiddenFunctionaryKeys] = useState<Set<string>>(() => loadHiddenFunctionaryKeys())

  const { data: templateSettings, isLoading: loadingTemplateSettings } = useSeatingPlanTemplateSettings()
  const templateSettingsSnapshot = templateSettings ?? null
  const functionaryDutyListFormat = useMemo((): { pageSize: string; orientation: 'landscape' | 'portrait' } => {
    const pageSize = String(templateSettings?.functionaryDutyList?.pageSize || 'A4').toUpperCase()
    const orientation =
      String(templateSettings?.functionaryDutyList?.orientation || 'landscape').toLowerCase() === 'portrait'
        ? ('portrait' as const)
        : ('landscape' as const)
    return { pageSize: pageSize || 'A4', orientation }
  }, [templateSettings])
  const [dutyListColumnWidths, setDutyListColumnWidths] = useState(DEFAULT_DUTY_LIST_COLUMN_WIDTHS)
  const hasInitializedColumnWidthsRef = useRef(false)
  useEffect(() => {
    if (!templateSettings?.functionaryDutyList || hasInitializedColumnWidthsRef.current) return
    hasInitializedColumnWidthsRef.current = true
    setDutyListColumnWidths({
      ...DEFAULT_DUTY_LIST_COLUMN_WIDTHS,
      ...(templateSettings.functionaryDutyList.columnWidths || {}),
    })
  }, [templateSettings])
  const dutyListLayoutReady = Boolean(templateSettings) && !loadingTemplateSettings

  const dutyListControlByKey = useMemo(() => {
    const map = new Map<string, { min: number; max: number }>()
    DUTY_LIST_COLUMN_CONTROLS.forEach((control) => {
      map.set(control.key, { min: control.min, max: control.max })
    })
    return map
  }, [])
  const dutyListColumnKeys = useMemo(
    () => DUTY_LIST_COLUMN_CONTROLS.map((control) => control.key),
    []
  )
  const dutyListPreviewTotalWidth = useMemo(
    () => dutyListColumnKeys.reduce((sum, key) => sum + dutyListColumnWidths[key], 0),
    [dutyListColumnKeys, dutyListColumnWidths]
  )

  const dutyListPreviewColumnPercentages = useMemo(() => {
    const total = dutyListPreviewTotalWidth || 1
    return dutyListColumnKeys.reduce((acc, key) => {
      acc[key] = Number(((dutyListColumnWidths[key] / total) * 100).toFixed(4))
      return acc
    }, {} as Record<keyof typeof DEFAULT_DUTY_LIST_COLUMN_WIDTHS, number>)
  }, [dutyListColumnKeys, dutyListColumnWidths, dutyListPreviewTotalWidth])

  useEffect(() => {
    return () => {
      if (dutyPdfPreviewUrl) URL.revokeObjectURL(dutyPdfPreviewUrl)
    }
  }, [dutyPdfPreviewUrl])

  const closeDutyPdfPreview = useCallback(() => {
    setShowDutyPdfPreview(false)
    setDutyPdfPageCount(0)
    setDutyPdfRenderError(null)
    setDutyPdfPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl)
      return null
    })
  }, [])

  const getSchoolInitials = useCallback((functionary?: Teacher) => {
    const schoolName = String(functionary?.schoolName || '').trim()
    if (schoolName) {
      const initials = schoolName
        .split(/\s+/)
        .map((part) => part.slice(0, 1))
        .join('')
        .toUpperCase()
      return initials.slice(0, 6)
    }
    return normalizeSchoolCode(functionary?.schoolCode)
  }, [])

  const startDutyListColumnResize = (boundaryIndex: number, event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()

    const leftKey = dutyListColumnKeys[boundaryIndex]
    const rightKey = dutyListColumnKeys[boundaryIndex + 1]
    if (!leftKey || !rightKey) return

    const leftConfig = dutyListControlByKey.get(leftKey)
    const rightConfig = dutyListControlByKey.get(rightKey)
    if (!leftConfig || !rightConfig) return

    const initialX = event.clientX
    const initialLeft = dutyListColumnWidths[leftKey]
    const initialRight = dutyListColumnWidths[rightKey]

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - initialX

      const minDeltaByLeft = -(initialLeft - leftConfig.min)
      const maxDeltaByRight = initialRight - rightConfig.min
      const maxDeltaByLeftMax = leftConfig.max - initialLeft
      const minDeltaByRightMax = initialRight - rightConfig.max

      const minDelta = Math.max(minDeltaByLeft, minDeltaByRightMax)
      const maxDelta = Math.min(maxDeltaByRight, maxDeltaByLeftMax)
      const boundedDelta = Math.max(minDelta, Math.min(maxDelta, delta))

      setDutyListColumnWidths((prev) => ({
        ...prev,
        [leftKey]: Math.round(initialLeft + boundedDelta),
        [rightKey]: Math.round(initialRight - boundedDelta),
      }))
    }

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  /* ── Fetch teachers ── */
  const { data: teachersData, isLoading: loadingTeachers } = useTeachers({
    limit: 100,
    sort: 'name',
  })

  const allFunctionaries = useMemo(() => {
    return [...(teachersData?.items || [])]
      .filter((f) => {
        const keys = getFunctionaryHideKeys(f)
        return !keys.some((key) => hiddenFunctionaryKeys.has(key))
      })
      .sort((a, b) =>
        String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
      )
  }, [teachersData, hiddenFunctionaryKeys])

  /* ── Filter by active tab + search ── */
  const activeDutyType = DUTY_TABS.find((t) => t.key === activeTab)?.dutyType || ''
  const isAsiTabActive = activeTab === 'ASI'

  const allocatedRoomsForSelectedDate = useMemo(() => {
    if (!selectedRoomDate) return []
    return [...rooms]
      .filter((room) => room?.isActive !== false)
      .filter((room) => Array.isArray(room?.allocatedExamDates) && room.allocatedExamDates.includes(selectedRoomDate))
      .sort((a, b) => {
        const orderDiff =
          getRoomAllocationOrderForDate(a, selectedRoomDate) - getRoomAllocationOrderForDate(b, selectedRoomDate)
        if (orderDiff !== 0) return orderDiff
        return compareRoomNo(a, b)
      })
  }, [rooms, selectedRoomDate])

  const functionaryById = useMemo(() => {
    const map: Record<string, Teacher> = {}
    for (const functionary of allFunctionaries) {
      if (functionary?._id) map[functionary._id] = functionary
    }
    return map
  }, [allFunctionaries])

  const invigilatorsForTab = useMemo(() => {
    return allFunctionaries.filter((f) => isCurrentInvigilator(f))
  }, [allFunctionaries])

  const selectedInvigilatorsForDate = useMemo(() => {
    if (!selectedRoomDate) return []
    return invigilatorsForTab.filter((func) => checkedDuties[`${func._id}::${selectedRoomDate}`])
  }, [invigilatorsForTab, checkedDuties, selectedRoomDate])

  const roomDropdownInvigilators = useMemo(() => {
    const source = allocationMode === 'manual' ? selectedInvigilatorsForDate : invigilatorsForTab
    return [...source].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
  }, [allocationMode, selectedInvigilatorsForDate, invigilatorsForTab])

  const selectedInvigilatorIdsForDate = useMemo(() => {
    return new Set(
      selectedInvigilatorsForDate
        .map((func) => String(func?._id || '').trim())
        .filter(Boolean)
    )
  }, [selectedInvigilatorsForDate])

  const selectedInvigilatorCountForRoomDate = useMemo(() => {
    return selectedInvigilatorsForDate.length
  }, [selectedInvigilatorsForDate])

  const canEnableAutoModeForDate = useMemo(
    () => Boolean(selectedRoomDate) && selectedInvigilatorCountForRoomDate >= allocatedRoomsForSelectedDate.length * 2,
    [selectedRoomDate, selectedInvigilatorCountForRoomDate, allocatedRoomsForSelectedDate.length]
  )

  // Only consider rooms that are actually allocated for the selected date.
  // The API can return duties for rooms not allocated on this date (stale/ghost entries)
  // which causes false "assigned elsewhere" conflicts.
  const allocatedRoomIdSet = useMemo(() => {
    return new Set(allocatedRoomsForSelectedDate.map((r) => String(r._id || '').trim()))
  }, [allocatedRoomsForSelectedDate])

  const isFunctionaryAssignedElsewhere = useCallback(
    (dateKey: string, functionaryId: string, currentRoomId: string, slot: 'first' | 'second') => {
      const normalizedFunctionaryId = String(functionaryId || '').trim()
      const normalizedCurrentRoomId = String(currentRoomId || '').trim()
      if (!dateKey || !normalizedFunctionaryId || !normalizedCurrentRoomId) return false

      const firstMap = roomAssignmentsByDate[dateKey] || {}
      const secondMap = roomAssignmentsByDateSecond[dateKey] || {}

      for (const [roomIdRaw, assignedIdRaw] of Object.entries(firstMap)) {
        const roomId = String(roomIdRaw || '').trim()
        const assignedId = String(assignedIdRaw || '').trim()
        if (!roomId || !assignedId) continue
        if (!allocatedRoomIdSet.has(roomId)) continue
        const isSameSlot = slot === 'first' && roomId === normalizedCurrentRoomId
        if (isSameSlot) continue
        if (assignedId === normalizedFunctionaryId) return true
      }

      for (const [roomIdRaw, assignedIdRaw] of Object.entries(secondMap)) {
        const roomId = String(roomIdRaw || '').trim()
        const assignedId = String(assignedIdRaw || '').trim()
        if (!roomId || !assignedId) continue
        if (!allocatedRoomIdSet.has(roomId)) continue
        const isSameSlot = slot === 'second' && roomId === normalizedCurrentRoomId
        if (isSameSlot) continue
        if (assignedId === normalizedFunctionaryId) return true
      }

      return false
    },
    [roomAssignmentsByDate, roomAssignmentsByDateSecond, allocatedRoomIdSet]
  )

  const getRemainingInvigilatorIdsForSlot = useCallback(
    (dateKey: string, roomId: string, slot: 'first' | 'second') => {
      const selectedIds = new Set(
        selectedInvigilatorsForDate
          .map((func) => String(func?._id || '').trim())
          .filter(Boolean)
      )
      if (!dateKey || !roomId) return selectedIds

      const firstMap = roomAssignmentsByDate[dateKey] || {}
      const secondMap = roomAssignmentsByDateSecond[dateKey] || {}
      const normalizedRoomId = String(roomId || '').trim()

      for (const [mappedRoomIdRaw, assignedIdRaw] of Object.entries(firstMap)) {
        const mappedRoomId = String(mappedRoomIdRaw || '').trim()
        const assignedId = String(assignedIdRaw || '').trim()
        if (!assignedId) continue
        if (!allocatedRoomIdSet.has(mappedRoomId)) continue
        const keepCurrentSlot = slot === 'first' && mappedRoomId === normalizedRoomId
        if (!keepCurrentSlot) selectedIds.delete(assignedId)
      }
      for (const [mappedRoomIdRaw, assignedIdRaw] of Object.entries(secondMap)) {
        const mappedRoomId = String(mappedRoomIdRaw || '').trim()
        const assignedId = String(assignedIdRaw || '').trim()
        if (!assignedId) continue
        if (!allocatedRoomIdSet.has(mappedRoomId)) continue
        const keepCurrentSlot = slot === 'second' && mappedRoomId === normalizedRoomId
        if (!keepCurrentSlot) selectedIds.delete(assignedId)
      }

      return selectedIds
    },
    [selectedInvigilatorsForDate, roomAssignmentsByDate, roomAssignmentsByDateSecond, allocatedRoomIdSet]
  )

  /* ── Count per tab ── */
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const tab of DUTY_TABS) {
      counts[tab.key] = allFunctionaries.filter((f) => (
        tab.key === 'ASI'
          ? isCurrentInvigilator(f)
          : hasDutyType(f, tab.dutyType)
      )).length
    }
    return counts
  }, [allFunctionaries])

  /* ── Count checked duties per date (only for active functionaries in this tab) ── */
  const activeFunctionaryIdSet = useMemo(() => {
    const set = new Set<string>()
    allFunctionaries
      .filter((f) => (isAsiTabActive ? isCurrentInvigilator(f) : hasDutyType(f, activeDutyType)))
      .forEach((f) => set.add(String(f._id)))
    return set
  }, [allFunctionaries, activeDutyType, isAsiTabActive])

  const checkedCountByDate = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const key of Object.keys(checkedDuties)) {
      if (!checkedDuties[key]) continue
      const [funcId, dateKey] = key.split('::')
      // Only count slots for functionaries that currently exist in this tab
      if (!funcId || !dateKey || !activeFunctionaryIdSet.has(funcId)) continue
      counts[dateKey] = (counts[dateKey] || 0) + 1
    }
    return counts
  }, [checkedDuties, activeFunctionaryIdSet])

  /* ── Count checked duties per functionary (only for active functionaries in this tab) ── */
  const checkedCountByFunctionary = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const key of Object.keys(checkedDuties)) {
      if (!checkedDuties[key]) continue
      const functionaryId = key.split('::')[0]
      if (!functionaryId || !activeFunctionaryIdSet.has(functionaryId)) continue
      counts[functionaryId] = (counts[functionaryId] || 0) + 1
    }
    return counts
  }, [checkedDuties, activeFunctionaryIdSet])

  const filteredFunctionaries = useMemo(() => {
    let list = allFunctionaries.filter((f) => (isAsiTabActive ? isCurrentInvigilator(f) : hasDutyType(f, activeDutyType)))
    const term = search.trim().toLowerCase()
    if (term) {
      list = list.filter((f) => {
        const haystack = `${f.name} ${f.oasisId || ''} ${f.employeeId || ''}`.toLowerCase()
        return haystack.includes(term)
      })
    }
    if (invigilatorDutySort !== 'none') {
      list = [...list].sort((a, b) => {
        const aCount = checkedCountByFunctionary[a._id] || 0
        const bCount = checkedCountByFunctionary[b._id] || 0
        if (aCount === bCount) {
          return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, {
            sensitivity: 'base',
          })
        }
        return invigilatorDutySort === 'asc' ? aCount - bCount : bCount - aCount
      })
    }
    return list
  }, [allFunctionaries, activeDutyType, search, isAsiTabActive, invigilatorDutySort, checkedCountByFunctionary])

  const getFunctionarySubjectCodes = useCallback((functionary?: Teacher) => {
    if (!functionary) return []
    const codes = new Set<string>()

    if (functionary.subjectCode) {
      String(functionary.subjectCode)
        .split(',')
        .map((part) => normalizeSubjectCode(part))
        .filter(Boolean)
        .forEach((code) => codes.add(code))
    }

    if (Array.isArray(functionary.subjects)) {
      functionary.subjects.forEach((subject) => {
        if (typeof subject === 'object' && subject && 'code' in subject) {
          const subjectCode = normalizeSubjectCode(String(subject.code || ''))
          if (subjectCode) codes.add(subjectCode)
        }
      })
    }

    return Array.from(codes)
  }, [])

  const getRoomSubjectConflict = useCallback((roomId: string, functionaryId: string, dateKey: string) => {
    const roomCodes = (roomSubjectCodesByDate[dateKey]?.[roomId] || []).map((code) => normalizeSubjectCode(code))
    if (roomCodes.length === 0) return null
    const functionary = functionaryById[functionaryId]
    const teacherCodes = getFunctionarySubjectCodes(functionary)
    if (teacherCodes.length === 0) return null

    const roomCodeSet = new Set(roomCodes)
    const conflictingCodes = teacherCodes.filter((code) => roomCodeSet.has(code))
    if (conflictingCodes.length === 0) return null

    return {
      functionaryName: functionary?.name || 'Selected functionary',
      conflictingCodes,
    }
  }, [roomSubjectCodesByDate, functionaryById, getFunctionarySubjectCodes])

  const getDateSubjectConflict = useCallback((functionaryId: string, dateKey: string) => {
    const examCodes = (examSubjectCodesByDate[dateKey] || []).map((code) => normalizeSubjectCode(code))
    if (examCodes.length === 0) return null
    const functionary = functionaryById[functionaryId]
    const teacherCodes = getFunctionarySubjectCodes(functionary)
    if (teacherCodes.length === 0) return null

    const examCodeSet = new Set(examCodes)
    const conflictingCodes = teacherCodes.filter((code) => examCodeSet.has(code))
    if (conflictingCodes.length === 0) return null

    return {
      functionaryName: functionary?.name || 'Selected functionary',
      conflictingCodes,
    }
  }, [examSubjectCodesByDate, functionaryById, getFunctionarySubjectCodes])

  const getRoomSchoolConflict = useCallback((roomId: string, functionaryId: string, dateKey: string) => {
    const functionary = functionaryById[functionaryId]
    const invigilatorSchoolCode = normalizeSchoolCode(functionary?.schoolCode)
    if (!invigilatorSchoolCode) return null

    const candidateSchoolCodes = (roomCandidateSchoolCodesByDate[dateKey]?.[roomId] || [])
      .map((code) => normalizeSchoolCode(code))
      .filter(Boolean)
    if (candidateSchoolCodes.length === 0) return null

    if (!candidateSchoolCodes.includes(invigilatorSchoolCode)) return null

    return {
      functionaryName: functionary?.name || 'Selected functionary',
      schoolCode: invigilatorSchoolCode,
    }
  }, [functionaryById, roomCandidateSchoolCodesByDate])

  const getCandidateOverlapConflict = useCallback((roomId: string, functionaryId: string, dateKey: string) => {
    const functionary = functionaryById[functionaryId]
    if (!functionary?.supervisionHistory?.length) return null

    const supervisedRollNos = new Set<string>()
    for (const entry of functionary.supervisionHistory) {
      if (entry.examDate === dateKey) continue
      for (const r of (entry.rollNumbers || [])) {
        supervisedRollNos.add(String(r).trim().toUpperCase())
      }
    }
    if (supervisedRollNos.size === 0) return null

    const roomRollNos = roomRollNumbersByDate[dateKey]?.[roomId]
    if (!roomRollNos?.length) return null

    for (const rollNo of roomRollNos) {
      if (supervisedRollNos.has(String(rollNo).trim().toUpperCase())) {
        return {
          functionaryName: functionary?.name || 'Selected functionary',
          overlappingRollNo: rollNo,
        }
      }
    }
    return null
  }, [functionaryById, roomRollNumbersByDate])

  const isInvigilatorAllowedForRoom = useCallback((roomId: string, functionaryId: string, dateKey: string) => {
    if (!functionaryId || !dateKey) return true
    const functionary = functionaryById[functionaryId]
    if (!isCurrentInvigilator(functionary)) return false
    if (getRoomSubjectConflict(roomId, functionaryId, dateKey)) return false
    if (getRoomSchoolConflict(roomId, functionaryId, dateKey)) return false
    // Candidate overlap is a warning only — does not block eligibility
    return true
  }, [functionaryById, getRoomSubjectConflict, getRoomSchoolConflict])

  const getEligibleRoomCountForFunctionary = useCallback((functionaryId: string, dateKey: string) => {
    if (!dateKey || !functionaryId) return 0
    let count = 0
    for (const room of allocatedRoomsForSelectedDate) {
      if (!isInvigilatorAllowedForRoom(room._id, functionaryId, dateKey)) continue
      if (isFunctionaryAssignedElsewhere(dateKey, functionaryId, room._id, 'first')) continue
      if (isFunctionaryAssignedElsewhere(dateKey, functionaryId, room._id, 'second')) continue
      count += 1
    }
    return count
  }, [allocatedRoomsForSelectedDate, isInvigilatorAllowedForRoom, isFunctionaryAssignedElsewhere])

  const replacementCandidates = useMemo(() => {
    if (!selectedRoomDate || !replacementTarget?._id) return []

    return invigilatorsForTab
      .filter((func) => {
        const candidateId = String(func?._id || '').trim()
        if (!candidateId || candidateId === String(replacementTarget._id || '').trim()) return false
        if (selectedInvigilatorIdsForDate.has(candidateId)) return false
        if (Object.values(roomAssignmentsByDate[selectedRoomDate] || {}).some((value) => String(value || '').trim() === candidateId)) return false
        if (Object.values(roomAssignmentsByDateSecond[selectedRoomDate] || {}).some((value) => String(value || '').trim() === candidateId)) return false
        return true
      })
      .map((func) => ({
        functionary: func,
        eligibleRoomCount: getEligibleRoomCountForFunctionary(String(func._id || ''), selectedRoomDate),
      }))
      .filter((entry) => entry.eligibleRoomCount > 0)
      .sort((a, b) => {
        if (b.eligibleRoomCount !== a.eligibleRoomCount) return b.eligibleRoomCount - a.eligibleRoomCount
        return String(a.functionary.name || '').localeCompare(String(b.functionary.name || ''), undefined, { sensitivity: 'base' })
      })
  }, [
    selectedRoomDate,
    replacementTarget,
    invigilatorsForTab,
    selectedInvigilatorIdsForDate,
    roomAssignmentsByDate,
    roomAssignmentsByDateSecond,
    getEligibleRoomCountForFunctionary,
  ])

  const toggleDuty = (funcId: string, dateKey: string) => {
    const key = `${funcId}::${dateKey}`
    const isSelecting = !checkedDuties[key]
    if (isSelecting) {
      // Enforce max-per-date limit
      const roomsForDate = Number(requiredRoomsByDate[dateKey] || 0)
      const candidatesForDate = Number(candidatesByDate[dateKey] || 0)
      const maxDuties = computeMaxDuties(activeTab, roomsForDate, candidatesForDate)
      const currentCount = checkedCountByDate[dateKey] || 0
      if (maxDuties > 0 && currentCount >= maxDuties) {
        toast.error(`Maximum ${maxDuties} functionar${maxDuties === 1 ? 'y' : 'ies'} already assigned for ${formatDateLabel(dateKey)}.`)
        return
      }
      if (activeTab === 'ASI') {
        const conflict = getDateSubjectConflict(funcId, dateKey)
        if (conflict) {
          toast(
            `${conflict.functionaryName} matches subject ${conflict.conflictingCodes.join(', ')}. Assign only in rooms other than this subject.`,
            {
              icon: 'i',
            }
          )
        }
      }
    }
    setCheckedDuties((prev) => ({ ...prev, [key]: !prev[key] }))
  }


  useEffect(() => {
    if (!dutyListLayoutReady || !templateSettingsSnapshot) return
    const timer = window.setTimeout(async () => {
      try {
        await seatingPlanService.updateTemplateSettings({
          ...templateSettingsSnapshot,
          functionaryDutyList: {
            ...(templateSettingsSnapshot.functionaryDutyList || { pageSize: 'A4', orientation: 'landscape' }),
            pageSize: 'A4',
            orientation: functionaryDutyListFormat.orientation,
            columnWidths: dutyListColumnWidths,
          },
        })
      } catch (error) {
        console.error('Failed to save duty list column widths:', error)
      }
    }, 500)

    return () => window.clearTimeout(timer)
  }, [dutyListColumnWidths, functionaryDutyListFormat.orientation, dutyListLayoutReady, templateSettingsSnapshot])

  /* ── Sync duty selections from cache when tab or data changes ── */
  const { data: selectionsData } = useDutySelections(activeDutyType)
  useEffect(() => {
    if (selectionsData) setCheckedDuties(selectionsData)
  }, [activeDutyType, selectionsData])

  /* ── Auto-scroll duties table to today's date column once on initial load (not on tab switch) ── */
  const supportOrTeachersLoading = loadingSupport || loadingTeachers
  useEffect(() => {
    if (supportOrTeachersLoading || examDates.length === 0 || hasScrolledToDateRef.current) return
    const timer = setTimeout(() => {
      const wrap = dutiesTableRef.current
      if (!wrap) return
      const todayKey = new Date().toISOString().slice(0, 10)
      const targetDate = examDates.includes(todayKey)
        ? todayKey
        : examDates.find((d) => d >= todayKey) || examDates[examDates.length - 1]
      if (!targetDate) return
      const th = wrap.querySelector<HTMLElement>(`[data-date="${targetDate}"]`)
      if (!th) return
      const firstDateTh = wrap.querySelector<HTMLElement>(`[data-date="${examDates[0]}"]`)
      const stickyWidth = firstDateTh ? firstDateTh.offsetLeft : 0
      wrap.scrollLeft = th.offsetLeft - stickyWidth
      hasScrolledToDateRef.current = true
    }, 150)
    return () => clearTimeout(timer)
  }, [examDates, supportOrTeachersLoading])

  /* Auto-select room date: today if it's an exam date, else next exam date */
  const getDefaultRoomDate = useCallback((dates: string[]): string => {
    if (dates.length === 0) return ''
    const today = normalizeDateKey(new Date())
    if (dates.includes(today)) return today
    const next = dates.find((d) => d >= today)
    return next || dates[dates.length - 1]
  }, [])

  useEffect(() => {
    if (activeTab !== 'ASI') return
    if (examDates.length === 0) {
      setSelectedRoomDate('')
      return
    }
    setSelectedRoomDate((prev) => (prev && examDates.includes(prev) ? prev : getDefaultRoomDate(examDates)))
  }, [activeTab, examDates, getDefaultRoomDate])

  const { data: dailyDutiesData, isLoading: loadingRoomAssignments } = useDailyDuties(selectedRoomDate, {
    refetchOnWindowFocus: false,
    enabled: activeTab === 'ASI' && !!selectedRoomDate,
  })
  useEffect(() => {
    if (activeTab !== 'ASI' || !selectedRoomDate || !dailyDutiesData) return
    const response = dailyDutiesData
    const nextAssignments: Record<string, string> = {}
    const nextAssignmentsSecond: Record<string, string> = {}
    for (const duty of response?.duties || []) {
      const roomId = String(duty?.room?._id || '')
      const functionaryId = String(duty?.functionary?._id || '')
      const functionary2Id = String(duty?.functionary2?._id || '')
      if (roomId && functionaryId) nextAssignments[roomId] = functionaryId
      if (roomId && functionary2Id) nextAssignmentsSecond[roomId] = functionary2Id
    }
    setRoomAssignmentsByDate((prev) => ({
      ...prev,
      [selectedRoomDate]: nextAssignments,
    }))
    setRoomAssignmentsByDateSecond((prev) => ({
      ...prev,
      [selectedRoomDate]: nextAssignmentsSecond,
    }))
    setRoomCandidateSchoolCodesByDate((prev) => ({
      ...prev,
      [selectedRoomDate]: response?.roomCandidateSchoolCodes || {},
    }))
    setRoomSubjectCodesByDate((prev) => ({
      ...prev,
      [selectedRoomDate]: response?.roomSubjectCodes || {},
    }))
    setRoomRollNumbersByDate((prev) => ({
      ...prev,
      [selectedRoomDate]: response?.roomRollNumbers || {},
    }))
  }, [activeTab, selectedRoomDate, dailyDutiesData])

  useEffect(() => {
    if (activeTab !== 'ASI' || !selectedRoomDate) return
    const assignmentsForDate = roomAssignmentsByDate[selectedRoomDate] || {}
    const secondAssignmentsForDate = roomAssignmentsByDateSecond[selectedRoomDate] || {}
    let changed = false
    const nextAssignments = { ...assignmentsForDate }
    const nextSecondAssignments = { ...secondAssignmentsForDate }

    for (const room of allocatedRoomsForSelectedDate) {
      const roomId = String(room?._id || '')
      const assignedFunctionaryId = String(assignmentsForDate[roomId] || '').trim()
      const assignedFunctionary2Id = String(secondAssignmentsForDate[roomId] || '').trim()
      if (!roomId) continue
      if (assignedFunctionaryId && !isInvigilatorAllowedForRoom(roomId, assignedFunctionaryId, selectedRoomDate)) {
        delete nextAssignments[roomId]
        changed = true
      }
      if (assignedFunctionary2Id && !isInvigilatorAllowedForRoom(roomId, assignedFunctionary2Id, selectedRoomDate)) {
        delete nextSecondAssignments[roomId]
        changed = true
      }
      if (assignedFunctionaryId && assignedFunctionary2Id && assignedFunctionaryId === assignedFunctionary2Id) {
        delete nextSecondAssignments[roomId]
        changed = true
      }
    }

    if (changed) {
      setRoomAssignmentsByDate((prev) => ({
        ...prev,
        [selectedRoomDate]: nextAssignments,
      }))
      setRoomAssignmentsByDateSecond((prev) => ({
        ...prev,
        [selectedRoomDate]: nextSecondAssignments,
      }))
    }
  }, [
    activeTab,
    selectedRoomDate,
    roomAssignmentsByDate,
    roomAssignmentsByDateSecond,
    allocatedRoomsForSelectedDate,
    isInvigilatorAllowedForRoom,
  ])

  /* ── Save handler ── */
  const handleSaveFunctionaries = () => {
    saveSelectionsMutation.mutate(
      { dutyType: activeDutyType, selections: checkedDuties },
      {
        onSuccess: () => toast.success(`Selections saved for ${activeDutyType}`),
        onError: (err: any) =>
          toast.error(err?.response?.data?.message || 'Failed to save selections'),
      }
    )
  }

  const runAutoAssignmentForSelectedDate = useCallback(
    async (showSuccessToast = true) => {
      if (!selectedRoomDate) return false
      if (allocatedRoomsForSelectedDate.length === 0) return false

      const orderedFunctionaryIds = selectedInvigilatorsForDate
        .map((func) => String(func._id || '').trim())
        .filter(Boolean)

      const requiredForAuto = allocatedRoomsForSelectedDate.length * 2
      if (orderedFunctionaryIds.length < requiredForAuto) {
        toast.error(`Select at least ${requiredForAuto} invigilators for auto assignment`)
        return false
      }

      try {
        const response = await assignDailyDutiesMutation.mutateAsync({
          examDate: selectedRoomDate,
          functionaryIds: orderedFunctionaryIds,
          silent: true,
        })

        const nextAssignments: Record<string, string> = {}
        const nextAssignmentsSecond: Record<string, string> = {}
        for (const duty of response?.duties || []) {
          const roomId = String(duty?.room?._id || '')
          const functionaryId = String(duty?.functionary?._id || '')
          const functionary2Id = String(duty?.functionary2?._id || '')
          if (roomId && functionaryId) nextAssignments[roomId] = functionaryId
          if (roomId && functionary2Id) nextAssignmentsSecond[roomId] = functionary2Id
        }
        setRoomAssignmentsByDate((prev) => ({
          ...prev,
          [selectedRoomDate]: nextAssignments,
        }))
        setRoomAssignmentsByDateSecond((prev) => ({
          ...prev,
          [selectedRoomDate]: nextAssignmentsSecond,
        }))
        setRoomCandidateSchoolCodesByDate((prev) => ({
          ...prev,
          [selectedRoomDate]: response?.roomCandidateSchoolCodes || prev[selectedRoomDate] || {},
        }))
        setRoomSubjectCodesByDate((prev) => ({
          ...prev,
          [selectedRoomDate]: response?.roomSubjectCodes || prev[selectedRoomDate] || {},
        }))
        setRoomRollNumbersByDate((prev) => ({
          ...prev,
          [selectedRoomDate]: response?.roomRollNumbers || prev[selectedRoomDate] || {},
        }))

        if (showSuccessToast) {
          toast.success(`Auto-assigned invigilators for ${formatDateLabel(selectedRoomDate)}`)
        }
        return true
      } catch (error: any) {
        const details = error?.response?.data?.conflictDetails
        if (details && Array.isArray(details) && details.length > 0) {
          setReplacementTarget(null)
          setConflictDialogData(details)
          setExpandedConflictIdx(null)
          setShowConflictDialog(true)
        } else {
          toast.error(error?.response?.data?.message || 'Failed to auto-assign invigilators')
        }
        // Revert to manual mode on failure (silent to avoid duplicate toast)
        updateAllocationModeMutation.mutate({ mode: 'manual', silent: true })
        return false
      }
    },
    [
      selectedRoomDate,
      allocatedRoomsForSelectedDate,
      selectedInvigilatorsForDate,
      assignDailyDutiesMutation,
      updateAllocationModeMutation,
    ]
  )

  const handleReplaceConflictFunctionary = useCallback((fromFunctionaryId: string, toFunctionaryId: string) => {
    if (!selectedRoomDate || !fromFunctionaryId || !toFunctionaryId) return

    setCheckedDuties((prev) => {
      const next = { ...prev }
      delete next[`${fromFunctionaryId}::${selectedRoomDate}`]
      next[`${toFunctionaryId}::${selectedRoomDate}`] = true
      return next
    })

    const replacement = functionaryById[toFunctionaryId]
    const replaced = functionaryById[fromFunctionaryId]
    setReplacementTarget(null)
    setShowConflictDialog(false)
    setConflictDialogData(null)
    setExpandedConflictIdx(null)
    toast.success(`Replaced ${replaced?.name || 'functionary'} with ${replacement?.name || 'selected invigilator'}`)
  }, [selectedRoomDate, functionaryById])

  const handleModeChange = (mode: 'auto' | 'manual') => {
    if (mode === allocationMode) return
    if (mode === 'auto' && activeTab === 'ASI') {
      if (!selectedRoomDate) {
        toast.error('Select exam date first')
        return
      }
      if (selectedInvigilatorCountForRoomDate === 0) {
        toast.error('No functionaries selected for the date.')
        return
      }
      if (!canEnableAutoModeForDate) {
        toast.error(`Select invigilators to assign automatically for ${formatDateLabel(selectedRoomDate)}`)
        return
      }
    }
    updateAllocationModeMutation.mutate({ mode, silent: true }, {
      onSuccess: async (savedMode) => {
        if (savedMode === 'auto' && activeTab === 'ASI') {
          const ok = await runAutoAssignmentForSelectedDate(true)
          if (!ok) {
            // Auto assignment failed; revert is handled inside runAutoAssignmentForSelectedDate
          }
        }
      },
      onError: () => {
        toast.error('Failed to update duty allocation mode')
      },
    })
  }

  const handleRoomAssignmentChange = useCallback((roomId: string, functionaryId: string) => {
    if (!selectedRoomDate) return
    if (functionaryId) {
      const conflict = getRoomSubjectConflict(roomId, functionaryId, selectedRoomDate)
      if (conflict) {
        toast.error(
          `Subject teacher cannot be on invigilation duty in this room. ${conflict.functionaryName} matches ${conflict.conflictingCodes.join(', ')}`
        )
        return
      }
      const roomSchoolConflict = getRoomSchoolConflict(roomId, functionaryId, selectedRoomDate)
      if (roomSchoolConflict) {
        toast.error(
          `Invigilator cannot be of candidate school. ${roomSchoolConflict.functionaryName} (school code: ${roomSchoolConflict.schoolCode}) matches candidates in this room. Check candidate data if incorrect.`
        )
        return
      }
      const candidateOverlap = getCandidateOverlapConflict(roomId, functionaryId, selectedRoomDate)
      if (candidateOverlap) {
        toast(`Candidate overlap: ${candidateOverlap.functionaryName} already supervised candidate ${candidateOverlap.overlappingRollNo} on a previous date.`, { icon: '⚠️' })
      }
    }
    setRoomAssignmentsByDate((prev) => ({
      ...prev,
      [selectedRoomDate]: {
        ...(prev[selectedRoomDate] || {}),
        [roomId]: functionaryId,
      },
    }))
  }, [selectedRoomDate, getRoomSubjectConflict, getRoomSchoolConflict, getCandidateOverlapConflict])

  const handleRoomAssignmentSecondChange = useCallback((roomId: string, functionaryId: string) => {
    if (!selectedRoomDate) return
    const assignedFirst = String(roomAssignmentsByDate[selectedRoomDate]?.[roomId] || '').trim()
    if (functionaryId && assignedFirst && functionaryId === assignedFirst) {
      toast.error('Invigilator 1 and Invigilator 2 cannot be same for a room')
      return
    }
    if (functionaryId) {
      const conflict = getRoomSubjectConflict(roomId, functionaryId, selectedRoomDate)
      if (conflict) {
        toast.error(
          `Subject teacher cannot be on invigilation duty in this room. ${conflict.functionaryName} matches ${conflict.conflictingCodes.join(', ')}`
        )
        return
      }
      const roomSchoolConflict = getRoomSchoolConflict(roomId, functionaryId, selectedRoomDate)
      if (roomSchoolConflict) {
        toast.error(
          `Invigilator cannot be of candidate school. ${roomSchoolConflict.functionaryName} (school code: ${roomSchoolConflict.schoolCode}) matches candidates in this room. Check candidate data if incorrect.`
        )
        return
      }
      const candidateOverlap = getCandidateOverlapConflict(roomId, functionaryId, selectedRoomDate)
      if (candidateOverlap) {
        toast(`Candidate overlap: ${candidateOverlap.functionaryName} already supervised candidate ${candidateOverlap.overlappingRollNo} on a previous date.`, { icon: '⚠️' })
      }
    }
    setRoomAssignmentsByDateSecond((prev) => ({
      ...prev,
      [selectedRoomDate]: {
        ...(prev[selectedRoomDate] || {}),
        [roomId]: functionaryId,
      },
    }))
  }, [selectedRoomDate, roomAssignmentsByDate, getRoomSubjectConflict, getRoomSchoolConflict, getCandidateOverlapConflict])

  const selectedRoomDateIndex = useMemo(() => {
    if (!selectedRoomDate) return -1
    return examDates.indexOf(selectedRoomDate)
  }, [examDates, selectedRoomDate])

  const canGoToPreviousRoomDate = selectedRoomDateIndex > 0
  const canGoToNextRoomDate = selectedRoomDateIndex >= 0 && selectedRoomDateIndex < examDates.length - 1

  const goToPreviousRoomDate = () => {
    if (!canGoToPreviousRoomDate) return
    setSelectedRoomDate(examDates[selectedRoomDateIndex - 1])
  }

  const goToNextRoomDate = () => {
    if (!canGoToNextRoomDate) return
    setSelectedRoomDate(examDates[selectedRoomDateIndex + 1])
  }

  const handleSaveRoomAssignments = async () => {
    if (!selectedRoomDate) {
      toast.error('Select exam date first')
      return
    }
    if (allocatedRoomsForSelectedDate.length === 0) {
      toast.error('No allocated rooms found for selected date')
      return
    }

    let orderedFunctionaryIds: string[] = []
    let orderedSecondFunctionaryIds: string[] = []
    if (allocationMode === 'auto') {
      await runAutoAssignmentForSelectedDate(true)
      return
    } else {
      const assignmentsForDate = roomAssignmentsByDate[selectedRoomDate] || {}
      const secondAssignmentsForDate = roomAssignmentsByDateSecond[selectedRoomDate] || {}
      orderedFunctionaryIds = allocatedRoomsForSelectedDate.map((room) => String(assignmentsForDate[room._id] || '').trim())
      orderedSecondFunctionaryIds = allocatedRoomsForSelectedDate.map((room) =>
        String(secondAssignmentsForDate[room._id] || '').trim()
      )

      if (orderedFunctionaryIds.some((value) => !value) || orderedSecondFunctionaryIds.some((value) => !value)) {
        toast.error('Assign both invigilators for each room')
        return
      }

      const hasSameInRoom = orderedFunctionaryIds.some((firstId, index) => firstId === orderedSecondFunctionaryIds[index])
      if (hasSameInRoom) {
        toast.error('Invigilator 1 and Invigilator 2 cannot be same for any room')
        return
      }

      const uniqueFunctionaryIds = new Set([...orderedFunctionaryIds, ...orderedSecondFunctionaryIds])
      if (uniqueFunctionaryIds.size !== orderedFunctionaryIds.length + orderedSecondFunctionaryIds.length) {
        toast.error('One invigilator cannot be assigned to multiple rooms on same date')
        return
      }

    }

    try {
      const response = await assignDailyDutiesMutation.mutateAsync({
        examDate: selectedRoomDate,
        functionaryIds: orderedFunctionaryIds,
        secondFunctionaryIds: orderedSecondFunctionaryIds,
      })

      const nextAssignments: Record<string, string> = {}
      const nextAssignmentsSecond: Record<string, string> = {}
      for (const duty of response?.duties || []) {
        const roomId = String(duty?.room?._id || '')
        const functionaryId = String(duty?.functionary?._id || '')
        const functionary2Id = String(duty?.functionary2?._id || '')
        if (roomId && functionaryId) nextAssignments[roomId] = functionaryId
        if (roomId && functionary2Id) nextAssignmentsSecond[roomId] = functionary2Id
      }
      setRoomAssignmentsByDate((prev) => ({
        ...prev,
        [selectedRoomDate]: nextAssignments,
      }))
      setRoomAssignmentsByDateSecond((prev) => ({
        ...prev,
        [selectedRoomDate]: nextAssignmentsSecond,
      }))
      setRoomCandidateSchoolCodesByDate((prev) => ({
        ...prev,
        [selectedRoomDate]: response?.roomCandidateSchoolCodes || prev[selectedRoomDate] || {},
      }))
      setRoomSubjectCodesByDate((prev) => ({
        ...prev,
        [selectedRoomDate]: response?.roomSubjectCodes || prev[selectedRoomDate] || {},
      }))
      setRoomRollNumbersByDate((prev) => ({
        ...prev,
        [selectedRoomDate]: response?.roomRollNumbers || prev[selectedRoomDate] || {},
      }))

      toast.success(`Room assignments saved for ${formatDateLabel(selectedRoomDate)}`)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to save room assignments')
    }
  }

  const handleDownloadRoomAssignments = async () => {
    if (!selectedRoomDate) {
      toast.error('Select exam date first')
      return
    }
    setLoadingDutyPdfPreview(true)
    try {
      const rawBlob = await dutiesService.downloadFunctionaryDutyRecord(selectedRoomDate)
      if (!rawBlob || rawBlob.size === 0) {
        toast.error('Generated file is empty. Please try again.')
        return
      }

      const blobType = String(rawBlob.type || '').toLowerCase()
      if (blobType.includes('application/json') || blobType.includes('text/plain') || blobType.includes('text/html')) {
        const rawText = await rawBlob.text()
        let message = 'Unable to generate PDF preview.'
        try {
          const parsed = JSON.parse(rawText)
          message = parsed?.message || parsed?.error || message
        } catch {
          if (rawText?.trim()) message = rawText
        }
        toast.error(message)
        return
      }

      const pdfBlob = rawBlob.type === 'application/pdf'
        ? rawBlob
        : new Blob([rawBlob], { type: 'application/pdf' })
      const objectUrl = URL.createObjectURL(pdfBlob)
      setDutyPdfPageCount(0)
      setDutyPdfRenderError(null)
      setDutyPdfPreviewUrl((previousUrl) => {
        if (previousUrl) URL.revokeObjectURL(previousUrl)
        return objectUrl
      })
      setShowDutyPdfPreview(true)
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to generate duty record preview')
    } finally {
      setLoadingDutyPdfPreview(false)
    }
  }

  /* ────────── render ────────── */

  const countClass = (assigned: number, max: number) =>
    cx('cx-duty-count', max > 0 && (assigned > max ? 'is-over' : assigned === max ? 'is-met' : 'is-short'))

  const totalAssignedForTab = examDates.reduce((sum, dk) => sum + (checkedCountByDate[dk] || 0), 0)
  const totalMaxForTab = examDates.reduce((sum, dk) => {
    const roomsCount = Number(requiredRoomsByDate[dk] || 0)
    const candidates = Number(candidatesByDate[dk] || 0)
    return sum + computeMaxDuties(activeTab, roomsCount, candidates)
  }, 0)

  type RoomRow = {
    room: Room
    firstId: string
    secondId: string
    first?: Teacher
    second?: Teacher
    firstAllowed: boolean
    secondAllowed: boolean
    firstOptions: Teacher[]
    secondOptions: Teacher[]
  }

  const roomRows: RoomRow[] =
    activeTab === 'ASI'
      ? allocatedRoomsForSelectedDate.map((room) => {
          const selectedFunctionaryId = roomAssignmentsByDate[selectedRoomDate]?.[room._id] || ''
          const selectedFunctionarySecondId = roomAssignmentsByDateSecond[selectedRoomDate]?.[room._id] || ''
          const selectedFunctionary = functionaryById[selectedFunctionaryId]
          const selectedFunctionarySecond = functionaryById[selectedFunctionarySecondId]
          const selectedFunctionaryAllowed =
            isCurrentInvigilator(selectedFunctionary) &&
            (allocationMode === 'manual' || isInvigilatorAllowedForRoom(room._id, selectedFunctionaryId, selectedRoomDate))
          const selectedFunctionarySecondAllowed =
            isCurrentInvigilator(selectedFunctionarySecond) &&
            (allocationMode === 'manual' || isInvigilatorAllowedForRoom(room._id, selectedFunctionarySecondId, selectedRoomDate))
          const remainingForFirst = getRemainingInvigilatorIdsForSlot(selectedRoomDate, room._id, 'first')
          const remainingForSecond = getRemainingInvigilatorIdsForSlot(selectedRoomDate, room._id, 'second')

          const options = [...roomDropdownInvigilators].filter((func) => {
            const candidateId = String(func._id || '').trim()
            if (!candidateId) return false
            if (!remainingForFirst.has(candidateId)) return false
            if (candidateId === String(selectedFunctionarySecondId || '').trim()) return false
            if (allocationMode !== 'manual' && !isInvigilatorAllowedForRoom(room._id, candidateId, selectedRoomDate)) return false
            if (isFunctionaryAssignedElsewhere(selectedRoomDate, candidateId, room._id, 'first')) return false
            return true
          })

          const secondOptions = [...roomDropdownInvigilators].filter((func) => {
            const candidateId = String(func._id || '').trim()
            if (!candidateId) return false
            if (!remainingForSecond.has(candidateId)) return false
            if (candidateId === String(selectedFunctionaryId || '').trim()) return false
            if (allocationMode !== 'manual' && !isInvigilatorAllowedForRoom(room._id, candidateId, selectedRoomDate)) return false
            if (isFunctionaryAssignedElsewhere(selectedRoomDate, candidateId, room._id, 'second')) return false
            return true
          })
          if (
            selectedFunctionaryId &&
            selectedFunctionary &&
            selectedFunctionaryAllowed &&
            !isFunctionaryAssignedElsewhere(selectedRoomDate, selectedFunctionaryId, room._id, 'first') &&
            !options.some((func) => func._id === selectedFunctionaryId)
          ) {
            options.push(selectedFunctionary)
          }
          if (
            selectedFunctionarySecondId &&
            selectedFunctionarySecond &&
            String(selectedFunctionarySecondId) !== String(selectedFunctionaryId) &&
            selectedFunctionarySecondAllowed &&
            !isFunctionaryAssignedElsewhere(selectedRoomDate, selectedFunctionarySecondId, room._id, 'second') &&
            !secondOptions.some((func) => func._id === selectedFunctionarySecondId)
          ) {
            secondOptions.push(selectedFunctionarySecond)
          }

          return {
            room,
            firstId: selectedFunctionaryId,
            secondId: selectedFunctionarySecondId,
            first: selectedFunctionary,
            second: selectedFunctionarySecond,
            firstAllowed: selectedFunctionaryAllowed,
            secondAllowed: selectedFunctionarySecondAllowed,
            firstOptions: options,
            secondOptions,
          }
        })
      : []

  const invigilatorOptions = (
    selectedId: string,
    selected: Teacher | undefined,
    allowed: boolean,
    list: Teacher[]
  ): SelectOption[] => [
    ...(selectedId && selected && !allowed
      ? [{ value: selectedId, label: `${selected.name || ''} (stored assignment no longer valid)`, disabled: true }]
      : []),
    ...list.map((func) => ({ value: String(func._id), label: String(func.name || '') })),
  ]

  const roomColumns: DataTableColumn<RoomRow>[] = [
    {
      key: 'room',
      header: 'Room',
      mobile: 'title',
      render: ({ room }) => (
        <span className="cb-strong">
          {room.roomNo}
          {room.roomName ? ` · ${room.roomName}` : ''}
        </span>
      ),
    },
    {
      key: 'first',
      header: 'Invigilator 1',
      interactive: true,
      render: (row) => (
        <Select
          size="sm"
          aria-label={`Invigilator 1 for room ${row.room.roomNo}`}
          value={row.firstId}
          onChange={(e) => handleRoomAssignmentChange(row.room._id, e.target.value)}
          disabled={loadingRoomAssignments || allocationMode === 'auto'}
          title={
            allocationMode === 'auto'
              ? `Auto mode: invigilator is assigned by system for room ${row.room.roomNo}`
              : `Assign invigilator for room ${row.room.roomNo}`
          }
          placeholder="Select invigilator"
          options={invigilatorOptions(row.firstId, row.first, row.firstAllowed, row.firstOptions)}
        />
      ),
    },
    {
      key: 'firstId',
      header: 'OASIS ID',
      mobile: 'hidden',
      render: ({ first }) => <span className="cb-muted">{first?.oasisId || first?.employeeId || '—'}</span>,
    },
    {
      key: 'second',
      header: 'Invigilator 2',
      interactive: true,
      render: (row) => (
        <Select
          size="sm"
          aria-label={`Invigilator 2 for room ${row.room.roomNo}`}
          value={row.secondId}
          onChange={(e) => handleRoomAssignmentSecondChange(row.room._id, e.target.value)}
          disabled={loadingRoomAssignments || allocationMode === 'auto'}
          title={`Invigilator 2 for room ${row.room.roomNo}`}
          placeholder="Select invigilator"
          options={invigilatorOptions(row.secondId, row.second, row.secondAllowed, row.secondOptions)}
        />
      ),
    },
    {
      key: 'secondId',
      header: 'OASIS ID',
      mobile: 'hidden',
      render: ({ second }) => <span className="cb-muted">{second?.oasisId || second?.employeeId || '—'}</span>,
    },
  ]

  const previewRooms = (
    allocatedRoomsForSelectedDate.length > 0
      ? allocatedRoomsForSelectedDate
      : Array.from({ length: 10 }).map(
          (_, i) =>
            ({
              _id: `preview-${i}`,
              roomNo: `${i + 1}`,
              roomName: '',
              floor: '',
            }) as Room
        )
  ).slice(0, 14)

  const orientationLabel = functionaryDutyListFormat.orientation === 'landscape' ? 'Landscape' : 'Portrait'

  const resizableHeader = (label: string, boundaryIndex: number, extra?: { rowSpan?: number }) => (
    <th rowSpan={extra?.rowSpan}>
      {label}
      <div
        className="cx-duty-sheet__grip"
        onMouseDown={(event) => startDutyListColumnResize(boundaryIndex, event)}
        title="Drag to resize column"
      />
    </th>
  )

  const closeConflictDialog = () => {
    setShowConflictDialog(false)
    setConflictDialogData(null)
    setExpandedConflictIdx(null)
    setReplacementTarget(null)
  }

  return (
    <Page width="full">
      <Card flush title="Duties by date" subtitle="Tick who is on duty for each exam date, then save the selection.">
        <div className="cx-duty-tabs">
          <Tabs
            label="Duty type"
            value={activeTab}
            onChange={(id) => {
              setActiveTab(id)
              setSearch('')
            }}
            items={DUTY_TABS.map((tab) => {
              const count = tabCounts[tab.key] || 0
              return {
                id: tab.key,
                label: <span title={tab.dutyType}>{tab.key === 'ASI' ? 'ASI · Invigilators' : tab.label}</span>,
                count: count > 0 ? count : undefined,
              }
            })}
          />
        </div>
        <CardToolbar>
          <FilterBar
            search={{ placeholder: 'Search functionaries', value: search, onChange: setSearch, label: 'Search functionaries' }}
            filters={<span className="cb-muted">{activeDutyType}</span>}
            actions={
              <Button
                variant="primary"
                icon={Save}
                loading={isSaving}
                disabled={filteredFunctionaries.length === 0 || examDates.length === 0}
                onClick={handleSaveFunctionaries}
              >
                Save selection
              </Button>
            }
          />
        </CardToolbar>

        {loadingTeachers ? (
          <div className="cb-table-state" role="status">
            <span className="cb-spinner" aria-hidden="true" />
            Loading functionaries…
          </div>
        ) : (
          <>
            <div className="cx-duty-matrix" ref={dutiesTableRef}>
              <table>
                <thead>
                  <tr>
                    <th scope="col" className="is-pin is-pin-1">
                      #
                    </th>
                    <th scope="col" className="is-pin is-pin-2">
                      Functionary
                    </th>
                    <th
                      scope="col"
                      className="is-pin is-pin-3"
                      aria-sort={
                        invigilatorDutySort === 'asc' ? 'ascending' : invigilatorDutySort === 'desc' ? 'descending' : 'none'
                      }
                    >
                      <button
                        type="button"
                        className="cx-duty-matrix__sort"
                        onClick={() =>
                          setInvigilatorDutySort((prev) => (prev === 'none' ? 'desc' : prev === 'desc' ? 'asc' : 'none'))
                        }
                      >
                        Duties
                        <Icon
                          icon={invigilatorDutySort === 'asc' ? ArrowUp : invigilatorDutySort === 'desc' ? ArrowDown : ArrowUpDown}
                          size={12}
                        />
                      </button>
                    </th>
                    <th scope="col" className="is-pin is-pin-4">
                      OASIS ID
                    </th>
                    {examDates.map((dateKey) => (
                      <th key={dateKey} scope="col" data-date={dateKey}>
                        {formatDateLabel(dateKey)}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th colSpan={2} className="is-pin is-pin-12">
                      {getMaxRowLabel(activeTab)}
                    </th>
                    <th colSpan={2} className="is-pin is-pin-34">
                      <span className={countClass(totalAssignedForTab, totalMaxForTab)}>
                        {totalAssignedForTab}/{totalMaxForTab}
                      </span>
                    </th>
                    {examDates.map((dateKey) => {
                      const roomsForDate = Number(requiredRoomsByDate[dateKey] || 0)
                      const candidatesForDate = Number(candidatesByDate[dateKey] || 0)
                      const maxDuties = computeMaxDuties(activeTab, roomsForDate, candidatesForDate)
                      const checked = checkedCountByDate[dateKey] || 0
                      return (
                        <th key={`max-${dateKey}`}>
                          <span className={countClass(checked, maxDuties)}>
                            {checked}/{maxDuties}
                          </span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredFunctionaries.map((func, index) => (
                    <tr key={func._id}>
                      <td className="is-pin is-pin-1">{index + 1}</td>
                      <td className="is-pin is-pin-2" title={func.name}>
                        {func.name}
                      </td>
                      <td className="is-pin is-pin-3">{checkedCountByFunctionary[func._id] || 0}</td>
                      <td className="is-pin is-pin-4">
                        {activeTab === 'CL4' ? 'N/A' : func.oasisId || func.employeeId || '—'}
                      </td>
                      {examDates.map((dateKey) => {
                        const key = `${func._id}::${dateKey}`
                        const isChecked = !!checkedDuties[key]
                        const roomsForDate = Number(requiredRoomsByDate[dateKey] || 0)
                        const candidatesForDate = Number(candidatesByDate[dateKey] || 0)
                        const maxDuties = computeMaxDuties(activeTab, roomsForDate, candidatesForDate)
                        const dateCheckedCount = checkedCountByDate[dateKey] || 0
                        const maxReached = dateCheckedCount >= maxDuties && maxDuties > 0
                        const isDisabled = maxReached && !isChecked
                        return (
                          <td
                            key={key}
                            title={
                              isDisabled
                                ? `Maximum ${maxDuties} reached for ${formatDateLabel(dateKey)}`
                                : `${func.name} - ${formatDateLabel(dateKey)}`
                            }
                          >
                            <Checkbox
                              checked={isChecked}
                              disabled={isDisabled}
                              onChange={() => toggleDuty(func._id, dateKey)}
                              aria-label={`${func.name} on ${formatDateLabel(dateKey)}`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredFunctionaries.length === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title={allFunctionaries.length === 0 ? 'No exam functionaries yet' : `No one is set up as ${activeDutyType}`}
                body={
                  allFunctionaries.length === 0
                    ? 'Add exam functionaries first, then pick their duties here.'
                    : 'Assign duty types on the Exam functionaries page.'
                }
              />
            ) : null}
          </>
        )}
      </Card>

      {activeTab === 'ASI' && (
        <>
          <Card
            flush
            title="Invigilators by room"
            subtitle="Place the selected invigilators in rooms for one exam date. Auto assignment applies here."
          >
            <CardToolbar>
              <FilterBar
                filters={
                  <>
                    <div className="cx-duty-date">
                      <Button
                        variant="tertiary"
                        size="sm"
                        icon={ChevronLeft}
                        aria-label="Previous exam date"
                        title="Previous exam date"
                        onClick={goToPreviousRoomDate}
                        disabled={!canGoToPreviousRoomDate}
                      />
                      <span className="cx-duty-date__label">
                        {selectedRoomDate ? formatDateLabel(selectedRoomDate) : '—'}
                      </span>
                      <Button
                        variant="tertiary"
                        size="sm"
                        icon={ChevronRight}
                        aria-label="Next exam date"
                        title="Next exam date"
                        onClick={goToNextRoomDate}
                        disabled={!canGoToNextRoomDate}
                      />
                    </div>
                    <Switch
                      label="Auto assign"
                      checked={allocationMode === 'auto'}
                      onChange={(on) => handleModeChange(on ? 'auto' : 'manual')}
                      disabled={loadingAllocationMode}
                    />
                  </>
                }
                actions={
                  <>
                    <Button
                      icon={FileText}
                      onClick={handleDownloadRoomAssignments}
                      loading={loadingDutyPdfPreview}
                      disabled={!selectedRoomDate || loadingRoomAssignments}
                    >
                      Preview duty record
                    </Button>
                    {allocationMode !== 'auto' && (
                      <Button
                        variant="primary"
                        icon={Save}
                        onClick={handleSaveRoomAssignments}
                        loading={savingRoomAssignments}
                        disabled={!selectedRoomDate || loadingRoomAssignments}
                      >
                        Save rooms
                      </Button>
                    )}
                  </>
                }
              />
            </CardToolbar>
            {allocatedRoomsForSelectedDate.length > 0 && allocationMode === 'auto' ? (
              <div className="cx-duty-banner">
                <Banner tone="info">Auto assignment is on. The system places invigilators in rooms when the selection is saved.</Banner>
              </div>
            ) : null}
            {allocatedRoomsForSelectedDate.length > 0 &&
            allocationMode === 'manual' &&
            roomDropdownInvigilators.length === 0 ? (
              <div className="cx-duty-banner">
                <Banner tone="warning">
                  No invigilators are selected for this date. Tick them in the ASI tab above first.
                </Banner>
              </div>
            ) : null}
            <DataTable
              caption="Invigilators by room"
              columns={roomColumns}
              rows={roomRows}
              getRowKey={(row) => row.room._id}
              loading={loadingRoomAssignments && roomRows.length === 0}
              loadingLabel="Loading room assignments…"
              empty={<EmptyState compact icon={DoorOpen} title="No rooms are allotted for this date" />}
            />
          </Card>

          <Card
            flush
            title="Duty record layout"
            subtitle="Drag a column edge to set its width on the printed record. Widths save on their own."
            action={
              <Badge tone="neutral">
                {functionaryDutyListFormat.pageSize} · {orientationLabel}
              </Badge>
            }
          >
            <PaperStage flush>
              <div className="cx-duty-record">
                <Paper pageSize="A4" orientation={functionaryDutyListFormat.orientation} caption>
                  <div className="cx-duty-sheet">
                    <div className="cx-duty-sheet__row">
                      <span>Centre No:&nbsp; ________</span>
                      <span>Centre Name:&nbsp; ______________________________</span>
                      <span>Date:&nbsp; __.__.__</span>
                    </div>
                    <div className="cx-duty-sheet__title">Exam Functionaries Duties Record (2025-26)</div>
                    <div className="cx-duty-sheet__row">
                      <span>Centre Superintendent: _______________________</span>
                      <span>Deputy Centre Superintendent: _______________________</span>
                    </div>

                    <table>
                      <colgroup>
                        <col width={`${dutyListPreviewColumnPercentages.srNo}%`} />
                        <col width={`${dutyListPreviewColumnPercentages.roomNo}%`} />
                        <col width={`${dutyListPreviewColumnPercentages.roomName}%`} />
                        <col width={`${dutyListPreviewColumnPercentages.floor}%`} />
                        <col width={`${dutyListPreviewColumnPercentages.inv1School}%`} />
                        <col width={`${dutyListPreviewColumnPercentages.inv1Teacher}%`} />
                        <col width={`${dutyListPreviewColumnPercentages.inv1TeacherId}%`} />
                        <col width={`${dutyListPreviewColumnPercentages.inv1Signature}%`} />
                        <col width={`${dutyListPreviewColumnPercentages.inv2School}%`} />
                        <col width={`${dutyListPreviewColumnPercentages.inv2Teacher}%`} />
                        <col width={`${dutyListPreviewColumnPercentages.inv2TeacherId}%`} />
                        <col width={`${dutyListPreviewColumnPercentages.inv2Signature}%`} />
                      </colgroup>
                      <thead>
                        <tr>
                          {resizableHeader('Sr No', 0, { rowSpan: 2 })}
                          {resizableHeader('Room No', 1, { rowSpan: 2 })}
                          {resizableHeader('Room Name', 2, { rowSpan: 2 })}
                          {resizableHeader('Floor', 3, { rowSpan: 2 })}
                          <th colSpan={4}>Invigilator 1</th>
                          <th colSpan={4}>Invigilator 2</th>
                        </tr>
                        <tr>
                          {resizableHeader('School', 4)}
                          {resizableHeader('Invigilator Name', 5)}
                          {resizableHeader('OASIS ID', 6)}
                          {resizableHeader('Signature', 7)}
                          {resizableHeader('School', 8)}
                          {resizableHeader('Invigilator Name', 9)}
                          {resizableHeader('OASIS ID', 10)}
                          <th>Signature</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRooms.map((room, idx) => {
                          const assignedFunctionaryId = String(roomAssignmentsByDate[selectedRoomDate]?.[room._id] || '')
                          const invigilator = functionaryById[assignedFunctionaryId]
                          return (
                            <tr key={room._id || `row-${idx}`}>
                              <td className="is-center">{idx + 1}</td>
                              <td className="is-center">{room.roomNo || ''}</td>
                              <td>{room.roomName || ''}</td>
                              <td>{room.floor || ''}</td>
                              <td>{getSchoolInitials(invigilator)}</td>
                              <td>{String(invigilator?.name || '').toUpperCase()}</td>
                              <td>{invigilator?.oasisId || invigilator?.employeeId || ''}</td>
                              <td />
                              <td>{getSchoolInitials(invigilator)}</td>
                              <td>{String(invigilator?.name || '').toUpperCase()}</td>
                              <td>{invigilator?.oasisId || invigilator?.employeeId || ''}</td>
                              <td />
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>

                    <div className="cx-duty-sheet__foot">
                      <div>
                        <strong>Frisking Duty</strong>
                        <p>1 ___________________________</p>
                        <p>2 ___________________________</p>
                      </div>
                      <div>
                        <strong>CCTV Invigilation</strong>
                        <p>1 ___________________________</p>
                        <p>2 ___________________________</p>
                      </div>
                      <div>
                        <strong>Class IV Duty</strong>
                        <p>1 ___________________&nbsp;&nbsp;&nbsp; 2 ___________________</p>
                        <p>3 ___________________</p>
                      </div>
                    </div>

                    <div className="cx-duty-sheet__sign">Centre Superintendent</div>
                  </div>
                </Paper>
              </div>
            </PaperStage>
          </Card>
        </>
      )}

      <Sheet
        open={showDutyPdfPreview && !!dutyPdfPreviewUrl}
        onClose={closeDutyPdfPreview}
        size="xl"
        icon={FileText}
        title="Duty record preview"
        description={selectedRoomDate ? `Exam functionary duty record for ${formatDateLabel(selectedRoomDate)}` : undefined}
        footer={
          dutyPdfPreviewUrl ? (
            <>
              <Button onClick={closeDutyPdfPreview}>Close</Button>
              <Button icon={ExternalLink} onClick={() => window.open(dutyPdfPreviewUrl, '_blank', 'noopener,noreferrer')}>
                Open in new tab
              </Button>
              <Button
                variant="primary"
                icon={Download}
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = dutyPdfPreviewUrl
                  link.download = `exam-functionary-duty-record-${selectedRoomDate}.pdf`
                  link.click()
                }}
              >
                Download PDF
              </Button>
            </>
          ) : null
        }
      >
        {dutyPdfPreviewUrl ? (
          <PaperStage
            className="cx-duty-pdf"
            state={
              dutyPdfRenderError ? (
                <EmptyState
                  icon={AlertCircle}
                  title="The preview couldn’t be shown"
                  body={dutyPdfRenderError}
                />
              ) : undefined
            }
          >
            <Document
              file={dutyPdfPreviewUrl}
              className={PAPER_PAGES_CLASS}
              loading={
                <div className="cb-table-state" role="status">
                  <span className="cb-spinner" aria-hidden="true" />
                  Loading PDF preview…
                </div>
              }
              onLoadSuccess={({ numPages }) => {
                setDutyPdfPageCount(numPages)
                setDutyPdfRenderError(null)
              }}
              onLoadError={(error) => {
                console.error('Failed to render duty PDF preview:', error)
                const message = (error as Error)?.message || 'Unknown PDF render error'
                setDutyPdfRenderError(`Failed to render preview in dialog (${message}). Use "Open in new tab" or "Download PDF".`)
              }}
            >
              {Array.from({ length: dutyPdfPageCount }).map((_, index) => (
                <PdfPage
                  key={`duty-preview-page-${index + 1}`}
                  pageNumber={index + 1}
                  width={dutyPdfPageWidth()}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
              ))}
            </Document>
          </PaperStage>
        ) : null}
      </Sheet>

      {/* ── Conflict diagnostics dialog ── */}
      <Dialog
        open={showConflictDialog && !!conflictDialogData}
        onClose={closeConflictDialog}
        tone="danger"
        size="lg"
        title="Auto assignment failed"
        description="No valid assignment exists for this date. Open a functionary to see which rooms conflict."
        footer={<Button onClick={closeConflictDialog}>Close</Button>}
      >
        {conflictDialogData && (
          <>
            <div className="cx-duty-scroll">
              <table className="cx-duty-conflicts">
                <thead>
                  <tr>
                    <th scope="col">Functionary</th>
                    <th scope="col">OASIS ID</th>
                    <th scope="col">School</th>
                    <th scope="col">Eligible rooms</th>
                    <th scope="col" className="is-end">
                      <span className="cb-visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {conflictDialogData.map((entry, idx) => {
                    const isExpanded = expandedConflictIdx === idx
                    const hasConflicts = (entry.ineligibleRooms?.length ?? 0) > 0
                    const eligibleTone =
                      entry.eligibleRoomCount === entry.totalRooms
                        ? 'success'
                        : entry.eligibleRoomCount === 0
                          ? 'danger'
                          : 'warning'
                    return (
                      <React.Fragment key={idx}>
                        <tr
                          className={cx(hasConflicts && 'is-expandable', isExpanded && 'is-open')}
                          onClick={() => hasConflicts && setExpandedConflictIdx(isExpanded ? null : idx)}
                        >
                          <td className="cb-strong">{entry.name || '—'}</td>
                          <td className="is-num cb-muted">{entry.employeeId || '—'}</td>
                          <td className="cb-muted">{entry.schoolCode || '—'}</td>
                          <td>
                            <Badge tone={eligibleTone}>
                              {entry.eligibleRoomCount}/{entry.totalRooms} eligible
                            </Badge>
                          </td>
                          <td className="is-end">
                            {entry._id && hasConflicts ? (
                              <Button
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setReplacementTarget(entry)
                                }}
                              >
                                Replace
                              </Button>
                            ) : null}
                            {hasConflicts ? (
                              <Button
                                variant="tertiary"
                                size="sm"
                                icon={isExpanded ? ChevronDown : ChevronRight}
                                aria-label={isExpanded ? 'Hide conflicting rooms' : 'Show conflicting rooms'}
                                aria-expanded={isExpanded}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setExpandedConflictIdx(isExpanded ? null : idx)
                                }}
                              />
                            ) : null}
                          </td>
                        </tr>
                        {isExpanded && hasConflicts && (
                          <tr>
                            <td colSpan={5} className="cx-duty-conflicts__detail">
                              <div className="cx-duty-reasons">
                                {(entry.ineligibleRooms || []).map((room: ConflictRoom, rIdx: number) => (
                                  <div key={rIdx} className="cx-duty-reasons__room">
                                    <span>Room {room.roomNo}</span>
                                    <div className="cx-duty-reasons__list">
                                      {room.reasons.map((reason: ConflictReason, reasonIdx: number) => {
                                        if (reason.type === 'subject') {
                                          return (
                                            <Badge key={reasonIdx} tone="neutral">
                                              Subject: {(reason.codes || []).join(', ')}
                                            </Badge>
                                          )
                                        }
                                        if (reason.type === 'school') {
                                          return (
                                            <Badge key={reasonIdx} tone="neutral">
                                              Own school: {reason.schoolCode}
                                            </Badge>
                                          )
                                        }
                                        if (reason.type === 'candidateOverlap') {
                                          return (
                                            <Badge key={reasonIdx} tone="neutral">
                                              Candidate overlap: {(reason.rollNumbers || []).join(', ')}
                                              {(reason.totalOverlaps || 0) > 5 ? ` (+${(reason.totalOverlaps || 0) - 5} more)` : ''}
                                            </Badge>
                                          )
                                        }
                                        return null
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="cb-subtle">Mode switched back to manual. Add more functionaries or resolve the conflicts above.</p>
          </>
        )}
      </Dialog>

      <Dialog
        open={!!replacementTarget}
        onClose={() => setReplacementTarget(null)}
        size="lg"
        title={replacementTarget?.name ? `Replace ${replacementTarget.name}` : 'Replace functionary'}
        description="Only current ASI invigilators who aren’t already selected or placed for this date are listed."
        footer={<Button onClick={() => setReplacementTarget(null)}>Close</Button>}
      >
        {replacementCandidates.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title="No one is free to take this duty"
            body="No eligible ASI invigilators are available for replacement on this date."
          />
        ) : (
          <div className="cx-duty-scroll">
            <table className="cx-duty-conflicts">
              <thead>
                <tr>
                  <th scope="col">Functionary</th>
                  <th scope="col">OASIS ID</th>
                  <th scope="col">Eligible rooms</th>
                  <th scope="col" className="is-end">
                    <span className="cb-visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {replacementCandidates.map(({ functionary, eligibleRoomCount }) => (
                  <tr key={functionary._id}>
                    <td className="cb-strong">{functionary.name || '—'}</td>
                    <td className="is-num cb-muted">{functionary.employeeId || '—'}</td>
                    <td className="is-num cb-muted">
                      {eligibleRoomCount}/{allocatedRoomsForSelectedDate.length}
                    </td>
                    <td className="is-end">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() =>
                          handleReplaceConflictFunctionary(String(replacementTarget?._id || ''), String(functionary._id || ''))
                        }
                      >
                        Replace
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Dialog>
    </Page>
  )
}

export default Duties
