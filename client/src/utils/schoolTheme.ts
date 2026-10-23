import { schoolAccent, type AccentTokens } from '@capabble/shared/schoolAccent'

const STYLE_ID = 'cb-school-theme'

const block = (selector: string, tokens: AccentTokens) =>
  `${selector}{${Object.entries(tokens).map(([name, value]) => `--${name}:${value};`).join('')}}`

/**
 * Re-brands the app with the school's colour (design system: SchoolTheme). Only the
 * accent tokens change; status colours, neutrals and charts stay. Empty or invalid
 * clears it back to Capabble blue. Selectors match styles/capabble/tokens.css.
 */
export function applySchoolTheme(hex: string | null | undefined) {
  if (typeof document === 'undefined') return
  const accent = schoolAccent(hex)
  let style = document.getElementById(STYLE_ID)
  if (!accent) {
    style?.remove()
    return
  }
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  style.textContent = block('.cb-app,.cb-shell', accent.light) + block('.dark .cb-app,.dark .cb-shell,.cb-app.dark', accent.dark)
}
