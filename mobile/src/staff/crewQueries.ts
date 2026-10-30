import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { crewService, type BoardingEvent, type Direction } from '@/services/crewService'

import { staffKeys } from './queries'

const all = [...staffKeys.all, 'crew'] as const

export const useCrew = (enabled = true) => useQuery({ queryKey: [...all, 'me'], queryFn: crewService.me, refetchInterval: 60_000, enabled })

/** Students on a trip by stop; refreshed while the screen is open (two phones may mark on one bus). */
export const useRoster = (tripId?: string) =>
  useQuery({ queryKey: [...all, 'roster', tripId], queryFn: () => crewService.roster(tripId as string), enabled: Boolean(tripId), refetchInterval: 20_000 })

/** One student on the trip's route, with the class teacher and family to call. */
export const useCrewStudent = (tripId?: string, studentId?: string) =>
  useQuery({ queryKey: [...all, 'student', tripId, studentId], queryFn: () => crewService.student(tripId as string, studentId as string), enabled: Boolean(tripId && studentId) })

const useWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: all }) })
}

export const useStartTrip = () => useWrite((input: { routeId: string; direction: Direction }) => crewService.start(input))
export const useEndTrip = () => useWrite((tripId: string) => crewService.end(tripId))
export const useMarkStudent = () =>
  useWrite(({ tripId, studentId, event }: { tripId: string; studentId: string; event: BoardingEvent }) => crewService.mark(tripId, { studentId, event }))
