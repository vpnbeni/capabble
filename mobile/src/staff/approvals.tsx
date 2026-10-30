import { Check, X } from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDayKey, formatRelative, formatTime, schoolToday } from '@/lib/format'
import { CATEGORY_LABELS } from '@/portal/calendarUi'
import type { Appointment } from '@/services/appntService'
import type { MyEvent } from '@/services/staffService'
import { space } from '@/theme/tokens'
import { ActionSheet, BottomSheet, DetailList, ListGroup, MobileButton, MobileTextField, Skeleton, SwipeRow, Text, haptic } from '@/ui'

import { isMeetingHost } from './access'
import { MeetingSheet } from './MeetingSheet'
import { useEventDecision, useEventRecord, useMeetingAction, useMeetingList, usePendingEvents } from './queries'
import { useStaff } from './useStaff'

export type Approval =
  | { kind: 'event'; id: string; event: MyEvent & { createdByName?: string } }
  | { kind: 'meeting'; id: string; meeting: Appointment }

/**
 * What waits for this login's decision: teachers' events for families (approvers) and meeting
 * requests it can answer (hosts and the front desk). Soonest first.
 */
export function useApprovals() {
  const staff = useStaff()
  const approver = staff.can('clndr.events.approve')
  const meetings = isMeetingHost(staff) || (staff.canUse('appnt_desk') && staff.can('appnt.appointments.manage'))
  const events = usePendingEvents(approver)
  const requests = useMeetingList('requests', schoolToday(), meetings)
  const items: Approval[] = [
    ...(approver ? (events.data ?? []).map((event) => ({ kind: 'event' as const, id: event.id, event })) : []),
    ...(meetings ? (requests.data?.items ?? []).filter((a) => a.canAct).map((meeting) => ({ kind: 'meeting' as const, id: meeting._id, meeting })) : []),
  ].sort((a, b) => dateOf(a).localeCompare(dateOf(b)))
  return {
    items,
    enabled: approver || meetings,
    isPending: (approver && events.isPending) || (meetings && requests.isPending),
    error: events.error || requests.error,
    isRefetching: events.isRefetching || requests.isRefetching,
    refetch: () => {
      if (approver) events.refetch()
      if (meetings) requests.refetch()
    },
  }
}

const dateOf = (item: Approval) => (item.kind === 'event' ? item.event.startDate + (item.event.startTime ?? '') : item.meeting.date + item.meeting.startTime)

const describe = (item: Approval) =>
  item.kind === 'event'
    ? {
        title: `Event · ${item.event.title}`,
        meta: formatDayKey(item.event.startDate, { weekday: 'short' }),
        subtitle: [item.event.createdByName ? `From ${item.event.createdByName}` : null, item.event.audiences.join(', ')].filter(Boolean).join(' · '),
      }
    : {
        title: `Meeting · ${item.meeting.visitor.name}`,
        meta: formatDayKey(item.meeting.date, { weekday: 'short' }),
        subtitle: `${formatTime(item.meeting.startTime)} with ${item.meeting.hostName} · ${item.meeting.purpose}`,
      }

/**
 * Approvals as swipeable rows (approve · reject), each opening its detail. Every swipe action is
 * also in the detail sheet. Toasts come from the screen (`onDone`) once any sheet has closed.
 */
