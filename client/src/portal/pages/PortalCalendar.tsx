import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AgendaList, Button, Card, EmptyState, FilterBar, MonthCalendar, Page, PageHeader, Skeleton, Tabs, dayKeyAdd, formatDayKey, monthAdd, monthGrid, monthOf,
} from '@/components/ui'
import type { CalendarItem } from '@/services/calendarService'
import CalendarItemSheet from '@/components/calendar/CalendarItemSheet'
import CalendarAgendaCard from '@/components/calendar/CalendarAgendaCard'
import CalendarFeedDialog from '@/components/calendar/CalendarFeedDialog'
import { Smartphone } from 'lucide-react'
import { dayInfoFrom, groupByDay, toEntry } from '@/components/calendar/calendarUi'
import '@/components/calendar/calendar.css'
import { usePortalCalendar } from '../usePortal'
import { LoadFailed } from './shared'

const schoolToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const isPhone = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 600px)').matches

/** The family's calendar: holidays, school events with their own instructions, exams, fee dates, meetings. */
export const PortalCalendar: React.FC = () => {
  const [params, setParams] = useSearchParams()
  const today = schoolToday()
  const [month, setMonth] = useState(() => monthOf(params.get('date') || today))
  const [view, setView] = useState<'month' | 'agenda'>(() => (isPhone() ? 'agenda' : 'month'))
  const [selected, setSelected] = useState(params.get('date') || today)
  const [child, setChild] = useState<string>('all')
  const [open, setOpen] = useState<CalendarItem | null>(null)
  const [feedOpen, setFeedOpen] = useState(false)
  const range = useMemo(() => monthGrid(month), [month])
  const { data, isLoading, isError } = usePortalCalendar(range.from, range.to)

  const linked = params.get('event')
  useEffect(() => {
    if (!linked || !data) return
    const date = params.get('date')
    const match = data.items.find((item) => item.eventId === linked && (!date || item.occurrence === date))
      || data.items.find((item) => item.eventId === linked)
    if (match) setOpen(match)
  }, [linked, data]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    setOpen(null)
    if (linked) {
      params.delete('event')
      setParams(params, { replace: true })
    }
  }

  const items = useMemo(() => (data?.items || []).filter((item) => {
    if (child === 'all') return true
    if (item.child) return item.child.studentId === child
    if (item.parts?.length) return item.parts.some((part) => !part.child || part.child.studentId === child)
    return true
  }), [data, child])
  const entries = useMemo(() => items.map(toEntry), [items])
  const days = useMemo(() => dayInfoFrom(data), [data])
  const dayGroups = useMemo(() => groupByDay(items.filter((i) => i.startDate <= selected && i.endDate >= selected), selected, selected, data), [items, selected, data])
  const monthGroups = useMemo(() => groupByDay(items, month === monthOf(today) ? today : `${month}-01`, range.to, data)
    .filter((g) => monthOf(g.date) === month), [items, month, today, range.to, data])
  const openEntry = (id: string) => setOpen(items.find((item) => item.id === id) || null)
  const children = data?.children || []

  return (
    <Page>
      <PageHeader title="Calendar" subtitle="Holidays, school events, exams and dates for your family" />
      {isError ? <LoadFailed what="The calendar" /> : null}
      <Card flush>
        <div className="cl-toolbar">
          <FilterBar
            chips={children.length > 1 ? [
              { id: 'all', label: 'Everyone', active: child === 'all' },
              ...children.map((c) => ({ id: c.studentId, label: c.name.split(' ')[0], active: child === c.studentId })),
            ] : undefined}
            onChipClick={setChild}
            actions={(
              <div className="cl-toolbar__actions">
                <Tabs variant="segmented" label="Calendar view" value={view} onChange={(id) => setView(id as 'month' | 'agenda')} items={[{ id: 'month', label: 'Month' }, { id: 'agenda', label: 'Agenda' }]} />
                <Button variant="secondary" icon={Smartphone} onClick={() => setFeedOpen(true)}>Add to phone</Button>
              </div>
            )}
          />
        </div>
      </Card>
      {view === 'month' ? (
        <div className="cb-grid-8-4">
          <Card>
            {isLoading && !data ? <Skeleton height={480} /> : (
              <MonthCalendar
                month={month}
                onMonthChange={setMonth}
                today={data?.today || today}
                selected={selected}
                onSelect={setSelected}
                entries={entries}
                onEntryClick={(entry) => openEntry(entry.id)}
                days={days}
                loading={isLoading}
              />
            )}
          </Card>
          <Card title={formatDayKey(selected, { weekday: 'long', month: 'long' })} subtitle={data?.days[selected] && data.days[selected].kind !== 'working' ? data.days[selected].label || 'No school' : undefined}>
            <AgendaList compact groups={dayGroups} today={data?.today || today} onEntryClick={(e) => openEntry(e.id)} empty={<EmptyState compact title="Nothing on this day" body="Pick another day." />} />
          </Card>
        </div>
      ) : (
        <Card
          title={`From ${formatDayKey(monthGroups[0]?.date || `${month}-01`, { month: 'long' })}`}
          action={(
            <div className="cl-toolbar__actions">
              <Button size="sm" onClick={() => setMonth((m) => monthAdd(m, -1))}>Earlier</Button>
              <Button size="sm" onClick={() => setMonth((m) => monthAdd(m, 1))}>Later</Button>
            </div>
          )}
        >
          {isLoading && !data ? <Skeleton height={320} /> : (
            <AgendaList groups={monthGroups} today={data?.today || today} onEntryClick={(e) => openEntry(e.id)} empty={<EmptyState compact title="Nothing else this month" body="Use Later to look ahead." />} />
          )}
        </Card>
      )}
      <CalendarItemSheet item={open} onClose={close} />
      <CalendarFeedDialog portal open={feedOpen} onClose={() => setFeedOpen(false)} />
    </Page>
  )
}

/** "Coming up" on the portal home. */
export const PortalComingUp: React.FC = () => {
  const today = schoolToday()
  const { data, isLoading, isError } = usePortalCalendar(today, dayKeyAdd(today, 6))
  return <CalendarAgendaCard data={data} isLoading={isLoading} isError={isError} calendarPath="/portal/calendar" />
}

export default PortalCalendar
