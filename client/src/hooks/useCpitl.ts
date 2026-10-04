import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import cpitlService, { FeeHead, FeeStructure } from '@/services/cpitlService'

export const cpitlKeys = {
  all: ['cpitl'] as const,
  dashboard: () => [...cpitlKeys.all, 'dashboard'] as const,
  classes: () => [...cpitlKeys.all, 'classes'] as const,
  feeHeads: () => [...cpitlKeys.all, 'fee-heads'] as const,
  structures: () => [...cpitlKeys.all, 'structures'] as const,
  structure: (id: string) => [...cpitlKeys.structures(), id] as const,
  revisions: (id: string) => [...cpitlKeys.structure(id), 'revisions'] as const,
  students: (params: Record<string, unknown>) => [...cpitlKeys.all, 'students', params] as const,
  account: (studentId: string) => [...cpitlKeys.all, 'account', studentId] as const,
  payments: (params: Record<string, unknown>) => [...cpitlKeys.all, 'payments', params] as const,
  settings: () => [...cpitlKeys.all, 'settings'] as const,
  categories: () => [...cpitlKeys.all, 'expense-categories'] as const,
  expenses: (params: Record<string, unknown>) => [...cpitlKeys.all, 'expenses', params] as const,
  expenseSummary: (params: Record<string, unknown>) => [...cpitlKeys.all, 'expense-summary', params] as const,
  budgets: (growthPct: number) => [...cpitlKeys.all, 'budgets', growthPct] as const,
  locations: () => [...cpitlKeys.all, 'locations'] as const,
  fuelVehicles: () => [...cpitlKeys.all, 'fuel-vehicles'] as const,
  fuelLogs: (params: Record<string, unknown>) => [...cpitlKeys.all, 'fuel-logs', params] as const,
  fuelAnalytics: (growthPct: number) => [...cpitlKeys.all, 'fuel-analytics', growthPct] as const,
  connections: () => [...cpitlKeys.all, 'electricity-connections'] as const,
  bills: (params: Record<string, unknown>) => [...cpitlKeys.all, 'electricity-bills', params] as const,
  electricityAnalytics: () => [...cpitlKeys.all, 'electricity-analytics'] as const,
  infraProjects: () => [...cpitlKeys.all, 'infra'] as const,
  infraProject: (id: string) => [...cpitlKeys.all, 'infra', id] as const,
  salaryComponents: () => [...cpitlKeys.all, 'salary-components'] as const,
  payrollSettings: () => [...cpitlKeys.all, 'payroll-settings'] as const,
  staffSalaries: () => [...cpitlKeys.all, 'staff-salaries'] as const,
  staffSalary: (teacherId: string) => [...cpitlKeys.all, 'staff-salary', teacherId] as const,
  payrollRuns: () => [...cpitlKeys.all, 'payroll-runs'] as const,
  payrollRun: (month: string) => [...cpitlKeys.all, 'payroll-run', month] as const,
  salarySummary: (teacherId: string) => [...cpitlKeys.all, 'salary-summary', teacherId] as const,
}

export const useCpitlDashboard = () => useQuery({ queryKey: cpitlKeys.dashboard(), queryFn: cpitlService.getDashboard })

export const useCpitlClasses = () =>
  useQuery({ queryKey: cpitlKeys.classes(), queryFn: cpitlService.getClasses, staleTime: 5 * 60 * 1000 })

export const useFeeHeads = () => useQuery({ queryKey: cpitlKeys.feeHeads(), queryFn: cpitlService.listFeeHeads })

export const useFeeStructures = () => useQuery({ queryKey: cpitlKeys.structures(), queryFn: cpitlService.listStructures })

export const useFeeStructure = (id?: string) =>
  useQuery({ queryKey: cpitlKeys.structure(id || ''), queryFn: () => cpitlService.getStructure(id as string), enabled: Boolean(id) })

export const useStructureRevisions = (id?: string) =>
  useQuery({ queryKey: cpitlKeys.revisions(id || ''), queryFn: () => cpitlService.listRevisions(id as string), enabled: Boolean(id) })

export const useFeeStudents = (params: { q?: string; class?: string; section?: string }, enabled = true) =>
  useQuery({ queryKey: cpitlKeys.students(params), queryFn: () => cpitlService.searchStudents(params), enabled })

export const useStudentAccount = (studentId?: string) =>
  useQuery({
    queryKey: cpitlKeys.account(studentId || ''),
    queryFn: () => cpitlService.getStudentAccount(studentId as string),
    enabled: Boolean(studentId),
  })

export const useFeePayments = (params: Record<string, string | number | undefined>) =>
  useQuery({ queryKey: cpitlKeys.payments(params), queryFn: () => cpitlService.listPayments(params) })

