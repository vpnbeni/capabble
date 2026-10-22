import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CalendarPlus, Smartphone } from 'lucide-react'
import {
  AgendaList, Banner, Button, Card, Dialog, EmptyState, FilterBar, MonthCalendar, Page, Skeleton, Switch, Tabs, TextArea,
  formatDayKey, monthAdd, monthGrid, monthOf,
} from '@/components/ui'
import { useEventAction, useMyCalendar } from '@/hooks/useCalendar'
import { usePermissions } from '@/hooks/usePermissions'
import { apiMessage, type CalendarItem, type CalendarLayerKey } from '@/services/calendarService'
import CalendarItemSheet from '@/components/calendar/CalendarItemSheet'
import EventComposer from '@/components/calendar/EventComposer'
import CalendarFeedDialog from '@/components/calendar/CalendarFeedDialog'
import { LAYER_LABELS, dayInfoFrom, findItem, groupByDay, toEntry } from '@/components/calendar/calendarUi'
import '@/components/calendar/calendar.css'

const LAYER_ORDER: CalendarLayerKey[] = ['events', 'school_days', 'exams', 'duties', 'fees', 'appointments', 'activities']
const HIDDEN_KEY = 'capabble.calendar.hiddenLayers'

const readHidden = (): CalendarLayerKey[] => {
  try {
    return JSON.parse(window.localStorage.getItem(HIDDEN_KEY) || '[]')
  } catch {
    return []
  }
}

const isPhone = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 600px)').matches

const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

/** Cancel an event, or one date of a repeating one, and tell people. */
export const CancelEventDialog: React.FC<{ item: CalendarItem | null; onClose: () => void }> = ({ item, onClose }) => {
  const [reason, setReason] = useState('')
  const [notify, setNotify] = useState(true)
  const action = useEventAction()
  useEffect(() => {
    if (item) { setReason(''); setNotify(true) }
  }, [item])
  const oneDate = Boolean(item?.recurring)
  const confirm = async () => {
    if (!item?.eventId) return
    try {
      await action.mutateAsync({ type: 'cancel', id: item.eventId, reason, notify, occurrence: oneDate ? item.occurrence : null })
      toast.success(oneDate ? 'That date is cancelled' : 'Event cancelled')
      onClose()
    } catch (error) {
      toast.error(apiMessage(error, 'Could not cancel the event. Try again.'))
    }
  }
  return (
    <Dialog
      open={Boolean(item)}
      onClose={onClose}
      tone="danger"
      title={oneDate ? `Cancel ${item?.title} on ${item ? formatDayKey(item.occurrence || item.startDate, { weekday: 'short' }) : ''}?` : `Cancel ${item?.title}?`}
      description={oneDate ? 'Other dates of this event stay as they are.' : 'It stays on the calendar, marked cancelled.'}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Keep event</Button>
          <Button variant="danger" loading={action.isPending} onClick={confirm}>{oneDate ? 'Cancel this date' : 'Cancel event'}</Button>
        </>
      )}
    >
      <div className="cb-stack">
        <TextArea label="Reason (optional)" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} hint="Shown in the notice people get." />
        <Switch label="Tell everyone it reaches" checked={notify} onChange={setNotify} />
      </div>
    </Dialog>
  )
}

