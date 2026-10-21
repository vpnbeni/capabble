import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { Badge, Button, cx, formatRelative } from '@/components/ui'
import { useEscape } from '@/components/ui/escape'
import { useMarkNotificationsRead, useNotificationList, useUnreadNotificationCount } from '@/hooks/useNotifications'
import type { AppNotification, NotificationAudience } from '@/services/notificationService'

const PANEL_SIZE = 8

/**
 * The header bell for staff and the family portal. Shows the unread count, the
 * latest notifications, and opens what each one is about.
 */
const NotificationBell: React.FC<{ audience: NotificationAudience; viewAllPath: string }> = ({ audience, viewAllPath }) => {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data: unread = 0 } = useUnreadNotificationCount(audience)
  const list = useNotificationList(audience, { limit: PANEL_SIZE }, open)
  const markRead = useMarkNotificationsRead(audience)
  const items = list.data?.pages[0]?.items || []

  useEscape(open, () => setOpen(false))
  useEffect(() => {
    if (!open) return undefined
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const openItem = (item: AppNotification) => {
    if (!item.readAt) markRead.mutate(item._id)
    setOpen(false)
    if (item.link) navigate(item.link)
  }

  const label = unread ? `Notifications, ${unread} unread` : 'Notifications'

  return (
    <div className="cb-shellhead__bellwrap" ref={ref}>
      <Button
        variant="tertiary"
        icon={Bell}
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-expanded={open}
        title="Notifications"
        className={cx('cb-shellhead__bell', open && 'is-open')}
      />
      {unread > 0 ? <span className="cb-shellhead__belldot" aria-hidden="true" /> : null}

      {open ? (
        <div className="cb-menu__panel cb-menu__panel--end cb-shellhead__notifications" role="dialog" aria-label="Notifications">
          <div className="cb-shellhead__notifhead">
            <span className="cb-card__title">Notifications</span>
            {unread > 0 ? (
              <span className="cb-shellhead__notifactions">
                <Badge tone="info" dot={false}>{unread > 99 ? '99+' : unread} new</Badge>
                <Button variant="tertiary" size="sm" onClick={() => markRead.mutate(null)}>Mark all read</Button>
              </span>
            ) : null}
          </div>

          {list.isLoading ? (
            <p className="cb-shellhead__notifempty">Loading notifications</p>
          ) : list.isError ? (
            <p className="cb-shellhead__notifempty">Notifications didn&apos;t load. Try again in a moment.</p>
          ) : items.length === 0 ? (
            <p className="cb-shellhead__notifempty">No notifications yet. Updates about your work show here.</p>
          ) : (
            <ul className="cb-shellhead__notiflist">
              {items.map((item) => (
                <li key={item._id}>
                  <button
                    type="button"
                    className={cx('cb-shellhead__notifitem', !item.readAt && 'is-unread')}
                    onClick={() => openItem(item)}
                  >
                    <span className={`cb-shellhead__notifdot is-${item.tone}`} aria-hidden="true" />
                    <span className="cb-shellhead__notifcopy">
                      <span className="cb-shellhead__notiftext">{item.title}</span>
                      {item.body ? <span className="cb-shellhead__notifbody">{item.body}</span> : null}
                      <span className="cb-shellhead__notiftime">
                        {!item.readAt ? <span className="cb-visually-hidden">Unread. </span> : null}
                        {formatRelative(item.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="cb-shellhead__notiffoot">
            <Button
              variant="tertiary"
              size="sm"
              fullWidth
              onClick={() => {
                setOpen(false)
                navigate(viewAllPath)
              }}
            >
              View all notifications
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default NotificationBell
