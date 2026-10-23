import { schoolAccent } from '@capabble/shared/schoolAccent'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Appearance, useColorScheme } from 'react-native'

import { storage } from '@/lib/storage'

import { palettes, type Palette } from './tokens'

/** `system` follows the device (the default); `light` and `dark` pin it on this device. */
export type AppearancePreference = 'system' | 'light' | 'dark'

type Theme = {
  scheme: 'light' | 'dark'
  colors: Palette
  appearance: AppearancePreference
  setAppearance: (next: AppearancePreference) => void
  /** The school's colour (#rrggbb) re-brands the accent tokens; null for Capabble blue. */
  setSchoolColor: (hex: string | null) => void
}

const APPEARANCE_KEY = 'capabble.appearance'

const ThemeContext = createContext<Theme>({
  scheme: 'light',
  colors: palettes.light,
  appearance: 'system',
  setAppearance: () => {},
  setSchoolColor: () => {},
})

/**
 * Light and dark from the device setting or the login's own choice (Your login → Appearance),
 * with the school's colour as the accent (design system: SchoolTheme). Status colours,
 * neutrals and charts never change with the school.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<AppearancePreference>('system')
  const [schoolColor, setSchoolColor] = useState<string | null>(null)
  const device = useColorScheme()
  const scheme = appearance === 'system' ? (device === 'dark' ? 'dark' : 'light') : appearance

  useEffect(() => {
    storage.get(APPEARANCE_KEY).then((saved) => {
      if (saved === 'light' || saved === 'dark') applyAppearance(saved, setAppearanceState)
    })
  }, [])

  const setAppearance = useCallback((next: AppearancePreference) => {
    applyAppearance(next, setAppearanceState)
    if (next === 'system') storage.remove(APPEARANCE_KEY)
    else storage.set(APPEARANCE_KEY, next)
  }, [])

  const accent = useMemo(() => schoolAccent(schoolColor), [schoolColor])
  const value = useMemo<Theme>(
    () => ({
      scheme,
      colors: accent ? { ...palettes[scheme], ...accent[scheme] } : palettes[scheme],
      appearance,
      setAppearance,
      setSchoolColor,
    }),
    [scheme, accent, appearance, setAppearance]
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Native controls (keyboard, alerts, pickers) follow the same choice as our palette. */
function applyAppearance(next: AppearancePreference, setState: (next: AppearancePreference) => void) {
  setState(next)
  try {
    Appearance.setColorScheme(next === 'system' ? 'unspecified' : next)
  } catch {
    // Web preview: the palette still follows the choice.
  }
}

export const useTheme = () => useContext(ThemeContext)
