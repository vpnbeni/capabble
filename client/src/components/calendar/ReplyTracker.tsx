import React from 'react'
import toast from 'react-hot-toast'
import { useMutation, useQuery } from '@tanstack/react-query'
import { BellRing } from 'lucide-react'
import { Badge, Button, MetricTile, MetricTiles, Skeleton, formatDayKey } from '@/components/ui'
import calendarService, { apiMessage, type ReplyTracker as Tracker } from '@/services/calendarService'

const TYPE_LABELS = { acknowledge: 'Acknowledgements', rsvp: 'RSVPs', consent: 'Consent' } as const

const countsFor = (segment: Tracker[number]) => {
  if (segment.type === 'acknowledge') return [{ label: 'Acknowledged', value: segment.counts.acknowledged || 0 }]
  if (segment.type === 'consent') {
    return [
      { label: 'Given', value: segment.counts.given || 0 },
      { label: 'Declined', value: segment.counts.declined || 0, tone: (segment.counts.declined ? 'danger' : undefined) as 'danger' | undefined },
    ]
  }
  return [
    { label: 'Coming', value: `${segment.counts.yes || 0}${segment.headcount > (segment.counts.yes || 0) ? ` (${segment.headcount} people)` : ''}` },
    { label: 'Not coming', value: segment.counts.no || 0 },
    { label: 'Maybe', value: segment.counts.maybe || 0 },
  ]
}

/** Who has replied to an event, per audience that asked, with a nudge for the rest. */
const ReplyTracker: React.FC<{ eventId: string }> = ({ eventId }) => {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['calendar', 'replies', eventId], queryFn: () => calendarService.replies(eventId) })
  const remind = useMutation({ mutationFn: (segmentKey?: string) => calendarService.remindPending(eventId, segmentKey) })
  if (isLoading) return <Skeleton height={120} />
  if (!data?.length) return null
  const nudge = async (segmentKey: string) => {
    try {
      const result = await remind.mutateAsync(segmentKey)
      toast.success(result.reminded ? `Reminder sent to ${result.reminded} ${result.reminded === 1 ? 'person' : 'people'}` : 'Everyone has replied')
      void refetch()
    } catch (error) {
      toast.error(apiMessage(error, 'Could not send the reminder.'))
    }
  }
  return (
    <div className="cl-replies">
      {data.map((segment) => (
        <section key={segment.key} aria-label={`${TYPE_LABELS[segment.type]} from ${segment.label}`}>
          <div className="cl-replies__head">
            <div>
              <span className="cb-strong">{segment.label || TYPE_LABELS[segment.type]}</span>
              <span className="cb-muted"> · {segment.expected - segment.pending.length} of {segment.expected} replied{segment.deadline ? ` · by ${formatDayKey(segment.deadline, { weekday: 'short' })}` : ''}</span>
            </div>
            {segment.pending.length ? (
              <Button size="sm" icon={BellRing} loading={remind.isPending} onClick={() => nudge(segment.key)}>Remind {segment.pending.length} who haven&apos;t replied</Button>
            ) : <Badge tone="success">Everyone replied</Badge>}
          </div>
          <MetricTiles>
            {countsFor(segment).map((count) => <MetricTile key={count.label} label={count.label} value={count.value} tone={'tone' in count ? count.tone : undefined} />)}
          </MetricTiles>
          {segment.pending.length ? (
            <details>
              <summary className="cb-link">Who hasn&apos;t replied</summary>
              <ul className="cl-replies__list">
                {segment.pending.map((person) => <li key={`${person.userId}:${person.child}`}>{person.name}{person.child ? ` (for ${person.child})` : ''}</li>)}
              </ul>
            </details>
          ) : null}
          {segment.type === 'consent' && segment.counts.declined ? (
            <details>
              <summary className="cb-link">Declined</summary>
              <ul className="cl-replies__list">
                {segment.responded.filter((r) => r.value === 'declined').map((r) => <li key={`${r.name}:${r.child}`}>{r.name}{r.child ? ` (for ${r.child})` : ''}{r.note ? `: ${r.note}` : ''}</li>)}
              </ul>
            </details>
          ) : null}
        </section>
      ))}
    </div>
  )
}

export default ReplyTracker
