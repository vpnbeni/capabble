import * as Location from 'expo-location'
import * as SecureStore from 'expo-secure-store'
import * as TaskManager from 'expo-task-manager'

import { ApiError, api, getTenantSlug, setTenantSlug } from './api'

/**
 * The bus's location while the crew runs a trip. Android keeps a "Sharing Bus 1's location"
 * notification up and sends the position about every 10 s, with the screen locked too; families
 * and the office see the bus on the map. Sharing stops when the trip ends here or on the server.
 *
 * The task can run after Android restarts the app in the background, so it keeps what it needs
 * (the trip and the school) in the secure store; the session cookies stay in the app's cookie store.
 */

export const BUS_LOCATION_TASK = 'capabble-bus-location'
const STORE_KEY = 'capabble.busTrip'
// The server takes at most 120 points a request; keep at most 15 minutes of points through a signal gap.
const BATCH = 100
const KEEP = 90

type Sharing = { tripId: string; slug: string; label: string }
type Point = { lat: number; lng: number; accuracy: number | null; speed: number | null; heading: number | null; at: string }

let pending: Point[] = []
let sending = false

const readSharing = async (): Promise<Sharing | null> => {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY)
    return raw ? (JSON.parse(raw) as Sharing) : null
  } catch {
    return null
  }
}

const flush = async (sharing: Sharing) => {
  if (sending || !pending.length) return
  sending = true
  const batch = pending.slice(0, BATCH)
  try {
    if (!getTenantSlug()) setTenantSlug(sharing.slug)
    await api.post(`/trnst/crew/trips/${encodeURIComponent(sharing.tripId)}/locations`, { points: batch })
    pending = pending.slice(batch.length)
  } catch (error) {
    // The trip ended (here, on another phone, or closed by the server) or isn't this login's: stop.
    if (error instanceof ApiError && (error.status === 404 || error.status === 409 || error.status === 403)) {
      pending = []
      await stopSharing()
    } else {
      // No signal or a busy server: keep the newest points and send them with the next ones.
      pending = pending.slice(-KEEP)
    }
  } finally {
    sending = false
  }
}

TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(BUS_LOCATION_TASK, async ({ data, error }) => {
  if (error) return
  const sharing = await readSharing()
  if (!sharing) {
    if (await Location.hasStartedLocationUpdatesAsync(BUS_LOCATION_TASK).catch(() => false)) await Location.stopLocationUpdatesAsync(BUS_LOCATION_TASK)
    return
  }
  pending.push(
    ...(data?.locations ?? []).map((location) => ({
      lat: location.coords.latitude,
      lng: location.coords.longitude,
      accuracy: location.coords.accuracy ?? null,
      speed: location.coords.speed ?? null,
      heading: location.coords.heading ?? null,
      at: new Date(location.timestamp).toISOString(),
    })),
  )
  await flush(sharing)
})

/** 'sharing', or why it can't: location refused, "Allow all the time" refused, or location turned off. */
export type ShareResult = 'sharing' | 'denied' | 'background-denied' | 'off'

/** Starts sharing this trip's location (asking for permission the first time). */
export async function startSharing(tripId: string, label: string): Promise<ShareResult> {
  const foreground = await Location.requestForegroundPermissionsAsync()
  if (foreground.status !== 'granted') return 'denied'
  const background = await Location.requestBackgroundPermissionsAsync()
  if (background.status !== 'granted') return 'background-denied'
  if (!(await Location.hasServicesEnabledAsync())) return 'off'

  const slug = getTenantSlug()
  if (!slug) return 'off'
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify({ tripId, slug, label } satisfies Sharing))
  pending = []
  if (await Location.hasStartedLocationUpdatesAsync(BUS_LOCATION_TASK)) await Location.stopLocationUpdatesAsync(BUS_LOCATION_TASK)
  try {
    await Location.startLocationUpdatesAsync(BUS_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 10_000,
      distanceInterval: 15,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: `Sharing ${label}'s location`,
        notificationBody: 'Families see the bus on the map until you end the trip.',
        killServiceOnDestroy: false,
      },
    })
  } catch {
    await SecureStore.deleteItemAsync(STORE_KEY)
    return 'off'
  }
  return 'sharing'
}

/** Whether this phone is sharing this trip's location now. */
export async function isSharing(tripId: string): Promise<boolean> {
  const sharing = await readSharing()
  if (!sharing || sharing.tripId !== tripId) return false
  return Location.hasStartedLocationUpdatesAsync(BUS_LOCATION_TASK).catch(() => false)
}

/** Stops sharing (the trip ended, or the crew signed out). */
export async function stopSharing(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEY).catch(() => undefined)
  pending = []
  if (await Location.hasStartedLocationUpdatesAsync(BUS_LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(BUS_LOCATION_TASK).catch(() => undefined)
  }
}
