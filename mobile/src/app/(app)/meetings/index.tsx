import { useRouter } from 'expo-router'
import { CalendarClock, CalendarPlus } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDayKey, formatTime, schoolToday } from '@/lib/format'
import { usePortal } from '@/portal/PortalProvider'
import { useCancelAppointment, usePortalAppointments } from '@/portal/queries'
import { CardSkeleton, LoadFailed, NoChild } from '@/portal/states'
import type { PortalAppointment, PortalAppointmentStatus } from '@/services/portalService'
import { space, type Tone } from '@/theme/tokens'
import { Badge, Banner, Button, Card, Dialog, EmptyState, ListRow, Screen, Sheet, Text, TextField, useToast } from '@/ui'

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

/** Meetings a parent has asked for or the school has booked with them. */
export default function MeetingsScreen() {
  const router = useRouter()
  const toast = useToast()
  const { child, isParent } = usePortal()
  const list = usePortalAppointments()
  const cancel = useCancelAppointment()
  const [open, setOpen] = useState<PortalAppointment | null>(null)
  const [cancelling, setCancelling] = useState<PortalAppointment | null>(null)
  const [reason, setReason] = useState('')
  const [cancelError, setCancelError] = useState<string | null>(null)

  const data = list.data
  const items = data?.items ?? []
  const upcoming = items.filter(isUpcoming)
  const past = items.filter((a) => !isUpcoming(a))
  const canRequest = Boolean(isParent && data?.allowRequests)
  const request = canRequest ? () => router.push('/meetings/new') : undefined

  const rows = (list: PortalAppointment[]) =>
    list.map((a, index) => (
      <ListRow
        key={a._id}
        primary={a.hostName}
        secondary={`${when(a)} · ${[a.purpose, a.studentSnapshot?.name?.split(' ')[0]].filter(Boolean).join(' · ')}`}
        lines={2}
        divider={index < list.length - 1}
        trailing={<Badge label={MEETING_STATUS[a.status].label} tone={MEETING_STATUS[a.status].tone} />}
        onPress={() => setOpen(a)}
      />
    ))

  return (
    <Screen title="Meetings" onBack={router.back} refreshing={list.isRefetching} onRefresh={list.refetch}>
      {!child ? (
        <NoChild />
      ) : list.isPending ? (
        <CardSkeleton rows={3} />
      ) : list.isError ? (
        <LoadFailed what="Meetings" error={list.error} onRetry={list.refetch} />
      ) : (
        <>
          {isParent && !data?.allowRequests ? (
            <Banner tone="info" title="The school isn't taking meeting requests in the app">
              Call the school office to set up a meeting. Meetings the school books with you appear here.
            </Banner>
          ) : null}
          {request && items.length ? <Button label="Request a meeting" icon={CalendarPlus} onPress={request} fullWidth /> : null}

          {items.length === 0 ? (
            <Card>
              <EmptyState
                icon={CalendarClock}
                title="No meetings yet"
                body={canRequest ? 'Request a meeting with a teacher or the principal.' : 'Meetings the school books with you will appear here.'}
                action={request ? <Button label="Request a meeting" icon={CalendarPlus} onPress={request} /> : undefined}
              />
            </Card>
          ) : null}
          {upcoming.length ? (
            <Card title="Coming up" flush>
              {rows(upcoming)}
            </Card>
          ) : null}
          {past.length ? (
            <Card title="Earlier" flush>
              {rows(past)}
            </Card>
          ) : null}
        </>
      )}

      <Sheet
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={open ? `Meeting with ${open.hostName}` : ''}
        description={open ? when(open) : undefined}
        footer={
          open && isUpcoming(open) ? (
            <>
              <Button
                label="Cancel meeting"
                variant="tertiary"
                onPress={() => {
                  setReason('')
                  setCancelError(null)
                  setCancelling(open)
                  setOpen(null)
                }}
              />
              <Button label="Done" variant="secondary" onPress={() => setOpen(null)} />
            </>
          ) : (
            <Button label="Done" variant="secondary" onPress={() => setOpen(null)} />
          )
        }
      >
        {open ? (
          <View style={{ gap: space['space-3'] }}>
            <Badge label={MEETING_STATUS[open.status].label} tone={MEETING_STATUS[open.status].tone} />
            <Text variant="body-lg">
              {MODE_LABEL[open.mode]}
              {open.location ? ` · ${open.location}` : ''}
            </Text>
            <Text variant="body" tone="muted">
              About {open.purpose}
              {open.studentSnapshot?.name ? ` for ${open.studentSnapshot.name}` : ''} · Ref. {open.refNo}
            </Text>
            {open.agenda ? <Text variant="body-lg">{open.agenda}</Text> : null}
            {open.cancelReason ? (
              <Text variant="body" tone="muted">
                Reason: {open.cancelReason}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      <Dialog
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        tone="danger"
        title="Cancel this meeting?"
        description={cancelling ? `${cancelling.hostName}, ${when(cancelling)}` : undefined}
        footer={
          <>
            <Button label="Keep meeting" variant="secondary" onPress={() => setCancelling(null)} />
            <Button
              label="Cancel meeting"
              variant="danger"
              loading={cancel.isPending}
              onPress={async () => {
                if (!cancelling) return
                try {
                  await cancel.mutateAsync({ id: cancelling._id, reason })
                  setCancelling(null)
                  toast('Meeting cancelled.')
                } catch (error) {
                  setCancelError(error instanceof ApiError ? error.message : "Couldn't cancel. Try again.")
                }
              }}
            />
          </>
        }
      >
        {cancelError ? <Banner tone="danger" title={cancelError} /> : null}
        <TextField label="Reason" hint="Optional. Shared with the school." value={reason} onChangeText={setReason} multiline />
      </Dialog>
    </Screen>
  )
}
