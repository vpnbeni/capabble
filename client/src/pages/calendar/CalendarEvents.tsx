import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { CalendarPlus } from 'lucide-react'
import {
  Badge, Button, Card, CardToolbar, DataTable, Dialog, EmptyState, Entity, FilterBar, Menu, Page, formatDayKey, formatRelative, formatTime,
} from '@/components/ui'
import type { DataTableColumn, MenuItem } from '@/components/ui'
import { useAudienceOptions, useCalendarEvents, useEventAction } from '@/hooks/useCalendar'
import { usePermissions } from '@/hooks/usePermissions'
import { apiMessage, type EventListRow } from '@/services/calendarService'
import EventComposer from '@/components/calendar/EventComposer'
import { CancelEventDialog } from './CalendarPage'
import { CATEGORY_LABELS, STATUS_LABELS } from '@/components/calendar/calendarUi'
import '@/components/calendar/calendar.css'

type View = 'upcoming' | 'drafts' | 'approval' | 'past'

const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

const whenOf = (row: EventListRow) => {
  const days = row.endDate && row.endDate !== row.startDate
    ? `${formatDayKey(row.startDate, { weekday: 'short' })} – ${formatDayKey(row.endDate, { weekday: 'short' })}`
    : formatDayKey(row.startDate, { weekday: 'short', year: true })
  return row.allDay || !row.startTime ? days : `${days}, ${formatTime(row.startTime)}`
}

