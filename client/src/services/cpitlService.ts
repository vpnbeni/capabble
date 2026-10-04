import type { AxiosRequestConfig } from 'axios'
import baseApi from './api'

// CPITL pages show their own success/error toasts, so opt out of the global
// interceptor toasts (`_silent`) to avoid showing every message twice.
type Config = AxiosRequestConfig
const silent = (config?: Config): Config => ({ ...(config || {}), _silent: true } as Config)
const api = {
  get: (url: string, config?: Config) => baseApi.get(url, silent(config)),
  delete: (url: string, config?: Config) => baseApi.delete(url, silent(config)),
  post: (url: string, data?: unknown, config?: Config) => baseApi.post(url, data, silent(config)),
  put: (url: string, data?: unknown, config?: Config) => baseApi.put(url, data, silent(config)),
}

export type FeeFrequency = 'one_time' | 'monthly' | 'quarterly' | 'half_yearly' | 'annual'
export type PaymentMode = 'cash' | 'upi' | 'cheque' | 'dd' | 'bank_transfer' | 'card'

export type FeeHead = {
  _id: string
  name: string
  code: string
  category: string
  frequency: FeeFrequency
  isRefundable?: boolean
  isOptional?: boolean
  description?: string
  sortOrder?: number
}

export type StructureComponent = {
  feeHead: string
  name: string
  code: string
  amount: number
  frequency: FeeFrequency
  isOptional?: boolean
}

export type InstallmentPlan = {
  dueDay: number
  oneTimeMonth: number
  annualMonth: number
  halfYearlyMonths: number[]
  quarterlyMonths: number[]
}

export type LateFeeRule = {
  type: 'none' | 'flat' | 'per_day'
  amount: number
  graceDays: number
  cap: number
}

export type FeeStructure = {
  _id: string
  name: string
  description?: string
  applicableClasses: string[]
  components: StructureComponent[]
  installmentPlan: InstallmentPlan
  lateFee: LateFeeRule
  status: 'draft' | 'active' | 'archived'
  version: number
  annualTotal: number
  annualTotalWithOptional: number
  assignedCount: number
  updatedAt?: string
  academicSession?: string
}

export type ComponentDiff = {
  added: Array<{ feeHead: string; name: string; amount: number; frequency: FeeFrequency }>
  removed: Array<{ feeHead: string; name: string; amount: number; frequency: FeeFrequency }>
  changed: Array<{ feeHead: string; name: string; changes: Array<{ field: string; from: unknown; to: unknown }> }>
  isEmpty: boolean
}

export type StructureRevision = {
  _id: string
  version: number
  changeNote: string
  changedBy?: { name?: string; email?: string }
  createdAt: string
  diff: ComponentDiff
  snapshot?: Partial<FeeStructure>
}

export type ClassOption = { class: string; count: number; sections: Array<{ section: string; count: number }> }

export type ConcessionRule = {
  _id?: string
  name?: string
  feeHead?: string | null
  type: 'percent' | 'flat'
  value: number
  reason?: string
  approvedBy?: string
}

export type DemandLine = { feeHead: string | null; name: string; code: string; frequency: string; gross: number; concession: number; net: number; paid: number }

export type FeeDemand = {
  _id: string
  periodKey: string
  label: string
  dueDate: string
  lines: DemandLine[]
  gross: number
  concession: number
  total: number
  paid: number
  balance: number
  lateFeePaid: number
  lateFeeDue: number
  isOverdue: boolean
  status: 'due' | 'partial' | 'paid' | 'waived'
}

export type StudentSnapshot = { name: string; rollNumber: string; class: string; section: string; fatherName: string; guardianPhone?: string }

export type FeePayment = {
  _id: string
  receiptNo: string
  date: string
  mode: PaymentMode
  reference: string
  cheque?: { number?: string; bank?: string; status?: '' | 'pending' | 'cleared' | 'bounced' }
  allocations: Array<{ demandId: string; periodLabel: string; name: string; amount: number }>
  feeAmount: number
  lateFeeCollected: number
  total: number
  remarks?: string
  status: 'valid' | 'cancelled'
  cancellation?: { reason?: string; at?: string }
  collectedBy?: { name?: string }
  studentSnapshot: StudentSnapshot
  student: string
}

