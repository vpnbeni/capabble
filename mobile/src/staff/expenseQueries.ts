import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { expenseService, type ExpenseInput, type FuelInput, type PayslipEdit } from '@/services/expenseService'

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

export const useMeters = () => useQuery({ queryKey: [...keys.all, 'meters'], queryFn: expenseService.meters })
export const useBills = () => useQuery({ queryKey: [...keys.all, 'bills'], queryFn: expenseService.bills })
export const useProjects = () => useQuery({ queryKey: [...keys.all, 'projects'], queryFn: expenseService.projects })

export const useAddMeter = () => useWrite(expenseService.addMeter)
export const useAddBill = () => useWrite(expenseService.addBill)
export const usePayBill = () => useWrite(({ id, input }: { id: string; input: Parameters<typeof expenseService.payBill>[1] }) => expenseService.payBill(id, input))
export const useSaveProject = () => useWrite(expenseService.saveProject)
export const usePayProject = () => useWrite(({ id, input }: { id: string; input: Parameters<typeof expenseService.payProject>[1] }) => expenseService.payProject(id, input))

// Payroll writes refresh payroll and expenses (paying records an expense).
const usePayrollWrite = <T, R>(fn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: keys.payroll }), queryClient.invalidateQueries({ queryKey: keys.all })]),
  })
}
export const useStartRun = () => usePayrollWrite(expenseService.startRun)
export const useEditPayslips = () => usePayrollWrite(({ month, payslips }: { month: string; payslips: PayslipEdit[] }) => expenseService.editPayslips(month, payslips))
export const useFinalizeRun = () => usePayrollWrite(expenseService.finalize)
export const useMarkRunPaid = () =>
  usePayrollWrite(({ month, input }: { month: string; input: Parameters<typeof expenseService.markPaid>[1] }) => expenseService.markPaid(month, input))
export const useReopenRun = () => usePayrollWrite(expenseService.reopen)
export const useRemoveRun = () => usePayrollWrite(expenseService.removeRun)
