import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError } from '@/lib/api'
import { libraryService, type PurchaseOrder } from '@/services/libraryService'

import { staffKeys } from './queries'

const all = [...staffKeys.all, 'library'] as const

export const useLibraryToday = () => useQuery({ queryKey: [...all, 'today'], queryFn: libraryService.today, staleTime: 30_000 })
export const useLoans = () => useQuery({ queryKey: [...all, 'loans'], queryFn: async () => (await libraryService.loans()).items, staleTime: 30_000 })
export const useLibraryTitles = (q: string, enabled = true) =>
  useQuery({ queryKey: [...all, 'titles', q], queryFn: async () => (await libraryService.titles(q)).items, placeholderData: keepPreviousData, enabled })
export const useFines = (enabled = true) => useQuery({ queryKey: [...all, 'fines'], queryFn: async () => (await libraryService.fines()).items, enabled })

const useWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: all }) })
}

export const useIssueBook = () => useWrite(({ memberId, copyId }: { memberId: string; copyId: string }) => libraryService.issue(memberId, copyId))
export const useReturnBook = () =>
  useWrite(({ code, condition }: { code: string; condition: 'good' | 'damaged' | 'requires_inspection' }) => libraryService.returnByCode(code, condition))
export const useRenewLoan = () => useWrite((loanId: string) => libraryService.renew(loanId))
export const useWaiveFine = () => useWrite(({ id, reason }: { id: string; reason: string }) => libraryService.waiveFine(id, reason))

// Purchasing, stocktakes, reports and the digital library. Writes refresh everything under the
// library key (counts on the desk, the catalogue, orders).

export const usePurchaseRequests = (enabled = true) => useQuery({ queryKey: [...all, 'requests'], queryFn: async () => (await libraryService.requests()).items, enabled })
export const useSuppliers = (enabled = true) => useQuery({ queryKey: [...all, 'suppliers'], queryFn: async () => (await libraryService.suppliers()).items, enabled })
export const usePurchaseOrders = (enabled = true) => useQuery({ queryKey: [...all, 'orders'], queryFn: async () => (await libraryService.orders()).items, enabled })
export const useStocktakes = () => useQuery({ queryKey: [...all, 'stocktakes'], queryFn: async () => (await libraryService.stocktakes()).items })
export const useDigitalResources = () => useQuery({ queryKey: [...all, 'digital'], queryFn: async () => (await libraryService.digital()).items })
export const useLibraryReports = () =>
  useQuery({
    queryKey: [...all, 'reports'],
    queryFn: async () => {
      const [inventory, overdue, fines] = await Promise.all([libraryService.inventory(), libraryService.overdue(), libraryService.fineTotals()])
      return { inventory: inventory.rows, overdue: overdue.rows, fines: fines.rows }
    },
  })

export const useCreateTitle = () => useWrite(libraryService.createTitle)
export const useAddCopies = () => useWrite(({ titleId, copies }: { titleId: string; copies: Parameters<typeof libraryService.addCopies>[1] }) => libraryService.addCopies(titleId, copies))
export const useRequestBook = () => useWrite(libraryService.request)
export const useReviewRequest = () =>
  useWrite(({ id, decision, note }: { id: string; decision: 'approved' | 'rejected'; note: string }) => libraryService.review(id, decision, note))
export const useAddSupplier = () => useWrite(libraryService.addSupplier)
export const usePlaceOrder = () => useWrite(libraryService.order)
export const useReceiveOrder = () =>
  useWrite(({ id, copies }: { id: string; copies: Parameters<typeof libraryService.receive>[1] }) => libraryService.receive(id, copies))
export const useStartStocktake = () => useWrite(libraryService.startStocktake)
export const useCheckCopy = () => useWrite(({ id, code }: { id: string; code: string }) => libraryService.checkCopy(id, code))
export const useCloseStocktake = () => useWrite(libraryService.closeStocktake)
export const useAddDigital = () => useWrite(libraryService.addDigital)

/**
 * Accession numbers from the first one and how many: "LIB-0098", 3 → LIB-0098, LIB-0099, LIB-0100.
 * null when the first one doesn't end in digits.
 */
export const accessionRun = (first: string, count: number) => {
  const match = first.trim().match(/^(.*?)(\d+)$/)
  if (!match) return count === 1 && first.trim() ? [first.trim()] : null
  const [, prefix, digits] = match
  return Array.from({ length: count }, (_, index) => `${prefix}${String(Number(digits) + index).padStart(digits.length, '0')}`)
}

/** A duplicate accession number comes back as a database error; say what to fix instead. */
export const copiesError = (failure: unknown, fallback: string) => {
  if (failure instanceof ApiError) return /duplicate|E11000|distinct/i.test(failure.message) ? 'One of these accession numbers is already used. Start from a number that isn’t.' : failure.message
  return fallback
}

/** Books ordered and received so far on an order. */
export const orderCounts = (order: PurchaseOrder) => {
  const ordered = order.lines.reduce((sum, line) => sum + line.quantity, 0)
  const received = order.lines.reduce((sum, line) => sum + (line.receivedQuantity ?? 0), 0)
  return { ordered, received }
}
