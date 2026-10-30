import { keepPreviousData, useQuery } from '@tanstack/react-query'
import trnstService from '@/services/trnstService'

export const trnstKeys = {
  all: ['trnst'] as const,
  live: () => [...trnstKeys.all, 'live'] as const,
  trips: (date: string) => [...trnstKeys.all, 'trips', date] as const,
  trip: (id: string) => [...trnstKeys.all, 'trip', id] as const,
  crewMe: () => [...trnstKeys.all, 'crew', 'me'] as const,
  roster: (tripId: string) => [...trnstKeys.all, 'crew', 'roster', tripId] as const,
  crewStudent: (tripId: string, studentId: string) => [...trnstKeys.all, 'crew', 'student', tripId, studentId] as const,
}

// Phones send a point about every 10 s, so refreshing faster shows nothing new.
export const LIVE_REFRESH_MS = 10_000

export const useLiveBuses = () =>
  useQuery({ queryKey: trnstKeys.live(), queryFn: trnstService.getLive, refetchInterval: LIVE_REFRESH_MS })

export const useTrips = (date: string) =>
  useQuery({ queryKey: trnstKeys.trips(date), queryFn: () => trnstService.getTrips(date), placeholderData: keepPreviousData })

export const useTrip = (id?: string | null) =>
  useQuery({
    queryKey: trnstKeys.trip(id || ''),
    queryFn: () => trnstService.getTrip(id as string),
    enabled: Boolean(id),
    // Keep an active trip's trail moving.
    refetchInterval: (query) => (query.state.data?.status === 'active' ? LIVE_REFRESH_MS : false),
  })

export const useCrewMe = () => useQuery({ queryKey: trnstKeys.crewMe(), queryFn: trnstService.getCrewMe })

export const useCrewStudent = (tripId?: string, studentId?: string) =>
  useQuery({
    queryKey: trnstKeys.crewStudent(tripId || '', studentId || ''),
    queryFn: () => trnstService.getCrewStudent(tripId as string, studentId as string),
    enabled: Boolean(tripId && studentId),
  })

export const useRoster = (tripId?: string | null) =>
  useQuery({
    queryKey: trnstKeys.roster(tripId || ''),
    queryFn: () => trnstService.getRoster(tripId as string),
    enabled: Boolean(tripId),
    refetchInterval: 30_000,
  })
