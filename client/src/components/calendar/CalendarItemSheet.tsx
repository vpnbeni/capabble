import React from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Paperclip } from 'lucide-react'
import { Badge, Button, DetailList, EmptyState, Sheet, Skeleton, formatDayKey, formatTime } from '@/components/ui'
import { useEventView } from '@/hooks/useCalendar'
import { usePermissions } from '@/hooks/usePermissions'
import type { CalendarItem, CalendarPart } from '@/services/calendarService'
import { CATEGORY_LABELS, LAYER_LABELS, ROLE_LABELS, STATUS_LABELS } from './calendarUi'
import ReplyControls from './ReplyControls'
import './calendar.css'

const whenText = (item: { startDate: string; endDate: string; allDay: boolean; startTime?: string | null; endTime?: string | null }) => {
  const days = item.endDate && item.endDate !== item.startDate
    ? `${formatDayKey(item.startDate, { weekday: 'short' })} – ${formatDayKey(item.endDate, { weekday: 'short', year: true })}`
    : formatDayKey(item.startDate, { weekday: 'long', month: 'long', year: true })
  if (item.allDay || !item.startTime) return days
  return `${days}, ${formatTime(item.startTime)}${item.endTime ? ` to ${formatTime(item.endTime)}` : ''}`
}

const PartBlock: React.FC<{ part: CalendarPart; eventId?: string }> = ({ part, eventId }) => (
  <div className="cl-part">
    <div className="cl-part__head">
      <span className="cb-strong">{part.child ? `For ${part.child.name}` : part.label || 'For you'}</span>
      {part.role && part.role !== 'attendee' ? <Badge tone="info" dot={false}>{ROLE_LABELS[part.role]}</Badge> : null}
    </div>
    {part.instructions ? <p className="cl-part__text">{part.instructions}</p> : null}
    {part.attachments?.length ? (
      <ul className="cl-files">
        {part.attachments.map((file) => (
          <li key={file.url}><a className="cb-link" href={file.url} target="_blank" rel="noreferrer">{file.name}</a></li>
        ))}
      </ul>
    ) : null}
    {eventId && part.response && part.response !== 'none' ? <ReplyControls eventId={eventId} part={part} /> : null}
  </div>
)

/**
 * One calendar item in a side sheet: a school event with the viewer's own part(s),
 * a holiday or closure, or an item from another module with a link to it.
 */
const CalendarItemSheet: React.FC<{
  item: CalendarItem | null
  onClose: () => void
  onEdit?: (eventId: string) => void
  onCancel?: (item: CalendarItem) => void
}> = ({ item, onClose, onEdit, onCancel }) => {
  const isEvent = Boolean(item?.eventId)
  const { isPortal } = usePermissions()
  const { data: view, isLoading } = useEventView(isEvent && !item?.parts ? item?.eventId : null)
  const parts = item?.parts || view?.parts || []
  const status = item?.status ? STATUS_LABELS[item.status] : null

  return (
    <Sheet
      open={Boolean(item)}
      onClose={onClose}
      title={item?.title || ''}
      description={item ? whenText(item) : undefined}
      icon={CalendarDays}
      size="md"
      footer={item ? (
        <>
          {item.canEdit && item.eventId && onCancel && item.status !== 'cancelled' ? (
            <Button variant="tertiary" onClick={() => onCancel(item)}>{item.recurring ? 'Cancel this date' : 'Cancel event'}</Button>
          ) : null}
          {item.canEdit && item.eventId && onEdit ? <Button variant="secondary" onClick={() => onEdit(item.eventId as string)}>Edit event</Button> : null}
          {!isEvent && item.link ? (
            <Link className="cb-btn cb-btn--primary cb-btn--md" to={item.link} onClick={onClose}>
              <span className="cb-btn__label">Open {LAYER_LABELS[item.layer]?.toLowerCase() || 'details'}</span>
            </Link>
          ) : null}
          <Button variant="primary" onClick={onClose}>Done</Button>
        </>
      ) : null}
    >
      {item ? (
        <div className="cb-stack cl-sheet">
          <div className="cl-badges">
            <Badge tone="neutral" dot={false}>{item.category ? CATEGORY_LABELS[item.category] : LAYER_LABELS[item.layer]}</Badge>
            {status && item.status !== 'published' ? <Badge tone={status.tone}>{status.label}</Badge> : null}
            {item.critical ? <Badge tone="warning">Important</Badge> : null}
            {item.tentative ? <Badge tone="warning">Tentative</Badge> : null}
            {item.recurring ? <Badge tone="neutral" dot={false}>Repeats</Badge> : null}
          </div>
          <DetailList
            columns={1}
            items={[
              ...(item.venue ? [{ label: 'Where', value: item.venue }] : []),
              ...(item.child && !isEvent ? [{ label: 'For', value: item.child.name }] : []),
              ...(item.createdByName ? [{ label: 'Added by', value: item.createdByName }] : []),
            ]}
          />
          {item.detail && !isEvent ? <p>{item.detail}</p> : null}
          {isEvent && (view?.description || item.detail) ? <p className="cl-description">{view?.description || item.detail}</p> : null}
          {isEvent && (view?.attachments?.length || 0) > 0 ? (
            <ul className="cl-files">
              {view?.attachments.map((file) => (
                <li key={file.url}><Paperclip size={14} aria-hidden /> <a className="cb-link" href={file.url} target="_blank" rel="noreferrer">{file.name}</a></li>
              ))}
            </ul>
          ) : null}
          {item.category === 'ptm' && item.status !== 'cancelled' ? (
            <p>
              <Link className="cb-link" to={isPortal ? '/portal/appointments' : '/appnt/today'} onClick={onClose}>
                {isPortal ? 'Book a time to meet a teacher' : 'See meeting bookings'}
              </Link>
            </p>
          ) : null}
          {isEvent ? (
            <section aria-label="What it means for you">
              <h4 className="cb-subhead">What it means for you</h4>
              {isLoading && !parts.length ? <Skeleton height={48} /> : null}
              {!isLoading && !parts.length ? (
                <EmptyState compact title="Nothing for you to do" body="You can see this event, but it has no instructions for you." />
              ) : (
                <div className="cl-parts">{parts.map((part) => <PartBlock key={`${part.segmentKey}:${part.child?.studentId || ''}`} part={part} eventId={item.status === 'cancelled' ? undefined : item.eventId} />)}</div>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  )
}

export default CalendarItemSheet
