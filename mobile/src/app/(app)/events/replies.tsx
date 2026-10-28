import { useLocalSearchParams, useRouter } from 'expo-router'
import { BellRing, Users } from 'lucide-react-native'
import { useState } from 'react'

import { ApiError } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { ANSWER_LABELS, ANSWER_TONE } from '@/portal/calendarUi'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import type { ResponseValue } from '@/services/calendarTypes'
import { useEventDetail, useEventReplies, useRemindPending } from '@/staff/eventQueries'
import { ActionBar, ActionSheet, Avatar, ListGroup, MobileScreen, NavBar, SearchBar, SegmentedControl, StatusView, Surface, haptic, useToast } from '@/ui'

/**
 * Who has and hasn't replied to one audience of an event. A family that hasn't replied opens the
 * child's record, with the guardian to call; the action bar reminds them all.
 */
export default function RepliesScreen() {
  const router = useRouter()
  const toast = useToast()
  const { id, segment } = useLocalSearchParams<{ id: string; segment: string }>()
  const event = useEventDetail(id)
  const replies = useEventReplies(id)
  const remind = useRemindPending()
  const tracker = replies.data?.find((entry) => entry.key === segment)
  const [view, setView] = useState<'pending' | 'replied'>('pending')
  const [query, setQuery] = useState('')
  const [asking, setAsking] = useState(false)

  const match = (name: string, child: string) => !query.trim() || `${name} ${child}`.toLowerCase().includes(query.trim().toLowerCase())
  const pending = (tracker?.pending ?? []).filter((row) => match(row.name, row.child))
  const replied = (tracker?.responded ?? []).filter((row) => match(row.name, row.child))
  const published = event.data?.status === 'published'

  const send = async () => {
    setAsking(false)
    try {
      const result = await remind.mutateAsync({ id, segmentKey: segment })
      haptic.success()
      toast(result.reminded ? `Reminded ${result.reminded} ${result.reminded === 1 ? 'person' : 'people'}` : 'Everyone has replied')
    } catch (error) {
      haptic.error()
      toast(error instanceof ApiError ? error.message : "The reminder wasn't sent. Try again.", 'danger')
    }
  }

  return (
    <MobileScreen
      refreshing={replies.isRefetching}
      onRefresh={replies.refetch}
      nav={<NavBar title={tracker?.label ?? 'Replies'} back={{ label: 'Event', onPress: router.back }} />}
      actionBar={
        published && tracker?.pending.length ? (
          <ActionBar
            icon={BellRing}
            summary={`${tracker.pending.length} ${tracker.pending.length === 1 ? "hasn't" : "haven't"} replied`}
            detail={`${tracker.expected - tracker.pending.length} of ${tracker.expected} replied`}
            label={remind.isPending ? 'Sending…' : 'Send a reminder'}
            onPress={() => setAsking(true)}
          />
        ) : undefined
      }
      overlay={
        <ActionSheet
          open={asking}
          onClose={() => setAsking(false)}
          title={`Remind ${tracker?.pending.length ?? 0} ${tracker?.pending.length === 1 ? 'person' : 'people'}?`}
          message={`Everyone in ${tracker?.label ?? 'this audience'} who hasn't replied gets a notification.`}
          actions={[{ label: 'Send reminder', icon: BellRing, onSelect: send }]}
        />
      }
    >
      <SegmentedControl
        label="Show"
        value={view}
        onChange={setView}
        options={[
          { value: 'pending', label: `Not replied ${tracker?.pending.length ?? ''}`.trim() },
          { value: 'replied', label: `Replied ${tracker?.responded.length ?? ''}`.trim() },
        ]}
      />
      {(tracker?.expected ?? 0) > 12 ? <SearchBar label="Search names" placeholder="Search names" value={query} onChange={setQuery} onCancel={() => setQuery('')} /> : null}
      {replies.isPending ? (
        <CardSkeleton rows={4} />
      ) : replies.isError ? (
        <LoadFailed what="Replies" error={replies.error} onRetry={replies.refetch} />
      ) : !tracker ? (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Users} title="No replies asked for" body="This audience was changed and no longer asks for a reply." />
        </Surface>
      ) : view === 'pending' ? (
        pending.length ? (
          <ListGroup
            footer={pending.some((row) => row.studentId) ? 'Tap a family to see the child and call a guardian.' : undefined}
            items={pending.map((row) => ({
              title: row.name || 'No name',
              subtitle: row.child ? `For ${row.child}` : undefined,
              avatar: <Avatar name={row.name || '?'} size={36} />,
              onPress: row.studentId ? () => router.push({ pathname: '/student/[id]', params: { id: row.studentId } }) : undefined,
            }))}
          />
        ) : (
          <Surface padded={false}>
            <StatusView compact kind="empty" icon={Users} title="Everyone has replied" body={`${tracker.responded.length} of ${tracker.expected} replied.`} />
          </Surface>
        )
      ) : replied.length ? (
        <ListGroup
          items={replied.map((row) => ({
            title: row.name || 'No name',
            subtitle: [row.child ? `For ${row.child}` : null, row.count && row.count > 1 ? `${row.count} coming` : null, row.note || null, formatDate(row.at)].filter(Boolean).join(' · '),
            avatar: <Avatar name={row.name || '?'} size={36} />,
            badge: { label: ANSWER_LABELS[row.value as ResponseValue] ?? row.value, tone: ANSWER_TONE[row.value as ResponseValue] ?? 'neutral' },
            lines: 2,
          }))}
        />
      ) : (
        <Surface padded={false}>
          <StatusView compact kind="empty" icon={Users} title="No replies yet" body="Replies show here as families answer." />
        </Surface>
      )}
    </MobileScreen>
  )
}
