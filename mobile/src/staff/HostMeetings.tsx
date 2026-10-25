import { useRouter } from 'expo-router'
import { CalendarClock, Clock, Users } from 'lucide-react-native'
import { useState } from 'react'

import { dayKeyAdd, formatDayKey, formatTime, minutesBetween, schoolTimeNow, schoolToday } from '@/lib/format'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { Appointment } from '@/services/appntService'
import { Callout, Hero, ListGroup, MobileScreen, NavBar, SegmentedControl, StatusView, Surface, useToast, type ListGroupItem } from '@/ui'

import { MEETING_STATUS, MeetingSheet } from './MeetingSheet'
import { useMeetingDay, useMeetingList } from './queries'

type View = 'today' | 'requests' | 'upcoming'

export const meetingRow = (a: Appointment, onPress: () => void, { withDate = false } = {}): ListGroupItem => ({
  title: a.visitor.name,
  subtitle: [withDate ? formatDayKey(a.date, { weekday: 'short' }) : null, formatTime(a.startTime), a.purpose].filter(Boolean).join(' · '),
  icon: Users,
  tile: 2,
  badge: MEETING_STATUS[a.status],
  onPress,
})

/**
 * A host's meetings: today's (the next one as the Hero), requests to answer, and what's coming.
 * Each opens the meeting sheet to confirm, check in, finish, decline or cancel.
 */
export function HostMeetings() {
  const router = useRouter()
  const toast = useToast()
  const today = schoolToday()
  const now = schoolTimeNow()
  const [view, setView] = useState<View>('today')
  const [open, setOpen] = useState<Appointment | null>(null)
  const day = useMeetingDay(today)
  const requests = useMeetingList('requests', today)
  const upcoming = useMeetingList('upcoming', dayKeyAdd(today, 1), view === 'upcoming')

  const todays = (day.data?.items ?? []).filter((a) => !['declined', 'cancelled'].includes(a.status))
  const next = todays.find((a) => ['confirmed', 'checked_in'].includes(a.status) && a.endTime > now)
  const pending = day.data?.pendingRequests ?? requests.data?.pagination.total ?? 0
  const list = view === 'today' ? day : view === 'requests' ? requests : upcoming
  const items = view === 'today' ? todays : (view === 'requests' ? requests.data?.items : upcoming.data?.items) ?? []
  // Keep the open sheet in step with the lists after an action refreshes them.
  const shown = open ? ([...todays, ...(requests.data?.items ?? []), ...(upcoming.data?.items ?? [])].find((a) => a._id === open._id) ?? open) : null

  return (
    <MobileScreen
      refreshing={day.isRefetching || requests.isRefetching}
      onRefresh={() => {
        day.refetch()
        requests.refetch()
        if (view === 'upcoming') upcoming.refetch()
      }}
      nav={
        <NavBar
          title="Meetings"
          back={{ label: 'Back', onPress: router.back }}
          actions={[{ icon: Clock, label: 'Your hours', onPress: () => router.push('/meetings/hours') }]}
        />
      }
      overlay={<MeetingSheet meeting={shown} onClose={() => setOpen(null)} onDone={(message) => toast(message)} />}
    >
      {day.isPending ? null : next ? (
        <Hero
          icon={CalendarClock}
          label={next.status === 'checked_in' ? `Here now · ${next.purpose}` : `Next · ${next.purpose}`}
          value={next.status === 'checked_in' ? next.visitor.name : next.startTime <= now ? 'Now' : minutesBetween(now, next.startTime) <= 60 ? `${minutesBetween(now, next.startTime)} min` : formatTime(next.startTime)}
          detail={next.status === 'checked_in' ? `Checked in for ${formatTime(next.startTime)}` : `${next.visitor.name} · ${formatTime(next.startTime)} to ${formatTime(next.endTime)}`}
          action={{ label: 'Open', onPress: () => setOpen(next) }}
        />
      ) : null}
      {pending && view !== 'requests' ? (
        <Callout tone="warning" title={pending === 1 ? '1 request to answer' : `${pending} requests to answer`} action={{ label: 'See requests', onPress: () => setView('requests') }}>
          Families are waiting to hear if you can meet them.
        </Callout>
      ) : null}
      <SegmentedControl
        label="Show"
        value={view}
        onChange={setView}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'requests', label: pending ? `Requests ${pending}` : 'Requests' },
          { value: 'upcoming', label: 'Upcoming' },
        ]}
      />
      {list.isPending ? (
        <CardSkeleton rows={3} />
      ) : list.isError ? (
        <LoadFailed what="Your meetings" error={list.error} onRetry={list.refetch} />
      ) : items.length ? (
        <ListGroup items={items.map((a) => meetingRow(a, () => setOpen(a), { withDate: view !== 'today' }))} />
      ) : (
        <Surface padded={false}>
          <StatusView
            compact
            kind="empty"
            icon={Users}
            title={view === 'today' ? 'No meetings today' : view === 'requests' ? 'No requests waiting' : 'No meetings coming up'}
            body={view === 'requests' ? 'Requests from families show here to confirm or decline.' : 'Meetings booked with you show here.'}
          />
        </Surface>
      )}
    </MobileScreen>
  )
}
