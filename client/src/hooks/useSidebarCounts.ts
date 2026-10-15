import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import { useSelector } from 'react-redux'
import { selectIsAuthenticated } from '../redux/slices/authSlice'
import answerSheetService from '../services/answerSheetService'
import candidateService from '../services/candidateService'
import datesheetService from '../services/datesheetService'
import { seatingPlanService } from '../services/seatingPlanService'
import subjectService from '../services/subjectService'
import teacherService from '../services/teacherService'

export type SidebarCount = number | null

export interface SidebarCounts {
  examFunctionaries: SidebarCount
  candidates: SidebarCount
  subjects: SidebarCount
  answerSheets: SidebarCount
  datesheetDays: SidebarCount
  rooms: SidebarCount
}

export interface SidebarCountsAccess {
  examFunctionaries: boolean
  candidates: boolean
  subjects: boolean
  answerSheets: boolean
  datesheetDays: boolean
  rooms: boolean
}

const EMPTY_COUNTS: SidebarCounts = {
  examFunctionaries: null,
  candidates: null,
  subjects: null,
  answerSheets: null,
  datesheetDays: null,
  rooms: null,
}

export const sidebarKeys = {
  all: ['sidebar'] as const,
  counts: (access: SidebarCountsAccess) => [...sidebarKeys.all, 'counts', access] as const,
}

const parseCount = (value: unknown): SidebarCount => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed
    }
  }

  return null
}

const getAnswerSheetRecordCount = (byType: unknown): SidebarCount => {
  if (!Array.isArray(byType)) {
    return null
  }

  return byType.reduce((sum: number, entry: unknown) => {
    const count = parseCount((entry as { count?: unknown } | null)?.count)
    return sum + (count ?? 0)
  }, 0)
}

const withFallback = async <T>(
  enabled: boolean,
  fn: () => Promise<T>,
): Promise<T | null> => {
  if (!enabled) return null
  try {
    return await fn()
  } catch {
    return null
  }
}

async function fetchSidebarCounts(access: SidebarCountsAccess): Promise<SidebarCounts> {
  const [
    teachers,
    candidates,
    subjects,
    datesheets,
    rooms,
    answerStats,
  ] = await Promise.all([
    withFallback(access.examFunctionaries, () => teacherService.getAll({ limit: 1, isActive: true })),
    withFallback(access.candidates, () => candidateService.getCandidatesWithParams({ limit: 1 })),
    withFallback(access.subjects, () => subjectService.getStats()),
    withFallback(access.datesheetDays, () => datesheetService.getStats()),
    withFallback(access.rooms, () => seatingPlanService.getRooms()),
    withFallback(access.answerSheets, () => answerSheetService.getStatistics()),
  ])

  return {
    examFunctionaries: parseCount((teachers as { totalItems?: unknown } | null)?.totalItems),
    candidates: parseCount((candidates as { total?: unknown } | null)?.total),
    subjects: parseCount((subjects as { total?: unknown } | null)?.total),
    answerSheets: getAnswerSheetRecordCount((answerStats as { data?: { byType?: unknown } } | null)?.data?.byType),
    datesheetDays: parseCount((datesheets as { data?: { data?: { centreDays?: unknown; fullDatesheetDays?: unknown } } } | null)?.data?.data?.centreDays
      ?? (datesheets as { data?: { data?: { centreDays?: unknown; fullDatesheetDays?: unknown } } } | null)?.data?.data?.fullDatesheetDays),
    rooms: parseCount(Array.isArray(rooms) ? rooms.length : null),
  }
}

export function useSidebarCounts(
  access: SidebarCountsAccess,
  options?: Omit<UseQueryOptions<SidebarCounts, Error>, 'queryKey' | 'queryFn'>
) {
  const hasToken = useSelector(selectIsAuthenticated)

  return useQuery({
    queryKey: sidebarKeys.counts(access),
    queryFn: () => fetchSidebarCounts(access),
    enabled: hasToken,
    initialData: EMPTY_COUNTS,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    ...options,
  })
}
