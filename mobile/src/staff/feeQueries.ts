import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { feeService, type PaymentInput } from '@/services/feeService'

import { staffKeys } from './queries'

const keys = {
  all: [...staffKeys.all, 'fees'] as const,
  students: (q: string, cls: string) => [...staffKeys.all, 'fees', 'students', q, cls] as const,
  account: (id: string) => [...staffKeys.all, 'fees', 'account', id] as const,
  payments: (from: string, to: string) => [...staffKeys.all, 'fees', 'payments', from, to] as const,
}

export const useFeeStudents = (q: string, cls = '', enabled = true) =>
  useQuery({
    queryKey: keys.students(q, cls),
    queryFn: () => feeService.students({ q: q || undefined, class: cls || undefined, limit: q ? 30 : 200 }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled,
  })

export const useFeeAccount = (id?: string) => useQuery({ queryKey: keys.account(id ?? ''), queryFn: () => feeService.account(id as string), enabled: Boolean(id) })

export const usePayments = (from: string, to: string) => useQuery({ queryKey: keys.payments(from, to), queryFn: () => feeService.payments({ from, to }), staleTime: 30_000 })

/** A payment, a cancelled receipt or a cheque's fate changes dues, totals and the principal's glance. */
const useFeeWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all })
      queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'glance', 'fees'] })
    },
  })
}

export const useRecordPayment = () => useFeeWrite(({ studentId, input }: { studentId: string; input: PaymentInput }) => feeService.pay(studentId, input))
export const useCancelReceipt = () => useFeeWrite(({ id, reason }: { id: string; reason: string }) => feeService.cancel(id, reason))
export const useChequeStatus = () => useFeeWrite(({ id, status }: { id: string; status: 'cleared' | 'bounced' }) => feeService.chequeStatus(id, status))
