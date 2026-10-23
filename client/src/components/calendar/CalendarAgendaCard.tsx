import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AgendaList, Badge, Card, EmptyState, Skeleton, dayKeyAdd } from '@/components/ui'
import type { CalendarData, CalendarItem } from '@/services/calendarService'
import CalendarItemSheet from './CalendarItemSheet'
import { groupByDay } from './calendarUi'
import './calendar.css'

const DAY_TONE: Record<string, 'neutral' | 'warning' | 'info'> = {
  holiday: 'neutral',
  vacation: 'neutral',
  weekly_off: 'neutral',
  closure: 'warning',
  half_day: 'info',
}

/** Today's school-day status in words: "Holiday: Diwali", "Half day, school ends 12:30". */
export const todayLine = (data?: CalendarData) => {
  if (!data) return null
  const day = data.days[data.today]
  if (!day || day.kind === 'working') return null
  const text = day.kind === 'weekly_off'
    ? 'Day off today'
    : day.kind === 'half_day' && day.halfDayEndTime
      ? `Half day: school ends ${day.halfDayEndTime}`
      : day.kind === 'closure' && day.mode && day.mode !== 'closed'
        ? `${day.label} (classes ${day.mode})`
        : day.label || 'Not a working day'
  return <Badge tone={DAY_TONE[day.kind] || 'neutral'}>{text}</Badge>
}

/**
 * "Coming up": today and the next days from the viewer's own calendar, for any
 * dashboard (staff Home, the crew screen, the family portal). Pass the data from the
 * matching hook (useMyCalendar or usePortalCalendar) for [today, today + days - 1].
 */
const CalendarAgendaCard: React.FC<{
  data?: CalendarData
  isLoading?: boolean
  isError?: boolean
  calendarPath: string
  title?: string
  days?: number
  limit?: number
  fill?: boolean
}> = ({ data, isLoading, isError, calendarPath, title = 'Coming up', days = 7, limit = 8, fill }) => {
  const [open, setOpen] = useState<CalendarItem | null>(null)
  const groups = useMemo(() => {
    if (!data) return []
    const to = dayKeyAdd(data.today, days - 1)
    let left = limit
    return groupByDay(data.items, data.today, to, data)
      .map((group) => {
        const entries = group.entries.slice(0, Math.max(0, left))
        left -= entries.length
        return { ...group, entries }
      })
      .filter((group) => group.entries.length)
  }, [data, days, limit])
  const total = data ? data.items.length : 0
  const shown = groups.reduce((n, g) => n + g.entries.length, 0)

  return (
    <Card
      title={title}
      subtitle={todayLine(data)}
      fill={fill}
      action={<Link className="cb-link" to={calendarPath}>Open calendar</Link>}
      footer={total > shown ? <span className="cb-muted">{total - shown} more in the next {days} days</span> : undefined}
    >
      {isLoading && !data ? (
        <div className="cb-skeleton-stack"><Skeleton height={16} width="40%" /><Skeleton height={40} /><Skeleton height={40} /></div>
      ) : isError ? (
        <EmptyState compact title="The calendar didn't load" body="Open the calendar to try again." />
      ) : (
        <AgendaList
          compact
          groups={groups}
          today={data?.today}
          onEntryClick={(entry) => setOpen(data?.items.find((item) => item.id === entry.id) || null)}
          empty={<EmptyState compact title={`Nothing in the next ${days} days`} body="School events, exams, duties and fee dates show here." />}
        />
      )}
      <CalendarItemSheet item={open} onClose={() => setOpen(null)} />
    </Card>
  )
}

export default CalendarAgendaCard
