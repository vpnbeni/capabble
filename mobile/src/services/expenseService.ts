import { api, requestBytes } from '@/lib/api'

import type { PaymentMode } from './feeService'
import type { Attachment } from './uploadService'

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
  /** Photos of the bill, uploaded first (uploadService.attachment). */
  attachments?: Attachment[]
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
  daysInMonth?: number
  payslips?: Payslip[]
}

export interface Payslip {
  _id: string
  staffKey: string
  snapshot?: { name?: string; designation?: string; employeeId?: string }
  paidDays: number
  lopDays: number
  arrears?: number
  otherDeduction?: number
  remarks?: string
  gross: number
  totalDeductions: number
  net: number
}

/** What can change on a draft payslip; the server works the pay out again. */
export type PayslipEdit = { _id: string; lopDays?: number; arrears?: number; otherDeduction?: number; remarks?: string }

export interface MeterConnection {
  _id: string
  name: string
  consumerNo?: string
  meterNo?: string
  provider?: string
}

export interface ElectricityBill {
  _id: string
  connectionId: string
  connectionSnapshot?: { name?: string; consumerNo?: string }
  billMonth: string
  billNo?: string
  prevReading?: number | null
  currReading?: number | null
  units?: number
  amount: number
  dueDate?: string | null
  status: 'unpaid' | 'paid'
  paidOn?: string | null
  mode?: PaymentMode | ''
}

export type ProjectStatus = 'planned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled'
export type ProjectType = 'construction' | 'renovation' | 'repair' | 'furniture' | 'it_infra' | 'landscaping' | 'other'

export interface InfraProject {
  _id: string
  title: string
  type: ProjectType
  vendor?: string
  sanctionedBudget: number
  status: ProjectStatus
  spent?: number
  payments?: number
  lastPayment?: string | null
  locationText?: string
}

const month_ = (month: string) => `/cpitl/payroll/runs/${encodeURIComponent(month)}`

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
  /** Works out every salaried person's pay for a month ("2026-10"), as a draft. */
  startRun: (month: string) => api.post<PayrollRun>('/cpitl/payroll/runs', { month }),
  /** Draft only: only the payslips sent change; the server works their pay out again. */
  editPayslips: (month: string, payslips: PayslipEdit[]) => api.put<PayrollRun>(month_(month), { payslips }),
  finalize: (month: string) => api.post<PayrollRun>(`${month_(month)}/finalize`, {}),
  /** Records the salaries as one expense. */
  markPaid: (month: string, input: { paidOn: string; mode: PaymentMode; reference?: string }) => api.post<PayrollRun>(`${month_(month)}/pay`, input),
  /** Back to draft; a paid run's expense is voided. */
  reopen: (month: string) => api.post<PayrollRun>(`${month_(month)}/reopen`, {}),
  removeRun: (month: string) => api.delete<unknown>(month_(month)),
  bankSheet: (month: string) => requestBytes(`${month_(month)}/bank-sheet.xlsx`),
  meters: () => api.get<MeterConnection[]>('/cpitl/electricity/connections'),
  addMeter: (input: { name: string; consumerNo?: string; meterNo?: string; provider?: string }) => api.post<MeterConnection>('/cpitl/electricity/connections', input),
  bills: () => api.get<ElectricityBill[]>('/cpitl/electricity/bills'),
  /** A month's bill for a meter; markPaid also records the payment (and its expense). */
  addBill: (input: { connectionId: string; billMonth: string; amount: number; prevReading?: number; currReading?: number; billNo?: string; dueDate?: string; markPaid?: boolean; mode?: PaymentMode; paidOn?: string }) =>
    api.post<ElectricityBill>('/cpitl/electricity/bills', input),
  payBill: (billId: string, input: { mode: PaymentMode; paidOn: string; reference?: string }) => api.post<ElectricityBill>(`/cpitl/electricity/bills/${encodeURIComponent(billId)}/pay`, input),
  projects: () => api.get<InfraProject[]>('/cpitl/infra/projects'),
  /** Only the fields sent change (milestones and documents are left alone). */
  saveProject: (input: { _id?: string; title?: string; type?: ProjectType; vendor?: string; sanctionedBudget?: number; status?: ProjectStatus }) =>
    input._id ? api.put<InfraProject>(`/cpitl/infra/projects/${encodeURIComponent(input._id)}`, input) : api.post<InfraProject>('/cpitl/infra/projects', input),
  /** A payment towards a project (a capital expense). */
  payProject: (projectId: string, input: { amount: number; mode: PaymentMode; date: string; reference?: string; payee?: string }) =>
    api.post<unknown>(`/cpitl/infra/projects/${encodeURIComponent(projectId)}/payments`, input),
}