export type AccountTotals = { gross: number; concession: number; demanded: number; paid: number; balance: number }

export type StudentAccount = {
  student: StudentSnapshot & { _id: string; motherName?: string; busNo?: string; category?: string }
  account: null | {
    _id: string
    structureId: string | null
    structureVersion: number
    optedOptionalHeads: string[]
    concessions: ConcessionRule[]
    openingBalance: number
    totals: AccountTotals
  }
  structure: null | {
    _id: string
    name: string
    version: number
    status: string
    lateFee: LateFeeRule
    optionalHeads: StructureComponent[]
    isOutdated: boolean
  }
  demands: FeeDemand[]
  payments: FeePayment[]
}

export type StudentSearchRow = StudentSnapshot & {
  _id: string
  accountId: string | null
  structureId: string | null
  totals: AccountTotals | null
}

export type CapitalSettings = {
  receiptPrefix: string
  gstin: string
  pan: string
  slipFooterNote: string
  bankDetails: string
  defaultDueDay: number
  defaultLateFee: LateFeeRule
  concessionPresets: Array<{ _id?: string; name: string; type: 'percent' | 'flat'; value: number; feeHeadCode: string }>
}

export type ClassRow = {
  class: string
  section?: string
  expected: number
  concession: number
  collected: number
  pending: number
  overdue: number
  dueSoFar: number
  students: number
  defaulters: number
  collectionRate?: number
  sections?: ClassRow[]
}

export type CpitlDashboard = {
  totals: { expected: number; gross: number; concession: number; collected: number; pending: number; overdue: number; dueSoFar: number; collectionRate: number; dueSoFarRate: number }
  payments: { total: number; lateFee: number; count: number; today: number; todayCount: number }
  coverage: { studentsWithStructure: number; activeStudents: number }
  byClass: ClassRow[]
  byMonth: Array<{ month: string; amount: number; count: number }>
  byMode: Array<{ mode: PaymentMode; amount: number; count: number }>
  defaulters: Array<StudentSnapshot & { accountId: string; studentId: string; overdue: number; installments: number; oldestDue: string }>
}

export type PaymentPayload = {
  amount: number
  lateFee?: number
  mode: PaymentMode
  reference?: string
  date?: string
  remarks?: string
  cheque?: { number?: string; bank?: string; date?: string }
  allocations?: Array<{ demandId: string; amount: number }>
}


// ── Phase 2: expenses ───────────────────────────────────────────────
export type ExpenseKind = 'salary' | 'fuel' | 'electricity' | 'operating' | 'infra'

export type Attachment = { _id?: string; name: string; url: string; mimeType: string; size: number; uploadedAt?: string }

export type ExpenseCategory = {
  _id: string
  name: string
  icon: string
  color: string
  parentId: string | null
  isSystem?: boolean
  sortOrder?: number
  isActive?: boolean
}

export type CapitalExpense = {
  _id: string
  kind: ExpenseKind
  date: string
  amount: number
  mode: PaymentMode | ''
  payee: string
  reference: string
  title: string
  notes: string
  categoryId: string | null
  attachments: Attachment[]
  sourceRef?: { model?: string; id?: string }
  status: 'valid' | 'void'
  voidReason?: string
  createdBy?: { name?: string }
}

export type ExpenseSummary = {
  totals: { expense: number; income: number; net: number; thisMonth: number }
  byKind: Array<{ kind: ExpenseKind; amount: number; count: number }>
  byMonth: Array<{ month: string; expense: number; income: number; net: number; byKind: Partial<Record<ExpenseKind, number>> }>
  byCategory: Array<{ categoryId: string | null; name: string; icon: string; color: string; amount: number; count: number }>
  recent: CapitalExpense[]
}

export type BudgetRow = {
  kind: ExpenseKind
  targetKey: string
  targetLabel: string
  group: string
  icon?: string
  color?: string
  budget: number
  actual: number
  usedPct: number | null
  monthsRecorded: number
  projectedYearEnd: number
  nextYear: number
}

