import { useCallback, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'cb-admin-theme'

/** Saved choice, or dark (the panel's original look) when nothing is saved. */
export const readTheme = (): Theme => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** The design tokens switch with the `dark` class on <body class="cb-app">. */
export const applyTheme = (theme: Theme) => {
  document.body.classList.toggle('dark', theme === 'dark')
}

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Private mode or blocked storage: the switch still works for this visit.
    }
  }, [theme])

  const toggle = useCallback(() => setTheme((current) => (current === 'dark' ? 'light' : 'dark')), [])
  return { theme, toggle }
}
