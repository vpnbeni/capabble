import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { centreService } from '@/services/centreService'

import { staffKeys } from './queries'

// Board exam centre: every write refreshes the centre's lists (rooms change duties and papers).
const all = [...staffKeys.all, 'centre'] as const

export const useCentreDetails = () => useQuery({ queryKey: [...all, 'details'], queryFn: centreService.details })
export const useExamRooms = () => useQuery({ queryKey: [...all, 'rooms'], queryFn: centreService.rooms })
export const useAssetRooms = (enabled: boolean) => useQuery({ queryKey: [...all, 'asset-rooms'], queryFn: centreService.assetRooms, enabled })
export const useAllocationMode = () => useQuery({ queryKey: [...all, 'allocation-mode'], queryFn: centreService.allocationMode })
export const useSeatingMode = () => useQuery({ queryKey: [...all, 'seating-mode'], queryFn: centreService.seatingMode })
export const useCentrePapers = () => useQuery({ queryKey: [...all, 'papers'], queryFn: centreService.papers })
export const useDayDuties = (date: string | null) => useQuery({ queryKey: [...all, 'duties', date], queryFn: () => centreService.duties(date as string), enabled: Boolean(date) })
export const useDutyMode = () => useQuery({ queryKey: [...all, 'duty-mode'], queryFn: centreService.dutyMode })
export const useInvigilators = (enabled: boolean) => useQuery({ queryKey: [...all, 'invigilators'], queryFn: centreService.invigilators, enabled })
export const useAnswerSheets = () => useQuery({ queryKey: [...all, 'answer-sheets'], queryFn: centreService.answerSheets })
export const useDaySheets = (date: string | null) => useQuery({ queryKey: [...all, 'day-sheets', date], queryFn: () => centreService.daySheets(date as string), enabled: Boolean(date) })
export const useForm66Dates = () => useQuery({ queryKey: [...all, 'form66'], queryFn: centreService.form66Dates })
export const useForm66Subjects = (date: string | null) => useQuery({ queryKey: [...all, 'form66', date], queryFn: () => centreService.form66Subjects(date as string), enabled: Boolean(date) })

const useWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: all }) })
}

export const useSaveCentreDetails = () => useWrite(centreService.saveDetails)
export const useAddRoom = () => useWrite(centreService.addRoom)
export const useSaveRoom = () => useWrite(centreService.saveRoom)
export const useSetAllocationMode = () => useWrite(centreService.setAllocationMode)
export const useSetSeatingMode = () => useWrite(centreService.setSeatingMode)
export const useRemoveRoom = () => useWrite(centreService.removeRoom)
export const useSyncAssetRooms = () => useWrite(centreService.syncAssetRooms)
export const useAssignDuties = () => useWrite(centreService.assignDuties)
export const useSaveSerials = () => useWrite(({ sheet, from, to }: { sheet: Parameters<typeof centreService.saveSerials>[0]; from: string; to: string }) => centreService.saveSerials(sheet, from, to))
export const useDiscardSerials = () => useWrite(centreService.discardSerials)
