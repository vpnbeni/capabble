import React from 'react'
import { UserRound } from 'lucide-react'
import { Badge, Card, EmptyState, type Tone } from '@/components/ui'
import type { AttendanceDayStatus } from '../portalService'

export const pad2 = (n: number) => String(n).padStart(2, '0')
export const monthKey = (date = new Date()) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`

export const formatMonth = (month: string) => {
  const [year, m] = month.split('-').map(Number)
  return new Date(year, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export const ATTENDANCE_LABEL: Record<AttendanceDayStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half day',
  holiday: 'Holiday',
  weekly_off: 'Sunday',
  upcoming: '',
}

export const FEE_STATUS: Record<string, { tone: Tone; label: string }> = {
  paid: { tone: 'success', label: 'Paid' },
  partial: { tone: 'warning', label: 'Partly paid' },
  due: { tone: 'info', label: 'Due' },
  overdue: { tone: 'danger', label: 'Overdue' },
  waived: { tone: 'neutral', label: 'Waived' },
}

export const FeeStatusBadge: React.FC<{ status: string; isOverdue?: boolean }> = ({ status, isOverdue }) => {
  const key = isOverdue && status !== 'paid' ? 'overdue' : status
  const entry = FEE_STATUS[key] || FEE_STATUS.due
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

/** Shown when a parent has no children linked yet. */
export const NoChild: React.FC = () => (
  <Card>
    <EmptyState
      icon={UserRound}
      title="No student is linked to this login"
      body="Ask the school office to link your child to your login."
    />
  </Card>
)

export const LoadFailed: React.FC<{ what: string }> = ({ what }) => (
  <Card>
    <EmptyState title={`${what} didn't load`} body="Check your connection and refresh the page." compact />
  </Card>
)
