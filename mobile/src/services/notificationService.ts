import { api } from '@/lib/api'
import type { Tone } from '@/theme/tokens'

// Staff's own notifications (/api/notifications), the website's bell. Pinned to the signed-in login.

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

export const notificationService = {
  list: (before?: string) => api.get<NotificationPage>('/notifications', { before, limit: 30 }),
  unreadCount: () => api.get<{ unread: number }>('/notifications/unread-count'),
  markRead: (id: string) => api.post<unknown>(`/notifications/${encodeURIComponent(id)}/read`),
  markAllRead: () => api.post<{ updated: number }>('/notifications/read-all'),
}
