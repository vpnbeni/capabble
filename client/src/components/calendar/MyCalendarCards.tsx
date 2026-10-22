import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card, MiniCalendar, Skeleton, dayKeyAdd, monthGrid, monthOf } from '@/components/ui'
import type { CalendarDayInfo, Tone } from '@/components/ui'
import { useMyCalendar } from '@/hooks/useCalendar'
import type { CalendarLayerKey } from '@/services/calendarService'
import CalendarAgendaCard, { todayLine } from './CalendarAgendaCard'

export const schoolToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

/** "Coming up" for the signed-in staff member: today and the next six days. */
export const MyCalendarCard: React.FC<{ title?: string; days?: number; limit?: number; fill?: boolean }> = ({ title, days = 7, limit, fill }) => {
  const today = schoolToday()
  const { data, isLoading, isError } = useMyCalendar(today, dayKeyAdd(today, days - 1))
  return <CalendarAgendaCard title={title} data={data} isLoading={isLoading} isError={isError} calendarPath="/calendar" days={days} limit={limit} fill={fill} />
}

const LAYER_TONE: Partial<Record<CalendarLayerKey, Tone | 'accent'>> = {
  events: 'accent',
  exams: 'warning',
  duties: 'info',
  fees: 'success',
  school_days: 'neutral',
}

/** This month at a glance: days off shaded, a dot for each kind of thing on a day. */
export const MonthGlanceCard: React.FC<{ title?: string }> = ({ title = 'This month' }) => {
  const navigate = useNavigate()
  const today = schoolToday()
  const [month, setMonth] = useState(monthOf(today))
  const range = useMemo(() => monthGrid(month), [month])
  const { data, isLoading } = useMyCalendar(range.from, range.to)
  const days = useMemo(() => {
    const out: Record<string, CalendarDayInfo> = {}
    Object.entries(data?.days || {}).forEach(([key, day]) => {
      out[key] = { off: !day.working, label: day.kind === 'working' ? undefined : day.label }
    })
    data?.items.forEach((item) => {
      const tone = LAYER_TONE[item.layer] || 'accent'
      let key = item.startDate
      let guard = 0
      while (key <= item.endDate && guard < 40) {
        const info = out[key] || {}
        const tones = info.tones || []
        if (!tones.includes(tone)) out[key] = { ...info, tones: [...tones, tone] }
        key = dayKeyAdd(key, 1)
        guard += 1
      }
    })
    return out
  }, [data])
  return (
    <Card title={title} subtitle={todayLine(data)} action={<Link className="cb-link" to="/calendar">Open calendar</Link>}>
      {isLoading && !data ? <Skeleton height={260} /> : (
        <MiniCalendar
          month={month}
          onMonthChange={setMonth}
          today={data?.today || today}
          days={days}
          onSelect={(key) => navigate(`/calendar?date=${key}`)}
          legend={[
            { label: 'Events', tone: 'accent' },
            { label: 'Exams', tone: 'warning' },
            { label: 'Duties', tone: 'info' },
            { label: 'Holidays', tone: 'neutral' },
          ]}
        />
      )}
    </Card>
  )
}
