import { useSyncExternalStore } from 'react'

import { ApiError } from '@/lib/api'
import { fileStore } from '@/lib/fileStore'
import { staffService, type RegisterSave } from '@/services/staffService'

/**
 * Registers saved on the phone and not yet on the server. A roll call is always written here
 * first, then sent; it leaves the queue once the server has it. Without a connection it waits
 * and is sent by `flushAttendanceQueue` (on launch, when the app comes back, every 30 s).
 * One entry per class and day: saving the same register again replaces the waiting one.
 */
export type QueuedRegister = RegisterSave & {
  key: string
  absent: number
  total: number
  /** When the teacher saved it on the phone (ISO). */
  savedAt: string
  /** The server refused it (not a connection problem): shown so the teacher can act. */
  error?: string
}

const FILE = 'attendance-queue'

let entries: QueuedRegister[] = []
let loaded = false
let flushing: Promise<number> | null = null
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((listener) => listener())
const persist = () => fileStore.write(FILE, entries)

export const registerKey = (date: string, className: string, section: string) => `${date}|${className}|${section}`

const load = async () => {
  if (loaded) return
  const saved = await fileStore.read<QueuedRegister[]>(FILE)
  // Something saved while the file was being read wins over the file.
  const keys = new Set(entries.map((entry) => entry.key))
  entries = [...entries, ...(saved ?? []).filter((entry) => !keys.has(entry.key))]
  loaded = true
  emit()
}

/** Puts a register in the queue (replacing a waiting copy of the same register). */
export async function queueRegister(save: RegisterSave, counts: { absent: number; total: number }) {
  await load()
  const entry: QueuedRegister = {
    ...save,
    ...counts,
    key: registerKey(save.date, save.className, save.section),
    savedAt: new Date().toISOString(),
  }
  entries = [...entries.filter((item) => item.key !== entry.key), entry]
  emit()
  await persist()
  return entry
}

export async function discardRegister(key: string) {
  await load()
  entries = entries.filter((item) => item.key !== key)
  emit()
  await persist()
}

/**
 * Sends every waiting register. Returns how many reached the server. Stops at the first
 * connection failure (the rest would fail too); a refusal is kept with its reason.
 */
export function flushAttendanceQueue(): Promise<number> {
  flushing ??= (async () => {
    await load()
    let sent = 0
    for (const entry of [...entries]) {
      try {
        await staffService.saveRegister(entry)
        sent += 1
        entries = entries.filter((item) => item.key !== entry.key || item.savedAt !== entry.savedAt)
      } catch (error) {
        if (error instanceof ApiError && error.status === 0) break
        const message = error instanceof Error ? error.message : 'The school server refused this register.'
        entries = entries.map((item) => (item.key === entry.key && item.savedAt === entry.savedAt ? { ...item, error: message } : item))
      }
      emit()
    }
    await persist()
    return sent
  })().finally(() => {
    flushing = null
  })
  return flushing
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  load()
  return () => listeners.delete(listener)
}

/** The waiting copy of a register, if any (after a save, to tell sent from waiting). */
export const peekQueued = (key: string) => entries.find((entry) => entry.key === key)

/** The registers waiting on this phone, newest last. */
export const useAttendanceQueue = () => useSyncExternalStore(subscribe, () => entries)

/** Clears the queue (sign out: the next login on this phone mustn't send them). */
export async function clearAttendanceQueue() {
  entries = []
  loaded = true
  emit()
  await fileStore.remove(FILE)
}
