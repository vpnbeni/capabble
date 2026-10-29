import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { feeSetupService, type StructureInput } from '@/services/feeSetupService'

import { staffKeys } from './queries'

// Fee setup writes refresh fee setup and the fee screens (dues change when a structure is assigned).
const all = [...staffKeys.all, 'fee-setup'] as const

export const useFeeHeads = () => useQuery({ queryKey: [...all, 'heads'], queryFn: feeSetupService.heads })
export const useFeeStructures = () => useQuery({ queryKey: [...all, 'structures'], queryFn: feeSetupService.structures })
export const useBudgets = (enabled = true) => useQuery({ queryKey: [...all, 'budgets'], queryFn: feeSetupService.budgets, enabled })

const useWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: all }), queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'fees'] })]) })
}

export const useAddFeeHead = () => useWrite(feeSetupService.addHead)
export const useSaveStructure = () => useWrite(({ id, input }: { id?: string; input: StructureInput }) => feeSetupService.saveStructure(id, input))
export const useAssignStructure = () => useWrite(({ id, classes }: { id: string; classes: string[] }) => feeSetupService.assign(id, classes))
export const useDuplicateStructure = () => useWrite(feeSetupService.duplicate)
export const useArchiveStructure = () => useWrite(feeSetupService.archive)
export const useSaveBudget = () => useWrite(feeSetupService.saveBudget)
export const useCopyBudgets = () => useWrite(feeSetupService.copyBudgets)
