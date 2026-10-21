import { useEffect, useSyncExternalStore } from 'react'

/**
 * Colour theme for the whole web app. `system` follows the device setting and
 * is the default; `light` and `dark` pin it. The choice lives on this device
 * only. index.html applies it before first paint with the same key and rules,
 * so keep the two in step.
 */
export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'cb-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'
const THEME_COLOR = { light: '#ffffff', dark: '#111314' }

const listeners = new Set<() => void>()
/** Screens mounted that only have a light design (public marketing pages). */
let lightOnlyScreens = 0

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* storage blocked: fall back to the device setting */
  }
  return 'system'
}

let preference: ThemePreference = typeof window === 'undefined' ? 'system' : readPreference()

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches
}

export function resolveTheme(pref: ThemePreference = preference): 'light' | 'dark' {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light'
  return pref
}

function apply() {
  const theme = lightOnlyScreens > 0 ? 'light' : resolveTheme()
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
}

function notify() {
  listeners.forEach((listener) => listener())
}

export function setThemePreference(next: ThemePreference) {
  preference = next
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* storage blocked: the choice lasts for this page load */
  }
  apply()
  notify()
}

let systemQuery: MediaQueryList | null = null

/** Call once at startup: applies the theme and follows device and other-tab changes. */
export function initTheme() {
  apply()
  // Held at module level so the listener lives as long as the app.
  systemQuery = window.matchMedia(DARK_QUERY)
  systemQuery.addEventListener('change', () => {
    if (preference !== 'system') return
    apply()
    notify()
  })
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    preference = readPreference()
    apply()
    notify()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Keeps the page light while the calling screen is mounted (screens with no dark design). */
export function useLightOnlyTheme() {
  useEffect(() => {
    lightOnlyScreens += 1
    apply()
    return () => {
      lightOnlyScreens -= 1
      apply()
    }
  }, [])
}

/** Current preference, the theme it resolves to, and a setter. */
export function useTheme() {
  const pref = useSyncExternalStore(subscribe, () => preference, () => 'system' as ThemePreference)
  const resolved = useSyncExternalStore(subscribe, () => resolveTheme(), () => 'light' as const)
  return { preference: pref, resolved, setPreference: setThemePreference }
}
