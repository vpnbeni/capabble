import { useLocalSearchParams, useRouter } from 'expo-router'
import { BellRing, CalendarDays, Ellipsis, Pencil, Send } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatTime } from '@/lib/format'
import { ANSWER_LABELS, CATEGORY_LABELS } from '@/portal/calendarUi'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { ResponseValue } from '@/services/calendarTypes'
import type { ReplyTracker } from '@/services/eventService'
import { useCancelEvent, useDeleteEvent, useEventDetail, useEventReplies, usePublishEvent, useRemindPending } from '@/staff/eventQueries'
import { eventBadge, eventWhen } from '@/staff/eventUi'
import { useAudienceOptions } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import {
  ActionBar,
  ActionSheet,
  Badge,
  BottomSheet,
  Callout,
  DetailList,
  Dialog,
  ListGroup,
  MobileButton,
  MobileScreen,
  MobileTextField,
  NavBar,
  StatusView,
  Surface,
  Switch,
  Text,
  haptic,
  useToast,
} from '@/ui'

const REPLY_KIND: Record<ReplyTracker['type'], string> = { acknowledge: 'Mark as seen', rsvp: 'Coming or not', consent: 'Consent' }

/**
 * One event: its facts, who has replied, and what its creator (or the principal) can do with it:
 * edit, remind the families who haven't replied, send a draft for approval, cancel or delete.
 */
