import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { transportService } from '@/services/transportService'

import { staffKeys } from './queries'

const all = [...staffKeys.all, 'transport'] as const

export const useTrips = () => useQuery({ queryKey: [...all, 'trips'], queryFn: transportService.trips, refetchInterval: 60_000 })
export const useRoutes = () => useQuery({ queryKey: [...all, 'routes'], queryFn: transportService.routes, staleTime: 60_000 })
export const useBuses = (enabled = true) => useQuery({ queryKey: [...all, 'vehicles'], queryFn: transportService.vehicles, staleTime: 60_000, enabled })
export const useRiders = () => useQuery({ queryKey: [...all, 'riders'], queryFn: () => transportService.riders(), staleTime: 30_000 })
export const useOwnWay = (enabled = true) => useQuery({ queryKey: [...all, 'own-way'], queryFn: transportService.ownWay, enabled })

const useWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: all }) })
}

export const useAssignRider = () => useWrite(transportService.assign)
export const useRemoveRider = () => useWrite(transportService.remove)
