import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Icon } from '@/components/ui'

const shiftMonth = (monthKey: string, delta: number) => {
  const [yearValue, monthValue] = monthKey.split('-').map(Number)
  const next = new Date(yearValue, (monthValue || 1) - 1 + delta, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

export const formatMonthLabel = (monthKey: string) => {
  const [yearValue, monthValue] = monthKey.split('-').map(Number)
  if (!yearValue || !monthValue) return monthKey
  return new Date(yearValue, monthValue - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
}

/** Previous / next month stepper. Renders inside a `.cb-app` page. */
export const MonthSwitcher = ({
  value,
  onChange,
}: {
  value: string
  onChange: (month: string) => void
}) => (
  <div className="attnd-stepper" role="group" aria-label="Month">
    <button
      type="button"
      className="attnd-stepper__btn"
      title="Previous month"
      aria-label="Previous month"
      onClick={() => onChange(shiftMonth(value, -1))}
    >
      <Icon icon={ChevronLeft} size={16} />
    </button>
    <span className="attnd-stepper__label" aria-live="polite">
      {formatMonthLabel(value)}
    </span>
    <button
      type="button"
      className="attnd-stepper__btn"
      title="Next month"
      aria-label="Next month"
      onClick={() => onChange(shiftMonth(value, 1))}
    >
      <Icon icon={ChevronRight} size={16} />
    </button>
  </div>
)
