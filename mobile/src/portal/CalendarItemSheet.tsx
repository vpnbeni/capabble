import { Paperclip } from 'lucide-react-native'
import { useState } from 'react'
import { Linking, StyleSheet, View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDayKey, formatRelative, formatTime, schoolToday } from '@/lib/format'
import type { CalendarItem, CalendarPart, ResponseValue } from '@/services/calendarTypes'
import { space } from '@/theme/tokens'
import { Badge, BottomSheet, Callout, DetailList, haptic, ListGroup, MobileButton, SegmentedControl, Skeleton, StatusView, Stepper, Surface, Text } from '@/ui'

import { ANSWER_LABELS, ANSWER_TONE, CATEGORY_LABELS, LAYER_LABELS, ROLE_LABELS, STATUS_LABELS } from './calendarUi'
import { usePortalEvent, useRespondToEvent } from './queries'

const whenText = (item: CalendarItem) => {
  const days =
    item.endDate && item.endDate !== item.startDate
      ? `${formatDayKey(item.startDate, { weekday: 'short' })} – ${formatDayKey(item.endDate, { weekday: 'short', year: true })}`
      : formatDayKey(item.startDate, { weekday: 'long', month: 'long', year: true })
  if (item.allDay || !item.startTime) return days
  return `${days}, ${formatTime(item.startTime)}${item.endTime ? ` to ${formatTime(item.endTime)}` : ''}`
}

/** The earliest open reply deadline among the parts still waiting for an answer. */
const replyBy = (parts: CalendarPart[]) => {
  const today = schoolToday()
  return parts
    .filter((part) => part.response && part.response !== 'none' && !part.myResponse && part.responseDeadline && part.responseDeadline >= today)
    .map((part) => part.responseDeadline as string)
    .sort()[0]
}

/**
 * One calendar item as a bottom sheet: a school event with what it means for the family
 * (and the reply it asks for), a holiday, or a date from another part of the school.
 * Mirrors client/src/components/calendar/CalendarItemSheet.tsx.
 */
export function CalendarItemSheet({ item, onClose }: { item: CalendarItem | null; onClose: () => void }) {
  const isEvent = Boolean(item?.eventId)
  const view = usePortalEvent(isEvent ? item?.eventId : null)
  const parts = view.data?.parts ?? item?.parts ?? []
  const status = item?.status ? STATUS_LABELS[item.status] : null
  const description = view.data?.description || (isEvent ? item?.detail : undefined)
  const deadline = item && item.status !== 'cancelled' ? replyBy(parts) : undefined

  return (
    <BottomSheet
      open={Boolean(item)}
      onClose={onClose}
      detent={isEvent ? 'large' : 'medium'}
      title={item?.title ?? ''}
      description={item ? whenText(item) : undefined}
      footer={
        <MobileButton variant="gray" fullWidth onPress={onClose}>
          Done
        </MobileButton>
      }
    >
      {item ? (
        <>
          <View style={styles.badges}>
            <Badge label={item.category ? CATEGORY_LABELS[item.category] : LAYER_LABELS[item.layer]} dot={false} />
            {status && item.status !== 'published' ? <Badge label={status.label} tone={status.tone} /> : null}
            {item.critical ? <Badge label="Important" tone="warning" /> : null}
            {item.tentative ? <Badge label="Tentative" tone="warning" /> : null}
            {item.recurring ? <Badge label="Repeats" dot={false} /> : null}
          </View>

          {deadline ? (
            <Callout tone="warning" title={`Reply by ${formatDayKey(deadline, { weekday: 'short' })}`}>
              The school is waiting for your answer below.
            </Callout>
          ) : null}

          {item.venue || (item.child && !isEvent) ? (
            <DetailList
              columns={2}
              items={[
                ...(item.venue ? [{ label: 'Where', value: item.venue }] : []),
                ...(item.child && !isEvent ? [{ label: 'For', value: item.child.name }] : []),
              ]}
            />
          ) : null}
          {item.detail && !isEvent ? <Text variant="body-lg">{item.detail}</Text> : null}
          {description ? <Text variant="body-lg">{description}</Text> : null}
          {view.data?.attachments?.length ? <Files files={view.data.attachments} /> : null}

          {isEvent ? (
            <View style={{ gap: space['space-3'] }}>
              <Text variant="m-headline" accessibilityRole="header">
                What it means for you
              </Text>
              {view.isPending && !parts.length ? <Skeleton height={64} radius={16} /> : null}
              {!view.isPending && !parts.length ? (
                <Surface padded={false}>
                  <StatusView compact kind="empty" title="Nothing for you to do" body="You can see this event, but it has no instructions for you." />
                </Surface>
              ) : (
                parts.map((part) => (
                  <PartBlock
                    key={`${part.segmentKey}:${part.child?.studentId ?? ''}`}
                    part={part}
                    eventId={item.status === 'cancelled' ? undefined : item.eventId}
                  />
                ))
              )}
            </View>
          ) : null}
        </>
      ) : null}
    </BottomSheet>
  )
}

function Files({ files }: { files: { name: string; url: string }[] }) {
  return (
    <ListGroup
      header="Attachments"
      items={files.map((file) => ({ title: file.name, icon: Paperclip, tile: 6 as const, onPress: () => Linking.openURL(file.url) }))}
    />
  )
}

