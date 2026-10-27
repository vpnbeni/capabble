import { useRouter } from 'expo-router'

import { schoolToday } from '@/lib/format'
import { Callout, ListGroup, Section } from '@/ui'

import { isFrontDesk, isMeetingHost } from './access'
import { meetingRow } from './HostMeetings'
import { useMeetingDay } from './queries'
import { useStaff } from './useStaff'

/** Today's meetings for a host (everyone's for the front desk), on Today: up to four, requests waiting, and the way into Meetings. */
export function TodayMeetings() {
  const router = useRouter()
  const staff = useStaff()
  const host = isMeetingHost(staff) || isFrontDesk(staff)
  const day = useMeetingDay(schoolToday(), host)
  if (!host || !day.data) return null
  const items = day.data.items.filter((a) => !['declined', 'cancelled'].includes(a.status))
  const pending = day.data.pendingRequests
  if (!items.length && !pending) return null
  const open = () => router.push('/meetings')

  return (
    <Section title={day.data.isHostView ? 'Your meetings today' : 'Meetings today'} action={{ label: 'See all', onPress: open }}>
      {pending ? (
        <Callout tone="warning" title={pending === 1 ? '1 request to answer' : `${pending} requests to answer`} action={{ label: 'Answer', onPress: open }} />
      ) : null}
      {items.length ? <ListGroup items={items.slice(0, 4).map((a) => meetingRow(a, open, { withHost: !day.data?.isHostView }))} /> : null}
    </Section>
  )
}
