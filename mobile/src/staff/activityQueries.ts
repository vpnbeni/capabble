import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { PickedFile } from '@/lib/pickFile'
import { activityService, type CouncilApplication, type House, type PostInput, type Council, type SetupKind } from '@/services/activityService'

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

export const useSetupRecords = (kind: SetupKind) => useQuery({ queryKey: [...all, 'setup', kind], queryFn: () => activityService.setupList(kind) })
export const useSaveSetupRecord = () => useWrite(({ kind, id, input }: { kind: SetupKind; id?: string; input: Record<string, string> }) => activityService.setupSave(kind, id, input))
export const useRemoveSetupRecord = () => useWrite(({ kind, id }: { kind: SetupKind; id: string }) => activityService.setupRemove(kind, id))

export const useCouncil = (id: string) => useQuery({ queryKey: [...all, 'council', id], queryFn: () => activityService.council(id), enabled: Boolean(id) })
export const useUpdateHouse = () => useWrite(({ id, input }: { id: string; input: Partial<Pick<House, 'teachers' | 'councilMembers'>> }) => activityService.updateHouse(id, input))
export const useActivityImage = () =>
  useWrite(({ kind, id, field, picked }: { kind: 'houses' | 'clubs'; id: string; field: 'logo' | 'flag'; picked: PickedFile | null }) =>
    picked ? activityService.uploadImage(kind, id, field, picked) : activityService.clearLogo(kind, id),
  )
export const useSavePost = () =>
  useWrite(({ council, id, input }: { council: Council; id?: string; input: PostInput }) => (id ? activityService.updatePost(id, input) : activityService.addPost(council, input)))
export const useRemovePost = () => useWrite(activityService.removePost)
export const useAddApplication = () =>
  useWrite(({ postId, student }: { postId: string; student: Parameters<typeof activityService.addApplication>[1] }) => activityService.addApplication(postId, student))
export const useSetApplication = () => useWrite(({ id, status }: { id: string; status: CouncilApplication['status'] }) => activityService.setApplication(id, status))
export const useRemoveApplication = () => useWrite(activityService.removeApplication)
export const useRemoveCertificate = () => useWrite(activityService.removeCertificate)
