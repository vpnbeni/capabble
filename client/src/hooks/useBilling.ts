import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import billingService, { type BillingProfile, type Selection } from '@/services/billingService'

export const billingKeys = {
  all: ['billing'] as const,
  me: () => [...billingKeys.all, 'me'] as const,
  invoices: () => [...billingKeys.all, 'invoices'] as const,
  payments: () => [...billingKeys.all, 'payments'] as const,
  creditNotes: () => [...billingKeys.all, 'credit-notes'] as const,
  catalog: () => [...billingKeys.all, 'catalog'] as const,
  preview: (selection: Selection) => [...billingKeys.all, 'preview', selection] as const,
}

export const useBillingMe = () => useQuery({ queryKey: billingKeys.me(), queryFn: billingService.getMe })
export const useBillingInvoices = () => useQuery({ queryKey: billingKeys.invoices(), queryFn: billingService.getInvoices })
export const useBillingPayments = () => useQuery({ queryKey: billingKeys.payments(), queryFn: billingService.getPayments })
export const useBillingCreditNotes = () => useQuery({ queryKey: billingKeys.creditNotes(), queryFn: billingService.getCreditNotes })
export const useBillingCatalog = (enabled = true) =>
  useQuery({ queryKey: billingKeys.catalog(), queryFn: billingService.getCatalog, enabled, staleTime: 5 * 60_000 })

export const useBillingPreview = (selection: Selection, enabled: boolean) =>
  useQuery({
    queryKey: billingKeys.preview(selection),
    queryFn: () => billingService.preview(selection),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  })

const useInvalidate = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: billingKeys.all })
}

export const useSubscribe = () => {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: billingService.subscribe, onSuccess: invalidate })
}

export const useUpdateBillingProfile = () => {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (payload: Partial<BillingProfile>) => billingService.updateProfile(payload), onSuccess: invalidate })
}

export const useCancelSubscription = () => {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: billingService.cancel, onSuccess: invalidate })
}

export const useResumeSubscription = () => {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: billingService.resume, onSuccess: invalidate })
}