export type FuelVehicle = { _id: string | null; busNo?: string; registrationNumber?: string; vehicleType?: string; lastOdometer?: number; source: 'trnst' | 'logs' }

export type FuelLog = {
  _id: string
  vehicleId: string | null
  vehicleSnapshot: { busNo?: string; registrationNumber?: string; vehicleType?: string }
  date: string
  fuelType: 'diesel' | 'petrol' | 'cng' | 'ev'
  litres: number
  ratePerLitre: number
  amount: number
  odometer: number | null
  fullTank: boolean
  station: string
  billNo: string
  filledBy: string
  mode: PaymentMode | ''
  notes: string
  attachments: Attachment[]
}

export type VehicleFuelStats = {
  vehicleId: string | null
  vehicle: { busNo?: string; registrationNumber?: string; vehicleType?: string }
  fills: number
  litres: number
  cost: number
  km: number
  kmpl: number | null
  mileageMethod: 'full_tank' | 'odometer' | null
  costPerKm: number | null
  avgRate: number | null
  lastFill: string | null
  monthly: Array<{ month: string; amount: number }>
  monthsLogged: number
  annualised: number
  projected: number
}

export type FuelAnalytics = {
  vehicles: VehicleFuelStats[]
  fleet: { litres: number; cost: number; km: number; costPerKm: number | null; annualised: number; projected: number }
  meta: { monthsElapsed: number; growthPct: number }
}

export type AssetLocationOption = { _id: string; name: string; type: string; path?: string }

export type ElectricityConnection = {
  _id: string
  name: string
  consumerNo: string
  meterNo: string
  provider: string
  locationId: string | null
  locationText: string
  sanctionedLoadKw: number
  notes?: string
}

export type ElectricityBill = {
  _id: string
  connectionId: string
  connectionSnapshot: { name: string; consumerNo: string }
  billMonth: string
  billNo: string
  periodFrom: string | null
  periodTo: string | null
  prevReading: number | null
  currReading: number | null
  units: number
  amount: number
  dueDate: string | null
  status: 'unpaid' | 'paid'
  paidOn: string | null
  mode: PaymentMode | ''
  reference: string
  notes: string
  attachments: Attachment[]
}

export type ElectricitySeries = Array<{
  connectionId: string
  months: Array<{ month: string; units: number; amount: number; costPerUnit: number | null; lastYearUnits: number | null; lastYearAmount: number | null }>
}>

export type InfraProject = {
  _id: string
  title: string
  type: 'construction' | 'renovation' | 'repair' | 'furniture' | 'it_infra' | 'landscaping' | 'other'
  description: string
  locationId: string | null
  locationText: string
  vendor: string
  sanctionedBudget: number
  startDate: string | null
  targetDate: string | null
  completedDate: string | null
  status: 'planned' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled'
  milestones: Array<{ _id?: string; title: string; dueDate: string | null; done: boolean; doneAt?: string | null }>
  documents: Attachment[]
  spent: number
  payments?: CapitalExpense[] | number
  lastPayment?: string | null
  updatedAt?: string
}

// ── Phase 2: salary & payroll ───────────────────────────────────────
export type SalaryCalc = 'fixed' | 'percent_of_basic' | 'percent_of_gross'

export type SalaryComponent = { _id: string; name: string; code: string; type: 'earning' | 'deduction'; calc: SalaryCalc; defaultValue: number; sortOrder: number }

export type SalaryOptions = { pf: boolean; pfWageCap: boolean; esi: 'auto' | 'off'; tdsMonthly: number }

export type SalaryLine = { componentId?: string; code: string; name: string; type: 'earning' | 'deduction'; calc: SalaryCalc; value: number }

export type PayLine = { code: string; name: string; amount: number }

export type PayslipCalc = {
  daysInMonth: number
  lopDays: number
  paidDays: number
  earnings: PayLine[]
  deductions: PayLine[]
  fullGross: number
  gross: number
  totalDeductions: number
  net: number
  employerPf: number
  employerEsi: number
  employerCost: number
}

