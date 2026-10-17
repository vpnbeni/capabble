interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
  /** Overrides the label derived from the status. */
  label?: string
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

// Status tones follow the design system: success done, info in progress or due, warning needs a look, danger failed.
const TONES: Record<string, Tone> = {
  active: 'success',
  completed: 'success',
  success: 'success',
  paid: 'success',
  captured: 'success',
  processed: 'success',
  in_progress: 'info',
  pending: 'info',
  running: 'info',
  trialing: 'info',
  grandfathered: 'info',
  open: 'info',
  partial_failure: 'warning',
  past_due_grace: 'warning',
  overdue: 'danger',
  suspended: 'danger',
  suspended_read_only: 'danger',
  failed: 'danger',
  canceled: 'neutral',
  void: 'neutral',
  refunded: 'neutral',
}

// Billing states read as plain words.
const LABELS: Record<string, string> = {
  trialing: 'Trial',
  past_due_grace: 'Payment due',
  suspended_read_only: 'Read-only',
  grandfathered: 'Complimentary',
  canceled: 'Cancelled',
  captured: 'Received',
  processed: 'Refunded',
}

const labelForStatus = (status: string) => {
  if (LABELS[status]) return LABELS[status]
  const text = status.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function StatusBadge({ status, size = 'md', label }: StatusBadgeProps) {
  const normalized = status.toLowerCase()
  const tone = TONES[normalized] || 'neutral'

  return (
    <span className={`cb-badge cb-badge--${tone}${size === 'sm' ? ' cb-badge--sm' : ''}`}>
      <span className="cb-badge__dot" aria-hidden="true" />
      {label || labelForStatus(normalized)}
    </span>
  )
}