export default function EventScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const { id } = useLocalSearchParams<{ id: string }>()
  const event = useEventDetail(id)
  const data = event.data
  const asks = (data?.segments ?? []).some((segment) => segment.response && segment.response !== 'none')
  const replies = useEventReplies(id, asks && data?.status !== 'draft')
  const options = useAudienceOptions(data?.status === 'draft')
  const publish = usePublishEvent()
  const cancel = useCancelEvent()
  const remove = useDeleteEvent()
  const remind = useRemindPending()

  const [menu, setMenu] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [tell, setTell] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [reminding, setReminding] = useState(false)

  const canChange = Boolean(data) && (data?.mine || staff.can('clndr.events.manage'))
  const live = data?.status === 'published' || data?.status === 'scheduled'
  const pending = (replies.data ?? []).reduce((sum, tracker) => sum + tracker.pending.length, 0)
  const needsApproval = options.data?.needsApprovalForFamilies ?? true

  const fail = (error: unknown, fallback: string) => {
    haptic.error()
    toast(error instanceof ApiError ? error.message : fallback, 'danger')
  }

  const sendDraft = async () => {
    if (!data) return
    try {
      const result = await publish.mutateAsync(data.id)
      haptic.success()
      toast(result.status === 'pending_approval' ? 'Sent to the principal for approval' : 'Event published')
    } catch (error) {
      fail(error, "The event wasn't sent. Check your connection and try again.")
    }
  }

  const sendReminder = async () => {
    if (!data) return
    setReminding(false)
    try {
      const result = await remind.mutateAsync({ id: data.id })
      haptic.success()
      toast(result.reminded ? `Reminded ${result.reminded} ${result.reminded === 1 ? 'person' : 'people'}` : 'Everyone has replied')
    } catch (error) {
      fail(error, "The reminder wasn't sent. Try again.")
    }
  }

  const confirmCancel = async () => {
    if (!data) return
    try {
      await cancel.mutateAsync({ id: data.id, reason: reason.trim(), notify: data.status === 'published' && tell })
      setCancelling(false)
      haptic.medium()
      toast('Event cancelled')
    } catch (error) {
      fail(error, "The event wasn't cancelled. Try again.")
    }
  }

  const confirmDelete = async () => {
    if (!data) return
    try {
      await remove.mutateAsync(data.id)
      setDeleting(false)
      haptic.medium()
      toast('Draft deleted')
      router.back()
    } catch (error) {
      setDeleting(false)
      fail(error, "The draft wasn't deleted. Try again.")
    }
  }

  const edit = () => {
    setMenu(false)
    if (data) router.push({ pathname: '/event-new', params: { id: data.id } })
  }

  const actionBar = !data || !canChange ? undefined : data.status === 'draft' && data.mine ? (
    <ActionBar
      icon={Send}
      summary={data.rejectionNote ? 'Not approved' : 'Draft'}
      detail={data.rejectionNote ? 'Change it, then send it again' : 'Families don’t see it yet'}
      label={publish.isPending ? 'Sending…' : needsApproval ? 'Send for approval' : 'Publish event'}
      onPress={sendDraft}
    />
  ) : data.status === 'published' && pending > 0 ? (
    <ActionBar
      icon={BellRing}
      summary={`${pending} ${pending === 1 ? "hasn't" : "haven't"} replied`}
      detail={eventWhen(data)}
      label={remind.isPending ? 'Sending…' : 'Send a reminder'}
      onPress={() => setReminding(true)}
    />
  ) : undefined

  return (
    <MobileScreen
      refreshing={event.isRefetching || replies.isRefetching}
      onRefresh={() => {
        event.refetch()
        if (asks) replies.refetch()
      }}
      nav={
        <NavBar
          title="Event"
          back={{ label: 'Events', onPress: router.back }}
          actions={
            canChange && data?.status !== 'cancelled'
              ? [
                  { icon: Pencil, label: 'Edit event', onPress: edit },
                  { icon: Ellipsis, label: 'More actions', onPress: () => setMenu(true) },
                ]
              : []
          }
        />
      }
      actionBar={actionBar}
      overlay={
        <>
          <ActionSheet
            open={menu}
            onClose={() => setMenu(false)}
            title={data?.title ?? ''}
            actions={[
              { label: 'Edit event', icon: Pencil, onSelect: edit },
              ...(data?.status === 'published' && pending > 0 ? [{ label: 'Send a reminder', icon: BellRing, onSelect: () => (setMenu(false), setReminding(true)) }] : []),
              ...(live ? [{ label: 'Cancel event', tone: 'danger' as const, onSelect: () => (setMenu(false), setCancelling(true)) }] : []),
              ...(data?.status === 'draft' || data?.status === 'pending_approval'
                ? [{ label: 'Delete draft', tone: 'danger' as const, onSelect: () => (setMenu(false), setDeleting(true)) }]
                : []),
            ]}
          />
          <ActionSheet
            open={reminding}
            onClose={() => setReminding(false)}
            title={`Remind ${pending} ${pending === 1 ? 'person' : 'people'}?`}
            message="Everyone who hasn't replied gets a notification about this event."
            actions={[{ label: 'Send reminder', icon: BellRing, onSelect: sendReminder }]}
          />
          <BottomSheet
            open={cancelling}
            onClose={() => setCancelling(false)}
            detent="large"
            title="Cancel this event?"
            description={data?.status === 'published' ? 'It comes off everyone’s calendar.' : 'It won’t be published.'}
            footer={
              <View style={{ gap: space['space-2'] }}>
                <MobileButton variant="destructive" fullWidth loading={cancel.isPending} onPress={confirmCancel}>
                  Cancel event
                </MobileButton>
                <MobileButton variant="gray" fullWidth onPress={() => setCancelling(false)}>
                  Keep event
                </MobileButton>
              </View>
            }
          >
            <MobileTextField label="Reason (optional)" hint="Families see this in the notification." value={reason} onChangeText={setReason} maxLength={500} />
            {data?.status === 'published' ? (
              <ListGroup items={[{ title: 'Tell families', subtitle: 'A notification to everyone it was for', accessory: <Switch label="Tell families" value={tell} onChange={setTell} /> }]} />
            ) : null}
          </BottomSheet>
          <Dialog
            open={deleting}
            onClose={() => setDeleting(false)}
            tone="danger"
            title="Delete this draft?"
            description="It can't be brought back."
            footer={
              <>
                <MobileButton variant="gray" onPress={() => setDeleting(false)}>
                  Keep draft
                </MobileButton>
                <MobileButton variant="destructive" loading={remove.isPending} onPress={confirmDelete}>
                  Delete draft
                </MobileButton>
              </>
            }
          />
        </>
      }
    >
      {event.isPending ? (
        <CardSkeleton rows={4} />
      ) : event.isError || !data ? (
        <LoadFailed what="The event" error={event.error} onRetry={event.refetch} />
      ) : (
        <>
          {data.status === 'draft' && data.rejectionNote ? (
            <Callout tone="danger" title="The principal sent it back">
              {data.rejectionNote}
            </Callout>
          ) : data.status === 'pending_approval' ? (
            <Callout tone="warning" title="Waiting for the principal">
              Families see it once it’s approved. You get a notification either way.
            </Callout>
          ) : data.status === 'cancelled' ? (
            <Callout tone="neutral" title="This event was cancelled">
              {data.cancelReason || 'No reason was given.'}
            </Callout>
          ) : null}

          <Surface>
            <View style={{ gap: space['space-2'], marginBottom: space['space-4'] }}>
              <Text variant="m-section">{data.title}</Text>
              <View style={{ flexDirection: 'row' }}>
                <Badge {...eventBadge(data)} />
              </View>
            </View>
            <DetailList
              items={[
                { label: 'When', value: `${eventWhen(data)}${!data.allDay && data.endTime ? ` to ${formatTime(data.endTime)}` : data.allDay ? ', all day' : ''}`, wide: true },
                { label: 'Where', value: data.venue || null, wide: true },
                { label: 'Type', value: CATEGORY_LABELS[data.category] },
                { label: 'Created by', value: data.mine ? 'You' : data.createdByName || null },
                { label: 'For', value: data.visibility === 'school' ? 'Everyone' : data.visibility === 'staff' ? 'All staff' : data.segments.map((s) => s.label).join(', ') || null, wide: true },
                ...(data.description ? [{ label: 'About', value: data.description, wide: true }] : []),
              ]}
              columns={2}
            />
          </Surface>

          {data.segments
            .filter((segment) => segment.instructions)
            .map((segment) => (
              <ListGroup key={segment.key} header={data.segments.length > 1 ? `What ${segment.label} should know` : 'What families should know'} items={[{ title: segment.instructions as string, lines: 12 }]} />
            ))}

          {asks && data.status !== 'draft' ? (
            replies.isPending ? (
              <CardSkeleton rows={2} />
            ) : replies.isError ? (
              <LoadFailed what="Replies" error={replies.error} onRetry={replies.refetch} />
            ) : (
              (replies.data ?? []).map((tracker) => {
                const answered = tracker.expected - tracker.pending.length
                return (
                  <ListGroup
                    key={tracker.key}
                    header={`Replies · ${tracker.label}`}
                    footer={`${REPLY_KIND[tracker.type]}${tracker.deadline ? ` · reply by ${eventWhen({ startDate: tracker.deadline, endDate: tracker.deadline, allDay: true })}` : ''}`}
                    items={[
                      ...Object.entries(tracker.counts).map(([value, count]) => ({
                        title: ANSWER_LABELS[value as ResponseValue] ?? value,
                        value: String(count),
                      })),
                      ...(tracker.type === 'rsvp' && tracker.headcount ? [{ title: 'People coming', value: String(tracker.headcount) }] : []),
                      {
                        title: tracker.pending.length ? "Haven't replied" : 'Everyone has replied',
                        value: tracker.pending.length ? String(tracker.pending.length) : `${answered} of ${tracker.expected}`,
                        onPress: () => router.push({ pathname: '/events/replies', params: { id: data.id, segment: tracker.key } }),
                      },
                    ]}
                  />
                )
              })
            )
          ) : live ? (
            <Surface padded={false}>
              <StatusView compact kind="empty" icon={CalendarDays} title="No replies asked for" body="Families only see this event. To ask them to reply, edit it and choose how." />
            </Surface>
          ) : null}
        </>
      )}
    </MobileScreen>
  )
}
