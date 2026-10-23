import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import userAdminService, {
  type CreateUserPayload,
  type CredentialMethod,
  type UpdateUserPayload,
  type UserListParams,
} from '@/services/userAdminService'
import type { PermissionGrant } from '@/types/auth'

export const userAdminKeys = {
  all: ['user-admin'] as const,
  users: (params: UserListParams) => [...userAdminKeys.all, 'users', params] as const,
  user: (id: string) => [...userAdminKeys.all, 'user', id] as const,
  roles: () => [...userAdminKeys.all, 'roles'] as const,
  catalog: () => [...userAdminKeys.all, 'catalog'] as const,
  audit: (userId?: string, page = 1) => [...userAdminKeys.all, 'audit', userId || 'all', page] as const,
  staffCandidates: (search: string) => [...userAdminKeys.all, 'staff-candidates', search] as const,
  studentCandidates: (params: Record<string, string>) => [...userAdminKeys.all, 'student-candidates', params] as const,
  classOptions: (kind: string) => [...userAdminKeys.all, 'class-options', kind] as const,
  sectionOptions: () => [...userAdminKeys.all, 'section-options'] as const,
}

/** The school's classes and sections, for picking a staff login's own classes. */
export const useSectionOptions = (enabled: boolean) =>
  useQuery({
    queryKey: userAdminKeys.sectionOptions(),
    queryFn: userAdminService.sectionOptions,
    enabled,
    staleTime: 5 * 60 * 1000,
  })

/** Classes and sections with students, for the "Create for a class" pickers. */
export const useBulkClassOptions = (kind: 'parent' | 'student', enabled: boolean) =>
  useQuery({
    queryKey: userAdminKeys.classOptions(kind),
    queryFn: () => userAdminService.classOptions(kind),
    enabled,
  })

export const useManagedUsers = (params: UserListParams) =>
  useQuery({
    queryKey: userAdminKeys.users(params),
    queryFn: () => userAdminService.listUsers(params),
    placeholderData: keepPreviousData,
  })

export const useManagedUser = (id?: string) =>
  useQuery({
    queryKey: userAdminKeys.user(id || ''),
    queryFn: () => userAdminService.getUser(id as string),
    enabled: Boolean(id),
  })

export const useRoles = () =>
  useQuery({ queryKey: userAdminKeys.roles(), queryFn: userAdminService.listRoles, staleTime: 60 * 1000 })

export const usePermissionCatalog = () =>
  useQuery({ queryKey: userAdminKeys.catalog(), queryFn: userAdminService.getCatalog, staleTime: 30 * 60 * 1000 })

export const useAuditLog = (userId?: string, page = 1) =>
  useQuery({
    queryKey: userAdminKeys.audit(userId, page),
    queryFn: () => userAdminService.auditLog({ userId, page }),
    placeholderData: keepPreviousData,
  })

export const useStaffCandidates = (search: string, enabled = true) =>
  useQuery({
    queryKey: userAdminKeys.staffCandidates(search),
    queryFn: () => userAdminService.staffCandidates(search),
    enabled,
    placeholderData: keepPreviousData,
  })

export const useStudentCandidates = (params: { search?: string; className?: string; section?: string }, enabled = true) =>
  useQuery({
    queryKey: userAdminKeys.studentCandidates({
      search: params.search || '',
      className: params.className || '',
      section: params.section || '',
    }),
    queryFn: () => userAdminService.studentCandidates(params),
    enabled,
    placeholderData: keepPreviousData,
  })

const useInvalidateUsers = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: userAdminKeys.all })
}

export const useCreateUser = () => {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: (payload: CreateUserPayload) => userAdminService.createUser(payload),
    onSuccess: invalidate,
  })
}

export const useUpdateUser = () => {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserPayload }) => userAdminService.updateUser(id, payload),
    onSuccess: invalidate,
  })
}

export const useResetPassword = () => {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({ id, method, password }: { id: string; method: CredentialMethod; password?: string }) =>
      userAdminService.resetPassword(id, { method, ...(password ? { password } : {}) }),
    onSuccess: invalidate,
  })
}

export const useSignOutEverywhere = () => {
  const invalidate = useInvalidateUsers()
  return useMutation({ mutationFn: (id: string) => userAdminService.signOutEverywhere(id), onSuccess: invalidate })
}

export const useBulkPortalLogins = () => {
  const invalidate = useInvalidateUsers()
  return useMutation({ mutationFn: userAdminService.bulkPortal, onSuccess: invalidate })
}

export const useSaveRole = () => {
  const invalidate = useInvalidateUsers()
  return useMutation({
    mutationFn: ({ id, payload }: {
      id?: string
      payload: { name: string; description: string; basedOn?: string; permissions: PermissionGrant[] }
    }) => (id ? userAdminService.updateRole(id, payload) : userAdminService.createRole(payload)),
    onSuccess: invalidate,
  })
}

export const useDeleteRole = () => {
  const invalidate = useInvalidateUsers()
  return useMutation({ mutationFn: (id: string) => userAdminService.deleteRole(id), onSuccess: invalidate })
}
