import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { schoolSetupService } from '@/services/schoolSetupService'

import { staffKeys } from './queries'

// School setup: email, payments and roles. Role changes also refresh the Users screens' role lists.
const all = [...staffKeys.all, 'school-setup'] as const

export const useMailSettings = (enabled = true) => useQuery({ queryKey: [...all, 'mail'], queryFn: schoolSetupService.mail, enabled })
export const usePaymentSettings = (enabled = true) => useQuery({ queryKey: [...all, 'payments'], queryFn: schoolSetupService.payments, enabled })
export const useRoleList = () => useQuery({ queryKey: [...all, 'roles'], queryFn: schoolSetupService.roles })
export const usePermissionCatalog = () => useQuery({ queryKey: [...all, 'catalog'], queryFn: schoolSetupService.catalog, staleTime: Infinity })

const useWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: all }), queryClient.invalidateQueries({ queryKey: [...staffKeys.all, 'logins'] })]) })
}

export const useSaveMail = () => useWrite(schoolSetupService.saveMail)
export const useTestMail = () => useWrite(schoolSetupService.testMail)
export const useSavePayments = () => useWrite(schoolSetupService.savePayments)
export const useTestPayments = () => useWrite(schoolSetupService.testPayments)
export const useSaveRole = () => useWrite(schoolSetupService.saveRole)
export const useRemoveRole = () => useWrite(schoolSetupService.removeRole)
