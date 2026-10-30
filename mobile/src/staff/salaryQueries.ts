import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { salaryService, type SalaryLine, type SalaryOptions } from '@/services/salaryService'

import { staffKeys } from './queries'

const all = [...staffKeys.all, 'salaries'] as const

export const useStaffSalaries = () => useQuery({ queryKey: [...all, 'staff'], queryFn: salaryService.staff })
export const useStaffSalary = (teacherId: string) => useQuery({ queryKey: [...all, 'person', teacherId], queryFn: () => salaryService.person(teacherId), enabled: Boolean(teacherId) })
export const useSalaryComponents = () => useQuery({ queryKey: [...all, 'components'], queryFn: salaryService.components, staleTime: 10 * 60 * 1000 })
export const usePayrollSettings = () => useQuery({ queryKey: [...all, 'settings'], queryFn: salaryService.settings })

/** The month's pay for these lines, worked out by the server as they change. */
export const usePayPreview = (lines: SalaryLine[] | null, options: SalaryOptions | null) =>
  useQuery({
    queryKey: [...all, 'preview', lines, options],
    queryFn: () => salaryService.preview({ components: lines ?? [], options: options as SalaryOptions }),
    enabled: Boolean(lines && options && lines.some((line) => line.code === 'BASIC' && line.value > 0)),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })

const useWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: all }) })
}

export const useSaveSalary = () => useWrite(({ teacherId, input }: { teacherId: string; input: Parameters<typeof salaryService.save>[1] }) => salaryService.save(teacherId, input))
export const useReviseSalaries = () => useMutation({ mutationFn: salaryService.revise })
export const useSaveSalaryComponent = () => useWrite(({ id, input }: { id?: string; input: Parameters<typeof salaryService.saveComponent>[1] }) => salaryService.saveComponent(id, input))
export const useArchiveSalaryComponent = () => useWrite(salaryService.archiveComponent)
export const useSavePayrollSettings = () => useWrite(salaryService.saveSettings)
export const salaryKeys = { all }
