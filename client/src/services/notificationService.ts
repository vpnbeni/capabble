import type { AxiosRequestConfig } from 'axios'
import api from './api'

/** Staff use /notifications; parents and students the same API under /portal. */
export type NotificationAudience = 'staff' | 'portal'
export type NotificationTone = 'info' | 'success' | 'warning' | 'danger'

export interface AppNotification {
  _id: string
  kind: string
  module: string
  title: string
  body: string
  link: string
  tone: NotificationTone
  readAt: string | null
  createdAt: string
}

export interface NotificationPage {
  items: AppNotification[]
  unread: number
  nextBefore: string | null
}

export interface NotificationListParams {
  unread?: boolean
  module?: string
  before?: string | null
  limit?: number
}

const base = (audience: NotificationAudience) => (audience === 'portal' ? '/portal/notifications' : '/notifications')
// The bell polls in the background; a failed poll shouldn't raise a toast.
const silent = { _silent: true } as AxiosRequestConfig

const notificationService = {
  list: async (audience: NotificationAudience, params: NotificationListParams = {}): Promise<NotificationPage> => {
    const query = {
      ...(params.unread ? { unread: '1' } : {}),
      ...(params.module ? { module: params.module } : {}),
      ...(params.before ? { before: params.before } : {}),
      ...(params.limit ? { limit: params.limit } : {}),
    }
    return (await api.get(base(audience), { ...silent, params: query })).data.data
  },
  unreadCount: async (audience: NotificationAudience): Promise<number> =>
    (await api.get(`${base(audience)}/unread-count`, silent)).data.data.unread,
  markRead: async (audience: NotificationAudience, id: string) => {
    await api.post(`${base(audience)}/${encodeURIComponent(id)}/read`, undefined, silent)
  },
  markAllRead: async (audience: NotificationAudience) => {
    await api.post(`${base(audience)}/read-all`, undefined, silent)
  },
}

export default notificationService
