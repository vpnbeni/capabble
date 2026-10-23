import * as Notifications from 'expo-notifications'
import { useRouter, type Href } from 'expo-router'
import { useCallback, useEffect, useRef } from 'react'

import { appRouteFor } from '@/lib/notificationLinks'
import { pushSupported, registerForPush } from '@/lib/push'
import type { User } from '@/services/authService'
import { deviceService } from '@/services/deviceService'

type Tap = { link: string; notificationId: string; school: string }

const tapFrom = (response: Notifications.NotificationResponse | null): Tap | null => {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null
  const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>
  const text = (value: unknown) => (typeof value === 'string' ? value : '')
  return { link: text(data.link), notificationId: text(data.notificationId), school: text(data.school) }
}

/**
 * Push for the signed-in login: registers this phone (again whenever the login or
 * Expo's token changes), and opens the screen a tapped notification is about,
 * including a tap that launched the app before the session was restored.
 * `user` is null while signed out or before a temporary password is replaced.
 */
export function usePushNotifications(user: User | null, schoolSlug: string | null) {
  const router = useRouter()
  const pending = useRef<Tap | null>(null)
  const current = useRef({ user, schoolSlug })
  // First effect, so the ones below read this render's login.
  useEffect(() => {
    current.current = { user, schoolSlug }
  })

  const open = useCallback(() => {
    const tap = pending.current
    const { user: signedIn, schoolSlug: slug } = current.current
    if (!tap || !signedIn) return
    pending.current = null
    Notifications.clearLastNotificationResponse()
    // A push from a school this phone has since signed out of only opens Home.
    const sameSchool = !tap.school || tap.school === slug
    router.push((sameSchool ? appRouteFor(tap.link, signedIn.kind) : '/') as Href)
    if (sameSchool && tap.notificationId) deviceService.markRead(signedIn.kind, tap.notificationId).catch(() => {})
  }, [router])

  // Taps: the one that launched the app, then any while it runs.
  useEffect(() => {
    if (!pushSupported) return
    pending.current = tapFrom(Notifications.getLastNotificationResponse())
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      pending.current = tapFrom(response)
      open()
    })
    return () => subscription.remove()
  }, [open])

  // Signed in (or the session came back): open a waiting tap, then register this phone.
  useEffect(() => {
    if (!pushSupported || !user) return
    open()
    registerForPush(user.kind)
    const subscription = Notifications.addPushTokenListener(({ data }) => {
      if (typeof data === 'string') registerForPush(user.kind, data)
    })
    return () => subscription.remove()
  }, [user, open])
}
