import { api } from '@/lib/api'
import type { Tone } from '@/theme/tokens'

// The signed-in login's own notifications, the website's bell: /api/notifications for staff,
// /api/portal/notifications for parents and students (same shapes).

export interface StaffNotification {
  _id: string
  kind: string
  module: string
  title: string
  body?: string
  /** The website's page for it ('/calendar?event=…'); lib/notificationLinks maps it to the app. */
  link?: string
  tone?: Tone | string
  readAt: string | null
  createdAt: string
}

export interface NotificationPage {
  items: StaffNotification[]
  unread: number
  nextBefore: string | null
}

const base = (family: boolean) => (family ? '/portal/notifications' : '/notifications')

export const notificationService = {
  list: (family: boolean, before?: string) => api.get<NotificationPage>(base(family), { before, limit: 30 }),
  unreadCount: (family: boolean) => api.get<{ unread: number }>(`${base(family)}/unread-count`),
  markRead: (family: boolean, id: string) => api.post<unknown>(`${base(family)}/${encodeURIComponent(id)}/read`),
  markAllRead: (family: boolean) => api.post<{ updated: number }>(`${base(family)}/read-all`),
}
