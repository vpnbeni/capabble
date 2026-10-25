import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { ApiError } from '@/lib/api'
import { fileStore } from '@/lib/fileStore'
import { staffService, type RosterStudent } from '@/services/staffService'

// React Query hooks for the staff app. Writes invalidate `staffKeys.all` parts they touch.

export const staffKeys = {
  all: ['staff'] as const,
  timetable: (from: string, to: string) => [...staffKeys.all, 'timetable', from, to] as const,
  registers: (date: string) => [...staffKeys.all, 'registers', date] as const,
  roster: (className: string, section: string) => [...staffKeys.all, 'roster', className, section] as const,
  register: (date: string, className: string, section: string) => [...staffKeys.all, 'register', date, className, section] as const,
}

/** The signed-in teacher's periods, day by day (at most 14 days). */
export const useMyTimetable = (from: string, to: string, enabled = true) =>
  useQuery({
    queryKey: staffKeys.timetable(from, to),
    queryFn: () => staffService.myTimetable(from, to),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    enabled,
  })

/** Class registers this login may see for a day, marked or not. */
export const useRegisters = (date: string, enabled = true) =>
  useQuery({
    queryKey: staffKeys.registers(date),
    queryFn: () => staffService.registers(date),
    staleTime: 60_000,
    enabled,
  })

const rosterFile = (className: string, section: string) => `roster-${encodeURIComponent(`${className}|${section}`)}`

export type Roster = { students: RosterStudent[]; savedAt: string; offline: boolean }

/**
 * A class list for the roll call. Each one loaded is kept on the phone, so a teacher can
 * still take the register without a connection (marked `offline` with when it was saved).
 */
export const fetchRoster = async (className: string, section: string): Promise<Roster> => {
  try {
    const students = await staffService.roster(className, section)
    const roster = { students, savedAt: new Date().toISOString(), offline: false }
    fileStore.write(rosterFile(className, section), roster).catch(() => undefined)
    return roster
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) {
      const saved = await fileStore.read<Roster>(rosterFile(className, section))
      if (saved) return { ...saved, offline: true }
    }
    throw error
  }
}

export const useRoster = (className?: string, section?: string) =>
  useQuery({
    queryKey: staffKeys.roster(className ?? '', section ?? ''),
    queryFn: () => fetchRoster(className as string, section as string),
    enabled: Boolean(className && section),
    staleTime: 10 * 60 * 1000,
  })

/** The absent students already saved for a class and day (empty when offline: the roll starts from all present). */
export const useRegisterMarks = (date: string, className?: string, section?: string) =>
  useQuery({
    queryKey: staffKeys.register(date, className ?? '', section ?? ''),
    queryFn: async () => {
      try {
        const data = await staffService.register(date, className as string, section as string)
        return { absent: data.records.filter((record) => record.status === 'A').map((record) => String(record.studentId)), offline: false }
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) return { absent: [] as string[], offline: true }
        throw error
      }
    },
    enabled: Boolean(className && section),
    staleTime: 30_000,
  })
