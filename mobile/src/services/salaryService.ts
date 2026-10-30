import { api } from '@/lib/api'

// Salary structures (/api/cpitl/salary), the website's Finance → Salaries: each person's monthly
// pay lines, the school's PF, ESI and PT settings, and the pay lines the school uses. Rupees. Bank
// details come back with each person; the phone never shows them.

export type SalaryCalc = 'fixed' | 'percent_of_basic' | 'percent_of_gross'

export interface SalaryComponent {
  _id: string
  name: string
  code: string
  type: 'earning' | 'deduction'
  calc: SalaryCalc
  defaultValue?: number
  sortOrder?: number
}

export interface SalaryLine {
  componentId: string
  code: string
  name: string
  type: 'earning' | 'deduction'
  calc: SalaryCalc
  value: number
}

export interface SalaryOptions {
  pf: boolean
  pfWageCap: boolean
  esi: 'auto' | 'off'
  tdsMonthly: number
}

export interface StaffSalaryRow {
  teacherId: string
  name: string
  designation?: string
  department?: string
  employeeId?: string
  salary: { gross: number; net: number; deductions: number; employerCost: number; effectiveFrom: string } | null
}

export interface SalaryStructure {
  components: SalaryLine[]
  options: SalaryOptions
  effectiveFrom: string
  gross: number
  net: number
  revisions?: { effectiveFrom: string; fromGross: number; toGross: number; note?: string; at?: string }[]
}

export interface PayPreview {
  earnings: { code: string; name: string; amount: number }[]
  deductions: { code: string; name: string; amount: number }[]
  gross: number
  totalDeductions: number
  net: number
  employerPf: number
  employerEsi: number
  employerCost: number
}

export interface PayrollSettings {
  pfRate: number
  pfWageCeiling: number
  esiEmployee: number
  esiEmployer: number
  esiGrossLimit: number
  ptSlabs: { min: number; max: number | null; amount: number }[]
}

export interface RevisionResult {
  succeeded: number
  failed: { id: string; label?: string; error: string }[]
  rows: { teacherId: string; name: string; beforeGross: number; afterGross: number; beforeNet?: number; afterNet?: number; error?: string }[]
}

export const salaryService = {
  staff: () => api.get<StaffSalaryRow[]>('/cpitl/salary/staff'),
  person: (teacherId: string) => api.get<{ teacher: { _id: string; name: string; designation?: string }; structure: SalaryStructure | null }>(`/cpitl/salary/staff/${encodeURIComponent(teacherId)}`),
  /** Replaces the person's pay lines whole; a change in gross is kept in their history. */
  save: (teacherId: string, input: { components: { componentId: string; code: string; calc: SalaryCalc; value: number }[]; options: SalaryOptions; effectiveFrom: string; note?: string }) =>
    api.put<{ preview: PayPreview }>(`/cpitl/salary/staff/${encodeURIComponent(teacherId)}`, input),
  /** A month's pay worked out by the server without saving (30 days, nothing unpaid). */
  preview: (input: { components: { componentId: string; code: string; type: string; name: string; calc: SalaryCalc; value: number }[]; options: SalaryOptions }) =>
    api.post<PayPreview>('/cpitl/salary/preview', input),
  /** Raises (or lowers) several people's pay by a percent or an amount; `preview` saves nothing. */
  revise: (input: { teacherIds: string[]; mode: 'percent' | 'amount'; value: number; effectiveFrom: string; note?: string; preview: boolean }) =>
    api.post<RevisionResult>('/cpitl/salary/staff/bulk-revise', input),
  components: () => api.get<SalaryComponent[]>('/cpitl/salary/components'),
  saveComponent: (id: string | undefined, input: Partial<Omit<SalaryComponent, '_id'>>) =>
    id ? api.put<SalaryComponent>(`/cpitl/salary/components/${encodeURIComponent(id)}`, input) : api.post<SalaryComponent>('/cpitl/salary/components', input),
  /** Removed from the list; salaries that use it keep their values. */
  archiveComponent: (id: string) => api.delete<unknown>(`/cpitl/salary/components/${encodeURIComponent(id)}`),
  settings: () => api.get<PayrollSettings>('/cpitl/salary/settings'),
  /** Only the settings sent change (PT slabs as a whole list). */
  saveSettings: (input: Partial<PayrollSettings>) => api.put<PayrollSettings>('/cpitl/salary/settings', input),
}
