import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'

import { palettes, type Palette } from './tokens'

type Theme = { scheme: 'light' | 'dark'; colors: Palette }

const ThemeContext = createContext<Theme>({ scheme: 'light', colors: palettes.light })

/**
 * Follows the device's light or dark setting (design system: both themes are complete).
 * The school's own accent colour (applySchoolTheme) plugs in here once the API sends it.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light'
  const value = useMemo(() => ({ scheme, colors: palettes[scheme] }) as Theme, [scheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
