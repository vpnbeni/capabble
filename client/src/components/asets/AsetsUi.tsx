import React from 'react'
import { Badge, type Tone } from '@/components/ui'

/** Asset and workflow statuses as kit badges: the word always says what the colour means. */
const STATUS_TONE: Record<string, Tone | 'accent'> = {
  IN_STOCK: 'info',
  IN_USE: 'success',
  ALLOCATED: 'accent',
  UNDER_MAINTENANCE: 'warning',
  DAMAGED: 'warning',
  LOST: 'danger',
  RETIRED: 'neutral',
  DISPOSED: 'neutral',
  PROCURED: 'accent',
  RECEIVED: 'info',
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  ARCHIVED: 'neutral',
  DRAFT: 'neutral',
  OPEN: 'info',
  PENDING: 'warning',
  REQUESTED: 'warning',
  SCHEDULED: 'info',
  IN_PROGRESS: 'info',
  APPROVED: 'success',
  COMPLETED: 'success',
  CLOSED: 'neutral',
  RETURNED: 'neutral',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  OVERDUE: 'danger',
  MISSING: 'danger',
  FOUND: 'success',
  ORDERED: 'accent',
  REPORTED: 'warning',
  ASSIGNED: 'info',
  AWAITING_PARTS: 'warning',
  VERIFIED: 'success',
  WRONG_LOCATION: 'warning',
  NOT_FOUND: 'danger',
  UNVERIFIED: 'neutral',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'danger',
}

export const asetsStatusLabel = (status: string) => {
  const words = status.replace(/[_-]+/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const statusKey = (status?: string) => String(status || '').trim().toUpperCase().replace(/[\s-]+/g, '_')

/** Works for "IN_PROGRESS", "In Progress" and "in-progress" alike. */
export const asetsStatusTone = (status?: string): Tone | 'accent' => STATUS_TONE[statusKey(status)] || 'neutral'

/** Renders inside a `.cb-app` page (kit Badge). */
export const AsetsStatusBadge: React.FC<{ status?: string }> = ({ status }) =>
  status ? <Badge tone={asetsStatusTone(status)}>{asetsStatusLabel(status)}</Badge> : <span className="cb-subtle">—</span>
