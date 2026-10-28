import { api, requestBytes } from '@/lib/api'

import type { PaymentMode } from './feeService'

// Expenses, fuel and payroll (/api/cpitl), the website's Finance → Expenses, Fuel and Payroll. Rupees.

export interface ExpenseCategory {
  _id: string
  name: string
  parentId: string | null
  isActive: boolean
}

export interface Expense {
  _id: string
  kind: 'operating' | 'fuel' | 'electricity' | 'salary' | 'infra' | string
  title?: string
  payee?: string
  amount: number
  date: string
  mode?: PaymentMode | ''
  reference?: string
  notes?: string
  categoryId?: string | null
  categoryName?: string
  status: 'valid' | 'void'
  voidReason?: string
}

export interface ExpenseInput {
  title: string
  amount: number
  date: string
  categoryId: string
  payee?: string
  mode?: PaymentMode
  reference?: string
  notes?: string
}

export interface Vehicle {
  _id: string
  busNo?: string
  registrationNumber: string
  vehicleType?: string
  lastOdometer?: number
}

export interface FuelInput {
  vehicleId: string
  date: string
  litres: number
  ratePerLitre?: number
  amount?: number
  odometer?: number | null
  fullTank?: boolean
  station?: string
  billNo?: string
  mode?: PaymentMode
}

export interface PayrollRun {
  _id: string
  month: string
  status: 'draft' | 'finalized' | 'paid'
  totals: { staff: number; gross: number; deductions: number; net: number }
  paidOn?: string | null
  paymentMode?: string
  payslips?: { staffKey: string; snapshot?: { name?: string; designation?: string; employeeId?: string }; paidDays: number; lopDays: number; gross: number; totalDeductions: number; net: number }[]
}

export const expenseService = {
  categories: () => api.get<ExpenseCategory[]>('/cpitl/expense-categories'),
  list: (from: string, to: string) => api.get<Expense[]>('/cpitl/expenses', { from, to, limit: 300 }),
  create: (input: ExpenseInput) => api.post<Expense>('/cpitl/expenses', input),
  /** A void keeps the entry, crossed out, with the reason. */
  void: (id: string, reason: string) => api.post<Expense>(`/cpitl/expenses/${encodeURIComponent(id)}/void`, { reason }),
  vehicles: () => api.get<Vehicle[]>('/cpitl/fuel/vehicles'),
  /** A fuel fill (it also appears as a fuel expense). */
  fuel: (input: FuelInput) => api.post<unknown>('/cpitl/fuel-logs', input),
  runs: () => api.get<PayrollRun[]>('/cpitl/payroll/runs'),
  run: (month: string) => api.get<PayrollRun>(`/cpitl/payroll/runs/${encodeURIComponent(month)}`),
  payslips: (month: string) => requestBytes(`/cpitl/payroll/runs/${encodeURIComponent(month)}/payslips.pdf`),
}