const CalendarPage: React.FC = () => {
  const { can } = usePermissions()
  const canCreate = can(['clndr.events.create', 'clndr.events.manage', 'clndr.events.publish_wide'])
  const [params, setParams] = useSearchParams()
  const today = todayKey()
  const [month, setMonth] = useState(() => params.get('month') || monthOf(params.get('date') || today))
  const [view, setView] = useState<'month' | 'agenda'>(() => (isPhone() ? 'agenda' : 'month'))
  const [selected, setSelected] = useState<string>(() => params.get('date') || today)
  const [hidden, setHidden] = useState<CalendarLayerKey[]>(readHidden)
  const [openItem, setOpenItem] = useState<CalendarItem | null>(null)
  const [composer, setComposer] = useState<{ open: boolean; eventId?: string | null; date?: string }>({ open: false })
  const [cancelling, setCancelling] = useState<CalendarItem | null>(null)
  const [feedOpen, setFeedOpen] = useState(false)

  const range = useMemo(() => monthGrid(month), [month])
  const { data, isLoading, isError, refetch } = useMyCalendar(range.from, range.to)

  useEffect(() => {
    try { window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden)) } catch { /* private mode */ }
  }, [hidden])

  // Open an event from a notification link (?event=…&date=…).
  const linkedEvent = params.get('event')
  useEffect(() => {
    if (!linkedEvent || !data) return
    const date = params.get('date')
    const match = data.items.find((item) => item.eventId === linkedEvent && (!date || item.occurrence === date))
      || data.items.find((item) => item.eventId === linkedEvent)
    setOpenItem(match || {
      id: `event:${linkedEvent}`, eventId: linkedEvent, source: 'calendar', layer: 'events', title: 'Event',
      startDate: date || today, endDate: date || today, allDay: true,
    })
  }, [linkedEvent, data]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeItem = () => {
    setOpenItem(null)
    if (linkedEvent) {
      params.delete('event')
      setParams(params, { replace: true })
    }
  }

  const counts = useMemo(() => {
    const out: Partial<Record<CalendarLayerKey, number>> = {}
    data?.items.filter((item) => monthOf(item.startDate) === month || monthOf(item.endDate) === month)
      .forEach((item) => { out[item.layer] = (out[item.layer] || 0) + 1 })
    return out
  }, [data, month])
  const layers = LAYER_ORDER.filter((key) => counts[key] || !hidden.includes(key) || key === 'events')
  const visible = useMemo(() => (data?.items || []).filter((item) => !hidden.includes(item.layer)), [data, hidden])
  const entries = useMemo(() => visible.map(toEntry), [visible])
  const days = useMemo(() => dayInfoFrom(data), [data])
  const selectedGroups = useMemo(() => groupByDay(visible.filter((i) => i.startDate <= selected && i.endDate >= selected), selected, selected, data), [visible, selected, data])
  const monthGroups = useMemo(() => {
    const first = `${month}-01`
    const from = month === monthOf(today) ? today : first
    return groupByDay(visible, from, range.to, data).filter((group) => monthOf(group.date) === month)
  }, [visible, month, today, range.to, data])

  const openEntry = (entryId: string) => {
    const item = findItem(data, entryId)
    if (item) setOpenItem(item)
  }
  const toggleLayer = (key: string) => setHidden((current) => (
    current.includes(key as CalendarLayerKey) ? current.filter((k) => k !== key) : [...current, key as CalendarLayerKey]))

  const chips = layers.map((key) => ({ id: key, label: LAYER_LABELS[key], count: counts[key] || 0, active: !hidden.includes(key) }))
  const selectedDay = data?.days?.[selected]

  return (
    <Page width="full">
      <div className="cb-stack">
        {data?.failedSources?.length ? (
          <Banner tone="warning" title="Some dates could not load">
            {data.failedSources.length === 1 ? 'One part of the calendar' : `${data.failedSources.length} parts of the calendar`} didn&apos;t respond. What you see may be incomplete.
          </Banner>
        ) : null}
        <Card flush>
          <div className="cl-toolbar">
            <FilterBar chips={chips} onChipClick={toggleLayer} actions={(
              <div className="cl-toolbar__actions">
                <Tabs
                  variant="segmented"
                  label="Calendar view"
                  value={view}
                  onChange={(id) => setView(id as 'month' | 'agenda')}
                  items={[{ id: 'month', label: 'Month' }, { id: 'agenda', label: 'Agenda' }]}
                />
                <Button variant="secondary" icon={Smartphone} onClick={() => setFeedOpen(true)}>Add to phone</Button>
                {canCreate ? (
                  <Button variant="primary" icon={CalendarPlus} onClick={() => setComposer({ open: true, eventId: null, date: selected })}>
                    New event
                  </Button>
                ) : null}
              </div>
            )} />
          </div>
        </Card>

        {isError ? (
          <Card>
            <EmptyState title="The calendar didn't load" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />
          </Card>
        ) : view === 'month' ? (
          <div className="cb-grid-8-4">
            <Card>
              {isLoading && !data ? <Skeleton height={520} /> : (
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
                  toolbar={month !== monthOf(today) ? (
                    <Button variant="secondary" size="sm" onClick={() => { setMonth(monthOf(today)); setSelected(today) }}>Today</Button>
                  ) : null}
                />
              )}
            </Card>
            <Card
              title={formatDayKey(selected, { weekday: 'long', month: 'long' })}
              subtitle={selectedDay && selectedDay.kind !== 'working' ? selectedDay.label || 'Not a working day' : undefined}
              action={canCreate ? <Button size="sm" variant="tertiary" onClick={() => setComposer({ open: true, eventId: null, date: selected })}>Add event</Button> : null}
            >
              <AgendaList
                compact
                groups={selectedGroups}
                today={data?.today || today}
                onEntryClick={(entry) => openEntry(entry.id)}
                empty={<EmptyState compact title="Nothing on this day" body={canCreate ? 'Add an event, or pick another day.' : 'Pick another day to see what is on.'} />}
              />
            </Card>
          </div>
        ) : (
          <Card
            title={`From ${formatDayKey(monthGroups[0]?.date || `${month}-01`, { month: 'long' })}`}
            action={(
              <div className="cl-toolbar__actions">
                <Button size="sm" variant="secondary" onClick={() => setMonth((m) => monthAdd(m, -1))}>Earlier</Button>
                <Button size="sm" variant="secondary" onClick={() => setMonth((m) => monthAdd(m, 1))}>Later</Button>
              </div>
            )}
          >
            {isLoading && !data ? <Skeleton height={320} /> : (
              <AgendaList
                groups={monthGroups}
                today={data?.today || today}
                onEntryClick={(entry) => openEntry(entry.id)}
                empty={<EmptyState compact title="Nothing else this month" body="Use Later to look ahead." />}
              />
            )}
          </Card>
        )}
        {canCreate ? (
          <p className="cb-muted">
            Events you created, drafts and approvals are under <Link className="cb-link" to="/calendar/events">Calendar events</Link>.
          </p>
        ) : null}
      </div>

      <CalendarItemSheet
        item={openItem}
        onClose={closeItem}
        onEdit={(eventId) => { closeItem(); setComposer({ open: true, eventId }) }}
        onCancel={(item) => { closeItem(); setCancelling(item) }}
      />
      <CancelEventDialog item={cancelling} onClose={() => setCancelling(null)} />
      <CalendarFeedDialog open={feedOpen} onClose={() => setFeedOpen(false)} />
      <EventComposer
        open={composer.open}
        eventId={composer.eventId || null}
        defaultDate={composer.date}
        onClose={() => setComposer({ open: false })}
      />
    </Page>
  )
}

export default CalendarPage