function PartBlock({ part, eventId }: { part: CalendarPart; eventId?: string }) {
  return (
    <Surface>
      <View style={styles.partHead}>
        <Text variant="m-headline" style={{ flexShrink: 1 }}>
          {part.child ? `For ${part.child.name}` : part.label || 'For you'}
        </Text>
        {part.role && part.role !== 'attendee' ? <Badge label={ROLE_LABELS[part.role]} tone="info" dot={false} /> : null}
      </View>
      {part.instructions ? <Text variant="body-lg">{part.instructions}</Text> : null}
      {part.attachments?.length ? <Files files={part.attachments} /> : null}
      {eventId && part.response && part.response !== 'none' ? <ReplyControls eventId={eventId} part={part} /> : null}
    </Surface>
  )
}

/**
 * The reply an event asks for: acknowledge, RSVP (with how many are coming) or consent for one child.
 * The saved answer's badge confirms it; errors show here because a toast would sit under the sheet.
 */
function ReplyControls({ eventId, part }: { eventId: string; part: CalendarPart }) {
  const send = useRespondToEvent()
  const current = part.myResponse ?? null
  const [editing, setEditing] = useState(!current)
  const [error, setError] = useState<string | null>(null)
  const [rsvp, setRsvp] = useState<'yes' | 'no' | 'maybe'>(
    current && ['yes', 'no', 'maybe'].includes(current.value) ? (current.value as 'yes' | 'no' | 'maybe') : 'yes',
  )
  const [count, setCount] = useState(current?.count || 1)
  const closed = Boolean(part.responseDeadline && schoolToday() > part.responseDeadline)
  const deadline = part.responseDeadline ? ` by ${formatDayKey(part.responseDeadline, { weekday: 'short' })}` : ''

  const reply = async (value: ResponseValue) => {
    setError(null)
    try {
      await send.mutateAsync({
        eventId,
        input: {
          segmentKey: part.segmentKey,
          studentId: part.child?.studentId ?? null,
          value,
          count: part.response === 'rsvp' && value === 'yes' ? count : undefined,
        },
      })
      haptic.success()
      setEditing(false)
    } catch (failure) {
      haptic.error()
      setError(failure instanceof ApiError ? failure.message : "Your answer didn't save. Try again.")
    }
  }
  const errorText = error ? (
    <Text variant="label" tone="danger" accessibilityRole="alert">
      {error}
    </Text>
  ) : null

  if (current && !editing) {
    return (
      <View style={styles.replyRow}>
        <Badge
          label={`${ANSWER_LABELS[current.value]}${current.value === 'yes' && current.count && current.count > 1 ? ` · ${current.count}` : ''}`}
          tone={ANSWER_TONE[current.value]}
        />
        <Text variant="m-subhead" tone="muted" style={{ flex: 1 }}>
          {formatRelative(current.respondedAt)}
        </Text>
        {!closed && part.response !== 'acknowledge' ? (
          <MobileButton variant="plain" size="medium" onPress={() => setEditing(true)}>
            Change answer
          </MobileButton>
        ) : null}
      </View>
    )
  }

  if (closed) {
    return (
      <Text variant="body" tone="muted">
        Replies closed on {formatDayKey(part.responseDeadline as string, { weekday: 'short' })}.
      </Text>
    )
  }

  if (part.response === 'acknowledge') {
    return (
      <View style={{ gap: space['space-2'] }}>
        {deadline ? (
          <Text variant="body" tone="muted">
            Please confirm{deadline}.
          </Text>
        ) : null}
        <MobileButton fullWidth loading={send.isPending} onPress={() => reply('acknowledged')}>
          I have read this
        </MobileButton>
        {errorText}
      </View>
    )
  }

  if (part.response === 'consent') {
    return (
      <View style={{ gap: space['space-2'] }}>
        <Text variant="body" tone="muted">
          {part.child ? `Do you consent for ${part.child.name.split(' ')[0]}?` : 'Do you consent?'} Reply{deadline}.
        </Text>
        <MobileButton fullWidth loading={send.isPending} onPress={() => reply('given')}>
          Give consent
        </MobileButton>
        <MobileButton variant="gray" fullWidth disabled={send.isPending} onPress={() => reply('declined')}>
          Decline
        </MobileButton>
        {errorText}
      </View>
    )
  }

  return (
    <View style={{ gap: space['space-3'] }}>
      <Text variant="label">{`Will you come?${deadline ? ` Reply${deadline}.` : ''}`}</Text>
      <SegmentedControl
        label="Will you come?"
        value={rsvp}
        onChange={setRsvp}
        options={[
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'maybe', label: 'Maybe' },
        ]}
      />
      {rsvp === 'yes' ? <Stepper label="People coming" hint="Including you" value={count} onChange={setCount} min={1} max={20} /> : null}
      <MobileButton fullWidth loading={send.isPending} onPress={() => reply(rsvp)}>
        Send answer
      </MobileButton>
      {errorText}
    </View>
  )
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space['space-2'] },
  partHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space['space-2'] },
  replyRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space['space-2'] },
})
