import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { assetService } from '@/services/assetService'

import { staffKeys } from './queries'

const all = [...staffKeys.all, 'assets'] as const

export const useAssetSummary = () => useQuery({ queryKey: [...all, 'summary'], queryFn: assetService.summary, staleTime: 30_000 })
export const useAssets = (filter: { q?: string; locationId?: string; status?: string }, enabled = true) =>
  useQuery({ queryKey: [...all, 'list', filter], queryFn: () => assetService.assets(filter), placeholderData: keepPreviousData, enabled })
export const useAsset = (id: string | undefined) => useQuery({ queryKey: [...all, 'record', id], queryFn: () => assetService.asset(id!), enabled: Boolean(id) })
export const useAssetLocations = (enabled = true) => useQuery({ queryKey: [...all, 'locations'], queryFn: assetService.locations, staleTime: 5 * 60_000, enabled })
export const useMaintenance = (enabled = true) => useQuery({ queryKey: [...all, 'maintenance'], queryFn: () => assetService.maintenance(), enabled })
export const useAssetStock = (enabled = true) => useQuery({ queryKey: [...all, 'stock'], queryFn: assetService.stock, enabled })
export const useDisposals = (enabled = true) => useQuery({ queryKey: [...all, 'disposals'], queryFn: assetService.disposals, enabled })

const useWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: all }) })
}

export const useAllocateAsset = () => useWrite(assetService.allocate)
export const useReturnAsset = () => useWrite(assetService.returnAllocation)
export const useMoveAsset = () => useWrite(assetService.transfer)
export const useReportProblem = () => useWrite(assetService.reportProblem)
export const useUpdateMaintenance = () =>
  useWrite(({ id, input }: { id: string; input: Parameters<typeof assetService.updateMaintenance>[1] }) => assetService.updateMaintenance(id, input))
export const useAdjustStock = () => useWrite(({ id, input }: { id: string; input: Parameters<typeof assetService.adjustStock>[1] }) => assetService.adjustStock(id, input))
export const useApproveDisposal = () => useWrite(assetService.approveDisposal)