export type StaffSnapshot = { name: string; employeeId: string; designation: string; department: string; dutyType: string; bankName: string; accountNumber: string; ifscCode: string }

export type StaffSalaryRow = StaffSnapshot & {
  teacherId: string
  staffKey: string
  salary: null | { _id: string; gross: number; net: number; deductions: number; employerCost: number; effectiveFrom: string }
}

export type StaffSalaryStructure = {
  _id: string
  staffKey: string
  components: SalaryLine[]
  options: SalaryOptions
  effectiveFrom: string
  gross: number
  deductions: number
  net: number
  employerCost: number
  revisions: Array<{ effectiveFrom: string; fromGross: number; toGross: number; toNet: number; note: string; by?: { name?: string }; at: string }>
}

export type PayrollSettings = {
  pfRate: number
  pfWageCeiling: number
  esiEmployee: number
  esiEmployer: number
  esiGrossLimit: number
  ptSlabs: Array<{ min: number; max: number | null; amount: number }>
}

export type Payslip = {
  _id: string
  staffKey: string
  teacherId: string
  snapshot: StaffSnapshot
  lopDays: number
  lopFromAttendance: number | null
  paidDays: number
  arrears: number
  otherDeduction: number
  earnings: PayLine[]
  deductions: PayLine[]
  gross: number
  totalDeductions: number
  net: number
  employerPf: number
  employerEsi: number
  remarks: string
}

export type PayrollTotals = { staff: number; gross: number; deductions: number; net: number; employerPf: number; employerEsi: number }

export type PayrollRun = {
  _id: string
  month: string
  status: 'draft' | 'finalized' | 'paid'
  daysInMonth: number
  payslips: Payslip[]
  totals: PayrollTotals
  attendanceUsed: boolean
  paidOn: string | null
  paymentMode: string
  reference: string
  staffWithoutSalary?: Array<{ teacherId: string; name: string; designation: string }>
}

export type SalarySummary = null | { gross: number; net: number; deductions: number; employerCost: number; effectiveFrom: string }

