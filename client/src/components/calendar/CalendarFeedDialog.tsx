import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Link2 } from 'lucide-react'
import { Banner, Button, Dialog, TextField } from '@/components/ui'
import calendarService, { apiMessage, type FeedStatus } from '@/services/calendarService'
import portalService from '@/portal/portalService'

/**
 * "Add to your phone's calendar": a private link to subscribe to this person's
 * calendar from Google, Apple or Outlook. Making a new link turns the old one off.
 */
const CalendarFeedDialog: React.FC<{ open: boolean; onClose: () => void; portal?: boolean }> = ({ open, onClose, portal = false }) => {
  const queryClient = useQueryClient()
  const key = ['calendar', 'feed', portal ? 'portal' : 'staff']
  const api = portal
    ? { status: portalService.calendarFeed, reset: portalService.resetCalendarFeed, off: portalService.calendarFeedOff }
    : { status: calendarService.feed, reset: calendarService.resetFeed, off: calendarService.feedOff }
  const { data } = useQuery({ queryKey: key, queryFn: api.status, enabled: open })
  const [links, setLinks] = useState<FeedStatus | null>(null)
  const reset = useMutation({ mutationFn: api.reset, onSuccess: (result) => { setLinks(result); queryClient.setQueryData(key, { active: true }) } })
  const off = useMutation({ mutationFn: api.off, onSuccess: () => { setLinks(null); queryClient.setQueryData(key, { active: false }) } })

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Link copied')
    } catch {
      toast.error('Copy did not work. Select the link and copy it.')
    }
  }
  const make = async () => {
    try {
      await reset.mutateAsync()
    } catch (error) {
      toast.error(apiMessage(error, 'Could not make a link.'))
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => { setLinks(null); onClose() }}
      size="md"
      title="Add to your phone's calendar"
      description="See school dates in Google Calendar, Apple Calendar or Outlook. They show only what is for you."
      footer={(
        <>
          {data?.active ? <Button variant="tertiary" loading={off.isPending} onClick={() => off.mutate()}>Turn the link off</Button> : null}
          <Button variant="secondary" onClick={() => { setLinks(null); onClose() }}>Close</Button>
          <Button variant="primary" icon={Link2} loading={reset.isPending} onClick={make}>{data?.active ? 'Make a new link' : 'Make my link'}</Button>
        </>
      )}
    >
      <div className="cb-stack">
        {links?.url ? (
          <>
            <TextField label="Your private link" value={links.url} readOnly onFocus={(e) => e.target.select()} suffix={(
              <Button size="sm" variant="tertiary" icon={Copy} aria-label="Copy link" onClick={() => copy(links.url as string)} />
            )} />
            <div className="cl-toolbar__actions">
              {links.webcal ? <a className="cb-btn cb-btn--secondary cb-btn--sm" href={links.webcal}><span className="cb-btn__label">Open in Apple Calendar or Outlook</span></a> : null}
              <a className="cb-btn cb-btn--secondary cb-btn--sm" href={`https://calendar.google.com/calendar/r/settings/addbyurl?cid=${encodeURIComponent(links.url)}`} target="_blank" rel="noreferrer">
                <span className="cb-btn__label">Add to Google Calendar</span>
              </a>
            </div>
            <Banner tone="warning" title="Keep this link to yourself">Anyone with it can see your school dates. If it gets shared, make a new link here.</Banner>
          </>
        ) : data?.active ? (
          <p>You already have a link. Make a new one to see it again; the old link stops working.</p>
        ) : (
          <p>Make a private link, then add it to your phone&apos;s calendar app as a subscription.</p>
        )}
        <p className="cb-muted">Phone calendars check for changes every few hours (Google can take up to a day). For last-minute changes, rely on the app and its notifications.</p>
      </div>
    </Dialog>
  )
}

export default CalendarFeedDialog
