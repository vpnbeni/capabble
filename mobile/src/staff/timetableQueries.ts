import { useQuery } from '@tanstack/react-query'

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
