import type { FeeFrequency, InstallmentPlan, StructureComponent } from '@/services/cpitlService'

// Mirrors server/src/modules/cpitl/feeSchedule.js so editors can preview schedules live.

export const SESSION_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]

export const DEFAULT_PLAN: InstallmentPlan = {
  dueDay: 10,
  oneTimeMonth: 4,
  annualMonth: 4,
  halfYearlyMonths: [4, 10],
  quarterlyMonths: [4, 7, 10, 1],
}

export const monthsForFrequency = (frequency: FeeFrequency, plan: InstallmentPlan = DEFAULT_PLAN): number[] => {
  switch (frequency) {
    case 'one_time':
      return [plan.oneTimeMonth]
    case 'annual':
      return [plan.annualMonth]
    case 'half_yearly':
      return plan.halfYearlyMonths
    case 'quarterly':
      return plan.quarterlyMonths
    case 'monthly':
      return SESSION_MONTHS
    default:
      return []
  }
}

export const annualFor = (component: Pick<StructureComponent, 'amount' | 'frequency'>, plan?: InstallmentPlan) =>
  (Number(component.amount) || 0) * monthsForFrequency(component.frequency, plan).length

/** Month-by-month preview in session order: [{ month, amount, heads }]. */
export const schedulePreview = (components: StructureComponent[], plan: InstallmentPlan, includeOptional = false) =>
  SESSION_MONTHS.map((month) => {
    const heads = components.filter(
      (c) => (includeOptional || !c.isOptional) && Number(c.amount) > 0 && monthsForFrequency(c.frequency, plan).includes(month)
    )
    return { month, amount: heads.reduce((s, c) => s + Number(c.amount), 0), heads }
  }).filter((row) => row.amount > 0)

export const sessionYearFor = (month: number, sessionLabel?: string) => {
  const start = Number(String(sessionLabel || '').slice(0, 4)) || new Date().getFullYear()
  return month >= 4 ? start : start + 1
}
