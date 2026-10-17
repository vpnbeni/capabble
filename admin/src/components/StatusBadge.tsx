interface StatusBadgeProps {
  status: string
  size?: 'sm' | 'md'
}

type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

// Status tones follow the design system: success done, info in progress, warning needs a look, danger failed.
const TONES: Record<string, Tone> = {
  active: 'success',
  completed: 'success',
  success: 'success',
  in_progress: 'info',
  pending: 'info',
  running: 'info',
  partial_failure: 'warning',
  suspended: 'danger',
  failed: 'danger',
}

const labelForStatus = (status: string) => {
  const text = status.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const normalized = status.toLowerCase()
  const tone = TONES[normalized] || 'neutral'

  return (
    <span className={`cb-badge cb-badge--${tone}${size === 'sm' ? ' cb-badge--sm' : ''}`}>
      <span className="cb-badge__dot" aria-hidden="true" />
      {labelForStatus(normalized)}
    </span>
  )
}
