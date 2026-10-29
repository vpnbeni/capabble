import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { dayKeyAdd } from '@/lib/format'
import { timetableService } from '@/services/timetableService'

import { staffKeys } from './queries'
import { weekFor, type TimetableTarget } from './timetableGrid'

const keys = {
  school: [...staffKeys.all, 'school-timetable'] as const,
  days: (from: string, to: string) => [...staffKeys.all, 'school-days-map', from, to] as const,
}

/** The published timetable (classes, teachers, bell timings and grid): changes a few times a term. */
export const useSchoolTimetable = (enabled = true) =>
  useQuery({ queryKey: keys.school, queryFn: timetableService.school, staleTime: 10 * 60 * 1000, enabled })

/** One class's or teacher's week from Monday, with the school's days off. */
export const useTargetWeek = (target: TimetableTarget, monday: string) => {
  const school = useSchoolTimetable()
  const sunday = dayKeyAdd(monday, 6)
  const days = useQuery({ queryKey: keys.days(monday, sunday), queryFn: () => timetableService.days(monday, sunday), staleTime: 10 * 60 * 1000 })
  const dates = Array.from({ length: 7 }, (_, index) => dayKeyAdd(monday, index))
  return {
    data: school.data && days.data ? weekFor(school.data, target, days.data.days, dates) : undefined,
    isPending: school.isPending || days.isPending,
    isError: school.isError || days.isError,
    error: school.error ?? days.error,
    isRefetching: school.isRefetching || days.isRefetching,
    refetch: () => {
      school.refetch()
      days.refetch()
    },
  }
}

// Setting the timetable up: the working setup, bell timings and versions. Every write refreshes them
// and the published timetable the week views read.
const setupKeys = { all: [...staffKeys.all, 'timetable-setup'] as const }
export const useTimetableSetup = () => useQuery({ queryKey: [...setupKeys.all, 'state'], queryFn: timetableService.setup })
export const useBellTimings = () => useQuery({ queryKey: [...setupKeys.all, 'bells'], queryFn: timetableService.bellTimings })
export const useTimetableVersions = () => useQuery({ queryKey: [...setupKeys.all, 'versions'], queryFn: timetableService.versions })

const useWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: setupKeys.all }), queryClient.invalidateQueries({ queryKey: keys.school })]),
  })
}
export const useSaveBellTimings = () => useWrite(timetableService.saveBellTimings)
export const useSetClassPeriods = () => useWrite(({ classId, subjects }: { classId: string; subjects: Record<string, number> }) => timetableService.setClassPeriods(classId, subjects))
export const useAddClassSection = () => useWrite(timetableService.addClassSection)
export const useUpdateClassSection = () =>
  useWrite(({ id, input }: { id: string; input: Parameters<typeof timetableService.updateClassSection>[1] }) => timetableService.updateClassSection(id, input))
export const useRemoveClassSection = () => useWrite(timetableService.removeClassSection)
export const useAddTimetableSubject = () => useWrite(timetableService.addSubject)
export const useGenerateTimetable = () => useWrite(timetableService.generate)
export const usePublishVersion = () => useWrite(timetableService.publish)
export const useArchiveVersion = () => useWrite(timetableService.archive)
export const useRemoveVersion = () => useWrite(timetableService.removeVersion)
