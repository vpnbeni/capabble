import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { usersService, type CredentialMethod, type LoginKind, type NewLogin } from '@/services/usersService'

import { staffKeys } from './queries'

const keys = {
  all: [...staffKeys.all, 'logins'] as const,
  list: (kind: string, search: string) => [...staffKeys.all, 'logins', 'list', kind, search] as const,
  one: (id: string) => [...staffKeys.all, 'logins', 'one', id] as const,
  roles: [...staffKeys.all, 'logins', 'roles'] as const,
}

export const useLogins = (kind: LoginKind, search: string) =>
  useQuery({ queryKey: keys.list(kind, search), queryFn: () => usersService.list({ kind, search: search || undefined }), placeholderData: keepPreviousData, staleTime: 30_000 })

export const useLogin = (id?: string) => useQuery({ queryKey: keys.one(id ?? ''), queryFn: () => usersService.get(id as string), enabled: Boolean(id) })

export const useRoles = (enabled = true) => useQuery({ queryKey: keys.roles, queryFn: usersService.roles, staleTime: 10 * 60 * 1000, enabled })

export const useStaffCandidates = (search: string, enabled = true) =>
  useQuery({ queryKey: [...keys.all, 'staff-candidates', search], queryFn: () => usersService.staffCandidates(search), placeholderData: keepPreviousData, enabled })

export const useStudentCandidates = (search: string, enabled = true) =>
  useQuery({
    queryKey: [...keys.all, 'student-candidates', search],
    queryFn: () => usersService.studentCandidates(search),
    placeholderData: keepPreviousData,
    enabled: enabled && search.length >= 2,
  })

const useLoginWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }) })
}

export const useCreateLogin = () => useLoginWrite((input: NewLogin) => usersService.create(input))
export const useUpdateLogin = () =>
  useLoginWrite(({ id, changes }: { id: string; changes: Parameters<typeof usersService.update>[1] }) => usersService.update(id, changes))
export const useResetPassword = () => useLoginWrite(({ id, method }: { id: string; method: CredentialMethod }) => usersService.resetPassword(id, method))
export const useSignOutEverywhere = () => useLoginWrite((id: string) => usersService.signOutEverywhere(id))
