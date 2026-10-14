import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query'
import teacherService, {
  type Teacher,
  type FetchTeachersParams,
  type PaginatedTeachersResponse,
} from '../services/teacherService'

export const teacherKeys = {
  all: ['teachers'] as const,
  list: (params?: FetchTeachersParams) => [...teacherKeys.all, 'list', params ?? {}] as const,
  detail: (id: string) => [...teacherKeys.all, 'detail', id] as const,
  nextEmployeeId: () => [...teacherKeys.all, 'nextEmployeeId'] as const,
}

export function useTeachers(
  params: FetchTeachersParams,
  options?: Omit<
    UseQueryOptions<PaginatedTeachersResponse, Error>,
    'queryKey' | 'queryFn'
  >
) {
  return useQuery({
    queryKey: teacherKeys.list(params),
    queryFn: () => teacherService.getAll(params),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    ...options,
  })
}

/** The API caps `limit` at 100, so this fetches every page and joins them. */
const TEACHERS_PAGE_LIMIT = 100

export function useAllTeachers(
  params: Omit<FetchTeachersParams, 'page' | 'limit'>,
  options?: Omit<UseQueryOptions<PaginatedTeachersResponse, Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: [...teacherKeys.list({ ...params, page: 0, limit: TEACHERS_PAGE_LIMIT }), 'all'],
    queryFn: async () => {
      const first = await teacherService.getAll({ ...params, page: 1, limit: TEACHERS_PAGE_LIMIT })
      const items = [...first.items]
      for (let page = 2; page <= first.totalPages; page += 1) {
        const next = await teacherService.getAll({ ...params, page, limit: TEACHERS_PAGE_LIMIT })
        items.push(...next.items)
      }
      return { ...first, items, currentPage: 1, totalPages: 1, totalItems: items.length, itemsPerPage: items.length }
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    ...options,
  })
}

export function useTeacher(id: string | null, options?: Omit<UseQueryOptions<any, Error>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: teacherKeys.detail(id!),
    queryFn: () => teacherService.getById(id!).then((r) => r.data?.data ?? r.data),
    enabled: !!id,
    ...options,
  })
}

export function useNextEmployeeId(options?: Omit<UseQueryOptions<string, Error>, 'queryKey' | 'queryFn'>) {
  return useQuery({
    queryKey: teacherKeys.nextEmployeeId(),
    queryFn: async () => {
      const res = await teacherService.getNextEmployeeId()
      return res.data?.data?.employeeId ?? ''
    },
    ...options,
  })
}

export function useCreateTeacherMutation(
  options?: UseMutationOptions<any, Error, Omit<Teacher, '_id' | 'id'>>
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Teacher, '_id' | 'id'>) => teacherService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teacherKeys.all })
    },
    ...options,
  })
}

export function useUpdateTeacherMutation(
  options?: UseMutationOptions<any, Error, { id: string; data: Partial<Teacher> }>
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Teacher> }) =>
      teacherService.update(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: teacherKeys.all })
      queryClient.invalidateQueries({ queryKey: teacherKeys.detail(variables.id) })
    },
    ...options,
  })
}

export function useDeleteTeacherMutation(options?: UseMutationOptions<unknown, Error, string>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await teacherService.deleteById(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teacherKeys.all })
    },
    ...options,
  })
}
