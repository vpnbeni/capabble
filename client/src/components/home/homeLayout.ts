import { useSyncExternalStore } from 'react'
import { DEFAULT_QUICK_ACTIONS, MAX_QUICK_ACTIONS, QUICK_ACTIONS } from './quickActions'

/**
 * What the Home dashboard shows, per person: which widgets, in what order, and the
 * pages they pinned. Kept in this browser, keyed by school and user.
 */
export type WidgetId =
  | 'quick-actions'
  | 'attendance-today'
  | 'attendance-watch'
  | 'fees'
  | 'fee-defaulters'
  | 'timetable'
  | 'pinned'

export type HomeLayout = {
  /** Visible widgets, in display order. */
  widgets: WidgetId[]
  /** Page paths pinned to the "Pinned pages" widget. */
  pinned: string[]
  /** Quick action ids shown in the "Quick actions" widget. */
  actions: string[]
}

export const ALL_WIDGETS: WidgetId[] = [
  'quick-actions',
  'attendance-today',
  'fees',
  'attendance-watch',
  'timetable',
  'fee-defaulters',
  'pinned',
]

export const DEFAULT_HOME_LAYOUT: HomeLayout = {
  widgets: ['quick-actions', 'attendance-today', 'fees', 'attendance-watch', 'timetable', 'pinned'],
  pinned: [],
  actions: DEFAULT_QUICK_ACTIONS,
}

export const MAX_PINNED = 12

const listeners = new Set<() => void>()
const cache = new Map<string, HomeLayout>()

const sanitize = (raw: unknown): HomeLayout => {
  const value = (raw || {}) as Partial<HomeLayout>
  const widgets = Array.isArray(value.widgets)
    ? value.widgets.filter((id, index, list): id is WidgetId => ALL_WIDGETS.includes(id as WidgetId) && list.indexOf(id) === index)
    : DEFAULT_HOME_LAYOUT.widgets
  const pinned = Array.isArray(value.pinned)
    ? value.pinned.filter((path): path is string => typeof path === 'string').slice(0, MAX_PINNED)
    : []
  const knownActions = new Set(QUICK_ACTIONS.map((action) => action.id))
  const actions = Array.isArray(value.actions)
    ? value.actions.filter((id): id is string => knownActions.has(id as string)).slice(0, MAX_QUICK_ACTIONS)
    : DEFAULT_QUICK_ACTIONS
  return { widgets, pinned, actions }
}

const read = (key: string): HomeLayout => {
  const hit = cache.get(key)
  if (hit) return hit
  let layout = DEFAULT_HOME_LAYOUT
  try {
    const raw = window.localStorage.getItem(key)
    if (raw) layout = sanitize(JSON.parse(raw))
  } catch {
    /* fall back to the default layout */
  }
  cache.set(key, layout)
  return layout
}

export const saveHomeLayout = (key: string, layout: HomeLayout) => {
  const next = sanitize(layout)
  cache.set(key, next)
  try {
    window.localStorage.setItem(key, JSON.stringify(next))
  } catch {
    /* still applies for this visit */
  }
  listeners.forEach((listener) => listener())
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const homeLayoutKey = (tenant: string | null | undefined, userId: string | null | undefined) =>
  `home-layout:${tenant || 'default'}:${userId || 'anon'}`

export const useHomeLayout = (key: string) => useSyncExternalStore(subscribe, () => read(key))
