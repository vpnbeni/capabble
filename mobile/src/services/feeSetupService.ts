import { api } from '@/lib/api'

// Fee setup (/api/cpitl), the website's Finance → Fee heads, Fee structures and Budgets. Rupees.

export type Frequency = 'one_time' | 'monthly' | 'quarterly' | 'half_yearly' | 'annual'
export const FREQUENCY_LABELS: Record<Frequency, string> = {
  one_time: 'Once',
  monthly: 'Every month',
  quarterly: 'Every quarter',
  half_yearly: 'Every half year',
  annual: 'Once a year',
}

export interface FeeHead {
  _id: string
  name: string
  code: string
  category?: string
  frequency: Frequency
}

export interface StructureComponent {
  feeHead: string
  name: string
  code?: string
  amount: number
  frequency: Frequency
  isOptional?: boolean
}

export interface FeeStructure {
  _id: string
  name: string
  description?: string
  applicableClasses: string[]
  components: StructureComponent[]
  installmentPlan: { dueDay: number; oneTimeMonth?: number; annualMonth?: number; halfYearlyMonths?: number[]; quarterlyMonths?: number[] }
  status: 'draft' | 'active' | 'archived'
  version?: number
  annualTotal?: number
  assignedCount?: number
}

/** What a structure save may change; components and classes go whole when sent. */
export type StructureInput = Partial<Pick<FeeStructure, 'name' | 'description' | 'applicableClasses' | 'components' | 'installmentPlan'>> & { changeNote?: string }

export interface BudgetRow {
  kind: string
  targetKey: string
  targetLabel: string
  group?: string
  budget: number
  actual: number
  usedPct: number | null
  projectedYearEnd?: number
}

const id = encodeURIComponent

export const feeSetupService = {
  heads: () => api.get<FeeHead[]>('/cpitl/fee-heads'),
  addHead: (input: { name: string; code: string; frequency: Frequency; category?: string }) => api.post<FeeHead>('/cpitl/fee-heads', input),
  structures: () => api.get<FeeStructure[]>('/cpitl/fee-structures'),
  /** A new one starts as a draft; saving an existing one makes a new version (the website's history keeps the old). */
  saveStructure: (structureId: string | undefined, input: StructureInput) =>
    structureId ? api.put<FeeStructure>(`/cpitl/fee-structures/${id(structureId)}`, input) : api.post<FeeStructure>('/cpitl/fee-structures', input),
  /** Adds the fees to every student of the classes (and makes a draft active). */
  assign: (structureId: string, classes: string[]) => api.post<{ students: number }>(`/cpitl/fee-structures/${id(structureId)}/assign`, { classes, sections: [], studentIds: [] }),
  duplicate: (structureId: string) => api.post<FeeStructure>(`/cpitl/fee-structures/${id(structureId)}/duplicate`, {}),
  archive: (structureId: string) => api.post<FeeStructure>(`/cpitl/fee-structures/${id(structureId)}/archive`, {}),
  budgets: () => api.get<BudgetRow[]>('/cpitl/budgets'),
  /** Only the rows sent change. */
  saveBudget: (row: Pick<BudgetRow, 'kind' | 'targetKey' | 'targetLabel'> & { amount: number }) => api.put<{ saved: number }>('/cpitl/budgets', { budgets: [row] }),
  /** Fills this year's budgets from last year's spending, plus a growth percentage. */
  copyBudgets: (growthPct: number) => api.post<unknown>('/cpitl/budgets/copy-from-actuals', { growthPct }),
}
