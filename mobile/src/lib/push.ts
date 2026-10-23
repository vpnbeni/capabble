import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { AndroidImportance } from 'expo-notifications'
import { Platform } from 'react-native'

import { storage } from '@/lib/storage'
import type { UserKind } from '@/services/authService'
import { deviceService } from '@/services/deviceService'

/**
 * Push notifications. Every in-app notification the school sends (fees due, a new
 * notice, a calendar event, the bus leaving) also arrives on the phone; the server
 * queues them per phone (server/src/push). The app registers its Expo push token
 * after sign-in and removes it on sign-out.
 *
 * Needs the Expo project ID (`eas init` writes it into app.json): until then, and in
 * the web preview, registration is skipped and everything else works as before.
 */

const TOKEN_KEY = 'capabble.pushToken'

export const pushProjectId: string | null =
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null

export const pushSupported = Platform.OS !== 'web'

if (pushSupported) {
  // Shown while the app is open too (a fee receipt arriving while the parent is on Home).
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

/** Asks once for permission, then returns this phone's Expo push token, or null. */
async function getPushToken(): Promise<string | null> {
  if (!pushSupported || !pushProjectId) return null
  if (Platform.OS === 'android') {
    // The server sends on this channel (channelId 'default').
    await Notifications.setNotificationChannelAsync('default', {
      name: 'School updates',
      importance: AndroidImportance.HIGH,
    })
  }
  let { status } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync())
  if (status !== 'granted') return null
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: pushProjectId })
  return data
}

/** Tell the school's server this phone wants pushes for the signed-in login. Never throws. */
export async function registerForPush(kind: UserKind, token?: string): Promise<void> {
  try {
    const pushToken = token ?? (await getPushToken())
    if (!pushToken) return
    await deviceService.register(kind, {
      token: pushToken,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      appVersion: Constants.expoConfig?.version ?? '',
      deviceName: Constants.deviceName ?? '',
    })
    await storage.set(TOKEN_KEY, pushToken)
  } catch {
    // Offline or refused: the next launch or sign-in tries again.
  }
}

/** Signing out: stop pushes to this phone while the session still works. Never throws. */
export async function unregisterFromPush(kind: UserKind): Promise<void> {
  try {
    const token = await storage.get(TOKEN_KEY)
    if (!token) return
    await storage.remove(TOKEN_KEY)
    await deviceService.unregister(kind, token)
  } catch {
    // The server also drops phones whose login signed out everywhere.
  }
}
