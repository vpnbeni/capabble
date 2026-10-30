import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, SegmentedControl, TextField, formatDayKey, formatRelative } from '@/components/ui'
import calendarService, { apiMessage, type CalendarPart, type ReplyInput, type ResponseValue } from '@/services/calendarService'
import portalService from '@/portal/portalService'
import { usePermissions } from '@/hooks/usePermissions'

const ANSWER_LABELS: Record<ResponseValue, string> = {
  acknowledged: 'Acknowledged',
  yes: 'Coming',
  no: 'Not coming',
  maybe: 'Maybe',
  given: 'Consent given',
  declined: 'Consent declined',
}
const ANSWER_TONE: Record<ResponseValue, 'success' | 'danger' | 'warning'> = {
  acknowledged: 'success', yes: 'success', no: 'danger', maybe: 'warning', given: 'success', declined: 'danger',
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())

/**
 * The reply an event audience asks for: acknowledge, RSVP (with how many coming) or
 * consent for one child. Uses the portal API for family logins and the staff API otherwise.
 */
const ReplyControls: React.FC<{ eventId: string; part: CalendarPart }> = ({ eventId, part }) => {
  const { isPortal } = usePermissions()
  const queryClient = useQueryClient()
  const current = part.myResponse || null
  const [rsvp, setRsvp] = useState<ResponseValue>(current?.value || 'yes')
  const [count, setCount] = useState(String(current?.count || 1))
  const [editing, setEditing] = useState(!current)
  useEffect(() => { setEditing(!current); setRsvp(current?.value || 'yes'); setCount(String(current?.count || 1)) }, [current])
  const closed = Boolean(part.responseDeadline && today() > part.responseDeadline)
  const send = useMutation({
    mutationFn: (input: ReplyInput) => (isPortal ? portalService.respondToEvent(eventId, input) : calendarService.respond(eventId, input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] })
      queryClient.invalidateQueries({ queryKey: ['portal', 'calendar'] })
    },
  })
  const reply = async (value: ResponseValue) => {
    try {
      await send.mutateAsync({
        segmentKey: part.segmentKey,
        studentId: part.child?.studentId || null,
        value,
        count: part.response === 'rsvp' && value === 'yes' ? Math.max(1, Number(count) || 1) : undefined,
      })
      toast.success(value === 'declined' ? 'Your answer is saved. The school has been told.' : 'Thank you. Your answer is saved.')
      setEditing(false)
    } catch (error) {
      toast.error(apiMessage(error, 'Your answer did not save. Try again.'))
    }
  }

  if (!part.response || part.response === 'none') return null
  // One answer covers all the family's children in this audience, so ask about the family.
  const family = (part.children?.length ?? 0) > 1
  const deadline = part.responseDeadline ? ` by ${formatDayKey(part.responseDeadline, { weekday: 'short' })}` : ''

  if (current && !editing) {
    return (
      <div className="cl-reply">
        <Badge tone={ANSWER_TONE[current.value]}>{ANSWER_LABELS[current.value]}{current.value === 'yes' && current.count && current.count > 1 ? ` · ${current.count}` : ''}</Badge>
        <span className="cb-muted">{formatRelative(current.respondedAt)}</span>
        {!closed && part.response !== 'acknowledge' ? <Button size="sm" variant="tertiary" onClick={() => setEditing(true)}>Change answer</Button> : null}
      </div>
    )
  }
  if (closed) return <p className="cb-muted">Replies closed on {formatDayKey(part.responseDeadline as string, { weekday: 'short' })}.</p>

  if (part.response === 'acknowledge') {
    return (
      <div className="cl-reply">
        <Button size="sm" variant="primary" loading={send.isPending} onClick={() => reply('acknowledged')}>I have read this</Button>
        {deadline ? <span className="cb-muted">Please confirm{deadline}.</span> : null}
      </div>
    )
  }
  if (part.response === 'consent') {
    return (
      <div className="cl-reply">
        <span className="cb-muted">{part.child ? `Do you consent for ${part.child.name.split(' ')[0]}?` : 'Do you consent?'} Reply{deadline}.</span>
        <div className="cl-toolbar__actions">
          <Button size="sm" variant="primary" loading={send.isPending} onClick={() => reply('given')}>Give consent</Button>
          <Button size="sm" variant="secondary" disabled={send.isPending} onClick={() => reply('declined')}>Decline</Button>
        </div>
      </div>
    )
  }
  return (
    <div className="cl-reply">
      <SegmentedControl
        label={family ? 'Will your family come?' : 'Will you come?'}
        value={rsvp}
        onChange={(value) => setRsvp(value as ResponseValue)}
        options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'maybe', label: 'Maybe' }]}
      />
      {rsvp === 'yes' ? (
        <TextField label={family ? 'How many from your family' : 'How many people'} type="number" min={1} max={20} size="sm" value={count} onChange={(e) => setCount(e.target.value)} />
      ) : null}
      <Button size="sm" variant="primary" loading={send.isPending} onClick={() => reply(rsvp)}>Send answer</Button>
      {deadline ? <span className="cb-muted">Reply{deadline}.</span> : null}
    </div>
  )
}

export default ReplyControls