export function ApprovalList({ items, onDone }: { items: Approval[]; onDone: (message: string, tone?: 'success' | 'danger') => void }) {
  const decide = useEventDecision()
  const act = useMeetingAction()
  const [openEvent, setOpenEvent] = useState<string | null>(null)
  const [openMeeting, setOpenMeeting] = useState<Appointment | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [declining, setDeclining] = useState<Appointment | null>(null)

  const approve = async (item: Approval) => {
    try {
      if (item.kind === 'event') await decide.mutateAsync({ id: item.id, decision: 'approve' })
      else await act.mutateAsync({ id: item.id, action: 'confirm' })
      haptic.success()
      onDone(item.kind === 'event' ? 'Event approved and sent' : 'Meeting confirmed')
    } catch (error) {
      haptic.error()
      onDone(error instanceof ApiError ? error.message : "That didn't save. Try again.", 'danger')
    }
  }

  return (
    <>
      <ListGroup>
        {items.map((item, index) => {
          const text = describe(item)
          return (
            <SwipeRow
              key={`${item.kind}:${item.id}`}
              divider={index > 0}
              unread
              title={text.title}
              subtitle={text.subtitle}
              meta={text.meta}
              onPress={() => (item.kind === 'event' ? setOpenEvent(item.id) : setOpenMeeting(item.meeting))}
              actions={[
                { label: item.kind === 'event' ? 'Approve' : 'Confirm', icon: Check, tone: 'accent', onPress: () => approve(item) },
                {
                  label: item.kind === 'event' ? 'Reject' : 'Decline',
                  icon: X,
                  tone: 'danger',
                  onPress: () => (item.kind === 'event' ? setRejecting(item.id) : setDeclining(item.meeting)),
                },
              ]}
            />
          )
        })}
      </ListGroup>
      <EventDecisionSheet
        id={openEvent ?? rejecting}
        rejectFirst={Boolean(rejecting)}
        onClose={() => {
          setOpenEvent(null)
          setRejecting(null)
        }}
        onDone={onDone}
      />
      <MeetingSheet meeting={openMeeting} onClose={() => setOpenMeeting(null)} onDone={onDone} />
      <ActionSheet
        open={Boolean(declining)}
        onClose={() => setDeclining(null)}
        title={declining ? `Decline ${declining.visitor.name}'s request?` : ''}
        message="They're told the meeting can't happen. To give a reason, open the request."
        actions={[
          {
            label: 'Decline request',
            tone: 'danger',
            onSelect: async () => {
              const meeting = declining
              setDeclining(null)
              if (!meeting) return
              try {
                await act.mutateAsync({ id: meeting._id, action: 'decline' })
                haptic.success()
                onDone('Request declined')
              } catch (error) {
                haptic.error()
                onDone(error instanceof ApiError ? error.message : "That didn't save. Try again.", 'danger')
              }
            },
          },
        ]}
      />
    </>
  )
}

/** A teacher's event as the principal decides on it: what, when, who for, what families are told. */
function EventDecisionSheet({ id, rejectFirst, onClose, onDone }: { id: string | null; rejectFirst: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const record = useEventRecord(id)
  const decide = useEventDecision()
  const [reasonMode, setReasonMode] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  if (id !== openedFor) {
    setOpenedFor(id)
    setReasonMode(rejectFirst)
    setNote('')
    setError(null)
  }
  const event = record.data

  const run = async (decision: 'approve' | 'reject') => {
    if (!id) return
    setError(null)
    try {
      await decide.mutateAsync({ id, decision, note: note.trim() })
      haptic.success()
      onClose()
      onDone(decision === 'approve' ? 'Event approved and sent' : 'Event sent back to the teacher')
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "That didn't save. Try again.")
    }
  }

  return (
    <BottomSheet
      open={Boolean(id)}
      onClose={onClose}
      detent="large"
      title={event?.title ?? 'Event'}
      description={
        event
          ? `${formatDayKey(event.startDate, { weekday: 'short' })}${event.allDay || !event.startTime ? ', all day' : `, ${formatTime(event.startTime)}${event.endTime ? ` to ${formatTime(event.endTime)}` : ''}`}`
          : undefined
      }
      footer={
        reasonMode ? (
          <View style={{ gap: space['space-2'] }}>
            <MobileButton variant="destructive" fullWidth loading={decide.isPending} onPress={() => run('reject')}>
              Reject event
            </MobileButton>
            <MobileButton variant="gray" fullWidth onPress={() => setReasonMode(false)}>
              Back
            </MobileButton>
          </View>
        ) : (
          <View style={{ gap: space['space-2'] }}>
            <MobileButton fullWidth loading={decide.isPending} onPress={() => run('approve')}>
              Approve and send
            </MobileButton>
            <MobileButton variant="gray" fullWidth onPress={() => setReasonMode(true)}>
              Reject
            </MobileButton>
          </View>
        )
      }
    >
      {error ? (
        <Text variant="label" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      {record.isPending ? (
        <Skeleton lines={4} height={14} />
      ) : reasonMode ? (
        <MobileTextField
          label="What should the teacher change? (optional)"
          hint="The teacher sees this and can send it again."
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
        />
      ) : event ? (
        <>
          <DetailList
            items={[
              { label: 'Sent by', value: event.createdByName },
              { label: 'For', value: event.segments.map((segment) => segment.label || segment.personType).join(', ') },
              { label: 'Type', value: CATEGORY_LABELS[event.category] },
              { label: 'Venue', value: event.venue },
              { label: 'Sent', value: formatRelative(event.updatedAt) },
              ...(event.description ? [{ label: 'About', value: event.description, wide: true }] : []),
              ...event.segments
                .filter((segment) => segment.instructions)
                .map((segment) => ({ label: `What ${segment.label || 'they'} are told`, value: segment.instructions, wide: true })),
            ]}
          />
        </>
      ) : null}
    </BottomSheet>
  )
}
