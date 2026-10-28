import { useRouter } from 'expo-router'
import { CalendarDays, CalendarPlus } from 'lucide-react-native'
import { useMemo, useState } from 'react'

import { schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { EventRow } from '@/services/eventService'
import { useEventList } from '@/staff/eventQueries'
import { eventBadge, eventWhen } from '@/staff/eventUi'
import { useStaff } from '@/staff/useStaff'
import { ActionBar, ChipRail, ListGroup, MobileScreen, NavBar, SearchBar, SegmentedControl, StatusView, Surface } from '@/ui'

type View = 'upcoming' | 'drafts' | 'approval' | 'past'

/** The same four lists as the website's Calendar events page. */
const inView = (row: EventRow, view: View, today: string) => {
  if (view === 'upcoming') return ['published', 'scheduled'].includes(row.status) && row.endDate >= today
  if (view === 'drafts') return row.status === 'draft' && row.mine
  if (view === 'approval') return row.status === 'pending_approval'
  return row.endDate < today || row.status === 'cancelled'
}

/**
 * Events this login made (everyone's for those who manage the calendar): coming up, drafts,
 * waiting for approval, past and cancelled. Each opens its record to edit, remind or cancel.
 */
export default function EventsScreen() {
  const router = useRouter()
  const staff = useStaff()
  const today = schoolToday()
  const manages = staff.can('clndr.events.manage')
  const [whose, setWhose] = useState<'mine' | 'all'>('mine')
  const everyone = manages && whose === 'all'
  const list = useEventList(everyone)
  const [picked, setView] = useState<View | null>(null)
  const [query, setQuery] = useState('')

  const rows = useMemo(() => list.data ?? [], [list.data])
  const counts = useMemo(
    () => ({
      upcoming: rows.filter((row) => inView(row, 'upcoming', today)).length,
      drafts: rows.filter((row) => inView(row, 'drafts', today)).length,
      approval: rows.filter((row) => inView(row, 'approval', today)).length,
      past: rows.filter((row) => inView(row, 'past', today)).length,
    }),
    [rows, today],
  )
  // Until a list is picked, open the first one with something in it.
  const view: View = picked ?? (['upcoming', 'approval', 'drafts', 'past'] as const).find((key) => counts[key]) ?? 'upcoming'
  const shown = rows
    .filter((row) => inView(row, view, today))
    .filter((row) => !query.trim() || row.title.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (view === 'past' ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)))

  const canCreate = staff.canUse('clndr_events') && staff.can('clndr.events.create')

  return (
    <MobileScreen
      refreshing={list.isRefetching}
      onRefresh={list.refetch}
      nav={<NavBar title="Events" back={{ label: 'Back', onPress: router.back }} />}
      actionBar={
        canCreate ? (
          <ActionBar
            icon={CalendarPlus}
            summary={counts.upcoming ? `${counts.upcoming} coming up` : 'Nothing coming up'}
            detail={counts.approval ? `${counts.approval} waiting for approval` : undefined}
            label="Create event"
            onPress={() => router.push('/event-new')}
          />
        ) : undefined
      }
    >
      {manages ? (
        <SegmentedControl
          label="Whose events"
          value={whose}
          onChange={setWhose}
          options={[
            { value: 'mine', label: 'Yours' },
            { value: 'all', label: 'Everyone’s' },
          ]}
        />
      ) : null}
      <ChipRail
        label="Show"
        value={view}
        onChange={setView}
        items={[
          { id: 'upcoming', label: 'Coming up', count: counts.upcoming },
          { id: 'drafts', label: 'Drafts', count: counts.drafts },
          { id: 'approval', label: 'Waiting for approval', count: counts.approval },
          { id: 'past', label: 'Past and cancelled', count: counts.past },
        ]}
      />
      {rows.length > 12 ? <SearchBar label="Search events" placeholder="Search events" value={query} onChange={setQuery} onCancel={() => setQuery('')} /> : null}
      {list.isPending ? (
        <CardSkeleton rows={4} />
      ) : list.isError ? (
        <LoadFailed what="Events" error={list.error} onRetry={list.refetch} />
      ) : shown.length ? (
        <ListGroup
          items={shown.map((row) => ({
            title: row.title,
            subtitle: [
              eventWhen(row),
              row.status === 'draft' && row.rejectionNote ? `Not approved: ${row.rejectionNote}` : row.audiences.join(', '),
              everyone && !row.mine && row.createdByName ? `by ${row.createdByName}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
            lines: 2,
            badge: eventBadge(row),
            onPress: () => router.push({ pathname: '/events/[id]', params: { id: row.id } }),
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView
            compact
            kind="empty"
            icon={CalendarDays}
            title={
              view === 'upcoming' ? 'No events coming up' : view === 'drafts' ? 'No drafts' : view === 'approval' ? 'Nothing waiting for approval' : 'No past events'
            }
            body={view === 'upcoming' ? 'Events you create show here until their day has passed.' : 'Pull down to check again.'}
          />
        </Surface>
      )}
    </MobileScreen>
  )
}
