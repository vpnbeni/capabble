import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { libraryService } from '@/services/libraryService'

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
