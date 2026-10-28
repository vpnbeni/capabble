import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { expenseService, type ExpenseInput, type FuelInput } from '@/services/expenseService'

import { staffKeys } from './queries'

const keys = { all: [...staffKeys.all, 'expenses'] as const, payroll: [...staffKeys.all, 'payroll'] as const }

export const useExpenseCategories = () => useQuery({ queryKey: [...keys.all, 'categories'], queryFn: expenseService.categories, staleTime: 10 * 60 * 1000 })
export const useExpenses = (from: string, to: string) => useQuery({ queryKey: [...keys.all, 'list', from, to], queryFn: () => expenseService.list(from, to), staleTime: 30_000 })
export const useVehicles = (enabled = true) => useQuery({ queryKey: [...keys.all, 'vehicles'], queryFn: expenseService.vehicles, staleTime: 10 * 60 * 1000, enabled })
export const usePayrollRuns = () => useQuery({ queryKey: [...keys.payroll, 'runs'], queryFn: expenseService.runs, staleTime: 5 * 60 * 1000 })
export const usePayrollRun = (month?: string) =>
  useQuery({ queryKey: [...keys.payroll, 'run', month ?? ''], queryFn: () => expenseService.run(month as string), enabled: Boolean(month) })

const useWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }) })
}

export const useRecordExpense = () => useWrite((input: ExpenseInput) => expenseService.create(input))
export const useRecordFuel = () => useWrite((input: FuelInput) => expenseService.fuel(input))
export const useVoidExpense = () => useWrite(({ id, reason }: { id: string; reason: string }) => expenseService.void(id, reason))
