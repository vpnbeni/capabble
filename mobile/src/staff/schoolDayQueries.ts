import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { schoolDaysService, type RuleInput } from '@/services/schoolDaysService'

import { staffKeys } from './queries'

const key = [...staffKeys.all, 'school-days'] as const

export const useSchoolDays = (enabled = true) => useQuery({ queryKey: key, queryFn: schoolDaysService.list, staleTime: 60_000, enabled })

/** A change to school days moves the calendar, registers and timetables: refresh everything staff. */
const useSave = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: staffKeys.all }) })
}

export const useCreateRule = () => useSave((input: RuleInput) => schoolDaysService.create(input))
export const useUpdateRule = () => useSave(({ id, input }: { id: string; input: RuleInput }) => schoolDaysService.update(id, input))
export const useRemoveRule = () => useSave((id: string) => schoolDaysService.remove(id))
