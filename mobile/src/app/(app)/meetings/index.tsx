import { useRouter } from 'expo-router'
import { CalendarPlus } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatDayKey, formatTime, schoolToday } from '@/lib/format'
import { usePortal } from '@/portal/PortalProvider'
import { useSession } from '@/session/SessionProvider'
import { HostMeetings } from '@/staff/HostMeetings'
import { useCancelAppointment, usePortalAppointments } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import type { PortalAppointment, PortalAppointmentStatus } from '@/services/portalService'
import { type Tone } from '@/theme/tokens'
import {
  ActionBar,
  Badge,
  BottomSheet,
  Callout,
  DetailList,
  Dialog,
  haptic,
  ListGroup,
  MobileButton,
  MobileScreen,
  MobileTextField,
  NavBar,
  SegmentedControl,
  StatusView,
  Surface,
  Text,
  useToast,
} from '@/ui'

const MEETING_STATUS: Record<PortalAppointmentStatus, { label: string; tone: Tone }> = {
  requested: { label: 'Waiting for the school', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  checked_in: { label: 'At school', tone: 'success' },
  completed: { label: 'Met', tone: 'success' },
  declined: { label: 'Declined', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  no_show: { label: 'Missed', tone: 'danger' },
}

const MODE_LABEL = { in_person: 'At school', phone: 'Phone call', video: 'Video call' } as const

const when = (a: PortalAppointment) => `${formatDayKey(a.date, { weekday: 'short' })}, ${formatTime(a.startTime)}`
const isUpcoming = (a: PortalAppointment) => (a.status === 'requested' || a.status === 'confirmed') && a.date >= schoolToday()

export default function MeetingsScreen() {
  const session = useSession()
  if (session.status !== 'signedIn') return null
  return session.user.kind === 'staff' ? <HostMeetings /> : <FamilyMeetings />
}

/** Meetings a parent has asked for or the school has booked with them. */
function FamilyMeetings() {
  const router = useRouter()
  const toast = useToast()
  const { child, isParent } = usePortal()
  const list = usePortalAppointments()
  const cancel = useCancelAppointment()
  const [view, setView] = useState<'upcoming' | 'past'>('upcoming')
  const [open, setOpen] = useState<PortalAppointment | null>(null)
  const [cancelling, setCancelling] = useState<PortalAppointment | null>(null)
  const [reason, setReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)

  const data = list.data
  const items = data?.items ?? []
  const upcoming = items.filter(isUpcoming)
  const past = items.filter((a) => !isUpcoming(a))
  const shown = view === 'upcoming' ? upcoming : past
  const canRequest = Boolean(isParent && data?.allowRequests)

  return (
    <MobileScreen
      refreshing={list.isRefetching}
      onRefresh={list.refetch}
      nav={<NavBar title="Meetings" back={{ label: 'Back', onPress: router.back }} />}
      actionBar={
        canRequest && child ? (
          <ActionBar
            icon={CalendarPlus}
            summary={upcoming.length ? `${upcoming.length} coming up` : 'No meetings booked'}
            detail={`About ${child.name}`}
            label="Request"
            onPress={() => router.push('/meetings/new')}
          />
        ) : undefined
      }
      overlay={
        <>
          <BottomSheet
            open={Boolean(open)}
            onClose={() => setOpen(null)}
            title={open ? `Meeting with ${open.hostName}` : ''}
            description={open ? when(open) : undefined}
            footer={
              <>
                {open && isUpcoming(open) ? (
                  <MobileButton
                    variant="destructive"
                    fullWidth
                    onPress={() => {
                      setReason('')
                      setCancelError(null)
                      setCancelling(open)
                      setOpen(null)
                    }}
                  >
                    Cancel meeting
                  </MobileButton>
                ) : null}
                <MobileButton variant="gray" fullWidth onPress={() => setOpen(null)}>
                  Done
                </MobileButton>
              </>
            }
          >
            {open ? (
              <>
                <Badge label={MEETING_STATUS[open.status].label} tone={MEETING_STATUS[open.status].tone} />
                <DetailList
                  columns={2}
                  items={[
                    { label: 'How', value: MODE_LABEL[open.mode] },
                    { label: 'Where', value: open.location },
                    { label: 'About', value: open.purpose },
                    { label: 'For', value: open.studentSnapshot?.name },
                    { label: 'Reference', value: open.refNo },
                    ...(open.agenda ? [{ label: 'Your note', value: open.agenda, wide: true }] : []),
                    ...(open.cancelReason ? [{ label: 'Reason', value: open.cancelReason, wide: true }] : []),
                  ]}
                />
              </>
            ) : null}
          </BottomSheet>
          <Dialog
            open={Boolean(cancelling)}
            onClose={() => setCancelling(null)}
            tone="danger"
            title="Cancel this meeting?"
            description={cancelling ? `${cancelling.hostName}, ${when(cancelling)}` : undefined}
            footer={
              <>
                <MobileButton variant="gray" size="medium" onPress={() => setCancelling(null)}>
                  Keep meeting
                </MobileButton>
                <MobileButton
                  variant="destructive"
                  size="medium"
                  loading={cancel.isPending}
                  onPress={async () => {
                    if (!cancelling) return
                    try {
                      await cancel.mutateAsync({ id: cancelling._id, reason })
                      haptic.medium()
                      setCancelling(null)
                      toast('Meeting cancelled.')
                    } catch (error) {
                      setCancelError(error instanceof ApiError ? error.message : "Couldn't cancel. Try again.")
                    }
                  }}
                >
                  Cancel meeting
                </MobileButton>
              </>
            }
          >
            {cancelError ? <Callout tone="danger" title={cancelError} /> : null}
            <MobileTextField label="Reason" hint="Optional. Shared with the school." value={reason} onChangeText={setReason} multiline />
          </Dialog>
        </>
      }
    >
      {!child ? (
        <NoChild />
      ) : list.isPending ? (
        <CardSkeleton rows={3} />
      ) : list.isError ? (
        <LoadFailed what="Meetings" error={list.error} onRetry={list.refetch} />
      ) : (
        <>
          {isParent && !data?.allowRequests ? (
            <Callout tone="info" title="The school isn't taking meeting requests in the app">
              Call the school office to set up a meeting. Meetings the school books with you show here.
            </Callout>
          ) : null}
          {items.length ? (
            <SegmentedControl
              label="Show"
              value={view}
              onChange={setView}
              options={[
                { value: 'upcoming', label: `Upcoming ${upcoming.length}` },
                { value: 'past', label: `Past ${past.length}` },
              ]}
            />
          ) : null}
          {shown.length ? (
            <ListGroup
              items={shown.map((a) => ({
                title: a.hostName,
                subtitle: `${when(a)} · ${[a.purpose, a.studentSnapshot?.name?.split(' ')[0]].filter(Boolean).join(' · ')}`,
                badge: MEETING_STATUS[a.status],
                onPress: () => setOpen(a),
              }))}
            />
          ) : (
            <Surface padded={false}>
              <StatusView
                compact
                kind="empty"
                title={items.length ? (view === 'upcoming' ? 'Nothing coming up' : 'No earlier meetings') : 'No meetings yet'}
                body={canRequest ? 'Request a meeting with a teacher or the principal.' : 'Meetings the school books with you show here.'}
              />
            </Surface>
          )}
          {canRequest ? (
            <Text variant="m-subhead" tone="muted" style={{ textAlign: 'center' }}>
              Requests go to the school, which confirms the time.
            </Text>
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
