import { api, request } from '@/lib/api'

import type { UserKind } from './authService'

// Staff reach their own routes; parents and students only reach /portal/*.
const base = (kind: UserKind) => (kind === 'staff' ? '/devices' : '/portal/devices')
const notificationsBase = (kind: UserKind) => (kind === 'staff' ? '/notifications' : '/portal/notifications')

export type DeviceRegistration = { token: string; platform: 'ios' | 'android'; appVersion?: string; deviceName?: string }

export const deviceService = {
  /** This phone gets pushes for the signed-in login (the token moves here from any earlier login). */
  register: (kind: UserKind, device: DeviceRegistration) => api.post<{ id: string }>(base(kind), device),

  /** Signed out on this phone: stop pushing to it. Called before the session ends. */
  unregister: (kind: UserKind, token: string) =>
    request<unknown>(`${base(kind)}/${encodeURIComponent(token)}`, { method: 'DELETE', skipRefresh: true }),

  /** Opening a push counts as reading it, as on the website's bell. */
  markRead: (kind: UserKind, notificationId: string) =>
    api.post<unknown>(`${notificationsBase(kind)}/${encodeURIComponent(notificationId)}/read`),
}
