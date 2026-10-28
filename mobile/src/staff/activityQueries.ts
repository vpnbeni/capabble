import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { activityService } from '@/services/activityService'

import { staffKeys } from './queries'

const all = [...staffKeys.all, 'activities'] as const

export const useHouses = () => useQuery({ queryKey: [...all, 'houses'], queryFn: activityService.houses, staleTime: 10 * 60 * 1000 })
export const useHouseRanking = () => useQuery({ queryKey: [...all, 'ranking'], queryFn: activityService.ranking, staleTime: 60_000 })
export const useClubs = (enabled = true) => useQuery({ queryKey: [...all, 'clubs'], queryFn: activityService.clubs, staleTime: 5 * 60 * 1000, enabled })
export const useActivityEvents = (enabled = true) => useQuery({ queryKey: [...all, 'events'], queryFn: activityService.events, staleTime: 5 * 60 * 1000, enabled })
export const useCertificates = (enabled = true) => useQuery({ queryKey: [...all, 'certificates'], queryFn: activityService.certificates, staleTime: 60_000, enabled })
export const useActivityProfile = (studentId?: string, enabled = true) =>
  useQuery({ queryKey: [...all, 'profile', studentId ?? ''], queryFn: () => activityService.profile(studentId as string), enabled: Boolean(studentId) && enabled, staleTime: 5 * 60 * 1000 })

const useWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: all }) })
}

export const useAddPoints = () => useWrite(activityService.addPoints)
export const useAddCertificate = () => useWrite(activityService.addCertificate)