/** Events this person created, plus approvals and the whole school's events for those who manage them. */
const CalendarEvents: React.FC = () => {
  const { can } = usePermissions()
  const seesAll = can(['clndr.events.manage', 'clndr.events.approve'])
  const canApprove = can(['clndr.events.approve', 'clndr.events.manage'])
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>(() => (params.get('status') === 'pending_approval' ? 'approval' : 'upcoming'))
  const [search, setSearch] = useState('')
  const [onlyMine, setOnlyMine] = useState(!seesAll)
  const [composer, setComposer] = useState<{ open: boolean; id: string | null }>({ open: false, id: null })
  const [deleting, setDeleting] = useState<EventListRow | null>(null)
  const [cancelling, setCancelling] = useState<EventListRow | null>(null)
  const { data: rows = [], isLoading } = useCalendarEvents(undefined, onlyMine)
  useAudienceOptions()
  const action = useEventAction()
  const today = todayKey()

  // Open an event from a link (?event=…), e.g. an approval notice.
  useEffect(() => {
    const id = params.get('event')
    if (id) setComposer({ open: true, id })
  }, [params])

  const counts = useMemo(() => ({
    upcoming: rows.filter((r) => ['published', 'scheduled'].includes(r.status) && r.endDate >= today).length,
    drafts: rows.filter((r) => r.status === 'draft' && r.mine).length,
    approval: rows.filter((r) => r.status === 'pending_approval').length,
    past: rows.filter((r) => r.endDate < today || r.status === 'cancelled').length,
  }), [rows, today])

  const shown = useMemo(() => rows
    .filter((r) => {
      if (view === 'upcoming') return ['published', 'scheduled'].includes(r.status) && r.endDate >= today
      if (view === 'drafts') return r.status === 'draft' && r.mine
      if (view === 'approval') return r.status === 'pending_approval'
      return r.endDate < today || r.status === 'cancelled'
    })
    .filter((r) => !search.trim() || r.title.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (view === 'past' ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate))),
  [rows, view, search, today])

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
      toast.success(label)
    } catch (error) {
      toast.error(apiMessage(error, 'That didn’t work. Try again.'))
    }
  }

  const menuFor = (row: EventListRow): MenuItem[] => {
    const items: MenuItem[] = [{ label: row.status === 'published' ? 'Edit' : 'Open', onSelect: () => setComposer({ open: true, id: row.id }) }]
    if (row.status === 'draft' && row.mine) items.push({ label: 'Publish', onSelect: () => run('Published', () => action.mutateAsync({ type: 'publish', id: row.id })) })
    if (row.status === 'pending_approval' && canApprove && !row.mine) {
      items.push({ label: 'Approve and publish', onSelect: () => run('Approved and published', () => action.mutateAsync({ type: 'approve', id: row.id })) })
    }
    if (['published', 'scheduled'].includes(row.status)) items.push({ divider: true }, { label: 'Cancel event', tone: 'danger', onSelect: () => setCancelling(row) })
    if (['draft', 'pending_approval'].includes(row.status)) items.push({ divider: true }, { label: 'Delete draft', tone: 'danger', onSelect: () => setDeleting(row) })
    return items
  }

  const columns: DataTableColumn<EventListRow>[] = [
    {
      key: 'title',
      header: 'Event',
      mobile: 'title',
      render: (row) => <Entity primary={row.title} secondary={[CATEGORY_LABELS[row.category], row.recurrence?.freq ? 'Repeats' : ''].filter(Boolean).join(' · ')} />,
    },
    { key: 'when', header: 'When', mobile: 'subtitle', render: whenOf },
    { key: 'audiences', header: 'For', mobile: 'hidden', render: (row) => row.audiences.slice(0, 2).join(', ') + (row.audiences.length > 2 ? ` +${row.audiences.length - 2}` : '') || '—' },
    { key: 'by', header: 'Added by', mobile: 'hidden', render: (row) => (row.mine ? 'You' : row.createdByName || '—') },
    { key: 'updated', header: 'Updated', mobile: 'hidden', render: (row) => formatRelative(row.updatedAt) },
    {
      key: 'status',
      header: 'Status',
      mobile: 'aside',
      render: (row) => {
        const status = STATUS_LABELS[row.status]
        return <Badge tone={status.tone}>{row.status === 'draft' && row.rejectionNote ? 'Sent back' : status.label}</Badge>
      },
    },
    { key: 'menu', header: '', headerLabel: 'Actions', interactive: true, width: '48px', render: (row) => <Menu items={menuFor(row)} label={`Actions for ${row.title}`} /> },
  ]

  const chips = [
    { id: 'upcoming', label: 'Upcoming', count: counts.upcoming, active: view === 'upcoming' },
    { id: 'drafts', label: 'My drafts', count: counts.drafts, active: view === 'drafts' },
    ...(canApprove || counts.approval ? [{ id: 'approval', label: 'Waiting for approval', count: counts.approval, active: view === 'approval' }] : []),
    { id: 'past', label: 'Past and cancelled', count: counts.past, active: view === 'past' },
  ]

  return (
    <Page>
      <Card flush>
        <CardToolbar>
          <FilterBar
            search={{ value: search, onChange: setSearch, placeholder: 'Search events' }}
            chips={chips}
            onChipClick={(id) => setView(id as View)}
            actions={(
              <div className="cl-toolbar__actions">
                {seesAll ? (
                  <Button size="sm" variant="tertiary" onClick={() => setOnlyMine((v) => !v)}>{onlyMine ? 'Show everyone’s' : 'Show only mine'}</Button>
                ) : null}
                <Button variant="primary" icon={CalendarPlus} onClick={() => setComposer({ open: true, id: null })}>New event</Button>
              </div>
            )}
          />
        </CardToolbar>
        <DataTable
          columns={columns}
          rows={shown}
          getRowKey={(row) => row.id}
          loading={isLoading}
          loadingLabel="Loading events"
          onRowClick={(row) => setComposer({ open: true, id: row.id })}
          empty={search ? (
            <EmptyState compact title="No events match" body="Try a different word." />
          ) : (
            <EmptyState
              compact
              title={{ upcoming: 'No upcoming events', drafts: 'No drafts', approval: 'Nothing waiting for approval', past: 'No past events' }[view]}
              body={view === 'upcoming' ? 'Create an event and choose who it is for.' : undefined}
            />
          )}
        />
      </Card>

      <EventComposer
        open={composer.open}
        eventId={composer.id}
        onClose={() => {
          setComposer({ open: false, id: null })
          if (params.get('event')) {
            params.delete('event')
            setParams(params, { replace: true })
          }
        }}
      />
      <CancelEventDialog
        item={cancelling ? {
          id: cancelling.id, eventId: cancelling.id, title: cancelling.title, source: 'calendar', layer: 'events',
          startDate: cancelling.startDate, endDate: cancelling.endDate, allDay: cancelling.allDay, recurring: false,
        } : null}
        onClose={() => setCancelling(null)}
      />
      <Dialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        tone="danger"
        title={`Delete ${deleting?.title}?`}
        description="The draft is removed. Nobody was told about it, so nobody is told now."
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Keep draft</Button>
            <Button
              variant="danger"
              loading={action.isPending}
              onClick={() => deleting && run('Draft deleted', () => action.mutateAsync({ type: 'delete', id: deleting.id })).then(() => setDeleting(null))}
            >
              Delete draft
            </Button>
          </>
        )}
      />
    </Page>
  )
}

export default CalendarEvents
