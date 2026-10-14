import { useSyncExternalStore } from 'react'

/**
 * How the attendance grids treat days nobody marked. Attendance is stored as absences
 * only, so these settings change what the grids show and count — not what is saved.
 * Kept per browser.
 */
export type AttndSettings = {
  /** Working days with no absence: counted as present, or left as not marked. */
  unmarkedAs: 'present' | 'unmarked'
  /** Show a "P" on days counted as present. */
  showPresentMark: boolean
  /** Sundays start as holidays (each date can still be switched). */
  sundayHoliday: boolean
  /** Allow ticking absences on future dates, e.g. approved leave. */
  allowFutureMarking: boolean
}

export const DEFAULT_ATTND_SETTINGS: AttndSettings = {
  unmarkedAs: 'present',
  showPresentMark: true,
  sundayHoliday: true,
  allowFutureMarking: false,
}

const STORAGE_KEY = 'attnd-settings'
const listeners = new Set<() => void>()

const read = (): AttndSettings => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_ATTND_SETTINGS
    const parsed = JSON.parse(raw) as Partial<AttndSettings>
    return {
      unmarkedAs: parsed.unmarkedAs === 'unmarked' ? 'unmarked' : 'present',
      showPresentMark: parsed.showPresentMark ?? DEFAULT_ATTND_SETTINGS.showPresentMark,
      sundayHoliday: parsed.sundayHoliday ?? DEFAULT_ATTND_SETTINGS.sundayHoliday,
      allowFutureMarking: parsed.allowFutureMarking ?? DEFAULT_ATTND_SETTINGS.allowFutureMarking,
    }
  } catch {
    return DEFAULT_ATTND_SETTINGS
  }
}

let snapshot: AttndSettings = read()

export const saveAttndSettings = (next: AttndSettings) => {
  snapshot = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* settings still apply for this visit */
  }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useAttndSettings = () => useSyncExternalStore(subscribe, () => snapshot)

export const todayDateKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export const isSundayDate = (dateKey: string) => new Date(`${dateKey}T00:00:00`).getDay() === 0

/** Date keys are YYYY-MM-DD, so string order is date order. */
export const isFutureDate = (dateKey: string, todayKey = todayDateKey()) => dateKey > todayKey

export type MarkState = 'absent' | 'present' | 'unmarked' | 'upcoming' | 'holiday'

/** What one person's cell shows for one date. */
export const markState = (
  settings: AttndSettings,
  { holiday, absent, future }: { holiday: boolean; absent: boolean; future: boolean }
): MarkState => {
  if (holiday) return 'holiday'
  if (absent) return 'absent'
  if (future) return 'upcoming'
  return settings.unmarkedAs === 'present' ? 'present' : 'unmarked'
}

export type MarkCounts = { present: number; absent: number; unmarked: number; upcoming: number }

export const emptyCounts = (): MarkCounts => ({ present: 0, absent: 0, unmarked: 0, upcoming: 0 })

export const addMark = (counts: MarkCounts, state: MarkState) => {
  if (state !== 'holiday') counts[state] += 1
  return counts
}