/** Download a binary (e.g. .xlsx) endpoint as a file. */
export const downloadBlob = async (endpoint: string, params: Record<string, unknown> | undefined, filename: string) => {
  const res = await api.get(endpoint, { params, responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
}

/** Fetch a PDF endpoint and open it in a new tab (falls back to download if popups are blocked). */
export const openPdf = async (endpoint: string, params?: Record<string, unknown>, filename = 'document.pdf') => {
  const res = await api.get(endpoint, { params, responseType: 'blob' })
  const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
  const win = window.open(url, '_blank')
  if (!win) {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
  }
  setTimeout(() => window.URL.revokeObjectURL(url), 60_000)
}

const cpitlService = {
  getDashboard: async () => (await api.get('/cpitl/dashboard')).data.data as CpitlDashboard,
  getClasses: async () => (await api.get('/cpitl/classes')).data.data as ClassOption[],

  listFeeHeads: async () => (await api.get('/cpitl/fee-heads')).data.data as FeeHead[],
  createFeeHead: async (payload: Partial<FeeHead>) => (await api.post('/cpitl/fee-heads', payload)).data,
  updateFeeHead: async (id: string, payload: Partial<FeeHead>) => (await api.put(`/cpitl/fee-heads/${id}`, payload)).data,
  deleteFeeHead: async (id: string) => (await api.delete(`/cpitl/fee-heads/${id}`)).data,

  listStructures: async () => (await api.get('/cpitl/fee-structures')).data.data as FeeStructure[],
  getStructure: async (id: string) => (await api.get(`/cpitl/fee-structures/${id}`)).data.data as FeeStructure,
  createStructure: async (payload: Partial<FeeStructure>) => (await api.post('/cpitl/fee-structures', payload)).data.data as FeeStructure,
  updateStructure: async (id: string, payload: Partial<FeeStructure> & { changeNote?: string }) =>
    (await api.put(`/cpitl/fee-structures/${id}`, payload)).data,
  duplicateStructure: async (id: string, name?: string) => (await api.post(`/cpitl/fee-structures/${id}/duplicate`, { name })).data.data as FeeStructure,
  archiveStructure: async (id: string) => (await api.post(`/cpitl/fee-structures/${id}/archive`)).data,
  assignStructure: async (id: string, payload: { classes?: string[]; sections?: string[]; studentIds?: string[] }) =>
    (await api.post(`/cpitl/fee-structures/${id}/assign`, payload)).data,
  reapplyStructure: async (id: string) => (await api.post(`/cpitl/fee-structures/${id}/reapply`)).data,
  listRevisions: async (id: string) => (await api.get(`/cpitl/fee-structures/${id}/revisions`)).data.data as StructureRevision[],
  getRevision: async (id: string, version: number) => (await api.get(`/cpitl/fee-structures/${id}/revisions/${version}`)).data.data as StructureRevision,

  searchStudents: async (params: { q?: string; class?: string; section?: string; limit?: number }) =>
    (await api.get('/cpitl/students', { params })).data.data as StudentSearchRow[],
  getStudentAccount: async (studentId: string) => (await api.get(`/cpitl/students/${studentId}/account`)).data.data as StudentAccount,
  updateStudentAccount: async (
    studentId: string,
    payload: { concessions?: ConcessionRule[]; optedOptionalHeads?: string[]; openingBalance?: number; structureId?: string | null }
  ) => (await api.put(`/cpitl/students/${studentId}/account`, payload)).data,
  collectPayment: async (studentId: string, payload: PaymentPayload) =>
    (await api.post(`/cpitl/students/${studentId}/payments`, payload)).data.data as FeePayment,
  waiveDemand: async (demandId: string, waive = true) => (await api.post(`/cpitl/demands/${demandId}/waive`, { waive })).data,

  listPayments: async (params: Record<string, string | number | undefined>) => {
    const res = await api.get('/cpitl/payments', { params })
    return { items: res.data.data as FeePayment[], summary: res.data.summary as { count: number; total: number } }
  },
  cancelPayment: async (id: string, reason: string) => (await api.post(`/cpitl/payments/${id}/cancel`, { reason })).data,
  updateChequeStatus: async (id: string, status: 'pending' | 'cleared' | 'bounced', note?: string) =>
    (await api.post(`/cpitl/payments/${id}/cheque-status`, { status, note })).data,

  openReceipt: (payment: Pick<FeePayment, '_id' | 'receiptNo'>) =>
    openPdf(`/cpitl/payments/${payment._id}/receipt.pdf`, undefined, `receipt_${payment.receiptNo.replace(/\//g, '-')}.pdf`),
  openStudentSlip: (studentId: string, upto?: string) => openPdf(`/cpitl/students/${studentId}/fee-slip.pdf`, upto ? { upto } : undefined, 'fee-slip.pdf'),
  openClassSlips: (params: { class: string; section?: string; upto?: string }) => openPdf('/cpitl/fee-slips.pdf', params, `fee-slips_${params.class}.pdf`),

  getSettings: async () => (await api.get('/cpitl/settings')).data.data as CapitalSettings,
  updateSettings: async (payload: Partial<CapitalSettings>) => (await api.put('/cpitl/settings', payload)).data,
  // Phase 2 — expenses
  uploadAttachment: async (file: File) => {
    const body = new FormData()
    body.append('file', file)
    const res = await api.post('/cpitl/attachments', body, { headers: { 'Content-Type': 'multipart/form-data' } })
    return res.data.data as Attachment
  },
  listLocations: async () => (await api.get('/cpitl/locations')).data.data as AssetLocationOption[],

  listExpenseCategories: async (all = false) =>
    (await api.get('/cpitl/expense-categories', { params: all ? { all: 'true' } : undefined })).data.data as ExpenseCategory[],
  saveExpenseCategory: async (payload: Partial<ExpenseCategory>) =>
    payload._id
      ? (await api.put(`/cpitl/expense-categories/${payload._id}`, payload)).data
      : (await api.post('/cpitl/expense-categories', payload)).data,
  archiveExpenseCategory: async (id: string) => (await api.delete(`/cpitl/expense-categories/${id}`)).data,

  listExpenses: async (params: Record<string, string | number | undefined>) => {
    const res = await api.get('/cpitl/expenses', { params })
    return { items: res.data.data as CapitalExpense[], summary: res.data.summary as { count: number; total: number } }
  },
  getExpenseSummary: async (params?: { from?: string; to?: string }) => (await api.get('/cpitl/expenses/summary', { params })).data.data as ExpenseSummary,
  saveExpense: async (payload: Partial<CapitalExpense>) =>
    payload._id ? (await api.put(`/cpitl/expenses/${payload._id}`, payload)).data : (await api.post('/cpitl/expenses', payload)).data,
  voidExpense: async (id: string, reason: string) => (await api.post(`/cpitl/expenses/${id}/void`, { reason })).data,

  getBudgets: async (growthPct = 0) => {
    const res = await api.get('/cpitl/budgets', { params: { growthPct } })
    return { rows: res.data.data as BudgetRow[], meta: res.data.meta as { monthsElapsed: number; growthPct: number } }
  },
  saveBudgets: async (budgets: Array<Pick<BudgetRow, 'kind' | 'targetKey' | 'targetLabel'> & { amount: number }>) =>
    (await api.put('/cpitl/budgets', { budgets })).data,
  copyBudgetsFromActuals: async (growthPct: number) => (await api.post('/cpitl/budgets/copy-from-actuals', { growthPct })).data,

  listFuelVehicles: async () => {
    const res = await api.get('/cpitl/fuel/vehicles')
    return { vehicles: res.data.data as FuelVehicle[], trnstActive: Boolean(res.data.meta?.trnstActive) }
  },
  listFuelLogs: async (params?: Record<string, string | undefined>) => (await api.get('/cpitl/fuel-logs', { params })).data.data as FuelLog[],
  saveFuelLog: async (payload: Partial<FuelLog>) =>
    payload._id ? (await api.put(`/cpitl/fuel-logs/${payload._id}`, payload)).data : (await api.post('/cpitl/fuel-logs', payload)).data,
  removeFuelLog: async (id: string, reason?: string) => (await api.post(`/cpitl/fuel-logs/${id}/remove`, { reason })).data,
  getFuelAnalytics: async (growthPct = 0) => (await api.get('/cpitl/fuel/analytics', { params: { growthPct } })).data.data as FuelAnalytics,
  downloadFuelProjection: (growthPct: number) => downloadBlob('/cpitl/fuel/projection.xlsx', { growthPct }, 'fuel-projection.xlsx'),

  listElectricityConnections: async () => (await api.get('/cpitl/electricity/connections')).data.data as ElectricityConnection[],
  saveElectricityConnection: async (payload: Partial<ElectricityConnection>) =>
    payload._id
      ? (await api.put(`/cpitl/electricity/connections/${payload._id}`, payload)).data
      : (await api.post('/cpitl/electricity/connections', payload)).data,
  archiveElectricityConnection: async (id: string) => (await api.delete(`/cpitl/electricity/connections/${id}`)).data,
  listElectricityBills: async (params?: Record<string, string | undefined>) =>
    (await api.get('/cpitl/electricity/bills', { params })).data.data as ElectricityBill[],
  saveElectricityBill: async (payload: Partial<ElectricityBill> & { markPaid?: boolean; paidOn?: string | null }) =>
    payload._id
      ? (await api.put(`/cpitl/electricity/bills/${payload._id}`, payload)).data
      : (await api.post('/cpitl/electricity/bills', payload)).data,
  payElectricityBill: async (id: string, payload: { paidOn: string; mode: PaymentMode; reference?: string }) =>
    (await api.post(`/cpitl/electricity/bills/${id}/pay`, payload)).data,
  removeElectricityBill: async (id: string, reason?: string) => (await api.post(`/cpitl/electricity/bills/${id}/remove`, { reason })).data,
  getElectricityAnalytics: async () => (await api.get('/cpitl/electricity/analytics')).data.data as ElectricitySeries,

  listInfraProjects: async () => (await api.get('/cpitl/infra/projects')).data.data as InfraProject[],
  getInfraProject: async (id: string) => (await api.get(`/cpitl/infra/projects/${id}`)).data.data as InfraProject & { payments: CapitalExpense[] },
  saveInfraProject: async (payload: Partial<InfraProject>) =>
    payload._id
      ? (await api.put(`/cpitl/infra/projects/${payload._id}`, payload)).data
      : (await api.post('/cpitl/infra/projects', payload)).data,
  addInfraPayment: async (id: string, payload: Partial<CapitalExpense>) => (await api.post(`/cpitl/infra/projects/${id}/payments`, payload)).data,

  // Phase 2 — salary & payroll
  getSalarySummary: async (teacherId: string) => (await api.get(`/cpitl/salary/summary/${teacherId}`)).data.data as SalarySummary,
  listSalaryComponents: async () => (await api.get('/cpitl/salary/components')).data.data as SalaryComponent[],
  saveSalaryComponent: async (payload: Partial<SalaryComponent>) =>
    payload._id
      ? (await api.put(`/cpitl/salary/components/${payload._id}`, payload)).data
      : (await api.post('/cpitl/salary/components', payload)).data,
  archiveSalaryComponent: async (id: string) => (await api.delete(`/cpitl/salary/components/${id}`)).data,
  getPayrollSettings: async () => (await api.get('/cpitl/salary/settings')).data.data as PayrollSettings,
  savePayrollSettings: async (payload: Partial<PayrollSettings>) => (await api.put('/cpitl/salary/settings', payload)).data,
  previewSalary: async (payload: { components: SalaryLine[]; options: SalaryOptions }) =>
    (await api.post('/cpitl/salary/preview', payload)).data.data as PayslipCalc,
  listStaffSalaries: async () => (await api.get('/cpitl/salary/staff')).data.data as StaffSalaryRow[],
  getStaffSalary: async (teacherId: string) =>
    (await api.get(`/cpitl/salary/staff/${teacherId}`)).data.data as { teacher: StaffSnapshot & { _id: string }; staffKey: string; structure: StaffSalaryStructure | null },
  saveStaffSalary: async (teacherId: string, payload: { components: SalaryLine[]; options: SalaryOptions; effectiveFrom?: string; note?: string }) =>
    (await api.put(`/cpitl/salary/staff/${teacherId}`, payload)).data,

  listPayrollRuns: async () => (await api.get('/cpitl/payroll/runs')).data.data as Array<Omit<PayrollRun, 'payslips'>>,
  createPayrollRun: async (month: string) => (await api.post('/cpitl/payroll/runs', { month })).data,
  getPayrollRun: async (month: string) => (await api.get(`/cpitl/payroll/runs/${month}`)).data.data as PayrollRun,
  updatePayrollRun: async (month: string, payslips: Array<Pick<Payslip, '_id'> & Partial<Pick<Payslip, 'lopDays' | 'arrears' | 'otherDeduction' | 'remarks'>>>) =>
    (await api.put(`/cpitl/payroll/runs/${month}`, { payslips })).data,
  deletePayrollRun: async (month: string) => (await api.delete(`/cpitl/payroll/runs/${month}`)).data,
  finalizePayrollRun: async (month: string) => (await api.post(`/cpitl/payroll/runs/${month}/finalize`)).data,
  payPayrollRun: async (month: string, payload: { paidOn: string; mode: PaymentMode; reference?: string }) =>
    (await api.post(`/cpitl/payroll/runs/${month}/pay`, payload)).data,
  reopenPayrollRun: async (month: string) => (await api.post(`/cpitl/payroll/runs/${month}/reopen`)).data,
  openPayslips: (month: string, staffKey?: string) =>
    openPdf(`/cpitl/payroll/runs/${month}/payslips.pdf`, staffKey ? { staffKey } : undefined, `payslips_${month}.pdf`),
  downloadBankSheet: (month: string) => downloadBlob(`/cpitl/payroll/runs/${month}/bank-sheet.xlsx`, undefined, `salary-bank-sheet_${month}.xlsx`),
}

export default cpitlService
