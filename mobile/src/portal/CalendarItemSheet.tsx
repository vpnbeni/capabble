import { Paperclip } from 'lucide-react-native'
import { useState } from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'

import { ApiError } from '@/lib/api'
import { formatDayKey, formatRelative, formatTime, schoolToday } from '@/lib/format'
import type { CalendarItem, CalendarPart, ResponseValue } from '@/services/calendarTypes'
import { useTheme } from '@/theme/ThemeProvider'
import { radius, space } from '@/theme/tokens'
import { Badge, Button, EmptyState, Icon, SegmentedControl, Sheet, Skeleton, Text, TextField } from '@/ui'

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

  return (
    <Sheet
      open={Boolean(item)}
      onClose={onClose}
      title={item?.title ?? ''}
      description={item ? whenText(item) : undefined}
      footer={<Button label="Done" variant="secondary" onPress={onClose} />}
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

          {item.venue ? <Detail label="Where" value={item.venue} /> : null}
          {item.child && !isEvent ? <Detail label="For" value={item.child.name} /> : null}
          {item.detail && !isEvent ? <Text variant="body-lg">{item.detail}</Text> : null}
          {description ? <Text variant="body-lg">{description}</Text> : null}
          {view.data?.attachments?.length ? <Files files={view.data.attachments} /> : null}

          {isEvent ? (
            <View style={{ gap: space['space-3'] }}>
              <Text variant="card-title" accessibilityRole="header">
                What it means for you
              </Text>
              {view.isPending && !parts.length ? <Skeleton height={48} /> : null}
              {!view.isPending && !parts.length ? (
                <EmptyState title="Nothing for you to do" body="You can see this event, but it has no instructions for you." />
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
    </Sheet>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="body-lg">{value}</Text>
    </View>
  )
}

function Files({ files }: { files: { name: string; url: string }[] }) {
  return (
    <View style={{ gap: space['space-1'] }}>
      {files.map((file) => (
        <Pressable
          key={file.url}
          accessibilityRole="link"
          onPress={() => Linking.openURL(file.url)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space['space-2'], minHeight: 44 }}
        >
          <Icon icon={Paperclip} size={16} />
          <Text variant="body-lg" tone="accent" style={{ flexShrink: 1 }}>
            {file.name}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

function PartBlock({ part, eventId }: { part: CalendarPart; eventId?: string }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.part, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.partHead}>
        <Text variant="label" style={{ flexShrink: 1 }}>
          {part.child ? `For ${part.child.name}` : part.label || 'For you'}
        </Text>
        {part.role && part.role !== 'attendee' ? <Badge label={ROLE_LABELS[part.role]} tone="info" dot={false} /> : null}
      </View>
      {part.instructions ? <Text variant="body-lg">{part.instructions}</Text> : null}
      {part.attachments?.length ? <Files files={part.attachments} /> : null}
      {eventId && part.response && part.response !== 'none' ? <ReplyControls eventId={eventId} part={part} /> : null}
    </View>
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
  const [count, setCount] = useState(String(current?.count || 1))
  const closed = Boolean(part.responseDeadline && schoolToday() > part.responseDeadline)
  const deadline = part.responseDeadline ? ` by ${formatDayKey(part.responseDeadline, { weekday: 'short' })}` : ''

  const reply = async (value: ResponseValue) => {
    const people = Math.round(Number(count))
    if (part.response === 'rsvp' && value === 'yes' && !(people >= 1 && people <= 20)) {
      setError('Enter how many people are coming, from 1 to 20')
      return
    }
    setError(null)
    try {
      await send.mutateAsync({
        eventId,
        input: {
          segmentKey: part.segmentKey,
          studentId: part.child?.studentId ?? null,
          value,
          count: part.response === 'rsvp' && value === 'yes' ? people : undefined,
        },
      })
      setEditing(false)
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Your answer didn't save. Try again.")
    }
  }
  const errorText = error ? (
    <Text variant="small" tone="danger" accessibilityRole="alert">
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
        <Text variant="small" tone="muted">
          {formatRelative(current.respondedAt)}
        </Text>
        {!closed && part.response !== 'acknowledge' ? (
          <Button label="Change answer" variant="tertiary" onPress={() => setEditing(true)} />
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
        <Button label="I have read this" loading={send.isPending} onPress={() => reply('acknowledged')} fullWidth />
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
        <View style={styles.replyRow}>
          <View style={{ flex: 1 }}>
            <Button label="Give consent" loading={send.isPending} onPress={() => reply('given')} fullWidth />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Decline" variant="secondary" disabled={send.isPending} onPress={() => reply('declined')} fullWidth />
          </View>
        </View>
        {errorText}
      </View>
    )
  }

  return (
    <View style={{ gap: space['space-3'] }}>
      <SegmentedControl
        label={`Will you come?${deadline ? ` Reply${deadline}.` : ''}`}
        value={rsvp}
        onChange={setRsvp}
        options={[
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
          { value: 'maybe', label: 'Maybe' },
        ]}
      />
      {rsvp === 'yes' ? (
        <TextField label="How many people" keyboardType="number-pad" value={count} onChangeText={setCount} maxLength={2} />
      ) : null}
      <Button label="Send answer" loading={send.isPending} onPress={() => reply(rsvp)} fullWidth />
      {errorText}
    </View>
  )
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space['space-2'] },
  part: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius['radius-lg'], padding: space['space-4'], gap: space['space-3'] },
  partHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space['space-2'] },
  replyRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space['space-2'] },
})
