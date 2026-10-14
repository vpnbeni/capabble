import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Icon } from '@/components/ui'

const shiftDate = (dateKey: string, delta: number) => {
  const next = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(next.getTime())) return dateKey
  next.setDate(next.getDate() + delta)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

const formatDateLabel = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateKey
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

/** Previous / next day stepper. Renders inside a `.cb-app` page. */
export const DateSwitcher = ({
  value,
  onChange,
}: {
  value: string
  onChange: (date: string) => void
}) => (
  <div className="attnd-stepper" role="group" aria-label="Date">
    <button
      type="button"
      className="attnd-stepper__btn"
      title="Previous day"
      aria-label="Previous day"
      onClick={() => onChange(shiftDate(value, -1))}
    >
      <Icon icon={ChevronLeft} size={16} />
    </button>
    <span className="attnd-stepper__label" aria-live="polite">
      {formatDateLabel(value)}
    </span>
    <button
      type="button"
      className="attnd-stepper__btn"
      title="Next day"
      aria-label="Next day"
      onClick={() => onChange(shiftDate(value, 1))}
    >
      <Icon icon={ChevronRight} size={16} />
    </button>
  </div>
)
