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

// Setting up the register: categories, vendors, places, purchases, audits and reports.
export const useAssetCategories = (enabled = true) => useQuery({ queryKey: [...all, 'categories'], queryFn: assetService.categories, staleTime: 5 * 60_000, enabled })
export const useAssetVendors = (enabled = true) => useQuery({ queryKey: [...all, 'vendors'], queryFn: assetService.vendors, staleTime: 5 * 60_000, enabled })
export const useAssetPurchases = () => useQuery({ queryKey: [...all, 'purchases'], queryFn: assetService.purchases })
export const useAssetAudits = () => useQuery({ queryKey: [...all, 'audits'], queryFn: assetService.audits })
export const useAssetAudit = (id?: string) => useQuery({ queryKey: [...all, 'audit', id], queryFn: () => assetService.audit(id as string), enabled: Boolean(id) })
export const useAssetReports = () =>
  useQuery({
    queryKey: [...all, 'reports'],
    queryFn: async () => {
      const [byCategory, byLocation] = await Promise.all([assetService.report('by-category'), assetService.report('by-location')])
      return { byCategory, byLocation }
    },
  })

export const useAddAsset = () => useWrite(assetService.addAsset)
export const useSaveCategory = () => useWrite(assetService.saveCategory)
export const useSaveVendor = () => useWrite(assetService.saveVendor)
export const useAddLocation = () => useWrite(assetService.addLocation)
export const useRenameLocation = () => useWrite(({ id, name }: { id: string; name: string }) => assetService.renameLocation(id, name))
export const useAddPurchase = () => useWrite(assetService.addPurchase)
export const useReceivePurchase = () => useWrite(assetService.receivePurchase)
export const useStartAudit = () => useWrite(assetService.startAudit)
export const useCheckAsset = () => useWrite(({ id, code }: { id: string; code: string }) => assetService.checkAsset(id, code))
export const useMarkAuditItem = () =>
  useWrite(({ id, itemId, state }: { id: string; itemId: string; state: Parameters<typeof assetService.markAuditItem>[2] }) => assetService.markAuditItem(id, itemId, state))
export const useCloseAudit = () => useWrite(assetService.closeAudit)
