import { useEffect, useRef, useState } from 'react'
import trnstService, { type GeoPoint } from '@/services/trnstService'
import { distanceMeters } from '@/components/trnst/TrnstUi'

/**
 * Shares the phone's location for a bus trip: watches GPS, keeps the screen on,
 * and sends points to the server about every 10 seconds. Points taken while the
 * phone is offline are queued (also in localStorage) and sent once it's back.
 *
 * A web page can only do this while it is open on screen. If the driver locks
 * the phone or switches apps, location stops until they come back.
 */

export type TrackerStatus = 'idle' | 'starting' | 'tracking' | 'denied' | 'unsupported' | 'error'

export type TrackerState = {
  status: TrackerStatus
  message?: string
  lastFix: GeoPoint | null
  lastSentAt: number | null
  queued: number
  wakeLock: 'on' | 'off' | 'unsupported'
}

const SEND_EVERY_MS = 10_000
// Record a point at least this often while standing still…
const MIN_POINT_GAP_MS = 8_000
// …or straight away after moving this far.
const MIN_MOVE_M = 25
const MAX_QUEUE = 1_000
const MAX_BATCH = 120

const queueKey = (tripId: string) => `capabble.trnst.queue.${tripId}`

const readQueue = (tripId: string): GeoPoint[] => {
  try {
    const raw = window.localStorage.getItem(queueKey(tripId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeQueue = (tripId: string, queue: GeoPoint[]) => {
  try {
    if (queue.length) window.localStorage.setItem(queueKey(tripId), JSON.stringify(queue))
    else window.localStorage.removeItem(queueKey(tripId))
  } catch {
    // Storage full or blocked: the in-memory queue still works.
  }
}

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (type: 'release', cb: () => void) => void }

export const useTripTracker = (tripId: string | null, enabled: boolean, onTripEnded?: () => void): TrackerState => {
  const [state, setState] = useState<TrackerState>({ status: 'idle', lastFix: null, lastSentAt: null, queued: 0, wakeLock: 'off' })
  const queue = useRef<GeoPoint[]>([])
  const lastRecorded = useRef<GeoPoint | null>(null)
  const sending = useRef(false)
  const endedRef = useRef(onTripEnded)
  endedRef.current = onTripEnded

  useEffect(() => {
    if (!tripId || !enabled) {
      setState((prev) => ({ ...prev, status: 'idle', wakeLock: 'off' }))
      return undefined
    }
    if (!('geolocation' in navigator)) {
      setState((prev) => ({ ...prev, status: 'unsupported', message: "This phone's browser can't share location." }))
      return undefined
    }

    let stopped = false
    let wakeLock: WakeLockSentinelLike | null = null
    queue.current = readQueue(tripId)
    lastRecorded.current = null
    setState((prev) => ({ ...prev, status: 'starting', message: undefined, queued: queue.current.length }))

    const persist = () => {
      writeQueue(tripId, queue.current)
      setState((prev) => ({ ...prev, queued: queue.current.length }))
    }

    const flush = async () => {
      if (stopped || sending.current || !queue.current.length) return
      if (typeof navigator.onLine === 'boolean' && !navigator.onLine) return
      sending.current = true
      const batch = queue.current.slice(0, MAX_BATCH)
      try {
        await trnstService.sendLocations(tripId, batch)
        queue.current = queue.current.slice(batch.length)
        persist()
        setState((prev) => ({ ...prev, lastSentAt: Date.now() }))
      } catch (error: any) {
        const status = error?.response?.status
        if (status === 409 || status === 404) {
          // The trip was ended (from another phone or by the office).
          queue.current = []
          persist()
          endedRef.current?.()
        }
        // Otherwise (offline, server busy) keep the points and try again.
      } finally {
        sending.current = false
      }
    }

    const record = (position: GeolocationPosition) => {
      const point: GeoPoint = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null,
        speed: position.coords.speed ?? null,
        heading: position.coords.heading ?? null,
        at: new Date(position.timestamp || Date.now()).toISOString(),
      }
      setState((prev) => ({ ...prev, status: 'tracking', message: undefined, lastFix: point }))
      const last = lastRecorded.current
      const due = !last
        || Date.parse(point.at) - Date.parse(last.at) >= MIN_POINT_GAP_MS
        || distanceMeters(last, point) >= MIN_MOVE_M
      if (!due) return
      lastRecorded.current = point
      queue.current = [...queue.current, point].slice(-MAX_QUEUE)
      persist()
      // Send the first fix at once so the bus appears on the map quickly.
      if (!last) void flush()
    }

    const watchId = navigator.geolocation.watchPosition(
      record,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setState((prev) => ({ ...prev, status: 'denied', message: 'Location is blocked for this site. Allow it in the browser settings, then reload.' }))
        } else {
          setState((prev) => ({ ...prev, status: prev.lastFix ? prev.status : 'error', message: 'Looking for a GPS signal…' }))
        }
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 }
    )

    const requestWakeLock = async () => {
      const api = (navigator as any).wakeLock
      if (!api?.request) {
        setState((prev) => ({ ...prev, wakeLock: 'unsupported' }))
        return
      }
      try {
        wakeLock = await api.request('screen')
        setState((prev) => ({ ...prev, wakeLock: 'on' }))
        wakeLock?.addEventListener('release', () => {
          if (!stopped) setState((prev) => ({ ...prev, wakeLock: 'off' }))
        })
      } catch {
        setState((prev) => ({ ...prev, wakeLock: 'off' }))
      }
    }
    void requestWakeLock()

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void requestWakeLock()
      void flush()
    }
    const onOnline = () => void flush()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    const timer = window.setInterval(() => void flush(), SEND_EVERY_MS)

    return () => {
      stopped = true
      navigator.geolocation.clearWatch(watchId)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      void wakeLock?.release().catch(() => undefined)
    }
  }, [tripId, enabled])

  return state
}