export const useCapitalSettings = () => useQuery({ queryKey: cpitlKeys.settings(), queryFn: cpitlService.getSettings })

/** Invalidate everything fee-related; money moves touch dashboard, ledgers and lists at once. */
export const useInvalidateCpitl = () => {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cpitlKeys.all })
}

export const useSaveFeeHead = () => {
  const invalidate = useInvalidateCpitl()
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Partial<FeeHead> }) =>
      id ? cpitlService.updateFeeHead(id, payload) : cpitlService.createFeeHead(payload),
    onSuccess: invalidate,
  })
}

export const useSaveStructure = () => {
  const invalidate = useInvalidateCpitl()
  return useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: Partial<FeeStructure> & { changeNote?: string } }) =>
      id ? cpitlService.updateStructure(id, payload) : cpitlService.createStructure(payload),
    onSuccess: invalidate,
  })
}

// ── Phase 2 ─────────────────────────────────────────────────────────
export const useExpenseCategories = () =>
  useQuery({ queryKey: cpitlKeys.categories(), queryFn: () => cpitlService.listExpenseCategories(), staleTime: 60 * 1000 })

export const useExpenses = (params: Record<string, string | number | undefined>) =>
  useQuery({ queryKey: cpitlKeys.expenses(params), queryFn: () => cpitlService.listExpenses(params) })

export const useExpenseSummary = (params: { from?: string; to?: string } = {}, enabled = true) =>
  useQuery({ queryKey: cpitlKeys.expenseSummary(params), queryFn: () => cpitlService.getExpenseSummary(params), enabled })

export const useBudgets = (growthPct = 0) =>
  useQuery({ queryKey: cpitlKeys.budgets(growthPct), queryFn: () => cpitlService.getBudgets(growthPct) })

export const useAssetLocations = () =>
  useQuery({ queryKey: cpitlKeys.locations(), queryFn: cpitlService.listLocations, staleTime: 5 * 60 * 1000 })

export const useFuelVehicles = () => useQuery({ queryKey: cpitlKeys.fuelVehicles(), queryFn: cpitlService.listFuelVehicles })

export const useFuelLogs = (params: Record<string, string | undefined> = {}) =>
  useQuery({ queryKey: cpitlKeys.fuelLogs(params), queryFn: () => cpitlService.listFuelLogs(params) })

export const useFuelAnalytics = (growthPct = 0) =>
  useQuery({ queryKey: cpitlKeys.fuelAnalytics(growthPct), queryFn: () => cpitlService.getFuelAnalytics(growthPct) })

export const useElectricityConnections = () =>
  useQuery({ queryKey: cpitlKeys.connections(), queryFn: cpitlService.listElectricityConnections })

export const useElectricityBills = (params: Record<string, string | undefined> = {}) =>
  useQuery({ queryKey: cpitlKeys.bills(params), queryFn: () => cpitlService.listElectricityBills(params) })

export const useElectricityAnalytics = () =>
  useQuery({ queryKey: cpitlKeys.electricityAnalytics(), queryFn: cpitlService.getElectricityAnalytics })

export const useInfraProjects = () => useQuery({ queryKey: cpitlKeys.infraProjects(), queryFn: cpitlService.listInfraProjects })

export const useInfraProject = (id?: string) =>
  useQuery({ queryKey: cpitlKeys.infraProject(id || ''), queryFn: () => cpitlService.getInfraProject(id as string), enabled: Boolean(id) })

export const useSalaryComponents = () => useQuery({ queryKey: cpitlKeys.salaryComponents(), queryFn: cpitlService.listSalaryComponents })

export const usePayrollSettings = () => useQuery({ queryKey: cpitlKeys.payrollSettings(), queryFn: cpitlService.getPayrollSettings })

export const useStaffSalaries = () => useQuery({ queryKey: cpitlKeys.staffSalaries(), queryFn: cpitlService.listStaffSalaries })

export const useStaffSalary = (teacherId?: string) =>
  useQuery({ queryKey: cpitlKeys.staffSalary(teacherId || ''), queryFn: () => cpitlService.getStaffSalary(teacherId as string), enabled: Boolean(teacherId) })

export const usePayrollRuns = () => useQuery({ queryKey: cpitlKeys.payrollRuns(), queryFn: cpitlService.listPayrollRuns })

export const usePayrollRun = (month?: string) =>
  useQuery({ queryKey: cpitlKeys.payrollRun(month || ''), queryFn: () => cpitlService.getPayrollRun(month as string), enabled: Boolean(month) })

export const useSalarySummary = (teacherId?: string, enabled = true) =>
  useQuery({
    queryKey: cpitlKeys.salarySummary(teacherId || ''),
    queryFn: () => cpitlService.getSalarySummary(teacherId as string),
    enabled: Boolean(teacherId) && enabled,
    retry: false,
  })
